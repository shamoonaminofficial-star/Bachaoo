import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLES } from '../../common/constants';
import { NotificationDispatchService } from '../notifications/dispatch.service';
import { assertIntPaisa } from '../../common/utils/money';
import { parsePagination, buildPaginatedResponse } from '../../common/utils/pagination';
import { AdjustPointsDto } from './dto/reward.dto';
import { CreateRewardDto, UpdateRewardDto } from './dto/create-reward.dto';

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const IDEMPOTENCY_SCOPE = 'reward-redeem';

const isSuperAdmin = (roles: string[]) => roles.includes(ROLES.SUPER_ADMIN);

function uniqueVoucherCode(prefix: string): string {
  const bytes = randomBytes(6).toString('hex').toUpperCase();
  return `${prefix}-${bytes}`;
}

/**
 * Phase 10 — points economy.
 *
 * Every points change is one immutable RewardTransaction row (EARN / REDEEM /
 * EXPIRE / ADJUST). Balances live on RewardAccount and are only mutated inside
 * the same transaction that writes the ledger row.
 */
@Injectable()
export class RewardsService {
  constructor(private readonly prisma: PrismaService, private readonly notify: NotificationDispatchService) {}

  // ---------------------------------------------------------------- account

  async getAccount(userId: string) {
    const account = await this.prisma.rewardAccount.upsert({
      where: { userId },
      update: {},
      create: { userId, availablePoints: 0, lifetimePoints: 0, redeemedPoints: 0 },
    });
    return {
      balance: account.availablePoints,
      lifetimeEarned: account.lifetimePoints,
      lifetimeRedeemed: account.redeemedPoints,
    };
  }

