import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

/**
 * Phase 9 — platform-wide KPI aggregation for the admin overview page.
 *
 * Cache: `admin:overview` in Redis, 5 minutes. Mutating flows bust it
 * best-effort via `invalidateOverview()` or a direct Redis `del` of
 * ADMIN_OVERVIEW_CACHE_KEY (RedisService is @Global, so no module cycle):
 *   - businesses.approveApplication / rejectApplication / verify / suspend / reactivate
 *   - deals.transition() (approve/reject/changes/pause/resume/publish) + expireDeals cron
 *   - memberships bustDashboard() (purchase/activate/cancel/expire)
 *   - payments.rejectManualPayment (approve path busts via activateMembership)
 *   - redemptions.confirmRedemption
 *   - admin moderation (batch ops, review moderation, ticket updates)
 * TTL is the safety net when a caller is missed. All money is integer paisa.
 */
export const ADMIN_OVERVIEW_CACHE_KEY = 'admin:overview';

@Injectable()
export class AdminOverviewService {
  private readonly logger = new Logger(AdminOverviewService.name);
  private static readonly CACHE_KEY = ADMIN_OVERVIEW_CACHE_KEY;
  private static readonly CACHE_TTL = 300;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Bust the cached overview after a mutating flow commits. Best-effort. */
  async invalidateOverview(): Promise<void> {
    try {
      await this.redis.del(AdminOverviewService.CACHE_KEY);
    } catch (err) {
      this.logger.warn(`admin overview cache invalidation failed: ${(err as Error).message}`);
    }
  }

  async getOverview() {
    try {
      const cached = await this.redis.get(AdminOverviewService.CACHE_KEY);
      if (cached) return JSON.parse(cached);
    } catch (err) {
      this.logger.warn(`admin overview cache read failed: ${(err as Error).message}`);
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAhead = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

    const [
      totalUsers,
      newUsersThisMonth,
      customerRoles,
      partnerRoles,
      totalBusinesses,
      pendingApplications,
      verifiedBusinesses,
      suspendedBusinesses,
      liveDeals,
      pendingDeals,
      draftDeals,
      expiredDeals,
      activeMemberships,
      expiringThisWeek,
      churned30d,
      membershipRevenueMonth,
      membershipRevenueTotal,
      pendingCommissions,
      settledThisMonth,
      redemptionsToday,
      redemptionsThisMonth,
      savingsGivenTotal,
      viewsToday,
      openTickets,
      pendingReviews,
      pendingInvitations,
    ] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { deletedAt: null, createdAt: { gte: monthStart } } }),
      this.prisma.userRole.count({ where: { role: { name: 'CUSTOMER' } } }),
      this.prisma.userRole.count({ where: { role: { name: 'BUSINESS_OWNER' } } }),
      this.prisma.business.count({ where: { deletedAt: null } }),
      this.prisma.businessApplication.count({ where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } } }),
      this.prisma.business.count({ where: { deletedAt: null, isVerified: true } }),
      this.prisma.business.count({ where: { deletedAt: null, isActive: false } }),
      this.prisma.deal.count({ where: { deletedAt: null, status: 'PUBLISHED' } }),
      this.prisma.deal.count({ where: { deletedAt: null, status: 'PENDING_APPROVAL' } }),
      this.prisma.deal.count({ where: { deletedAt: null, status: 'DRAFT' } }),
      this.prisma.deal.count({ where: { deletedAt: null, status: 'EXPIRED' } }),
      this.prisma.membership.count({ where: { status: 'ACTIVE', endDate: { gt: now } } }),
      this.prisma.membership.count({
        where: { status: 'ACTIVE', endDate: { gt: now, lte: weekAhead } },
      }),
      this.prisma.membership.count({
        where: { status: { in: ['EXPIRED', 'CANCELLED'] }, updatedAt: { gte: thirtyDaysAgo } },
      }),
      this.prisma.payment.aggregate({
        where: { status: 'PAID', orderType: 'MEMBERSHIP', paidAt: { gte: monthStart } },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: { status: 'PAID', orderType: 'MEMBERSHIP' },
        _sum: { amount: true },
      }),
      this.prisma.settlement.aggregate({
        where: { status: { in: ['PENDING', 'DISPUTED'] } },
        _sum: { commissionAmount: true },
      }),
      this.prisma.settlement.aggregate({
        where: { status: 'PAID', paidAt: { gte: monthStart } },
        _sum: { netAmount: true },
      }),
      this.prisma.redemption.count({ where: { status: 'CONFIRMED', createdAt: { gte: todayStart } } }),
      this.prisma.redemption.count({ where: { status: 'CONFIRMED', createdAt: { gte: monthStart } } }),
      this.prisma.savingsTransaction.aggregate({ _sum: { amount: true } }),
      this.prisma.deal.aggregate({ where: { deletedAt: null }, _sum: { viewCount: true } }),
      this.prisma.supportTicket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER'] } } }),
      this.prisma.review.count({ where: { status: 'PENDING' } }),
      this.prisma.staffInvitation.count({ where: { status: 'PENDING' } }),
    ]);

    // Pending manual payments = receipts uploaded, waiting for admin verification.
    const pendingPayments = await this.prisma.payment.count({
      where: { status: 'AWAITING_VERIFICATION', deletedAt: null },
    });

    const payload = {
      users: { total: totalUsers, newThisMonth: newUsersThisMonth, customers: customerRoles, partners: partnerRoles },
      businesses: {
        total: totalBusinesses,
        pendingApplications,
        verified: verifiedBusinesses,
        suspended: suspendedBusinesses,
      },
      deals: { live: liveDeals, pendingApproval: pendingDeals, drafts: draftDeals, expired: expiredDeals },
      memberships: { active: activeMemberships, expiringThisWeek, churnedLast30d: churned30d },
      revenue: {
        membershipRevenueThisMonth: membershipRevenueMonth._sum.amount ?? 0,
        membershipRevenueTotal: membershipRevenueTotal._sum.amount ?? 0,
        pendingCommissions: pendingCommissions._sum.commissionAmount ?? 0,
        settledThisMonth: settledThisMonth._sum.netAmount ?? 0,
      },
      activity: {
        redemptionsToday,
        redemptionsThisMonth,
        savingsGivenTotal: savingsGivenTotal._sum.amount ?? 0,
        lifetimeDealViews: viewsToday._sum.viewCount ?? 0,
      },
      queues: {
        pendingBusinesses: pendingApplications,
        pendingDeals: pendingDeals,
        pendingPayments,
        openSupportTickets: openTickets,
        pendingReviews,
        pendingStaffInvitations: pendingInvitations,
      },
    };

    try {
      await this.redis.set(AdminOverviewService.CACHE_KEY, JSON.stringify(payload), AdminOverviewService.CACHE_TTL);
    } catch (err) {
      this.logger.warn(`admin overview cache write failed: ${(err as Error).message}`);
    }
    return payload;
  }
}
