import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

/**
 * Phase 7 customer dashboard aggregation — read-only, fully cached.
 *
 * Cache: `dashboard:<userId>` in Redis, 5 minutes. Mutating flows must call
 * `invalidateDashboard(userId)` after they commit:
 *   - redemptions.confirmRedemption  (redemption + savings + cashback + points change)
 *   - favorites.add / favorites.remove (favoritesCount)
 *   - memberships.purchasePlan / activateMembership / cancel (membership block)
 *   - vouchers issuance / rewards redemption (Phase 10: wire there when built)
 * The TTL alone is the safety net if a caller forgets.
 */
@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);
  private static readonly CACHE_TTL = 300; // 5 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Bust a user's dashboard cache after a mutating flow commits. */
  static cacheKey(userId: string): string {
    return `dashboard:${userId}`;
  }

  async invalidateDashboard(userId: string): Promise<void> {
    try {
      await this.redis.del(DashboardService.cacheKey(userId));
    } catch (err) {
      // Cache invalidation is best-effort: the TTL keeps data fresh anyway.
      this.logger.warn(`dashboard cache invalidation failed for ${userId}: ${(err as Error).message}`);
    }
  }

  async getDashboard(userId: string) {
    const key = DashboardService.cacheKey(userId);
    try {
      const cached = await this.redis.get(key);
      if (cached) return JSON.parse(cached);
    } catch (err) {
      this.logger.warn(`dashboard cache read failed: ${(err as Error).message}`);
    }

    const now = new Date();
    const [
      membership,
      savingsAgg,
      redemptionsCount,
      favoritesCount,
      activeVouchers,
      wallet,
      rewardAccount,
      cashbackAgg,
      referralsCount,
      recentRedemptions,
      recentSavings,
      recentWalletTx,
      recommendedDeals,
    ] = await Promise.all([
      this.prisma.membership.findFirst({
        where: { userId, status: 'ACTIVE', endDate: { gt: now } },
        include: { plan: { select: { name: true, slug: true } } },
        orderBy: { endDate: 'desc' },
      }),
      this.prisma.savingsTransaction.aggregate({
        where: { userId },
        _sum: { amount: true },
      }),
      this.prisma.redemption.count({ where: { userId, status: 'CONFIRMED' } }),
      this.prisma.favorite.count({ where: { userId } }),
      this.prisma.userVoucher.count({
        where: { userId, status: 'AVAILABLE', expiresAt: { gt: now } },
      }),
      this.prisma.wallet.findUnique({ where: { userId }, select: { balance: true } }),
      this.prisma.rewardAccount.findUnique({
        where: { userId },
        select: { availablePoints: true },
      }),
      this.prisma.cashback.aggregate({
        where: { userId, status: 'APPROVED' },
        _sum: { amount: true },
      }),
      this.prisma.referral.count({ where: { referrerId: userId } }),
      this.prisma.redemption.findMany({
        where: { userId, status: 'CONFIRMED' },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          createdAt: true,
          savingAmount: true,
          deal: { select: { title: true } },
          business: { select: { name: true } },
        },
      }),
      this.prisma.savingsTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { id: true, createdAt: true, amount: true },
      }),
      this.prisma.walletTransaction.findMany({
        where: { wallet: { userId } },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { id: true, createdAt: true, amount: true, type: true },
      }),
      this.prisma.deal.findMany({
        where: { status: 'PUBLISHED', startDate: { lte: now }, endDate: { gte: now }, deletedAt: null },
        orderBy: [{ redemptionCount: 'desc' }, { createdAt: 'desc' }],
        take: 6,
        select: {
          id: true,
          title: true,
          slug: true,
          discountPercent: true,
          business: { select: { name: true, logo: true } },
        },
      }),
    ]);

    // Merge three streams into one timeline, latest 8.
    const activity = [
      ...recentRedemptions.map((r) => ({
        type: 'redemption' as const,
        label: `Redeemed ${r.deal?.title ?? 'a deal'}${r.business?.name ? ` at ${r.business.name}` : ''}`,
        at: r.createdAt,
        amount: r.savingAmount ?? 0,
      })),
      ...recentSavings.map((s) => ({
        type: 'saving' as const,
        label: 'Savings recorded',
        at: s.createdAt,
        amount: s.amount,
      })),
      ...recentWalletTx.map((w) => ({
        type: 'wallet' as const,
        label: w.type === 'CREDIT' ? 'Wallet credited' : 'Wallet debited',
        at: w.createdAt,
        amount: w.amount,
      })),
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, 8);

    const payload = {
      membership: membership
        ? {
            planName: membership.plan?.name ?? 'Membership',
            planSlug: membership.plan?.slug,
            status: membership.status,
            expiresAt: membership.endDate!,
            daysLeft: Math.max(0, Math.ceil((membership.endDate!.getTime() - now.getTime()) / 86_400_000)),
          }
        : null,
      stats: {
        totalSavings: savingsAgg._sum.amount ?? 0,
        redemptionsCount,
        favoritesCount,
        activeVouchers,
        walletBalance: wallet?.balance ?? 0,
        rewardPoints: rewardAccount?.availablePoints ?? 0,
        cashbackBalance: cashbackAgg._sum.amount ?? 0,
        referralsCount,
      },
      recentActivity: activity,
      recommendedDeals,
    };

    try {
      await this.redis.set(key, JSON.stringify(payload), DashboardService.CACHE_TTL);
    } catch (err) {
      this.logger.warn(`dashboard cache write failed: ${(err as Error).message}`);
    }
    return payload;
  }
}