  async getTransactions(userId: string, query: { page?: number | string; pageSize?: number | string }) {
    const { page, pageSize, skip, take } = parsePagination(query);
    const [total, rows] = await Promise.all([
      this.prisma.rewardTransaction.count({ where: { userId } }),
      this.prisma.rewardTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: { id: true, type: true, points: true, balanceAfter: true, reference: true, createdAt: true },
      }),
    ]);
    return buildPaginatedResponse(rows, total, page, pageSize);
  }

  // ---------------------------------------------------------------- catalog

  /** Public redeemable rewards (points → voucher). */
  async getCatalog() {
    const now = new Date();
    const rows = await this.prisma.reward.findMany({
      where: { isActive: true, deletedAt: null },
      include: {
        voucher: {
          select: { id: true, title: true, valueAmount: true, minBillPaisa: true, validTo: true, business: { select: { name: true } } },
        },
      },
      orderBy: { pointsCost: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      pointsCost: r.pointsCost,
      stock: r.stock,
      soldOut: r.stock !== null && r.stock <= 0,
      voucher: r.voucher
        ? {
            id: r.voucher.id,
            title: r.voucher.title,
            valuePaisa: r.voucher.valueAmount,
            minBillPaisa: r.voucher.minBillPaisa,
            expiresAt: r.voucher.validTo,
            businessName: r.voucher.business?.name ?? null,
          }
        : null,
      // A reward without a linked voucher cannot be fulfilled — surfaced
      // honestly so the frontend can hide or disable it.
      redeemable: Boolean(r.voucher) && (r.stock === null || r.stock > 0),
    }));
  }

  // ---------------------------------------------------------------- redeem

  /**
   * Redeem a catalog reward for points. Atomic: stock decrement, points debit,
   * and voucher minting in one transaction. Idempotent via client-supplied key.
   */
  async redeemReward(userId: string, rewardId: string, clientKey?: string) {
    const key = clientKey?.trim();
    if (key) {
      const existing = await this.prisma.idempotencyKey.findUnique({
        where: { key: `${IDEMPOTENCY_SCOPE}:${userId}:${key}` },
      });
      if (existing && existing.expiresAt > new Date()) {
        return { ...(existing.response as Record<string, unknown>), idempotentReplay: true };
      }
    }

    const now = new Date();
    try {
      const result = await this.prisma.$transaction(async (tx: any) => {
        // Reserve the idempotency slot first — a concurrent retry hits the
        // unique constraint and replays the stored response instead.
        if (key) {
          await tx.idempotencyKey.create({
            data: {
              key: `${IDEMPOTENCY_SCOPE}:${userId}:${key}`,
              userId,
              scope: IDEMPOTENCY_SCOPE,
              response: {},
              expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
            },
          });
        }

        const reward = await tx.reward.findFirst({
          where: { id: rewardId, isActive: true, deletedAt: null },
          include: { voucher: true },
        });
        if (!reward) {
          throw new NotFoundException({ code: 'REWARD_NOT_FOUND', message: 'Reward not found or not active.' });
        }
        if (!reward.voucher) {
          throw new BadRequestException({
            code: 'REWARD_NOT_CONFIGURED',
            message: 'This reward is not linked to a voucher yet.',
          });
        }
        if (now > reward.voucher.validTo) {
          throw new BadRequestException({ code: 'REWARD_EXPIRED', message: 'This reward has expired.' });
        }

        // Atomic stock decrement (only when stock is tracked).
        if (reward.stock !== null) {
          const dec = await tx.reward.updateMany({
            where: { id: reward.id, stock: { gt: 0 } },
            data: { stock: { decrement: 1 } },
          });
          if (dec.count === 0) {
            throw new ConflictException({ code: 'REWARD_SOLD_OUT', message: 'This reward is sold out.' });
          }
        }

        const account = await tx.rewardAccount.upsert({
          where: { userId },
          update: {},
          create: { userId, availablePoints: 0, lifetimePoints: 0, redeemedPoints: 0 },
        });
        if (account.availablePoints < reward.pointsCost) {
          throw new ConflictException({
            code: 'INSUFFICIENT_POINTS',
            message: `You need ${reward.pointsCost} points; you have ${account.availablePoints}.`,
          });
        }

        const updated = await tx.rewardAccount.update({
          where: { userId },
          data: {
            availablePoints: { decrement: reward.pointsCost },
            redeemedPoints: { increment: reward.pointsCost },
          },
        });
        await tx.rewardTransaction.create({
          data: {
            accountId: updated.id,
            userId,
            type: 'REDEEM',
            points: reward.pointsCost,
            balanceAfter: updated.availablePoints,
            reference: `reward:${reward.id}`,
            meta: { rewardTitle: reward.title },
          },
        });

        // Mint the customer's voucher from the reward's linked template.
        const code = uniqueVoucherCode(reward.voucher.codePrefix || 'RWD');
        const userVoucher = await tx.userVoucher.create({
          data: {
            voucherId: reward.voucher.id,
            userId,
            code,
            status: 'AVAILABLE',
            expiresAt: reward.voucher.validTo,
            source: 'REWARD',
          },
        });

        const response = {
          rewardId: reward.id,
          pointsDebited: reward.pointsCost,
          balanceAfter: updated.availablePoints,
          voucher: {
            id: userVoucher.id,
            code: userVoucher.code,
            title: reward.voucher.title,
            valuePaisa: reward.voucher.valueAmount,
            expiresAt: userVoucher.expiresAt,
          },
        };
        if (key) {
          await tx.idempotencyKey.update({
            where: { key: `${IDEMPOTENCY_SCOPE}:${userId}:${key}` },
            data: { response: response as never },
          });
        }
        return response;
      });
      // Phase 11: notify about the minted voucher — best-effort (not on replays).
      this.notify?.dispatch(userId, {
          type: 'REWARD_REDEEMED',
          title: 'Reward redeemed 🎟️',
          body: `You redeemed "${(result as any)?.voucher?.title ?? 'a reward'}" for ${(result as any)?.pointsDebited ?? 0} points. Your voucher code: ${(result as any)?.voucher?.code ?? ''}.`,
          data: { voucherId: (result as any)?.voucher?.id, code: (result as any)?.voucher?.code },
          channels: ['IN_APP'],
        })
        ?.catch(() => null);
      return { ...result, idempotentReplay: false };
    } catch (err: any) {      // Unique violation on the idempotency slot = a concurrent in-flight
      // request won; replay its stored response.
      if (key && err?.code === 'P2002') {
        const existing = await this.prisma.idempotencyKey.findUnique({
          where: { key: `${IDEMPOTENCY_SCOPE}:${userId}:${key}` },
        });
        if (existing) return { ...(existing.response as Record<string, unknown>), idempotentReplay: true };
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------- adjust (admin)

  /**
   * Manual point adjustment. Positive credits any admin; negative debits
   * require SUPER_ADMIN and an approval note. Everything is ledgered.
   */
  async adjustPoints(actorId: string, roles: string[], dto: AdjustPointsDto) {
    if (!dto.reason?.trim()) {
      throw new BadRequestException({ code: 'REASON_REQUIRED', message: 'A reason is required for point adjustments.' });
    }
    if (dto.points === 0) {
      throw new BadRequestException({ code: 'INVALID_POINTS', message: 'Points must be non-zero.' });
    }
    if (dto.points < 0) {
      if (!isSuperAdmin(roles)) {
        throw new ForbiddenException({
          code: 'SUPER_ADMIN_REQUIRED',
          message: 'Negative point adjustments require a super-admin.',
        });
      }
      if (!dto.approvalNote?.trim()) {
        throw new BadRequestException({
          code: 'APPROVAL_NOTE_REQUIRED',
          message: 'Negative adjustments need a super-admin approval note.',
        });
      }
    }

    const target = await this.prisma.user.findFirst({
      where: { id: dto.userId, deletedAt: null },
      select: { id: true },
    });
    if (!target) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found.' });

    const result = await this.prisma.$transaction(async (tx: any) => {
      const account = await tx.rewardAccount.upsert({
        where: { userId: dto.userId },
        update: {},
        create: { userId: dto.userId, availablePoints: 0, lifetimePoints: 0, redeemedPoints: 0 },
      });
      const debit = dto.points < 0;
      const abs = Math.abs(dto.points);
      if (debit && account.availablePoints < abs) {
        throw new ConflictException({
          code: 'INSUFFICIENT_POINTS',
          message: `User has ${account.availablePoints} points; cannot debit ${abs}.`,
        });
      }
      const updated = await tx.rewardAccount.update({
        where: { userId: dto.userId },
        data: debit
          ? { availablePoints: { decrement: abs } }
          : { availablePoints: { increment: abs }, lifetimePoints: { increment: abs } },
      });
      const txn = await tx.rewardTransaction.create({
        data: {
          accountId: updated.id,
          userId: dto.userId,
          type: 'ADJUST',
          points: abs,
          balanceAfter: updated.availablePoints,
          reference: `admin-adjust:${actorId}`,
          meta: { reason: dto.reason, approvalNote: dto.approvalNote ?? null, by: actorId },
        },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          actorRole: 'ADMIN',
          action: 'reward.adjust',
          entity: 'RewardAccount',
          entityId: updated.id,
          newValues: { userId: dto.userId, points: dto.points, reason: dto.reason, approvalNote: dto.approvalNote ?? null } as never,
        },
      });
      return { balanceAfter: updated.availablePoints, transactionId: txn.id };
    });
    return result;
  }

  // ---------------------------------------------------------------- admin catalog

  /**
   * Create a rewards-catalog entry. The linked voucher template must exist
   * and be active — a reward without a fulfillable voucher is rejected.
   */
  async createReward(dto: CreateRewardDto) {
    const voucher = await this.prisma.voucher.findFirst({
      where: { id: dto.voucherId, deletedAt: null, isActive: true },
      select: { id: true, title: true, valueAmount: true },
    });
    if (!voucher) {
      throw new NotFoundException({
        code: 'VOUCHER_NOT_FOUND',
        message: 'Linked voucher template not found or not active.',
      });
    }
    const reward = await this.prisma.reward.create({
      data: {
        title: dto.title,
        description: dto.description,
        pointsCost: dto.pointsCost,
        voucherId: dto.voucherId,
        stock: dto.stock ?? null,
        isActive: true,
      },
    });
    return reward;
  }

  async updateReward(rewardId: string, dto: UpdateRewardDto) {
    const existing = await this.prisma.reward.findFirst({
      where: { id: rewardId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException({ code: 'REWARD_NOT_FOUND', message: 'Reward not found.' });
    if (dto.voucherId) {
      const voucher = await this.prisma.voucher.findFirst({
        where: { id: dto.voucherId, deletedAt: null },
        select: { id: true },
      });
      if (!voucher) throw new NotFoundException({ code: 'VOUCHER_NOT_FOUND', message: 'Linked voucher not found.' });
    }
    return this.prisma.reward.update({
      where: { id: rewardId },
      data: {
        title: dto.title,
        description: dto.description,
        pointsCost: dto.pointsCost,
        voucherId: dto.voucherId,
        stock: dto.stock === undefined ? undefined : dto.stock,
        isActive: dto.isActive,
      },
    });
  }

  async deleteReward(rewardId: string) {
    const existing = await this.prisma.reward.findFirst({
      where: { id: rewardId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException({ code: 'REWARD_NOT_FOUND', message: 'Reward not found.' });
    return this.prisma.reward.update({
      where: { id: rewardId },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  // ---------------------------------------------------------------- internal

  /**
   * Ledgered point credit for other modules (referrals, memberships) to call
   * inside their own transactions. Never invents balances — one EARN row per
   * credit, account counters updated in the same tx.
   */
  async creditPoints(tx: any, userId: string, points: number, reference: string, meta: Record<string, unknown> = {}) {
    assertIntPaisa(points, 'points');
    if (points <= 0) return null;
    const account = await tx.rewardAccount.upsert({
      where: { userId },
      update: { availablePoints: { increment: points }, lifetimePoints: { increment: points } },
      create: { userId, availablePoints: points, lifetimePoints: points, redeemedPoints: 0 },
    });
    await tx.rewardTransaction.create({
      data: {
        accountId: account.id,
        userId,
        type: 'EARN',
        points,
        balanceAfter: account.availablePoints,
        reference,
        meta,
      },
    });
    return account;
  }
}
