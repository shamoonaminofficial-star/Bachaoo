import { AdminOverviewService } from './admin-overview.service';

/**
 * Phase 9 — admin overview service tests (aggregation shape + cache behavior).
 * Prisma/Redis are mocked; no DB touched.
 */

const agg = () => ({ _sum: { amount: 0, commissionAmount: 0, netAmount: 0, viewCount: 0 } });

function mockPrisma() {
  return {
    user: { count: jest.fn().mockResolvedValue(10) },
    userRole: { count: jest.fn().mockResolvedValue(8) },
    business: { count: jest.fn().mockResolvedValue(3) },
    businessApplication: { count: jest.fn().mockResolvedValue(1) },
    deal: { count: jest.fn().mockResolvedValue(2), aggregate: jest.fn().mockResolvedValue(agg()) },
    membership: { count: jest.fn().mockResolvedValue(5) },
    payment: { count: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue(agg()) },
    settlement: { aggregate: jest.fn().mockResolvedValue(agg()) },
    redemption: { count: jest.fn().mockResolvedValue(4) },
    savingsTransaction: { aggregate: jest.fn().mockResolvedValue(agg()) },
    supportTicket: { count: jest.fn().mockResolvedValue(2) },
    review: { count: jest.fn().mockResolvedValue(1) },
    staffInvitation: { count: jest.fn().mockResolvedValue(0) },
  };
}

function mockRedis() {
  const store = new Map<string, string>();
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async set(key: string, value: string) {
      store.set(key, value);
      return 'OK' as const;
    },
    async del(key: string) {
      return store.delete(key) ? 1 : 0;
    },
  };
}

describe('AdminOverviewService', () => {
  it('returns the full KPI shape with all money in integer paisa', async () => {
    const svc = new AdminOverviewService(mockPrisma() as any, mockRedis() as any);
    const o = await svc.getOverview();
    expect(o.users).toEqual({ total: 10, newThisMonth: 10, customers: 8, partners: 8 });
    expect(o.businesses).toMatchObject({ total: 3, verified: 3, suspended: 3, pendingApplications: 1 });
    expect(o.deals).toMatchObject({ live: 2, pendingApproval: 2, drafts: 2, expired: 2 });
    expect(o.memberships).toMatchObject({ active: 5, expiringThisWeek: 5, churnedLast30d: 5 });
    expect(o.revenue.membershipRevenueTotal).toBe(0);
    expect(o.queues).toMatchObject({
      pendingBusinesses: 1,
      pendingDeals: 2,
      pendingPayments: 0,
      openSupportTickets: 2,
      pendingReviews: 1,
      pendingStaffInvitations: 0,
    });
  });

  it('serves from cache on the second call (no extra prisma queries)', async () => {
    const prisma = mockPrisma();
    const redis = mockRedis();
    const svc = new AdminOverviewService(prisma as any, redis as any);
    await svc.getOverview();
    const countCalls = prisma.user.count.mock.calls.length;
    await svc.getOverview();
    expect(prisma.user.count.mock.calls.length).toBe(countCalls);
  });

  it('invalidateOverview busts the cache so the next call recomputes', async () => {
    const prisma = mockPrisma();
    const redis = mockRedis();
    const svc = new AdminOverviewService(prisma as any, redis as any);
    await svc.getOverview();
    await svc.invalidateOverview();
    await svc.getOverview();
    expect(prisma.user.count.mock.calls.length).toBeGreaterThan(1);
  });
});
