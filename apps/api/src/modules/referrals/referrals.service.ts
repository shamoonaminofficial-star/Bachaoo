import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RewardsService } from '../rewards/rewards.service';
import { NotificationDispatchService } from '../notifications/dispatch.service';
import { getSettingValue } from '../../common/utils/settings';

const APPLY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Reward amounts are read ONLY from system settings (admin-configurable).
 * Defaults are 0 (no reward) — nothing is hardcoded in code or docs.
 */
const SETTING_KEYS = {
  referrerPoints: 'referral.referrer_points',
  referrerCashbackPaisa: 'referral.referrer_cashback_paisa',
  referredPoints: 'referral.referred_points',
  referredCashbackPaisa: 'referral.referred_cashback_paisa',
} as const;

/**
 * Phase 10 — referrals.
 *
 * Signup with a code creates an INVITED Referral (auth flow). Users who missed
 * it can apply a code within 7 days via POST /referrals/apply. Qualifying
 * event = the referred user's first CONFIRMED redemption (the memberships
 * module already qualifies on first paid membership — both paths guard on the
 * INVITED status, so a referral is rewarded exactly once).
 */
@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rewards: RewardsService,
    private readonly notify: NotificationDispatchService,
  ) {}

  private frontendUrl(): string {
    return process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  }

  /** The caller's shareable referral code + link. */
  async getMyCode(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { referralCode: true },
    });
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found.' });
    return {
      code: user.referralCode,
      link: `${this.frontendUrl()}/r/${user.referralCode}`,
    };
  }

  /** Real referral stats — counts and rewards earned, never invented. */
  async getStats(userId: string) {
    const [referredCount, qualifiedCount, pendingCount, rewards] = await Promise.all([
      this.prisma.referral.count({ where: { referrerId: userId } }),
      this.prisma.referral.count({ where: { referrerId: userId, status: { in: ['QUALIFIED', 'REWARDED'] } } }),
      this.prisma.referral.count({ where: { referrerId: userId, status: 'INVITED' } }),
      this.prisma.referralReward.aggregate({
        where: { userId, status: 'APPROVED' },
        _sum: { pointsAmount: true, cashbackAmount: true },
      }),
    ]);
    return {
      referredCount,
      qualifiedCount,
      pendingCount,
      totalPointsEarned: rewards._sum.pointsAmount ?? 0,
      totalCashbackEarnedPaisa: rewards._sum.cashbackAmount ?? 0,
    };
  }

  /**
   * Apply a referral code post-signup (within 7 days of signup). One code per
   * user, never your own code.
   */
  async applyCode(userId: string, code: string) {
    const normalized = code.trim().toUpperCase();
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, referralCode: true, createdAt: true },
    });
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found.' });

    if (Date.now() - user.createdAt.getTime() > APPLY_WINDOW_MS) {
      throw new BadRequestException({
        code: 'APPLY_WINDOW_EXPIRED',
        message: 'Referral codes can only be applied within 7 days of signup.',
      });
    }

    const existing = await this.prisma.referral.findUnique({ where: { referredUserId: userId } });
    if (existing) {
      throw new ConflictException({
        code: 'REFERRAL_ALREADY_APPLIED',
        message: 'You have already applied a referral code.',
      });
    }

    const referrer = await this.prisma.user.findFirst({
      where: { referralCode: normalized, deletedAt: null },
      select: { id: true },
    });
    if (!referrer) {
      throw new NotFoundException({ code: 'CODE_NOT_FOUND', message: 'This referral code is not valid.' });
    }
    if (referrer.id === userId) {
      throw new BadRequestException({
        code: 'SELF_REFERRAL',
        message: 'You cannot use your own referral code.',
      });
    }

    const referralCode = await this.uniqueReferralCode();
    const referral = await this.prisma.$transaction(async (tx: any) => {
      const r = await tx.referral.create({
        data: { referrerId: referrer.id, referredUserId: userId, code: referralCode, status: 'INVITED' },
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          actorRole: 'CUSTOMER',
          action: 'referral.apply',
          entity: 'Referral',
          entityId: r.id,
          newValues: { referrerId: referrer.id } as never,
        },
      });
      return r;
    });
    return { applied: true, referralId: referral.id };
  }

  /**
   * Qualifying hook — call inside the redemption confirm transaction AFTER the
   * Redemption row is created. Qualifies the user's INVITED referral (if any)
   * and grants both sides' rewards from system settings. Guarded on the
   * INVITED status, so it can never double-reward (the memberships module's
   * first-paid-membership path marks REWARDED the same way).
   */
  async tryQualifyOnFirstRedemption(
    tx: any,
    userId: string,
  ): Promise<{ referrerId: string; referredUserId: string } | null> {
    const referral = await tx.referral.findFirst({
      where: { referredUserId: userId, status: 'INVITED' },
    });
    if (!referral) return null;
    await this.grantQualification(tx, referral.id, referral.referrerId, userId);
    return { referrerId: referral.referrerId, referredUserId: userId };
  }

  /**
   * Hourly safety net: qualify any INVITED referral whose referred user has at
   * least one CONFIRMED redemption (catches paths the confirm hook missed).
   */
  @Cron(CronExpression.EVERY_HOUR)
  async qualifyReferrals(): Promise<{ qualified: number }> {
    const candidates = await this.prisma.referral.findMany({
      where: { status: 'INVITED' },
      select: { id: true, referrerId: true, referredUserId: true },
      take: 200,
    });
    let qualified = 0;
    for (const c of candidates) {
      if (!c.referredUserId) continue;
      try {
        const done = await this.prisma.$transaction(async (tx: any) => {
          // Re-check inside the tx — concurrent runs serialize here.
          const referral = await tx.referral.findFirst({
            where: { id: c.id, status: 'INVITED' },
          });
          if (!referral) return false;
          const count = await tx.redemption.count({
            where: { userId: c.referredUserId, status: 'CONFIRMED' },
          });
          if (count === 0) return false;
          await this.grantQualification(tx, referral.id, referral.referrerId, c.referredUserId!);
          return true;
        });
        if (done) qualified++;
        if (done && c.referredUserId) {
          // Phase 11: notify both sides — best-effort, after commit.
          this.notify?.dispatch(c.referrerId, {
              type: 'REFERRAL_QUALIFIED',
              title: 'Referral reward earned 🎁',
              body: 'Someone you invited made their first purchase. Your referral reward has been credited.',
              data: { referredUserId: c.referredUserId },
              channels: ['IN_APP', 'EMAIL'],
            })
            ?.catch(() => null);
          this.notify?.dispatch(c.referredUserId, {
              type: 'REFERRAL_QUALIFIED',
              title: 'Welcome reward credited 🎁',
              body: 'Your first purchase is done — your referral welcome reward has been credited to your account.',
              data: { referrerId: c.referrerId },
              channels: ['IN_APP'],
            })
            ?.catch(() => null);
        }
      } catch (err) {
        this.logger.warn(`qualifyReferrals failed for ${c.id}: ${(err as Error).message}`);
      }
    }
    if (qualified) this.logger.log(`qualifyReferrals: qualified ${qualified} referral(s)`);
    return { qualified };
  }

  // ---------------------------------------------------------------- admin

  /** Admin referral list (newest first). */
  async adminList() {
    const rows = await this.prisma.referral.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        referrer: { select: { id: true, firstName: true, lastName: true, email: true } },
        referredUser: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      code: r.code,
      referrer: r.referrer,
      referredUser: r.referredUser,
      qualifiedAt: r.qualifiedAt,
      rewardedAt: r.rewardedAt,
      createdAt: r.createdAt,
    }));
  }

  /** Admin referral detail + granted rewards. */
  async adminDetail(id: string) {
    const r = await this.prisma.referral.findUnique({
      where: { id },
      include: {
        referrer: { select: { id: true, firstName: true, lastName: true, email: true } },
        referredUser: { select: { id: true, firstName: true, lastName: true, email: true } },
        rewards: true,
      },
    });
    if (!r) throw new NotFoundException({ code: 'REFERRAL_NOT_FOUND', message: 'Referral not found.' });
    return r;
  }

  // ---------------------------------------------------------------- internal

  private async uniqueReferralCode(): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const code = randomBytes(4).toString('hex').toUpperCase();
      const existing = await this.prisma.referral.findUnique({ where: { code }, select: { id: true } });
      if (!existing) return code;
    }
    throw new BadRequestException({ code: 'CODE_GENERATION_FAILED', message: 'Could not generate a referral code.' });
  }

  private async settingInt(tx: any, key: string): Promise<number> {
    const raw = await getSettingValue<unknown>(tx, key, 0);
    const n = Math.floor(Number(raw));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  /**
   * Marks a referral QUALIFIED → grants both sides → REWARDED, all in the
   * caller's transaction. Amounts come only from system settings.
   */
  private async grantQualification(tx: any, referralId: string, referrerId: string, referredUserId: string) {
    const now = new Date();
    await tx.referral.update({
      where: { id: referralId },
      data: { status: 'QUALIFIED', qualifiedAt: now },
    });

    const [referrerPoints, referrerCashback, referredPoints, referredCashback] = await Promise.all([
      this.settingInt(tx, SETTING_KEYS.referrerPoints),
      this.settingInt(tx, SETTING_KEYS.referrerCashbackPaisa),
      this.settingInt(tx, SETTING_KEYS.referredPoints),
      this.settingInt(tx, SETTING_KEYS.referredCashbackPaisa),
    ]);

    const mk = (userId: string, type: string, points?: number, cashback?: number) =>
      tx.referralReward.create({
        data: {
          referralId,
          userId,
          type,
          pointsAmount: points ?? null,
          cashbackAmount: cashback ?? null,
          status: 'APPROVED',
        },
      });

    if (referrerPoints > 0) {
      await this.rewards.creditPoints(tx, referrerId, referrerPoints, `referral:${referralId}`, {
        kind: 'REFERRAL_REWARD',
        side: 'referrer',
      });
      await mk(referrerId, 'POINTS', referrerPoints);
    }
    if (referrerCashback > 0) {
      await this.creditCashback(tx, referrerId, referrerCashback, referralId);
      await mk(referrerId, 'CASHBACK', undefined, referrerCashback);
    }
    if (referredPoints > 0) {
      await this.rewards.creditPoints(tx, referredUserId, referredPoints, `referral:${referralId}`, {
        kind: 'REFERRAL_REWARD',
        side: 'referred',
      });
      await mk(referredUserId, 'POINTS', referredPoints);
    }
    if (referredCashback > 0) {
      await this.creditCashback(tx, referredUserId, referredCashback, referralId);
      await mk(referredUserId, 'CASHBACK', undefined, referredCashback);
    }

    await tx.referral.update({
      where: { id: referralId },
      data: { status: 'REWARDED', rewardedAt: now },
    });
    await tx.auditLog.create({
      data: {
        actorId: null,
        actorRole: 'SYSTEM',
        action: 'referral.qualified',
        entity: 'Referral',
        entityId: referralId,
        newValues: { referrerId, referredUserId, referrerPoints, referrerCashback, referredPoints, referredCashback } as never,
      },
    });
  }

  private async creditCashback(tx: any, userId: string, amountPaisa: number, referralId: string) {
    const existing = await tx.cashback.aggregate({
      where: { userId, status: 'APPROVED' },
      _sum: { amount: true },
    });
    const balanceAfter = (existing._sum.amount ?? 0) + amountPaisa;
    const cb = await tx.cashback.create({
      data: { userId, amount: amountPaisa, status: 'APPROVED' },
    });
    await tx.cashbackTransaction.create({
      data: {
        cashbackId: cb.id,
        userId,
        type: 'CREDIT',
        amount: amountPaisa,
        balanceAfter,
        reference: `referral:${referralId}`,
      },
    });
  }
}
