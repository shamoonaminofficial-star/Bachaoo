import { DashboardService } from './dashboard.service';

/**
 * Phase 7 tests: dashboard aggregation shape + cache behavior.
 * Prisma/Redis are mocked; we assert the response contract the
 * frontend worker will build against.
 */

function makePrisma() {
  const now = new Date();
  return {
    membership: {
      findFirst: jest.fn().mockResolvedValue({
        status: 'ACTIVE',
        endDate: new Date(now.getTime() + 10 * 86400000),
        plan: { name: 'Gold', slug: 'gold' },
      }),
    },
    savingsTransaction: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 25000 } }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    redemption: {
      count: jest.fn().mockResolvedValue(3),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'r1',
          createdAt: now,
          savingAmount: 5000,
          deal: { title: 'Pizza Deal' },
          business: { name: 'Urban Slice' },
        },
      ]),
    },
    favorite: { count: jest.fn().mockResolvedValue(7) },
    userVoucher: { count: jest.fn().mockResolvedValue(2) },
    wallet: { findUnique: jest.fn().mockResolvedValue({ balance: 12000 }) },
    rewardAccount: { findUnique: jest.fn().mockResolvedValue({ availablePoints: 150 }) },
    cashback: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 800 } }) },
    referral: { count: jest.fn().mockResolvedValue(4) },
    walletTransaction: { findMany: jest.fn().mockResolvedValue([]) },
    deal: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'd1', title: 'Deal', slug: 'deal', discountPercent: 20, business: { name: 'Biz', logo: null } },
      ]),
    },
  } as any;
}

function makeRedis() {
  const store = new Map<string, string>();
  return {
    get: jest.fn(async (k: string) => store.get(k) ?? null),
    set: jest.fn(async (k: string, v: string) => { store.set(k, v); return 'OK' as const; }),
    del: jest.fn(async (k: string) => { store.delete(k); return 1; }),
  } as any;
}

describe('DashboardService', () => {
  it('returns the full dashboard contract', async () => {
    const service = new DashboardService(makePrisma(), makeRedis());
    const res = await service.getDashboard('user-1');

    // membership block
    expect(res.membership.planName).toBe('Gold');
    expect(res.membership.daysLeft).toBeGreaterThan(0);
    expect(res.membership.expiresAt).toBeInstanceOf(Date);

    // stats block — all numbers, all present
    expect(res.stats).toEqual({
      totalSavings: 25000,
      redemptionsCount: 3,
      favoritesCount: 7,
      activeVouchers: 2,
      walletBalance: 12000,
      rewardPoints: 150,
      cashbackBalance: 800,
      referralsCount: 4,
    });

    // timeline merged, latest 8
    expect(res.recentActivity.length).toBeLessThanOrEqual(8);
    expect(res.recentActivity[0]).toEqual(
      expect.objectContaining({ type: 'redemption', amount: 5000 }),
    );

    // recommendations capped at 6
    expect(res.recommendedDeals.length).toBeLessThanOrEqual(6);
    expect(res.recommendedDeals[0]).toEqual(expect.objectContaining({ id: 'd1' }));
  });

  it('serves the second call from cache without hitting prisma', async () => {
    const prisma = makePrisma();
    const service = new DashboardService(prisma, makeRedis());
    await service.getDashboard('user-1');
    const countSpy = prisma.redemption.count;
    countSpy.mockClear();
    const second = await service.getDashboard('user-1');
    expect(countSpy).not.toHaveBeenCalled();
    expect(second.stats.redemptionsCount).toBe(3);
  });

  it('invalidateDashboard busts the cache', async () => {
    const prisma = makePrisma();
    const redis = makeRedis();
    const service = new DashboardService(prisma, redis);
    await service.getDashboard('user-1');
    await service.invalidateDashboard('user-1');
    expect(redis.del).toHaveBeenCalledWith('dashboard:user-1');
    const countSpy = prisma.redemption.count;
    countSpy.mockClear();
    await service.getDashboard('user-1');
    expect(countSpy).toHaveBeenCalled(); // cache miss -> prisma again
  });

  it('null-safe when the user has nothing (no membership, wallet, rewards)', async () => {
    const prisma = makePrisma();
    prisma.membership.findFirst.mockResolvedValue(null);
    prisma.wallet.findUnique.mockResolvedValue(null);
    prisma.rewardAccount.findUnique.mockResolvedValue(null);
    const service = new DashboardService(prisma, makeRedis());
    const res = await service.getDashboard('user-1');
    expect(res.membership).toBeNull();
    expect(res.stats.walletBalance).toBe(0);
    expect(res.stats.rewardPoints).toBe(0);
    expect(res.stats.totalSavings).toBe(25000);
  });
});
