import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { ADMIN_OVERVIEW_CACHE_KEY } from '../admin/admin-overview.service';
import { assertIntPaisa } from '../../common/utils/money';
import { parsePagination, buildPaginatedResponse } from '../../common/utils/pagination';
import { WithdrawCashbackDto } from './dto/cashback.dto';
import { NotificationDispatchService } from '../notifications/dispatch.service';

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const IDEMPOTENCY_SCOPE = 'cashback-withdraw';

/**
 * Phase 10 — cashback balances, approval workflow, and withdrawals.
 *
 * The available balance is derived, never stored: APPROVED cashback minus
 * non-rejected withdrawals. Withdrawal requests take a Postgres advisory lock
 * on the user so two concurrent requests can't both pass the balance check.
 */
@Injectable()
export class CashbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly notify: NotificationDispatchService,
  ) {}

  /** Derived balance for one user: { earned, reserved, withdrawn }. */
  private async balances(tx: any, userId: string) {
    const [earnedAgg, pendingAgg, withdrawals] = await Promise.all([
      tx.cashback.aggregate({ where: { userId, status: 'APPROVED' }, _sum: { amount: true } }),
      tx.cashback.aggregate({ where: { userId, status: 'PENDING' }, _sum: { amount: true } }),
      tx.cashbackWithdrawal.aggregate({
        where: { userId, status: { in: ['PENDING', 'APPROVED'] } },
        _sum: { amount: true },
      }),
    ]);
    const earned = earnedAgg._sum.amount ?? 0;
    const reserved = withdrawals._sum.amount ?? 0;
    return { earned, pending: pendingAgg._sum.amount ?? 0, reserved, available: earned - reserved };
  }

  // ---------------------------------------------------------------- summary

  async getSummary(userId: string) {
    const b = await this.balances(this.prisma, userId);
    const withdrawnAgg = await this.prisma.cashbackWithdrawal.aggregate({
      where: { userId, status: 'APPROVED' },
      _sum: { amount: true },
    });
    return {
      balance: b.available,
      pending: b.pending,
      lifetimeEarned: b.earned,
      lifetimeWithdrawn: withdrawnAgg._sum.amount ?? 0,
    };
  }

  async getTransactions(userId: string, query: { page?: number | string; pageSize?: number | string }) {
    const { page, pageSize, skip, take } = parsePagination(query);
    const [total, rows] = await Promise.all([
      this.prisma.cashbackTransaction.count({ where: { userId } }),
      this.prisma.cashbackTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          type: true,
          amount: true,
          balanceAfter: true,
          reference: true,
          createdAt: true,
          cashback: { select: { id: true, status: true, redemptionId: true } },
        },
      }),
    ]);
    return buildPaginatedResponse(rows, total, page, pageSize);
  }

  // ---------------------------------------------------------------- approval

  /** Admin queue of PENDING cashback (e.g. redemptions when auto-approve is off). */
  async pendingList(query: { page?: number | string; pageSize?: number | string }) {
    const { page, pageSize, skip, take } = parsePagination(query);
    const [total, rows] = await Promise.all([
      this.prisma.cashback.count({ where: { status: 'PENDING' } }),
      this.prisma.cashback.findMany({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        skip,
        take,
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      }),
    ]);
    return buildPaginatedResponse(rows, total, page, pageSize);
  }

  async approveCashback(actorId: string, cashbackId: string) {
    const row = await this.prisma.cashback.findUnique({ where: { id: cashbackId } });
    if (!row) throw new NotFoundException({ code: 'CASHBACK_NOT_FOUND', message: 'Cashback not found.' });
    if (row.status !== 'PENDING') {
      throw new ConflictException({ code: 'ALREADY_MODERATED', message: `Cashback is already ${row.status}.` });
    }
    const updated = await this.prisma.$transaction(async (tx: any) => {
      const cb = await tx.cashback.update({ where: { id: cashbackId }, data: { status: 'APPROVED' } });
      await tx.auditLog.create({
        data: {
          actorId,
          actorRole: 'ADMIN',
          action: 'cashback.approve',
          entity: 'Cashback',
          entityId: cashbackId,
          newValues: { userId: row.userId, amount: row.amount } as never,
        },
      });
      return cb;
    });
    await this.bustCaches(row.userId);
    // Phase 11: notify the user — best-effort.
    this.notify?.dispatch(row.userId, {
        type: 'CASHBACK_APPROVED',
        title: 'Cashback credited 💰',
        body: `Rs ${(row.amount / 100).toLocaleString('en-PK')} cashback has been credited to your Bachatly balance.`,
        data: { cashbackId, amountPaisa: row.amount },
        channels: ['IN_APP'],
      })
      ?.catch(() => null);
    return { id: updated.id, status: updated.status };
  }

  async rejectCashback(actorId: string, cashbackId: string, reason: string) {
    if (!reason?.trim()) {
      throw new BadRequestException({ code: 'REASON_REQUIRED', message: 'A reason is required to reject cashback.' });
    }
    const row = await this.prisma.cashback.findUnique({ where: { id: cashbackId } });
    if (!row) throw new NotFoundException({ code: 'CASHBACK_NOT_FOUND', message: 'Cashback not found.' });
    if (row.status !== 'PENDING') {
      throw new ConflictException({ code: 'ALREADY_MODERATED', message: `Cashback is already ${row.status}.` });
    }
    const updated = await this.prisma.$transaction(async (tx: any) => {
      const cb = await tx.cashback.update({ where: { id: cashbackId }, data: { status: 'REJECTED' } });
      await tx.auditLog.create({
        data: {
          actorId,
          actorRole: 'ADMIN',
          action: 'cashback.reject',
          entity: 'Cashback',
          entityId: cashbackId,
          newValues: { userId: row.userId, amount: row.amount, reason } as never,
        },
      });
      return cb;
    });
    await this.bustCaches(row.userId);
    return { id: updated.id, status: updated.status };
  }

  // ---------------------------------------------------------------- withdrawal

  /**
   * Request a cashback withdrawal. Atomically reserves the amount (balance is
   * derived, so a per-user advisory lock serialises concurrent requests).
   * Idempotent via client key.
   */
  async withdraw(userId: string, dto: WithdrawCashbackDto, clientKey?: string) {
    assertIntPaisa(dto.amountPaisa, 'amountPaisa');
    const key = (clientKey ?? dto.idempotencyKey)?.trim();
    if (key) {
      const existing = await this.prisma.idempotencyKey.findUnique({
        where: { key: `${IDEMPOTENCY_SCOPE}:${userId}:${key}` },
      });
      if (existing && existing.expiresAt > new Date()) {
        return { ...(existing.response as Record<string, unknown>), idempotentReplay: true };
      }
    }

    try {
      const result = await this.prisma.$transaction(async (tx: any) => {
        // Serialise concurrent withdrawals for this user (released at commit).
        await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `cashback:${userId}`);

        if (key) {
          await tx.idempotencyKey.create({
            data: {
              key: `${IDEMPOTENCY_SCOPE}:${userId}:${key}`,
              userId,
              scope: IDEMPOTENCY_SCOPE,
              response: {},
              expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
            },
          });
        }

        const b = await this.balances(tx, userId);
        if (dto.amountPaisa > b.available) {
          throw new ConflictException({
            code: 'INSUFFICIENT_CASHBACK',
            message: `Available cashback is Rs. ${(b.available / 100).toFixed(2)}; requested Rs. ${(dto.amountPaisa / 100).toFixed(2)}.`,
          });
        }

        const withdrawal = await tx.cashbackWithdrawal.create({
          data: {
            userId,
            amount: dto.amountPaisa,
            method: dto.method,
            accountDetails: dto.accountDetails,
            status: 'PENDING',
            idempotencyKey: key ? `${IDEMPOTENCY_SCOPE}:${userId}:${key}` : null,
          },
        });
        const balanceAfter = b.available - dto.amountPaisa;
        await tx.cashbackTransaction.create({
          data: {
            userId,
            type: 'DEBIT',
            amount: dto.amountPaisa,
            balanceAfter,
            reference: `withdrawal:${withdrawal.id}`,
          },
        });

        const response = {
          id: withdrawal.id,
          amountPaisa: withdrawal.amount,
          method: withdrawal.method,
          status: withdrawal.status,
          balanceAfter,
        };
        if (key) {
          await tx.idempotencyKey.update({
            where: { key: `${IDEMPOTENCY_SCOPE}:${userId}:${key}` },
            data: { response: response as never },
          });
        }
        return response;
      });
      await this.bustCaches(userId);
      return { ...result, idempotentReplay: false };
    } catch (err: any) {
      if (key && err?.code === 'P2002') {
        const existing = await this.prisma.idempotencyKey.findUnique({
          where: { key: `${IDEMPOTENCY_SCOPE}:${userId}:${key}` },
        });
        if (existing) return { ...(existing.response as Record<string, unknown>), idempotentReplay: true };
      }
      throw err;
    }
  }

  async listWithdrawals(userId: string, query: { page?: number | string; pageSize?: number | string }) {
    const { page, pageSize, skip, take } = parsePagination(query);
    const [total, rows] = await Promise.all([
      this.prisma.cashbackWithdrawal.count({ where: { userId } }),
      this.prisma.cashbackWithdrawal.findMany({
        where: { userId },
        orderBy: { requestedAt: 'desc' },
        skip,
        take,
      }),
    ]);
    return buildPaginatedResponse(
      rows.map((w) => ({ ...w, accountDetails: maskAccount(w.accountDetails) })),
      total,
      page,
      pageSize,
    );
  }

  // ---------------------------------------------------------------- admin withdrawals

  async pendingWithdrawals(query: { page?: number | string; pageSize?: number | string }) {
    const { page, pageSize, skip, take } = parsePagination(query);
    const [total, rows] = await Promise.all([
      this.prisma.cashbackWithdrawal.count({ where: { status: 'PENDING' } }),
      this.prisma.cashbackWithdrawal.findMany({
        where: { status: 'PENDING' },
        orderBy: { requestedAt: 'asc' },
        skip,
        take,
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } } },
      }),
    ]);
    return buildPaginatedResponse(rows, total, page, pageSize);
  }

  async approveWithdrawal(actorId: string, withdrawalId: string, payoutReference?: string) {
    const row = await this.prisma.cashbackWithdrawal.findUnique({ where: { id: withdrawalId } });
    if (!row) throw new NotFoundException({ code: 'WITHDRAWAL_NOT_FOUND', message: 'Withdrawal not found.' });
    if (row.status !== 'PENDING') {
      throw new ConflictException({ code: 'ALREADY_MODERATED', message: `Withdrawal is already ${row.status}.` });
    }
    const updated = await this.prisma.$transaction(async (tx: any) => {
      const w = await tx.cashbackWithdrawal.update({
        where: { id: withdrawalId },
        data: { status: 'APPROVED', payoutReference: payoutReference ?? null, decidedAt: new Date(), decidedBy: actorId },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          actorRole: 'ADMIN',
          action: 'cashback.withdrawal-approve',
          entity: 'CashbackWithdrawal',
          entityId: withdrawalId,
          newValues: { userId: row.userId, amount: row.amount, payoutReference: payoutReference ?? null } as never,
        },
      });
      return w;
    });
    await this.bustCaches(row.userId);
    // Phase 11: notify the user — best-effort.
    this.notify?.dispatch(row.userId, {
        type: 'CASHBACK_WITHDRAWAL_APPROVED',
        title: 'Cashback payout sent 💸',
        body: `Your cashback withdrawal of Rs ${(row.amount / 100).toLocaleString('en-PK')} has been approved${payoutReference ? ` (ref: ${payoutReference})` : ''}.`,
        data: { withdrawalId, amountPaisa: row.amount },
        channels: ['IN_APP', 'EMAIL'],
      })
      ?.catch(() => null);
    return { id: updated.id, status: updated.status };
  }

  async rejectWithdrawal(actorId: string, withdrawalId: string, reason: string) {
    if (!reason?.trim()) {
      throw new BadRequestException({ code: 'REASON_REQUIRED', message: 'A reason is required to reject a withdrawal.' });
    }
    const row = await this.prisma.cashbackWithdrawal.findUnique({ where: { id: withdrawalId } });
    if (!row) throw new NotFoundException({ code: 'WITHDRAWAL_NOT_FOUND', message: 'Withdrawal not found.' });
    if (row.status !== 'PENDING') {
      throw new ConflictException({ code: 'ALREADY_MODERATED', message: `Withdrawal is already ${row.status}.` });
    }
    const result = await this.prisma.$transaction(async (tx: any) => {
      const w = await tx.cashbackWithdrawal.update({
        where: { id: withdrawalId },
        data: { status: 'REJECTED', rejectReason: reason, decidedAt: new Date(), decidedBy: actorId },
      });
      // Release the reservation: the money is available again.
      const b = await this.balances(tx, row.userId);
      const balanceAfter = b.available + row.amount;
      await tx.cashbackTransaction.create({
        data: {
          userId: row.userId,
          type: 'CREDIT',
          amount: row.amount,
          balanceAfter,
          reference: `withdrawal-reject:${withdrawalId}`,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          actorRole: 'ADMIN',
          action: 'cashback.withdrawal-reject',
          entity: 'CashbackWithdrawal',
          entityId: withdrawalId,
          newValues: { userId: row.userId, amount: row.amount, reason } as never,
        },
      });
      return { id: w.id, status: w.status, balanceAfter };
    });
    await this.bustCaches(row.userId);
    // Phase 11: notify the user — best-effort.
    this.notify?.dispatch(row.userId, {
        type: 'CASHBACK_WITHDRAWAL_REJECTED',
        title: 'Cashback withdrawal declined',
        body: `Your cashback withdrawal of Rs ${(row.amount / 100).toLocaleString('en-PK')} was declined. Reason: ${reason}. The amount is available in your balance again.`,
        data: { withdrawalId, amountPaisa: row.amount },
        channels: ['IN_APP', 'EMAIL'],
      })
      ?.catch(() => null);
    return result;
  }

  // ---------------------------------------------------------------- internal

  private async bustCaches(userId: string) {
    try {
      await this.redis.del(`dashboard:${userId}`);
    } catch {
      /* best effort */
    }
    try {
      await this.redis.del(ADMIN_OVERVIEW_CACHE_KEY);
    } catch {
      /* best effort */
    }
  }
}

/** Never return full account numbers to the client. */
function maskAccount(details: string): string {
  if (details.length <= 4) return '****';
  return `****${details.slice(-4)}`;
}
