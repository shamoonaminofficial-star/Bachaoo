import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { assertIntPaisa } from '../../common/utils/money';
import { ADMIN_OVERVIEW_CACHE_KEY } from '../admin/admin-overview.service';
import { parsePagination, buildPaginatedResponse } from '../../common/utils/pagination';
import { STORAGE_SERVICE, IStorageService } from '../../common/storage/storage.interface';
import { GatewayFactory } from '../payments/gateways/gateway.factory';
import { PaymentGateway } from './dto/purchase-plan.dto';
import { NotificationDispatchService, type DispatchChannel } from '../notifications/dispatch.service';
import { CreatePlanDto, UpdatePlanDto } from './dto/plan.dto';
import { ManualReceiptDto } from './dto/manual-receipt.dto';
import {
  AssignMembershipDto,
  CancelMembershipDto,
  ExtendMembershipDto,
  MembershipQueryDto,
} from './dto/manage-membership.dto';

const DAY_MS = 24 * 60 * 60 * 1000; // integer — no floats

const PAYMENT_PENDING = 'PENDING';
const PAYMENT_AWAITING_VERIFICATION = 'AWAITING_VERIFICATION';
const PAYMENT_PAID = 'PAID';
const PAYMENT_CANCELLED = 'CANCELLED';

const MEMBERSHIP_ACTIVE = 'ACTIVE';
const MEMBERSHIP_EXPIRED = 'EXPIRED';
const MEMBERSHIP_CANCELLED = 'CANCELLED';

const RECEIPT_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const RECEIPT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

