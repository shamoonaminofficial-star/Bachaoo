import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessesService } from '../businesses/businesses.service';
import { NotificationDispatchService } from '../notifications/dispatch.service';
import { ADMIN_ROLES } from '../../common/constants';
import { assertIntPaisa } from '../../common/utils/money';
import { CreateVoucherCampaignDto } from './dto/voucher.dto';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — readable on a receipt
const CODE_RANDOM_LEN = 8;

function randomCode(prefix: string): string {
  const bytes = randomBytes(CODE_RANDOM_LEN);
  let suffix = '';
  for (let i = 0; i < CODE_RANDOM_LEN; i++) suffix += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return `${prefix}-${suffix}`;
}

const isAdmin = (roles: string[]) => roles.some((r) => (ADMIN_ROLES as readonly string[]).includes(r));

/**
 * Phase 10 — voucher campaigns, claiming, and bill-time application.
 *
 * A campaign is a Voucher row + N pre-generated VoucherCode rows. Claiming is
 * atomic: `UPDATE ... WHERE claimedAt IS NULL` — the row count decides who won
 * the race, so two concurrent claims can never take the same code.
 */
@Injectable()
export class VouchersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businesses: BusinessesService,
    private readonly notify: NotificationDispatchService,
  ) {}

  // ---------------------------------------------------------------- campaigns

  /**
   * Admins create platform-wide (or per-business) campaigns; partners create
   * campaigns only for businesses they manage.
   */
  async createCampaign(actorId: string, roles: string[], dto: CreateVoucherCampaignDto) {
    const now = new Date();
    const startsAt = new Date(dto.startsAt);
    const expiresAt = new Date(dto.expiresAt);
    if (!(startsAt < expiresAt)) {
      throw new BadRequestException({ code: 'INVALID_DATES', message: 'startsAt must be before expiresAt.' });
    }
    if (expiresAt <= now) {
      throw new BadRequestException({ code: 'INVALID_DATES', message: 'expiresAt must be in the future.' });
    }
    assertIntPaisa(dto.valuePaisa, 'valuePaisa');
    if (dto.minBillPaisa !== undefined) assertIntPaisa(dto.minBillPaisa, 'minBillPaisa');

    if (dto.businessId) {
      const business = await this.prisma.business.findFirst({
        where: { id: dto.businessId, deletedAt: null },
        select: { id: true },
      });
      if (!business) throw new NotFoundException({ code: 'BUSINESS_NOT_FOUND', message: 'Business not found.' });
      if (!isAdmin(roles)) {
        // Partners may only run campaigns for their own businesses.
        await this.businesses.assertCanManage(actorId, roles, dto.businessId);
      }
    } else if (!isAdmin(roles)) {
      throw new ForbiddenException({
        code: 'BUSINESS_REQUIRED',
        message: 'Partners must scope voucher campaigns to one of their businesses.',
      });
    }

    const prefix = (dto.codePrefix ?? 'BCH').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'BCH';
    const voucher = await this.prisma.voucher.create({
      data: {
        businessId: dto.businessId ?? null,
        title: dto.title,
        description: dto.description,
        valueAmount: dto.valuePaisa,
        minBillPaisa: dto.minBillPaisa ?? null,
        codePrefix: prefix,
        totalQuantity: dto.totalCount,
        perUserLimit: dto.perUserLimit ?? 1,
        validFrom: startsAt,
        validTo: expiresAt,
        source: 'PROMOTIONAL',
        isActive: true,
      },
    });

    // Pre-generate the claim codes in chunks. The code column is unique, so a
    // freak collision is skipped via skipDuplicates.
    const codes = new Set<string>();
    let guard = 0;
    while (codes.size < dto.totalCount && guard < dto.totalCount + 1000) {
      codes.add(randomCode(prefix));
      guard++;
    }
    if (codes.size < dto.totalCount) {
      throw new BadRequestException({ code: 'CODE_GENERATION_FAILED', message: 'Could not generate unique codes.' });
    }
    const codeRows = [...codes].map((code) => ({ voucherId: voucher.id, code }));
    const CHUNK = 500;
    for (let i = 0; i < codeRows.length; i += CHUNK) {
      await this.prisma.voucherCode.createMany({ data: codeRows.slice(i, i + CHUNK), skipDuplicates: true });
    }
    const inserted = await this.prisma.voucherCode.count({ where: { voucherId: voucher.id } });

    return {
      id: voucher.id,
      title: voucher.title,
      totalCount: inserted,
      valuePaisa: voucher.valueAmount,
      minBillPaisa: voucher.minBillPaisa,
      codePrefix: prefix,
      startsAt: voucher.validFrom,
      expiresAt: voucher.validTo,
      businessId: voucher.businessId,
    };
  }

  async listCampaigns(actorId: string, roles: string[]) {
    const where: Record<string, unknown> = { deletedAt: null };
    if (!isAdmin(roles)) {
      // Partners see only their own businesses' campaigns.
      const owned = await this.prisma.business.findMany({
        where: {
          deletedAt: null,
          OR: [
            { ownerUserId: actorId },
            { owners: { some: { userId: actorId } } },
            { staff: { some: { userId: actorId, isActive: true } } },
          ],
        },
        select: { id: true },
      });
      where.businessId = { in: owned.map((b) => b.id) };
    }
    const rows = await this.prisma.voucher.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const claimed = await this.prisma.voucherCode.groupBy({
      by: ['voucherId'],
      where: { voucherId: { in: rows.map((r) => r.id) }, claimedAt: { not: null } },
      _count: { id: true },
    });
    const claimedBy = new Map(claimed.map((c) => [c.voucherId, c._count.id]));
    return rows.map((v) => ({
      id: v.id,
      title: v.title,
      valuePaisa: v.valueAmount,
      minBillPaisa: v.minBillPaisa,
      totalCount: v.totalQuantity,
      claimedCount: claimedBy.get(v.id) ?? 0,
      startsAt: v.validFrom,
      expiresAt: v.validTo,
      isActive: v.isActive,
      businessId: v.businessId,
    }));
  }

  // ---------------------------------------------------------------- my vouchers

  /** Customer's claimed vouchers with a derived display status. */
  async getMyVouchers(userId: string) {
    const now = new Date();
    const rows = await this.prisma.userVoucher.findMany({
      where: { userId },
      include: {
        voucher: {
          select: {
            id: true,
            title: true,
            description: true,
            valueAmount: true,
            minBillPaisa: true,
            businessId: true,
            business: { select: { name: true } },
          },
        },
      },
      orderBy: { issuedAt: 'desc' },
    });
    return rows.map((uv) => ({
      id: uv.id,
      code: uv.code,
      title: uv.voucher.title,
      description: uv.voucher.description,
      valuePaisa: uv.voucher.valueAmount,
      minBillPaisa: uv.voucher.minBillPaisa,
      businessId: uv.voucher.businessId,
      businessName: uv.voucher.business?.name ?? null,
      status: uv.status === 'REDEEMED' ? 'USED' : uv.expiresAt <= now ? 'EXPIRED' : 'ACTIVE',
      expiresAt: uv.expiresAt,
      issuedAt: uv.issuedAt,
      redeemedAt: uv.redeemedAt,
    }));
  }

  // ---------------------------------------------------------------- claiming

  /**
   * Claim one of the campaign's pre-generated codes.
   * Atomic: the code row is flipped `claimedAt IS NULL -> claimedAt = now()`
   * with updateMany; the affected-row count is the single-claim guard.
   */
  /**
   * Convenience: claim a pre-generated code without knowing its campaign id.
   * Resolves the code → voucher, then delegates to {@link claimVoucher}.
   */
  async claimVoucherByCode(userId: string, code: string) {
    const normalized = (code || '').trim().toUpperCase();
    if (!normalized) {
      throw new BadRequestException({ code: 'CODE_REQUIRED', message: 'A voucher code is required.' });
    }
    const row = await this.prisma.voucherCode.findUnique({
      where: { code: normalized },
      select: { voucherId: true },
    });
    if (!row) {
      throw new NotFoundException({ code: 'CODE_NOT_FOUND', message: 'This voucher code does not exist.' });
    }
    return this.claimVoucher(userId, row.voucherId, normalized);
  }

  async claimVoucher(userId: string, voucherId: string, code: string) {
    const normalized = code.trim().toUpperCase();
    const voucher = await this.prisma.voucher.findFirst({
      where: { id: voucherId, deletedAt: null },
      select: {
        id: true,
        title: true,
        valueAmount: true,
        perUserLimit: true,
        isActive: true,
        validFrom: true,
        validTo: true,
      },
    });
    if (!voucher) throw new NotFoundException({ code: 'VOUCHER_NOT_FOUND', message: 'Voucher campaign not found.' });
    const now = new Date();
    if (!voucher.isActive || now < voucher.validFrom) {
      throw new BadRequestException({ code: 'VOUCHER_NOT_LIVE', message: 'This voucher campaign is not live yet.' });
    }
    if (now > voucher.validTo) {
      throw new BadRequestException({ code: 'VOUCHER_EXPIRED', message: 'This voucher campaign has expired.' });
    }

    const mine = await this.prisma.userVoucher.count({ where: { userId, voucherId } });
    if (mine >= voucher.perUserLimit) {
      throw new ConflictException({
        code: 'PER_USER_LIMIT_REACHED',
        message: `You can claim at most ${voucher.perUserLimit} voucher(s) from this campaign.`,
      });
    }

    // Atomic claim: only one caller can flip claimedAt from NULL.
    const claimAttempt = await this.prisma.voucherCode.updateMany({
      where: { voucherId, code: normalized, claimedAt: null },
      data: { claimedAt: now, claimedById: userId },
    });
    if (claimAttempt.count === 0) {
      const existing = await this.prisma.voucherCode.findUnique({
        where: { code: normalized },
        select: { voucherId: true, claimedAt: true },
      });
      if (existing && existing.voucherId === voucherId && existing.claimedAt) {
        throw new ConflictException({ code: 'CODE_ALREADY_CLAIMED', message: 'This code has already been claimed.' });
      }
      throw new NotFoundException({ code: 'CODE_NOT_FOUND', message: 'This code is not valid for this campaign.' });
    }

    // Mint the customer's UserVoucher and link the code row, in one transaction.
    const userVoucher = await this.prisma.$transaction(async (tx: any) => {
      const uv = await tx.userVoucher.create({
        data: {
          voucherId,
          userId,
          code: normalized,
          status: 'AVAILABLE',
          expiresAt: voucher.validTo,
          source: 'PROMOTIONAL',
        },
      });
      await tx.voucherCode.update({
        where: { code: normalized },
        data: { userVoucherId: uv.id },
      });
      return uv;
    });

    const claimed = {
      id: userVoucher.id,
      code: userVoucher.code,
      title: voucher.title,
      valuePaisa: voucher.valueAmount,
      status: 'ACTIVE',
      expiresAt: userVoucher.expiresAt,
    };
    // Phase 11: notify — best-effort.
    this.notify?.dispatch(userId, {
        type: 'VOUCHER_CLAIMED',
        title: 'Voucher claimed 🎟️',
        body: `You claimed "${voucher.title}" worth Rs ${(voucher.valueAmount / 100).toLocaleString('en-PK')}. Show the code at the partner to use it.`,
        data: { userVoucherId: userVoucher.id, code: userVoucher.code },
        channels: ['IN_APP'],
      })
      ?.catch(() => null);
    return claimed;
  }

  // ---------------------------------------------------------------- bill-time

  /**
   * Validates + consumes a customer's voucher inside the redemption transaction.
   * Called from redemptions.confirm with the tx-scoped prisma client.
   *
   * @param tx transaction-scoped prisma client
   * @param maxApplicable paisa the voucher may discount (bill − deal discount)
   * @returns the consumed UserVoucher id and the paisa actually discounted
   */
  async applyVoucherAtConfirm(
    tx: any,
    userId: string,
    code: string,
    billAmountPaisa: number,
    businessId: string,
    maxApplicable: number,
  ): Promise<{ userVoucherId: string; voucherDiscount: number }> {
    const normalized = code.trim().toUpperCase();
    const uv = await tx.userVoucher.findUnique({
      where: { code: normalized },
      include: { voucher: true },
    });
    if (!uv) throw new NotFoundException({ code: 'VOUCHER_NOT_FOUND', message: 'Voucher code not found.' });
    if (uv.userId !== userId) {
      throw new ForbiddenException({ code: 'VOUCHER_NOT_OWNED', message: 'This voucher belongs to another customer.' });
    }
    if (uv.status !== 'AVAILABLE') {
      throw new ConflictException({ code: 'VOUCHER_ALREADY_USED', message: 'This voucher has already been used.' });
    }
    const now = new Date();
    if (uv.expiresAt <= now) {
      throw new BadRequestException({ code: 'VOUCHER_EXPIRED', message: 'This voucher has expired.' });
    }
    const v = uv.voucher;
    if (!v.isActive || v.deletedAt || now < v.validFrom || now > v.validTo) {
      throw new BadRequestException({ code: 'VOUCHER_NOT_LIVE', message: 'This voucher is not currently valid.' });
    }
    if (v.minBillPaisa && billAmountPaisa < v.minBillPaisa) {
      throw new BadRequestException({
        code: 'VOUCHER_MIN_BILL_NOT_MET',
        message: `This voucher needs a bill of at least Rs. ${(v.minBillPaisa / 100).toFixed(0)}.`,
      });
    }
    if (v.businessId && v.businessId !== businessId) {
      throw new BadRequestException({
        code: 'VOUCHER_BUSINESS_MISMATCH',
        message: 'This voucher is not valid at this business.',
      });
    }

    // Atomic consume: the update only lands while the row is still AVAILABLE.
    const consumed = await tx.userVoucher.updateMany({
      where: { id: uv.id, status: 'AVAILABLE' },
      data: { status: 'REDEEMED', redeemedAt: now },
    });
    if (consumed.count === 0) {
      throw new ConflictException({ code: 'VOUCHER_ALREADY_USED', message: 'This voucher was just used.' });
    }

    // The voucher can never discount more than what remains of the bill.
    const voucherDiscount = Math.max(0, Math.min(v.valueAmount, maxApplicable));
    return { userVoucherId: uv.id, voucherDiscount };
  }
}
