import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PaginatedResponse } from '@bachatly/types';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { APP_TIMEZONE } from '../../common/constants';
import { getSettingValue } from '../../common/utils/settings';
import { requiredSecret } from '../../common/utils/required-secret';
import {
  QrIssuanceRecord,
  QrTokenExpiredError,
  QrTokenInvalidError,
  RedemptionTokenPayload,
  signRedemptionToken,
  verifyRedemptionToken,
} from '../../common/utils/qr-token';
import {
  RedemptionMathResult,
  computeRedemptionAmounts,
} from './redemption-math';
import { CreateQrDto } from './dto/create-qr.dto';
import { ValidateQrDto } from './dto/validate-qr.dto';
import { ConfirmRedemptionDto } from './dto/confirm-redemption.dto';
import { ADMIN_ROLES } from '../../common/constants';
import { VouchersService } from '../vouchers/vouchers.service';
import { ReferralsService } from '../referrals/referrals.service';
import { NotificationDispatchService } from '../notifications/dispatch.service';
import { CommissionsService } from '../commissions/commissions.service';
import { ADMIN_OVERVIEW_CACHE_KEY } from '../admin/admin-overview.service';

function isAdminRole(roles: string[]): boolean {
  return roles?.some((r) => (ADMIN_ROLES as readonly string[]).includes(r)) ?? false;
}

// ---------------------------------------------------------------------------
// Asia/Karachi day boundaries. Pakistan is UTC+5 year-round (no DST), so a
// fixed offset is exact. If the platform ever expands to DST-observing zones,
// replace this with a tz-aware library.
// ---------------------------------------------------------------------------
const KARACHI_OFFSET_MS = 5 * 60 * 60 * 1000;

function karachiDayStart(date: Date): Date {
  const shifted = new Date(date.getTime() + KARACHI_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - KARACHI_OFFSET_MS);
}

function karachiMonthStart(date: Date): Date {
  const shifted = new Date(date.getTime() + KARACHI_OFFSET_MS);
  shifted.setUTCDate(1);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - KARACHI_OFFSET_MS);
}

// Prisma enum value names (match schema.prisma exactly).
const DEAL_PUBLISHED = 'PUBLISHED';
const DEAL_EXPIRED_STATUS = 'EXPIRED';
const REDEMPTION_CONFIRMED = 'CONFIRMED' as const;
const MEMBERSHIP_ACTIVE = 'ACTIVE';
const USER_ACTIVE = 'ACTIVE';

/**
 * Fraud hook: QR mint attempts per user per rolling hour above this are
 * flagged SUSPICIOUS_QR_RATE in validate() metadata. Never blocks — a human
 * (admin review) decides. Documented here and in the API docs.
 */
const SUSPICIOUS_MINT_RATE_PER_HOUR = 20;

/** Redis key holding the capped, TTL'd fraud-signal feed consumed by /admin/fraud-alerts. */
export const FRAUD_ALERTS_KEY = 'fraud:alerts';
const FRAUD_ALERTS_MAX = 200;
const FRAUD_ALERTS_TTL_SEC = 7 * 24 * 3600;

interface EligibilityContext {
  deal: any;
  business: any;
  branch: any | null;
  membership: any | null;
  plan: any | null;
}

@Injectable()
export class RedemptionsService {
  private readonly logger = new Logger(RedemptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly vouchers: VouchersService,
    private readonly referrals: ReferralsService,
    private readonly notify: NotificationDispatchService,
    private readonly commissions: CommissionsService,
  ) {}

  private get qrSecret(): string {
    return requiredSecret('JWT_SECRET', 'dev-secret-change-me');
  }

  // ------------------------------------------------------------- eligibility

