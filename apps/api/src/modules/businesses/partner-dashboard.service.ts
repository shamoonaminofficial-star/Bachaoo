import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

// ---------------------------------------------------------------------------
// Phase 8 — partner (business) dashboard aggregation.
//
// Cache: `partner-dashboard:<businessId>` in Redis, 5 minutes. Mutating flows
// must call `invalidatePartnerDashboard(businessId)` (deals create/update/
// status transitions, branch changes, redemption confirm, staff changes).
// ---------------------------------------------------------------------------

const KARACHI_OFFSET_MS = 5 * 60 * 60 * 1000;
const DASHBOARD_CACHE_TTL_SEC = 300;

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

@Injectable()
export class PartnerDashboardService {
  private readonly logger = new Logger(PartnerDashboardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  static cacheKey(businessId: string): string {
    return `partner-dashboard:${businessId}`;
  }

  async invalidatePartnerDashboard(businessId: string): Promise<void> {
    try {
      await this.redis.del(PartnerDashboardService.cacheKey(businessId));
    } catch {
      /* best effort — TTL is the net */
    }
  }

  async getDashboard(businessId: string) {
    const key = PartnerDashboardService.cacheKey(businessId);
    const hit = await this.redis.get(key).catch(() => null);
    if (hit) {
      try {
        return JSON.parse(hit);
      } catch {
        /* corrupted cache — rebuild */
      }
    }
    const payload = await this.buildDashboard(businessId);
    await this.redis.set(key, JSON.stringify(payload), DASHBOARD_CACHE_TTL_SEC).catch(() => null);
    return payload;
  }

  private async buildDashboard(businessId: string) {
    const now = new Date();
    const dayStart = karachiDayStart(now);
    const monthStart = karachiMonthStart(now);

    const business = await this.prisma.business.findFirst({
      where: { id: businessId, deletedAt: null },
      select: {
        id: true,
        name: true,
        logo: true,
        isVerified: true,
        isActive: true,
        ratingAvg: true,
        ratingCount: true,
      },
    });
    if (!business) return null;

    const [dealsByStatus, branchCount, staffCount, today, thisMonth, savings, recent, topDeals, viewsAgg] =
      await Promise.all([
        this.prisma.deal.groupBy({
          by: ['status'],
          where: { businessId, deletedAt: null },
          _count: { status: true },
        }),
        this.prisma.branch.count({ where: { businessId, deletedAt: null } }),
        this.prisma.businessStaff.count({ where: { businessId, isActive: true } }),
        this.prisma.redemption.count({
          where: { businessId, status: 'CONFIRMED', createdAt: { gte: dayStart } },
        }),
        this.prisma.redemption.count({
          where: { businessId, status: 'CONFIRMED', createdAt: { gte: monthStart } },
        }),
        this.prisma.redemption.aggregate({
          where: { businessId, status: 'CONFIRMED' },
          _sum: { savingAmount: true },
          _count: true,
        }),
        this.prisma.redemption.findMany({
          where: { businessId, status: 'CONFIRMED' },
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            deal: { select: { id: true, title: true } },
            branch: { select: { id: true, name: true } },
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        }),
        this.prisma.deal.findMany({
          where: { businessId, deletedAt: null },
          orderBy: { redemptionCount: 'desc' },
          take: 5,
          select: {
            id: true,
            title: true,
            discountPercent: true,
            redemptionCount: true,
            viewCount: true,
          },
        }),
        this.prisma.deal.aggregate({
          where: { businessId, deletedAt: null },
          _sum: { viewCount: true },
        }),
      ]);

    const statusCount = (s: string) =>
      dealsByStatus.find((r) => r.status === s)?._count.status ?? 0;

    return {
      business: {
        id: business.id,
        name: business.name,
        logo: business.logo ?? null,
        verified: business.isVerified,
        active: business.isActive,
      },
      stats: {
        activeDeals: statusCount('PUBLISHED'),
        pendingApproval: statusCount('PENDING_APPROVAL'),
        draftDeals: statusCount('DRAFT'),
        totalBranches: branchCount,
        redemptionsToday: today,
        redemptionsThisMonth: thisMonth,
        // Total savings given to customers via this business, integer paisa.
        totalSavingsGiven: savings._sum.savingAmount ?? 0,
        totalRedemptions: savings._count ?? 0,
        // Views are a cumulative lifetime counter on each deal (no per-day
        // view events are stored yet), so only a total is reported here.
        viewsTotal: viewsAgg._sum.viewCount ?? 0,
        ratingAverage: business.ratingAvg ?? 0,
        reviewsCount: business.ratingCount ?? 0,
        staffCount,
      },
      dealsByStatus: {
        published: statusCount('PUBLISHED'),
        pending: statusCount('PENDING_APPROVAL'),
        drafts: statusCount('DRAFT'),
        expired: statusCount('EXPIRED'),
        paused: statusCount('PAUSED'),
        rejected: statusCount('REJECTED'),
        approved: statusCount('APPROVED'),
      },
      recentRedemptions: recent.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        deal: { id: r.deal.id, title: r.deal.title },
        branch: r.branch ? { id: r.branch.id, name: r.branch.name } : null,
        customer: { firstName: r.user.firstName, lastName: r.user.lastName, email: r.user.email },
        bill: r.billAmount,
        discount: r.discountAmount,
        paid: r.paidAmount,
        saving: r.savingAmount,
        cashback: r.cashbackEarned,
        points: r.pointsEarned,
      })),
      topDeals: topDeals.map((d) => ({
        id: d.id,
        title: d.title,
        discountPercent: d.discountPercent,
        redemptions: d.redemptionCount,
        views: d.viewCount,
      })),
    };
  }

  // ------------------------------------------------------- partner redemptions

  async listRedemptions(
    businessId: string,
    query: {
      dealId?: string;
      branchId?: string;
      from?: string;
      to?: string;
      q?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    const page = Math.max(Number(query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize) || 20, 1), 100);
    const skip = (page - 1) * pageSize;

    const and: any[] = [{ businessId, status: 'CONFIRMED' }];
    if (query.dealId) and.push({ dealId: query.dealId });
    if (query.branchId) and.push({ branchId: query.branchId });
    if (query.from) and.push({ createdAt: { gte: new Date(query.from) } });
    if (query.to) and.push({ createdAt: { lte: new Date(query.to) } });
    if (query.q) {
      const q = query.q.trim();
      and.push({
        OR: [
          { user: { firstName: { contains: q, mode: 'insensitive' } } },
          { user: { lastName: { contains: q, mode: 'insensitive' } } },
          { user: { email: { contains: q, mode: 'insensitive' } } },
          { deal: { title: { contains: q, mode: 'insensitive' } } },
        ],
      });
    }

    const where = { AND: and };
    const [total, rows] = await Promise.all([
      this.prisma.redemption.count({ where }),
      this.prisma.redemption.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          deal: { select: { id: true, title: true, discountPercent: true } },
          branch: { select: { id: true, name: true } },
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
    ]);

    return {
      items: rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        confirmedAt: r.confirmedAt,
        deal: { id: r.deal.id, title: r.deal.title, discountPercent: r.deal.discountPercent },
        branch: r.branch ? { id: r.branch.id, name: r.branch.name } : null,
        customer: { firstName: r.user.firstName, lastName: r.user.lastName, email: r.user.email },
        bill: r.billAmount,
        discount: r.discountAmount,
        paid: r.paidAmount,
        saving: r.savingAmount,
        cashback: r.cashbackEarned,
        points: r.pointsEarned,
        calculationSnapshot: r.calculationSnapshot,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }
}
