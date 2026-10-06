import { PartnerDashboardService } from './partner-dashboard.service';

/**
 * Phase 8 tests: partner dashboard aggregation + Redis cache behavior.
 * Prisma/Redis are fully mocked — no DB required.
 */

const BIZ = 'biz-1';

function buildService() {
  const prisma: any = {
    business: { findFirst: jest.fn() },
    deal: { groupBy: jest.fn(), findMany: jest.fn(), aggregate: jest.fn() },
    branch: { count: jest.fn() },
    businessStaff: { count: jest.fn() },
    redemption: { count: jest.fn(), aggregate: jest.fn(), findMany: jest.fn() },
  };
  const redis: any = {
    get: jest.fn(async () => null),
    set: jest.fn(async () => 'OK'),
    del: jest.fn(async () => 1),
  };
  const service = new PartnerDashboardService(prisma, redis);
  return { service, prisma, redis };
}

function seedAggregate(prisma: any) {
  prisma.business.findFirst.mockResolvedValue({
    id: BIZ,
    name: 'Urban Slice',
    logo: 'https://cdn/logo.png',
    isVerified: true,
    isActive: true,
    ratingAvg: 4.5,
    ratingCount: 12,
  });
  prisma.deal.groupBy.mockResolvedValue([
    { status: 'PUBLISHED', _count: { status: 3 } },
    { status: 'PENDING_APPROVAL', _count: { status: 1 } },
    { status: 'DRAFT', _count: { status: 2 } },
    { status: 'EXPIRED', _count: { status: 1 } },
  ]);
  prisma.branch.count.mockResolvedValue(2);
  prisma.businessStaff.count.mockResolvedValue(4);
  prisma.redemption.count.mockResolvedValue(0);
  prisma.redemption.aggregate.mockResolvedValue({ _sum: { savingAmount: 50000 }, _count: 10 });
  prisma.redemption.findMany.mockResolvedValue([]);
  prisma.deal.findMany.mockResolvedValue([
    { id: 'd1', title: 'Deal 1', discountPercent: 20, redemptionCount: 7, viewCount: 100 },
  ]);
  prisma.deal.aggregate.mockResolvedValue({ _sum: { viewCount: 250 } });
}

describe('PartnerDashboardService.getDashboard', () => {
  it('aggregates stats and maps deal statuses on a cache miss', async () => {
    const { service, prisma, redis } = buildService();
    seedAggregate(prisma);
    prisma.redemption.count
      .mockResolvedValueOnce(2) // today
      .mockResolvedValueOnce(25); // this month

    const result = await service.getDashboard(BIZ);

    expect(result.business).toEqual(
      expect.objectContaining({ id: BIZ, name: 'Urban Slice', verified: true, active: true }),
    );
    expect(result.stats).toEqual(
      expect.objectContaining({
        activeDeals: 3,
        pendingApproval: 1,
        draftDeals: 2,
        totalBranches: 2,
        redemptionsToday: 2,
        redemptionsThisMonth: 25,
        totalSavingsGiven: 50000,
        totalRedemptions: 10,
        viewsTotal: 250,
        ratingAverage: 4.5,
        reviewsCount: 12,
        staffCount: 4,
      }),
    );
    expect(result.dealsByStatus).toEqual(
      expect.objectContaining({ published: 3, pending: 1, drafts: 2, expired: 1 }),
    );
    expect(result.topDeals).toHaveLength(1);
    expect(redis.set).toHaveBeenCalledWith(
      `partner-dashboard:${BIZ}`,
      expect.any(String),
      300,
    );
  });

  it('returns the cached payload on a cache hit without touching Prisma', async () => {
    const { service, prisma, redis } = buildService();
    const cached = { business: { id: BIZ, name: 'Cached' }, stats: {} };
    redis.get.mockResolvedValue(JSON.stringify(cached));

    const result = await service.getDashboard(BIZ);

    expect(result).toEqual(cached);
    expect(prisma.business.findFirst).not.toHaveBeenCalled();
  });

  it('returns null when the business does not exist', async () => {
    const { service, prisma } = buildService();
    prisma.business.findFirst.mockResolvedValue(null);

    await expect(service.getDashboard(BIZ)).resolves.toBeNull();
  });

  it('invalidatePartnerDashboard deletes the dashboard cache key', async () => {
    const { service, redis } = buildService();
    await service.invalidatePartnerDashboard(BIZ);
    expect(redis.del).toHaveBeenCalledWith(`partner-dashboard:${BIZ}`);
  });

  it('listRedemptions filters by dealId/branchId and returns the frozen snapshot', async () => {
    const { service, prisma } = buildService();
    const snapshot = { billAmount: 200000, discountAmount: 40000, savingAmount: 40000 };
    prisma.redemption.count.mockResolvedValue(1);
    prisma.redemption.findMany.mockResolvedValue([
      {
        id: 'r1',
        createdAt: new Date(),
        confirmedAt: new Date(),
        billAmount: 200000,
        discountAmount: 40000,
        paidAmount: 160000,
        savingAmount: 40000,
        cashbackEarned: 0,
        pointsEarned: 0,
        calculationSnapshot: snapshot,
        deal: { id: 'd1', title: 'Deal 1', discountPercent: 20 },
        branch: { id: 'b1', name: 'Main' },
        user: { id: 'u1', firstName: 'Ali', lastName: 'R', email: 'ali@x.pk' },
      },
    ]);

    const result = await service.listRedemptions(BIZ, { dealId: 'd1', branchId: 'b1', page: 1 });

    expect(prisma.redemption.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ AND: expect.any(Array) }) }),
    );
    expect(result.total).toBe(1);
    expect(result.items[0].calculationSnapshot).toEqual(snapshot);
    expect(result.items[0].saving).toBe(40000);
  });
});