  /**
   * Shared eligibility gate used by qr issuance, confirm, AND the
   * redeem-button state endpoint, so a token can never be minted or confirmed
   * after the deal/user state changed. Throws an HttpException with a
   * machine-readable `code` on any failure.
   *
   * Codes: DEAL_NOT_FOUND, DEAL_NOT_LIVE, DEAL_EXPIRED, BRANCH_NOT_ELIGIBLE,
   * MEMBERSHIP_REQUIRED, MEMBERSHIP_INACTIVE, PLAN_NOT_ELIGIBLE,
   * USAGE_LIMIT_REACHED, PER_USER_LIMIT_REACHED, DAILY_LIMIT_REACHED,
   * MONTHLY_LIMIT_REACHED.
   */
  private async checkEligibility(
    userId: string,
    dealId: string,
    branchId?: string,
  ): Promise<EligibilityContext> {
    const deal = await this.prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        business: true,
        dealBranches: { include: { branch: true } },
      },
    });
    if (!deal || deal.deletedAt) {
      throw new NotFoundException({ code: 'DEAL_NOT_FOUND', message: 'Deal not found.' });
    }

    const now = new Date();
    if (
      deal.status === DEAL_EXPIRED_STATUS ||
      (deal.endDate && new Date(deal.endDate) < now)
    ) {
      throw new UnprocessableEntityException({
        code: 'DEAL_EXPIRED',
        message: 'This deal has expired.',
      });
    }
    if (deal.status !== DEAL_PUBLISHED) {
      throw new UnprocessableEntityException({
        code: 'DEAL_NOT_LIVE',
        message: 'This deal is not currently redeemable.',
      });
    }
    if (deal.startDate && new Date(deal.startDate) > now) {
      throw new UnprocessableEntityException({
        code: 'DEAL_NOT_LIVE',
        message: 'This deal has not started yet.',
      });
    }

    const business = deal.business;
    if (!business || business.deletedAt || !business.isActive || !business.isVerified) {
      throw new UnprocessableEntityException({
        code: 'DEAL_NOT_LIVE',
        message: 'This deal is not currently available.',
      });
    }

    let branch: any | null = null;
    if (branchId) {
      branch = await this.prisma.branch.findFirst({
        where: { id: branchId, businessId: business.id },
      });
      // No DealBranch rows = deal applies to all branches of the business.
      const covered =
        branch &&
        !branch.deletedAt &&
        branch.isActive &&
        (deal.dealBranches.length === 0 ||
          deal.dealBranches.some((db: any) => db.branchId === branchId));
      if (!covered) {
        throw new UnprocessableEntityException({
          code: 'BRANCH_NOT_ELIGIBLE',
          message: 'This deal cannot be redeemed at the selected branch.',
        });
      }
    }

    const membership = await this.prisma.membership.findFirst({
      where: { userId, status: MEMBERSHIP_ACTIVE, endDate: { gt: now } },
      include: { plan: true },
      orderBy: { endDate: 'desc' },
    });
    const plan = membership?.plan ?? null;

    if (deal.requiresMembership && !membership) {
      // Distinguish "never a member" from "membership lapsed/cancelled" so
      // the client can show renew-vs-join messaging.
      const anyMembership = await this.prisma.membership.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      throw new ForbiddenException(
        anyMembership
          ? {
              code: 'MEMBERSHIP_INACTIVE',
              message: 'Your membership is not active. Renew to redeem this deal.',
            }
          : {
              code: 'MEMBERSHIP_REQUIRED',
              message: 'An active Bachatly membership is required to redeem this deal.',
            },
      );
    }
    const eligiblePlanIds: string[] = deal.eligiblePlanIds ?? [];
    if (
      eligiblePlanIds.length > 0 &&
      (!membership || !eligiblePlanIds.includes(membership.planId))
    ) {
      throw new ForbiddenException({
        code: 'PLAN_NOT_ELIGIBLE',
        message: 'Your membership plan is not eligible for this deal.',
      });
    }

    // Per-user / daily / monthly / total limits. Daily & monthly windows use
    // Asia/Karachi boundaries (see karachiDayStart/karachiMonthStart above).
    const userDealFilter = {
      userId,
      dealId,
      status: REDEMPTION_CONFIRMED,
    };

    if (deal.perUserLimit) {
      const used = await this.prisma.redemption.count({ where: userDealFilter });
      if (used >= deal.perUserLimit) {
        throw new UnprocessableEntityException({
          code: 'PER_USER_LIMIT_REACHED',
          message: 'You have already used this deal the maximum number of times.',
        });
      }
    }
    if (deal.dailyLimit) {
      const dayStart = karachiDayStart(now);
      const usedToday = await this.prisma.redemption.count({
        where: { ...userDealFilter, createdAt: { gte: dayStart } },
      });
      if (usedToday >= deal.dailyLimit) {
        throw new UnprocessableEntityException({
          code: 'DAILY_LIMIT_REACHED',
          message: `Daily limit reached for this deal (${APP_TIMEZONE} day).`,
        });
      }
    }
    if (deal.monthlyLimit) {
      const monthStart = karachiMonthStart(now);
      const usedThisMonth = await this.prisma.redemption.count({
        where: { ...userDealFilter, createdAt: { gte: monthStart } },
      });
      if (usedThisMonth >= deal.monthlyLimit) {
        throw new UnprocessableEntityException({
          code: 'MONTHLY_LIMIT_REACHED',
          message: 'Monthly limit reached for this deal.',
        });
      }
    }
    if (deal.usageLimit) {
      // Denormalised counter (incremented on every confirm) for the sold-out check.
      if (deal.redemptionCount >= deal.usageLimit) {
        throw new UnprocessableEntityException({
          code: 'USAGE_LIMIT_REACHED',
          message: 'This deal has reached its total redemption limit.',
        });
      }
    }

    return { deal, business, branch, membership, plan };
  }

  /** Non-throwing version for the Redeem-button state: { eligible, reasons[] }. */
  async getEligibility(userId: string, dealId: string, branchId?: string) {
    try {
      await this.checkEligibility(userId, dealId, branchId);
      return { eligible: true, reasons: [] as string[] };
    } catch (err) {
      const code =
        err instanceof HttpException
          ? ((err.getResponse() as Record<string, unknown>)?.code as string) || 'NOT_ELIGIBLE'
          : 'NOT_ELIGIBLE';
      return { eligible: false, reasons: [code] };
    }
  }

  // -------------------------------------------------------------- QR issuance

  async createQrToken(userId: string, dto: CreateQrDto) {
    const { deal } = await this.checkEligibility(userId, dto.dealId, dto.branchId);

    const ttl = Math.min(
      120,
      Math.max(60, parseInt(process.env.QR_TOKEN_TTL_SECONDS || '90', 10) || 90),
    );

    // Fraud hook (light): count QR mint attempts per user per rolling hour.
    // This NEVER blocks issuance — validate() flags SUSPICIOUS_QR_RATE in its
    // metadata when the rate looks abusive, for admin review.
    await this.redis.incrWithExpire(`qr:mint:${userId}`, 3600);

    // The JWT carries ONLY { jti, dealId, branchId?, exp } — never userId or
    // membershipId. Ownership lives in the server-side issuance record.
    const { token, jti } = signRedemptionToken(
      { dealId: deal.id, branchId: dto.branchId },
      this.qrSecret,
      ttl,
    );

    // Issuance record: source of truth for token ownership; lets confirm()
    // and validate() distinguish "expired" from "never issued".
    const record: QrIssuanceRecord = {
      userId,
      dealId: deal.id,
      branchId: dto.branchId ?? null,
      issuedAt: new Date().toISOString(),
    };
    await this.redis.set(`qr:jti:${jti}`, JSON.stringify(record), ttl);

    return { token, expiresIn: ttl };
  }

  // ------------------------------------------------------------------ validate

  private verifyTokenOrThrow(token: string): RedemptionTokenPayload {
    try {
      return verifyRedemptionToken(token, this.qrSecret);
    } catch (err) {
      if (err instanceof QrTokenExpiredError) {
        throw new GoneException({ code: 'QR_EXPIRED', message: 'This QR code has expired. Please generate a new one.' });
      }
      if (err instanceof QrTokenInvalidError) {
        throw new UnauthorizedException({ code: 'QR_INVALID', message: 'This QR code is invalid.' });
      }
      throw err;
    }
  }

  /**
   * Phase 8 security fix — staff scoping for QR scan/confirm.
   *
   * A cashier/scanner at business A must never validate or confirm a QR token
   * minted for business B's deal. Admins bypass; otherwise the caller must be
   * the business owner, a co-owner, or hold an ACTIVE BusinessStaff link for
   * the token's deal business (any staff role).
   */
  private async assertStaffOfBusiness(staffUserId: string, staffRoles: string[], businessId: string) {
    if (isAdminRole(staffRoles)) return;
    const link = await this.prisma.business.findFirst({
      where: {
        id: businessId,
        deletedAt: null,
        OR: [
          { ownerUserId: staffUserId },
          { owners: { some: { userId: staffUserId } } },
          { staff: { some: { userId: staffUserId, isActive: true } } },
        ],
      },
      select: { id: true },
    });
    if (!link) {
      throw new ForbiddenException({
        code: 'NOT_BUSINESS_STAFF',
        message: 'You are not staff of the business this QR token belongs to.',
      });
    }
  }

  /**
   * Partner scan step: verify the QR and return the customer/deal context the
   * cashier needs. Does NOT mark the token used and does NOT run the
   * eligibility gate — confirm() re-validates everything before any money
   * moves. Invalid/expired/used tokens are rejected with machine codes.
   */
  async validateQrToken(staffUserId: string, staffRoles: string[], dto: ValidateQrDto) {
    const payload = this.verifyTokenOrThrow(dto.token);
    const { jti } = payload;

    const issuedRaw = await this.redis.get(`qr:jti:${jti}`);
    if (!issuedRaw) {
      throw new GoneException({
        code: 'QR_EXPIRED',
        message: 'This QR code has expired. Please generate a new one.',
      });
    }
    if (await this.redis.isQrJtiUsed(jti)) {
      throw new ConflictException({
        code: 'QR_ALREADY_USED',
        message: 'This QR code has already been used.',
      });
    }

    let record: QrIssuanceRecord;
    try {
      record = JSON.parse(issuedRaw) as QrIssuanceRecord;
      if (!record?.userId || record.dealId !== payload.dealId) throw new Error('record mismatch');
    } catch {
      throw new UnauthorizedException({ code: 'QR_INVALID', message: 'This QR code is invalid.' });
    }

    const now = new Date();
    const [customer, deal, membership] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: record.userId },
        select: { id: true, firstName: true, status: true },
      }),
      this.prisma.deal.findUnique({
        where: { id: record.dealId },
        select: {
          id: true,
          title: true,
          businessId: true,
          discountPercent: true,
          maxDiscountAmount: true,
          dealType: true,
        },
      }),
      this.prisma.membership.findFirst({
        where: { userId: record.userId, status: MEMBERSHIP_ACTIVE, endDate: { gt: now } },
        include: { plan: true },
        orderBy: { endDate: 'desc' },
      }),
    ]);
    if (!customer || customer.status !== USER_ACTIVE) {
      throw new UnauthorizedException({ code: 'QR_INVALID', message: 'This QR code is invalid.' });
    }
    if (!deal) {
      throw new GoneException({ code: 'QR_EXPIRED', message: 'This deal is no longer available.' });
    }

    // Phase 8: staff of business A cannot even inspect business B's token.
    await this.assertStaffOfBusiness(staffUserId, staffRoles, deal.businessId);

    let branch: { id: string; name: string; address: string } | null = null;
    if (record.branchId) {
      const b = await this.prisma.branch.findUnique({
        where: { id: record.branchId },
        select: { id: true, name: true, address: true },
      });
      if (b) branch = b;
    }

    // Fraud hook: flag abusive mint rates for admin review (never blocks).
    const flags: string[] = [];
    const mintAttempts = parseInt((await this.redis.get(`qr:mint:${record.userId}`)) ?? '0', 10) || 0;
    if (mintAttempts > SUSPICIOUS_MINT_RATE_PER_HOUR) flags.push('SUSPICIOUS_QR_RATE');

    // Phase 9: persist the signal so /admin/fraud-alerts can surface it.
    if (flags.includes('SUSPICIOUS_QR_RATE')) {
      await this.persistFraudAlert({
        type: 'SUSPICIOUS_QR_RATE',
        userId: record.userId,
        dealId: record.dealId,
        branchId: record.branchId ?? null,
        mintAttemptsLastHour: mintAttempts,
        seenByStaffUserId: staffUserId,
        flaggedAt: new Date().toISOString(),
      }).catch(() => null);
    }

    return {
      customer: { firstName: customer.firstName },
      membership: membership
        ? { status: membership.status, planName: membership.plan?.name ?? null }
        : null,
      deal: {
        id: deal.id,
        title: deal.title,
        discountPercent: deal.discountPercent,
        maxDiscountPaisa: deal.maxDiscountAmount,
        dealType: deal.dealType,
      },
      branch,
      meta: { flags, mintAttemptsLastHour: mintAttempts },
    };
  }

  // ------------------------------------------------------------------ confirm

  /**
   * Confirm a redemption from a scanned QR token. Partner staff roles only.
   *
   * Flow: verify signature/expiry -> issuance record -> atomic replay guard
   * (Redis SET NX, NOT check-then-set) -> customer check -> full eligibility
   * re-gate on the token's owner (never the caller) -> server-side money math
   * -> ONE DB transaction writing Redemption + SavingsTransaction +
   * cashback/reward ledger rows + deal counter + audit log.
   */
  async confirmRedemption(staffUserId: string, staffRoles: string[], dto: ConfirmRedemptionDto) {
    const payload = this.verifyTokenOrThrow(dto.token);
    const { jti } = payload;

    // The issuance record must still exist (it carries the token TTL).
    const issuedRaw = await this.redis.get(`qr:jti:${jti}`);
    if (!issuedRaw) {
      throw new GoneException({
        code: 'QR_EXPIRED',
        message: 'This QR code has expired. Please generate a new one.',
      });
    }

    // Replay guard: atomic SET NX — only the first confirm wins, even under
    // concurrent double-submits. (A Lua script would work too; SET NX with
    // TTL is already atomic.)
    const firstUse = await this.redis.markQrJtiUsed(jti, 300);
    if (!firstUse) {
      throw new ConflictException({
        code: 'QR_ALREADY_USED',
        message: 'This QR code has already been used.',
      });
    }

    let record: QrIssuanceRecord;
    try {
      record = JSON.parse(issuedRaw) as QrIssuanceRecord;
      if (!record?.userId || record.dealId !== payload.dealId) throw new Error('record mismatch');
    } catch {
      // Unusable token: release the guard (best effort) so nothing is burned.
      try {
        await this.redis.del(`qr:used:${jti}`);
      } catch {
        /* best effort */
      }
      throw new UnauthorizedException({ code: 'QR_INVALID', message: 'This QR code is invalid.' });
    }

    try {
      const customer = await this.prisma.user.findUnique({ where: { id: record.userId } });
      if (!customer || customer.status !== USER_ACTIVE) {
        throw new UnauthorizedException({ code: 'QR_INVALID', message: 'QR token customer is not valid.' });
      }

      // Re-run the full eligibility gate on the token's owner (never the caller).
      const { deal, business, branch, membership, plan } = await this.checkEligibility(
        record.userId,
        payload.dealId,
        record.branchId ?? undefined,
      );

      // Phase 8: the caller must be staff of the token's deal business.
      await this.assertStaffOfBusiness(staffUserId, staffRoles, business.id);

      // ---- server-side bill math (integer paisa only; never trust the client) ----
      let math: RedemptionMathResult;
      try {
        math = computeRedemptionAmounts({
          billAmountPaisa: dto.billAmountPaisa,
          dealType: deal.dealType,
          discountPercent: deal.discountPercent,
          maxDiscountAmountPaisa: deal.maxDiscountAmount,
          originalPricePaisa: deal.originalPrice,
          dealPricePaisa: deal.dealPrice,
          cashbackPercent: plan?.cashbackPercent ?? null,
          rewardMultiplierBps: plan?.rewardMultiplierBps ?? null,
        });
      } catch {
        throw new BadRequestException({
          code: 'INVALID_BILL_AMOUNT',
          message: 'billAmountPaisa must be a positive integer paisa amount.',
        });
      }

      const now = new Date();
      // Karachi calendar period for the savings ledger (UTC+5, no DST).
      const karachiNow = new Date(now.getTime() + KARACHI_OFFSET_MS);
      const calculationSnapshot = {
        billAmount: math.billAmount,
        dealType: deal.dealType,
        discountPercent: deal.discountPercent ?? 0,
        maxDiscountAmount: deal.maxDiscountAmount ?? null,
        maxDiscountApplied: math.maxDiscountApplied,
        discountAmount: math.discountAmount,
        paidAmount: math.paidAmount,
        savingAmount: math.savingAmount,
        cashbackEarned: math.cashbackEarned,
        cashbackPercent: plan?.cashbackPercent ?? null,
        pointsEarned: math.pointsEarned,
        rewardMultiplierBps: plan?.rewardMultiplierBps ?? null,
        planId: plan?.id ?? null,
        membershipId: membership?.id ?? null,
        dealId: deal.id,
        businessId: business.id,
        branchId: branch?.id ?? null,
        confirmedBy: staffUserId,
        calculatedAt: now.toISOString(),
        timezone: APP_TIMEZONE,
        voucher: null as null | { code: string; userVoucherId: string; voucherDiscount: number },
      };

      const result = await this.prisma.$transaction(async (tx: any) => {
        // Phase 10: optional customer voucher. Validated + consumed atomically
        // inside this transaction — ownership, not-used, not-expired, campaign
        // live, min-bill met, business match. The voucher value is added to the
        // discount (clamped so it can never exceed what remains of the bill).
        let voucherDiscount = 0;
        let userVoucherId: string | null = null;
        if (dto.voucherCode?.trim()) {
          const applied = await this.vouchers.applyVoucherAtConfirm(
            tx,
            record.userId,
            dto.voucherCode,
            math.billAmount,
            business.id,
            math.billAmount - math.discountAmount,
          );
          userVoucherId = applied.userVoucherId;
          voucherDiscount = applied.voucherDiscount;
          calculationSnapshot.voucher = {
            code: dto.voucherCode.trim().toUpperCase(),
            userVoucherId,
            voucherDiscount,
          };
        }
        const discountTotal = math.discountAmount + voucherDiscount;
        const paidTotal = math.billAmount - discountTotal;
        const savingTotal = math.savingAmount + voucherDiscount;
        // Redemption cashback auto-approval is a platform setting (default
        // APPROVED so the customer sees value instantly). Set
        // `cashback.redemptionAutoApprove` = false to hold redemption
        // cashback in PENDING for manual review instead.
        const cashbackAutoApprove = await getSettingValue<boolean>(
          tx,
          'cashback.redemptionAutoApprove',
          true,
        );

        const redemption = await tx.redemption.create({
          data: {
            userId: record.userId,
            dealId: deal.id,
            businessId: business.id,
            branchId: branch?.id ?? null,
            membershipId: membership?.id ?? null,
            confirmedBy: staffUserId,
            confirmedAt: now,
            qrTokenJti: jti,
            idempotencyKey: jti, // unique: double-submit safety at the DB level
            billAmount: math.billAmount,
            discountPercent: deal.discountPercent ?? 0,
            discountAmount: discountTotal,
            paidAmount: paidTotal,
            savingAmount: savingTotal,
            userVoucherId,
            calculationSnapshot,
            pointsEarned: math.pointsEarned,
            cashbackEarned: math.cashbackEarned,
            status: REDEMPTION_CONFIRMED,
          },
        });

        // Phase 12: platform commission accrues inside the same transaction —
        // immutable CommissionEntry row based on the final paid amount.
        await this.commissions.recordCommission(tx, {
          redemptionId: redemption.id,
          businessId: business.id,
          categoryId: deal.categoryId ?? null,
          paidAmount: paidTotal,
        });

        // Phase 10: referral qualifying hook — the referred user's first
        // CONFIRMED redemption. Guarded on INVITED so it never double-rewards.
        // Returned (not notified here) so the caller can notify after commit.
        const referralQualified = await this.referrals.tryQualifyOnFirstRedemption(tx, record.userId);

        // Immutable savings ledger row (history is never edited; adjustments
        // are new rows).
        await tx.savingsTransaction.create({
          data: {
            userId: record.userId,
            redemptionId: redemption.id,
            categoryId: deal.categoryId ?? null,
            amount: savingTotal,
            periodYear: karachiNow.getUTCFullYear(),
            periodMonth: karachiNow.getUTCMonth() + 1,
          },
        });

        if (math.cashbackEarned > 0) {
          const cashback = await tx.cashback.create({
            data: {
              userId: record.userId,
              redemptionId: redemption.id,
              amount: math.cashbackEarned,
              status: cashbackAutoApprove ? 'APPROVED' : 'PENDING',
            },
          });
          await tx.cashbackTransaction.create({
            data: {
              cashbackId: cashback.id,
              userId: record.userId,
              type: 'CREDIT',
              amount: math.cashbackEarned,
              balanceAfter: math.cashbackEarned,
              reference: `redemption:${redemption.id}`,
            },
          });
        }

        if (math.pointsEarned > 0) {
          const account = await tx.rewardAccount.upsert({
            where: { userId: record.userId },
            update: {
              availablePoints: { increment: math.pointsEarned },
              lifetimePoints: { increment: math.pointsEarned },
            },
            create: {
              userId: record.userId,
              availablePoints: math.pointsEarned,
              lifetimePoints: math.pointsEarned,
              redeemedPoints: 0,
            },
          });
          await tx.rewardTransaction.create({
            data: {
              accountId: account.id,
              userId: record.userId,
              type: 'EARN',
              points: math.pointsEarned,
              balanceAfter: account.availablePoints,
              reference: `redemption:${redemption.id}`,
              meta: { dealId: deal.id },
            },
          });
        }

        // Denormalised counter backing the sold-out check.
        await tx.deal.update({
          where: { id: deal.id },
          data: { redemptionCount: { increment: 1 } },
        });

        // Audit: money moved — who confirmed what, for whom, for how much.
        await tx.auditLog.create({
          data: {
            actorId: staffUserId,
            actorRole: 'STAFF',
            action: 'redemption.confirm',
            entity: 'Redemption',
            entityId: redemption.id,
            newValues: {
              userId: record.userId,
              dealId: deal.id,
              businessId: business.id,
              branchId: branch?.id ?? null,
              billAmount: math.billAmount,
              discountAmount: discountTotal,
              paidAmount: paidTotal,
              savingAmount: savingTotal,
              cashbackEarned: math.cashbackEarned,
              pointsEarned: math.pointsEarned,
              voucherDiscount,
              userVoucherId,
            } as never,
          },
        });

        return { redemption, voucherDiscount, referralQualified };
      });

      // Phase 7: bust the customer's cached dashboard (redemption + savings +
      // cashback + points all changed). Best-effort — the 5-minute TTL is the net.
      try {
        await this.redis.del(`dashboard:${record.userId}`);
      } catch {
        /* best effort */
      }

      // Phase 11: referral qualified — notify both sides after commit.
      if (result.referralQualified) {
        const { referrerId, referredUserId } = result.referralQualified;
        this.notifyReferralQualified(referrerId, referredUserId);
      }

      // Phase 8: bust the partner dashboard cache for this business.
      try {
        await this.redis.del(`partner-dashboard:${business.id}`);
      } catch {
        /* best effort */
      }

      // Phase 9: bust the admin overview cache (activity + revenue KPIs changed).
      try {
        await this.redis.del(ADMIN_OVERVIEW_CACHE_KEY);
      } catch {
        /* best effort */
      }

      return {
        redemptionId: result.redemption.id,
        bill: math.billAmount,
        discount: math.discountAmount + result.voucherDiscount,
        paid: math.paidAmount - result.voucherDiscount,
        saving: math.savingAmount + result.voucherDiscount,
        cashback: math.cashbackEarned,
        points: math.pointsEarned,
        voucherDiscount: result.voucherDiscount,
      };
    } catch (err) {
      // The DB transaction failed: release the replay guard (best effort) so a
      // transient failure doesn't permanently burn the customer's QR.
      try {
        await this.redis.del(`qr:used:${jti}`);
      } catch {
        /* best effort */
      }
      if (err instanceof HttpException) throw err;
      this.logger.error(`confirmRedemption failed for jti ${jti}: ${(err as Error).message}`);
      throw new HttpException(
        { code: 'REDEMPTION_FAILED', message: 'Could not complete the redemption. Please try again.' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ------------------------------------------------------------------- history

  async getHistory(
    userId: string,
    page = 1,
    pageSize = 20,
  ): Promise<PaginatedResponse<unknown>> {
    const take = Math.min(Math.max(pageSize, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;
    const [total, rows] = await Promise.all([
      this.prisma.redemption.count({ where: { userId } }),
      this.prisma.redemption.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          deal: { select: { id: true, title: true, slug: true } },
          business: { select: { id: true, name: true, slug: true } },
          branch: { select: { id: true, name: true } },
        },
      }),
    ]);
    // Matches @bachatly/types PaginatedResponse<T>.
    return {
      items: rows,
      page: Math.max(page, 1),
      pageSize: take,
      total,
      totalPages: Math.max(1, Math.ceil(total / take)),
    };
  }

  // ------------------------------------------------------------ savings summary

  /**
   * Customer savings dashboard. All figures are integer paisa, aggregated
   * from the immutable SavingsTransaction ledger (never from Redemption
   * rows directly, so adjustments stay consistent).
   */
  async getSavingsSummary(userId: string) {
    const karachiNow = new Date(Date.now() + KARACHI_OFFSET_MS);
    const year = karachiNow.getUTCFullYear();
    const month = karachiNow.getUTCMonth() + 1;

    const [totalAgg, monthAgg, yearAgg, byCatRows, byMonthRows] = await Promise.all([
      this.prisma.savingsTransaction.aggregate({
        where: { userId },
        _sum: { amount: true },
      }),
      this.prisma.savingsTransaction.aggregate({
        where: { userId, periodYear: year, periodMonth: month },
        _sum: { amount: true },
      }),
      this.prisma.savingsTransaction.aggregate({
        where: { userId, periodYear: year },
        _sum: { amount: true },
      }),
      this.prisma.savingsTransaction.groupBy({
        by: ['categoryId'],
        where: { userId },
        _sum: { amount: true },
      }),
      this.prisma.savingsTransaction.groupBy({
        by: ['periodYear', 'periodMonth'],
        where: { userId },
        _sum: { amount: true },
        orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
        take: 12,
      }),
    ]);

    const catIds = byCatRows
      .map((r) => r.categoryId)
      .filter((id): id is string => !!id);
    const cats = catIds.length
      ? await this.prisma.category.findMany({
          where: { id: { in: catIds } },
          select: { id: true, name: true },
        })
      : [];
    const catName = new Map(cats.map((c) => [c.id, c.name]));

    return {
      total: totalAgg._sum.amount ?? 0,
      thisMonth: monthAgg._sum.amount ?? 0,
      thisYear: yearAgg._sum.amount ?? 0,
      byCategory: byCatRows.map((r) => ({
        categoryId: r.categoryId,
        categoryName: r.categoryId ? (catName.get(r.categoryId) ?? 'Other') : 'Other',
        total: r._sum.amount ?? 0,
      })),
      byMonth: byMonthRows.map((r) => ({
        month: `${r.periodYear}-${String(r.periodMonth).padStart(2, '0')}`,
        total: r._sum.amount ?? 0,
      })),
    };
  }

  // --------------------------------------------------------------------- admin

  /** Paginated redemption list for platform admins (support/finance review). */
  async getAdminRedemptions(query: {
    status?: string;
    businessId?: string;
    q?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResponse<unknown>> {
    const take = Math.min(Math.max(query.pageSize ?? 20, 1), 100);
    const page = Math.max(query.page ?? 1, 1);
    const skip = (page - 1) * take;

    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.businessId) where.businessId = query.businessId;
    const q = query.q?.trim();
    if (q) {
      where.OR = [
        { user: { firstName: { contains: q, mode: 'insensitive' } } },
        { user: { lastName: { contains: q, mode: 'insensitive' } } },
        { user: { email: { contains: q, mode: 'insensitive' } } },
        { deal: { title: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.redemption.count({ where }),
      this.prisma.redemption.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
          deal: { select: { id: true, title: true, slug: true } },
          business: { select: { id: true, name: true, slug: true } },
          branch: { select: { id: true, name: true } },
        },
      }),
    ]);
    return {
      items: rows,
      page,
      pageSize: take,
      total,
      totalPages: Math.max(1, Math.ceil(total / take)),
    };
  }

  /**
   * Phase 9: persist a fraud signal to the capped Redis feed consumed by
   * GET /admin/fraud-alerts. Best-effort — validation must never fail because
   * the alert feed write failed.
   */
  private async persistFraudAlert(event: Record<string, unknown>): Promise<void> {
    await this.redis.lpush(FRAUD_ALERTS_KEY, JSON.stringify({ id: `fr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, ...event }));
    await this.redis.ltrim(FRAUD_ALERTS_KEY, FRAUD_ALERTS_MAX);
    await this.redis.expire(FRAUD_ALERTS_KEY, FRAUD_ALERTS_TTL_SEC);
  }

  /**
   * Phase 11 — notify both sides when a referral qualifies. Fire-and-forget:
   * called after the redemption transaction commits, never throws.
   */
  private notifyReferralQualified(referrerId: string, referredUserId: string): void {
    this.notify?.dispatch(referrerId, {
        type: 'REFERRAL_QUALIFIED',
        title: 'Referral reward earned 🎁',
        body: 'Someone you invited made their first purchase. Your referral reward has been credited.',
        data: { referredUserId },
        channels: ['IN_APP', 'EMAIL'],
      })
      ?.catch(() => null);
    this.notify?.dispatch(referredUserId, {
        type: 'REFERRAL_QUALIFIED',
        title: 'Welcome reward credited 🎁',
        body: 'Your first purchase is done — your referral welcome reward has been credited to your account.',
        data: { referrerId },
        channels: ['IN_APP'],
      })
      ?.catch(() => null);
  }
}