function membershipNumber(): string {
  // BCH-<yy>-<6 uppercase alphanumerics>, e.g. BCH-26-K7Q2XA
  const yy = String(new Date().getFullYear()).slice(-2);
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(6);
  let suffix = '';
  for (const b of bytes) suffix += alphabet[b % alphabet.length];
  return `BCH-${yy}-${suffix}`;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

@Injectable()
export class MembershipsService {
  private readonly logger = new Logger(MembershipsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateways: GatewayFactory,
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
    private readonly redis: RedisService,
    private readonly notify: NotificationDispatchService,
  ) {}

  /** Phase 7: keep the cached customer dashboard honest (membership block). */
  private async bustDashboard(userId: string): Promise<void> {
    try {
      await this.redis.del(`dashboard:${userId}`);
      // Phase 9: membership mutations also change the admin overview KPIs.
      await this.redis.del(ADMIN_OVERVIEW_CACHE_KEY);
    } catch {
      /* best effort — 5-minute TTL is the safety net */
    }
  }

  // --------------------------------------------------------------------- plans

  /** Public: active plans, featured first. */
  listPlans() {
    return this.prisma.membershipPlan.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: [{ isFeatured: 'desc' }, { salePrice: 'asc' }],
    });
  }

  /** Admin: all plans including inactive (soft-deleted excluded). */
  listPlansAdmin() {
    return this.prisma.membershipPlan.findMany({
      where: { deletedAt: null },
      orderBy: [{ isFeatured: 'desc' }, { salePrice: 'asc' }],
    });
  }

  async createPlan(dto: CreatePlanDto) {
    this.assertPlanPricing(dto.regularPrice, dto.salePrice);
    const slug = await this.uniquePlanSlug(dto.toSlug());
    return this.prisma.membershipPlan.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        regularPrice: dto.regularPrice,
        salePrice: dto.salePrice,
        durationDays: dto.durationDays,
        benefits: dto.benefits,
        rewardMultiplierBps: dto.rewardMultiplierBps,
        cashbackPercent: dto.cashbackPercent,
        eligibleCategoryIds: dto.eligibleCategoryIds ?? [],
        eligibleBusinessIds: dto.eligibleBusinessIds ?? [],
        isFeatured: dto.isFeatured ?? false,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updatePlan(id: string, dto: UpdatePlanDto) {
    const plan = await this.prisma.membershipPlan.findUnique({ where: { id } });
    if (!plan || plan.deletedAt) {
      throw new NotFoundException({ code: 'PLAN_NOT_FOUND', message: 'Membership plan not found.' });
    }
    const regularPrice = dto.regularPrice ?? plan.regularPrice;
    const salePrice = dto.salePrice ?? plan.salePrice;
    this.assertPlanPricing(regularPrice, salePrice);
    if (dto.slug && dto.slug !== plan.slug) {
      const clash = await this.prisma.membershipPlan.findUnique({ where: { slug: dto.slug } });
      if (clash) {
        throw new ConflictException({ code: 'PLAN_SLUG_TAKEN', message: 'A plan with this slug already exists.' });
      }
    }
    return this.prisma.membershipPlan.update({ where: { id }, data: { ...dto } });
  }

  async deletePlan(id: string) {
    const plan = await this.prisma.membershipPlan.findUnique({ where: { id } });
    if (!plan || plan.deletedAt) {
      throw new NotFoundException({ code: 'PLAN_NOT_FOUND', message: 'Membership plan not found.' });
    }
    const inUse = await this.prisma.membership.count({
      where: { planId: id, status: MEMBERSHIP_ACTIVE, deletedAt: null },
    });
    if (inUse > 0) {
      throw new ConflictException({
        code: 'PLAN_IN_USE',
        message: `Cannot delete: ${inUse} active membership(s) use this plan. Deactivate it instead.`,
      });
    }
    return this.prisma.membershipPlan.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  }

  private assertPlanPricing(regularPrice: number, salePrice: number) {
    assertIntPaisa(regularPrice, 'regularPrice');
    assertIntPaisa(salePrice, 'salePrice');
    if (salePrice > regularPrice) {
      throw new BadRequestException({
        code: 'INVALID_PLAN_PRICING',
        message: 'Sale price cannot exceed the regular price.',
      });
    }
  }

  private async uniquePlanSlug(base: string): Promise<string> {
    let slug = base || 'plan';
    for (let n = 2; ; n++) {
      const existing = await this.prisma.membershipPlan.findUnique({ where: { slug } });
      if (!existing) return slug;
      slug = `${base}-${n}`;
    }
  }

  // ------------------------------------------------------------------ purchase

  /**
   * Start a membership purchase. The price ALWAYS comes from the plan row —
   * the client can never set or override the amount.
   *
   * Creates a PENDING Payment (+ attempt), then asks the resolved gateway for
   * client instructions. If the gateway can't build an intent (e.g. keys not
   * configured), the payment is CANCELLED and the gateway error is rethrown —
   * no orphan PENDING payments.
   */
  async purchasePlan(userId: string, dto: { planId: string; gateway: PaymentGateway }) {
    const plan = await this.prisma.membershipPlan.findUnique({ where: { id: dto.planId } });
    if (!plan || plan.deletedAt || !plan.isActive) {
      throw new NotFoundException({
        code: 'PLAN_NOT_FOUND',
        message: 'This membership plan is not available.',
      });
    }
    const amount = plan.salePrice;
    assertIntPaisa(amount, 'plan.salePrice');

    const gateway = this.gateways.resolve(dto.gateway);

    const payment = await this.prisma.payment.create({
      data: {
        userId,
        orderType: 'MEMBERSHIP',
        amount,
        currency: 'PKR',
        gateway: dto.gateway,
        status: PAYMENT_PENDING,
      },
    });

    let intent;
    try {
      intent = await gateway.createIntent({ id: payment.id, amount, currency: 'PKR', userId });
    } catch (err) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PAYMENT_CANCELLED, failureReason: (err as Error).message?.slice(0, 500) },
      });
      throw err;
    }

    await this.prisma.paymentAttempt.create({
      data: {
        paymentId: payment.id,
        gateway: dto.gateway,
        status: PAYMENT_PENDING,
        // The plan link lives on the attempt payload (Payment has no plan FK
        // until the Membership row exists).
        requestPayload: { planId: plan.id, amount } as never,
      },
    });

    return {
      paymentId: payment.id,
      gateway: dto.gateway,
      kind: intent.kind,
      clientData: intent.clientData,
    };
  }

  // ------------------------------------------------------------ manual receipt

  /**
   * Customer uploads proof of a bank transfer (multipart `file`: image or PDF,
   * ≤5 MB). The payment moves to AWAITING_VERIFICATION for admin review.
   */
  async uploadManualReceipt(
    userId: string,
    paymentId: string,
    dto: ManualReceiptDto,
    file: Express.Multer.File | undefined,
  ) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || (payment as any).userId !== userId) {
      throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND', message: 'Payment not found.' });
    }
    if ((payment as any).status !== PAYMENT_PENDING) {
      throw new UnprocessableEntityException({
        code: 'PAYMENT_NOT_PENDING',
        message: 'Receipts can only be attached to pending payments.',
      });
    }
    if (!['BANK_TRANSFER', 'MANUAL'].includes((payment as any).gateway)) {
      throw new UnprocessableEntityException({
        code: 'NOT_MANUAL_PAYMENT',
        message: 'This payment does not use manual bank transfer.',
      });
    }
    if (!file) {
      throw new BadRequestException({ code: 'RECEIPT_REQUIRED', message: 'A receipt file is required.' });
    }
    if (!RECEIPT_MIME.includes(file.mimetype)) {
      throw new BadRequestException({
        code: 'INVALID_RECEIPT_TYPE',
        message: `Receipt must be one of: ${RECEIPT_MIME.join(', ')}.`,
      });
    }
    if (file.size > RECEIPT_MAX_BYTES) {
      throw new BadRequestException({ code: 'RECEIPT_TOO_LARGE', message: 'Receipt must be 5 MB or smaller.' });
    }

    const { url } = await this.storage.upload({
      filename: file.originalname,
      mimetype: file.mimetype,
      buffer: file.buffer,
      folder: 'payment-receipts',
    });

    const receipt = await this.prisma.$transaction(async (tx: any) => {
      const r = await tx.manualPaymentReceipt.upsert({
        where: { paymentId },
        update: {
          receiptUrl: url,
          bankName: dto.bankName ?? null,
          accountTitle: dto.accountTitle ?? null,
          iban: dto.iban ?? null,
          status: 'SUBMITTED',
        },
        create: {
          paymentId,
          receiptUrl: url,
          bankName: dto.bankName ?? null,
          accountTitle: dto.accountTitle ?? null,
          iban: dto.iban ?? null,
          status: 'SUBMITTED',
        },
      });
      await tx.payment.update({
        where: { id: paymentId },
        data: { status: PAYMENT_AWAITING_VERIFICATION },
      });
      await tx.paymentAttempt.create({
        data: {
          paymentId,
          gateway: (payment as any).gateway,
          status: PAYMENT_AWAITING_VERIFICATION,
          responsePayload: { receiptUrl: url } as never,
        },
      });
      return r;
    });

    return receipt;
  }

  // -------------------------------------------------------------- activation

  /**
   * Activate the membership for a PAID payment. Runs in a DB transaction:
   * creates the Membership row + immutable MembershipHistory entry, fires the
   * referral qualifying event, and awards signup reward points.
   *
   * Renewals stack: when the user already has an active membership, the new
   * period starts at the current end date instead of now.
   *
   * Safe to retry (webhooks are idempotent): returns the existing membership
   * when the payment is already linked to one.
   */
  async activateMembership(paymentId: string, actorId?: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: { userId: true },
    });
    const result = await this.prisma.$transaction(async (tx: any) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: { attempts: { orderBy: { createdAt: 'desc' }, take: 1 } },
      });
      if (!payment) {
        throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND', message: 'Payment not found.' });
      }
      if (payment.status !== PAYMENT_PAID) {
        throw new UnprocessableEntityException({
          code: 'PAYMENT_NOT_PAID',
          message: 'Membership can only be activated for a paid payment.',
        });
      }
      if (payment.orderType !== 'MEMBERSHIP') {
        throw new UnprocessableEntityException({
          code: 'INVALID_ORDER_TYPE',
          message: 'This payment is not for a membership.',
        });
      }

      const existing = await tx.membership.findFirst({ where: { paymentId } });
      if (existing) return existing; // idempotent retry

      // The plan link was stored on the payment attempt payload at purchase time.
      const planId = (payment.attempts?.[0]?.requestPayload as any)?.planId as string | undefined;
      if (!planId) {
        throw new UnprocessableEntityException({
          code: 'PLAN_UNKNOWN',
          message: 'Could not determine the membership plan for this payment.',
        });
      }
      const plan = await tx.membershipPlan.findUnique({ where: { id: planId } });
      if (!plan) {
        throw new NotFoundException({ code: 'PLAN_NOT_FOUND', message: 'Membership plan not found.' });
      }

      const now = new Date();
      // Stack renewals: new period starts at the current expiry when one exists.
      const current = await tx.membership.findFirst({
        where: { userId: payment.userId, status: MEMBERSHIP_ACTIVE, endDate: { gt: now }, deletedAt: null },
        orderBy: { endDate: 'desc' },
      });
      const startDate = current && current.endDate && current.endDate > now ? current.endDate : now;
      const endDate = new Date(startDate.getTime() + Number(plan.durationDays) * DAY_MS);

      const membership = await this.createMembershipWithUniqueNumber(tx, {
        userId: payment.userId,
        planId: plan.id,
        status: MEMBERSHIP_ACTIVE,
        startDate,
        endDate,
        paymentId,
      });

      await tx.membershipHistory.create({
        data: {
          membershipId: membership.id,
          action: 'ACTIVATED',
          actorId: actorId ?? payment.userId,
          reason: `Activated via payment ${payment.id} (${payment.gateway})`,
          newValues: {
            planId: plan.id,
            membershipNumber: membership.membershipNumber,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
          } as never,
        },
      });

      // Referral qualifying event: first paid membership.
      await this.applyReferralReward(tx, payment.userId);

      // Signup reward points: first-ever membership only.
      const priorCount = await tx.membership.count({
        where: { userId: payment.userId, id: { not: membership.id }, deletedAt: null },
      });
      if (priorCount === 0) {
        const signupPoints = await this.getSettingInt(tx, 'signup.reward_points', 100);
        if (signupPoints > 0) {
          await this.creditPoints(tx, payment.userId, signupPoints, `signup:${membership.id}`, {
            membershipId: membership.id,
            kind: 'SIGNUP_BONUS',
          });
        }
      }

      return { ...membership, plan };
    }).then(async (result) => {
      if (payment?.userId) await this.bustDashboard(payment.userId);
      // Phase 11: welcome notification — best-effort, never fails activation.
      if (payment?.userId && result) {
        const planName = (result as any)?.plan?.name ?? 'Bachatly';
        const endDate = (result as any)?.endDate ? new Date((result as any).endDate) : null;
        this.notify?.dispatch(payment.userId, {
            type: 'MEMBERSHIP_ACTIVATED',
            title: 'Membership activated 🎉',
            body: endDate
              ? `Your ${planName} membership is active until ${endDate.toLocaleDateString('en-PK')}. Start saving!`
              : `Your ${planName} membership is now active. Start saving!`,
            data: { membershipId: (result as any)?.id },
            channels: ['IN_APP', 'EMAIL'],
          })
          ?.catch(() => null);
      }
      return result;
    });
    return result;
  }

  /** Retries on membership-number collision (unique constraint). */
  private async createMembershipWithUniqueNumber(tx: any, data: any) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await tx.membership.create({ data: { ...data, membershipNumber: membershipNumber() } });
      } catch (err: any) {
        if (err?.code === 'P2002' && attempt < 2) continue;
        throw err;
      }
    }
    throw new ConflictException({ code: 'MEMBERSHIP_NUMBER_FAILED', message: 'Could not generate a membership number.' });
  }

  /**
   * Referral qualifying event = first paid membership. Marks the referral
   * QUALIFIED and credits the referrer's configured point reward (ledgered).
   */
  private async applyReferralReward(tx: any, referredUserId: string) {
    const referral = await tx.referral.findFirst({
      where: { referredUserId, status: 'INVITED' },
    });
    if (!referral) return;

    const now = new Date();
    await tx.referral.update({
      where: { id: referral.id },
      data: { status: 'QUALIFIED', qualifiedAt: now },
    });

    const rewardPoints = await this.getSettingInt(tx, 'referral.reward_points', 500);
    if (rewardPoints > 0) {
      await this.creditPoints(tx, referral.referrerId, rewardPoints, `referral:${referral.id}`, {
        referralId: referral.id,
        kind: 'REFERRAL_REWARD',
      });
      await tx.referralReward.create({
        data: {
          referralId: referral.id,
          userId: referral.referrerId,
          type: 'POINTS',
          pointsAmount: rewardPoints,
          status: 'APPROVED',
        },
      });
    }
    await tx.referral.update({
      where: { id: referral.id },
      data: { status: 'REWARDED', rewardedAt: now },
    });
  }

  /** Ledgered point credit. Every points change = one RewardTransaction row. */
  private async creditPoints(
    tx: any,
    userId: string,
    points: number,
    reference: string,
    meta: Record<string, unknown>,
  ) {
    assertIntPaisa(points, 'points');
    if (points <= 0) return;
    const account = await tx.rewardAccount.upsert({
      where: { userId },
      update: {},
      create: { userId, availablePoints: 0, lifetimePoints: 0, redeemedPoints: 0 },
    });
    const balanceAfter = account.availablePoints + points;
    await tx.rewardAccount.update({
      where: { id: account.id },
      data: { availablePoints: balanceAfter, lifetimePoints: account.lifetimePoints + points },
    });
    await tx.rewardTransaction.create({
      data: {
        accountId: account.id,
        userId,
        type: 'EARN',
        points,
        balanceAfter,
        reference,
        meta: meta as never,
      },
    });
  }

  private async getSettingInt(tx: any, key: string, fallback: number): Promise<number> {
    const setting = await tx.systemSetting.findUnique({ where: { key } });
    const raw = setting?.value as unknown;
    const n = typeof raw === 'number' ? raw : Number((raw as any)?.value ?? NaN);
    return Number.isInteger(n) && n >= 0 ? n : fallback;
  }

  // --------------------------------------------------------------- my membership

  /** Current active membership (+ days remaining), else the most recent one. */
  async getMyMembership(userId: string) {
    const now = new Date();
    const active = await this.prisma.membership.findFirst({
      where: { userId, status: MEMBERSHIP_ACTIVE, endDate: { gt: now }, deletedAt: null },
      include: { plan: true },
      orderBy: { endDate: 'desc' },
    });
    const membership =
      active ??
      (await this.prisma.membership.findFirst({
        where: { userId, deletedAt: null },
        include: { plan: true },
        orderBy: { createdAt: 'desc' },
      }));
    if (!membership) return null;
    const daysRemaining =
      membership.status === MEMBERSHIP_ACTIVE && membership.endDate
        ? Math.max(0, Math.ceil((membership.endDate.getTime() - now.getTime()) / DAY_MS))
        : 0;
    return { ...membership, daysRemaining };
  }

  async getHistory(userId: string) {
    return this.prisma.membershipHistory.findMany({
      where: { membership: { userId, deletedAt: null } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { actor: { select: { firstName: true, lastName: true } } },
    });
  }

  // ------------------------------------------------------- admin: memberships

  async listMembershipsAdmin(query: MembershipQueryDto) {
    const { page, pageSize, skip, take } = parsePagination(query, ['createdAt', 'endDate'], 'createdAt');
    const where: any = { deletedAt: null };
    if (query.status) where.status = query.status.toUpperCase();
    if (query.q) {
      where.OR = [
        { membershipNumber: { contains: query.q, mode: 'insensitive' } },
        { user: { email: { contains: query.q, mode: 'insensitive' } } },
        { user: { firstName: { contains: query.q, mode: 'insensitive' } } },
        { user: { lastName: { contains: query.q, mode: 'insensitive' } } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.membership.findMany({
        where,
        include: {
          plan: { select: { id: true, name: true, slug: true } },
          user: { select: { id: true, email: true, firstName: true, lastName: true, phone: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.membership.count({ where }),
    ]);
    return buildPaginatedResponse(items, total, page, pageSize);
  }

  async extendMembership(id: string, dto: ExtendMembershipDto, actorId: string) {
    const membership = await this.prisma.membership.findUnique({ where: { id } });
    if (!membership || membership.deletedAt) {
      throw new NotFoundException({ code: 'MEMBERSHIP_NOT_FOUND', message: 'Membership not found.' });
    }
    if (membership.status !== MEMBERSHIP_ACTIVE) {
      throw new UnprocessableEntityException({
        code: 'MEMBERSHIP_NOT_ACTIVE',
        message: 'Only active memberships can be extended.',
      });
    }
    const base = membership.endDate && membership.endDate > new Date() ? membership.endDate : new Date();
    const newEndDate = new Date(base.getTime() + dto.days * DAY_MS);

    return this.prisma.$transaction(async (tx: any) => {
      const updated = await tx.membership.update({
        where: { id },
        data: { endDate: newEndDate },
        include: { plan: true },
      });
      await tx.membershipHistory.create({
        data: {
          membershipId: id,
          action: 'EXTENDED',
          actorId,
          reason: dto.reason,
          oldValues: { endDate: membership.endDate?.toISOString() ?? null } as never,
          newValues: { endDate: newEndDate.toISOString(), addedDays: dto.days } as never,
        },
      });
      return updated;
    }).then(async (result) => {
      await this.bustDashboard(membership.userId);
      return result;
    });
  }

  /** Customer cancels their own active membership. */
  async cancelMyMembership(userId: string, dto: CancelMembershipDto) {
    const membership = await this.prisma.membership.findFirst({
      where: { userId, status: MEMBERSHIP_ACTIVE, deletedAt: null },
      orderBy: { endDate: 'desc' },
      select: { id: true },
    });
    if (!membership) {
      throw new UnprocessableEntityException({
        code: 'NO_ACTIVE_MEMBERSHIP',
        message: 'You do not have an active membership to cancel.',
      });
    }
    return this.cancelMembership(membership.id, dto, userId);
  }

  async cancelMembership(id: string, dto: CancelMembershipDto, actorId: string) {
    const membership = await this.prisma.membership.findUnique({ where: { id } });
    if (!membership || membership.deletedAt) {
      throw new NotFoundException({ code: 'MEMBERSHIP_NOT_FOUND', message: 'Membership not found.' });
    }
    if (membership.status !== MEMBERSHIP_ACTIVE) {
      throw new UnprocessableEntityException({
        code: 'MEMBERSHIP_NOT_ACTIVE',
        message: 'Only active memberships can be cancelled.',
      });
    }
    const now = new Date();
    return this.prisma.$transaction(async (tx: any) => {
      const updated = await tx.membership.update({
        where: { id },
        data: { status: MEMBERSHIP_CANCELLED, cancelledAt: now },
        include: { plan: true },
      });
      await tx.membershipHistory.create({
        data: {
          membershipId: id,
          action: 'CANCELLED',
          actorId,
          reason: dto.reason,
          oldValues: { status: MEMBERSHIP_ACTIVE } as never,
          newValues: { status: MEMBERSHIP_CANCELLED, cancelledAt: now.toISOString() } as never,
        },
      });
      return updated;
    });
  }

  /**
   * Admin grants a membership directly (no payment). Every grant is history-
   * logged and audited via the controller's @Audit decorator.
   */
  async assignMembership(dto: AssignMembershipDto, actorId: string) {
    if (!dto.userId && !dto.userEmail) {
      throw new BadRequestException({ code: 'USER_REQUIRED', message: 'Provide userId or userEmail.' });
    }
    const user = dto.userId
      ? await this.prisma.user.findUnique({ where: { id: dto.userId } })
      : await this.prisma.user.findUnique({ where: { email: dto.userEmail } });
    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found.' });
    }
    const plan = await this.prisma.membershipPlan.findUnique({ where: { id: dto.planId } });
    if (!plan || plan.deletedAt || !plan.isActive) {
      throw new NotFoundException({ code: 'PLAN_NOT_FOUND', message: 'Membership plan not available.' });
    }
    const days = dto.days ?? plan.durationDays;
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + days * DAY_MS);

    return this.prisma.$transaction(async (tx: any) => {
      const membership = await this.createMembershipWithUniqueNumber(tx, {
        userId: dto.userId,
        planId: plan.id,
        status: MEMBERSHIP_ACTIVE,
        startDate,
        endDate,
        paymentId: null,
      });
      await tx.membershipHistory.create({
        data: {
          membershipId: membership.id,
          action: 'ASSIGNED',
          actorId,
          reason: dto.reason,
          newValues: {
            planId: plan.id,
            membershipNumber: membership.membershipNumber,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
          } as never,
        },
      });
      return { ...membership, plan };
    }).then(async (result) => {
      await this.bustDashboard(user.id);
      return result;
    });
  }

  // -------------------------------------------------------------------- expiry

  /** Daily cron: mark past-due active memberships EXPIRED (history-logged). */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async expireMemberships() {
    const now = new Date();
    const due = await this.prisma.membership.findMany({
      where: { status: MEMBERSHIP_ACTIVE, endDate: { lt: now }, deletedAt: null },
      select: { id: true, userId: true },
    });
    if (!due.length) return { expired: 0 };
    const ids = due.map((m) => m.id);
    await this.prisma.$transaction(async (tx: any) => {
      await tx.membership.updateMany({
        where: { id: { in: ids } },
        data: { status: MEMBERSHIP_EXPIRED },
      });
      await tx.membershipHistory.createMany({
        data: ids.map((id) => ({
          membershipId: id,
          action: 'EXPIRED',
          reason: 'Reached end date (daily expiry cron)',
        })),
      });
    });
    this.logger.log(`Expired ${ids.length} membership(s).`);
    for (const m of due) await this.bustDashboard(m.userId);
    // Phase 11: notify each expired member — best-effort.
    for (const m of due) {
      this.notify?.dispatch(m.userId, {
          type: 'MEMBERSHIP_EXPIRED',
          title: 'Your membership expired',
          body: 'Your Bachatly membership has expired. Renew to keep saving on every visit.',
          data: { membershipId: m.id },
          channels: ['IN_APP', 'EMAIL'],
        })
        ?.catch(() => null);
    }
    return { expired: ids.length };
  }

  /**
   * Phase 11 — daily reminder cron for memberships expiring within the next
   * `days` days. Deduped via recentlySent so a user gets at most one reminder
   * per 24h even if the cron overlaps. Honors membershipReminders preference.
   */
  @Cron('0 3 * * *')
  async sendExpiryReminders() {
    const days = await this.getSettingInt(this.prisma as any, 'notifications.expiry_reminder_days', 7);
    const expiring = await this.getExpiringSoon(days);
    let sent = 0;
    for (const m of expiring) {
      try {
        const dup = await this.notify?.recentlySent(m.user.id, 'MEMBERSHIP_EXPIRING', 24 * 60 * 60 * 1000);
        if (dup) continue;
        const daysLeft = Math.max(1, Math.ceil((new Date(m.endDate!).getTime() - Date.now()) / DAY_MS));
        await this.notify?.dispatch(m.user.id, {
          type: 'MEMBERSHIP_EXPIRING',
          title: `Membership expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
          body: `Your ${m.plan?.name ?? 'Bachatly'} membership ends on ${new Date(m.endDate!).toLocaleDateString('en-PK')}. Renew now to keep your savings going.`,
          data: { membershipId: m.id, daysLeft },
          channels: ['IN_APP', 'EMAIL'] as DispatchChannel[],
        });
        sent++;
      } catch {
        /* best effort per user */
      }
    }
    this.logger.log(`Sent ${sent} expiry reminder(s) for memberships expiring within ${days}d.`);
    return { sent };
  }

  /**
   * Hook data for the notifications module (Phase 11): memberships expiring
   * within the next `days` days, with contact details for reminders.
   */
  async getExpiringSoon(days = 7) {
    const now = new Date();
    const until = new Date(now.getTime() + days * DAY_MS);
    return this.prisma.membership.findMany({
      where: {
        status: MEMBERSHIP_ACTIVE,
        endDate: { gt: now, lte: until },
        deletedAt: null,
      },
      select: {
        id: true,
        endDate: true,
        plan: { select: { id: true, name: true } },
        user: { select: { id: true, email: true, phone: true, firstName: true } },
      },
      orderBy: { endDate: 'asc' },
    });
  }

  /** Guard helper for payments module: only the owner may see the payment. */
  async assertPaymentOwner(paymentId: string, userId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) {
      throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND', message: 'Payment not found.' });
    }
    if ((payment as any).userId !== userId) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You cannot view this payment.' });
    }
    return payment;
  }
}
