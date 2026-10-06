import { ReferralsService } from './referrals.service';

/**
 * Phase 10 tests: apply guards (self-code, window, duplicates) and the
 * first-redemption qualifying path (settings-driven rewards, no double grant).
 */

function makeRewards() {
  return {
    creditPoints: jest.fn().mockResolvedValue({ id: 'acc-1' }),
  } as any;
}

describe('ReferralsService.applyCode', () => {
  function prismaFor(user: any, referrer: any, existingReferral: any) {
    return {
      user: {
        findFirst: jest.fn(async (args: any) => {
          if (args.where.referralCode) return referrer;
          return user;
        }),
      },
      referral: {
        findUnique: jest.fn().mockResolvedValue(existingReferral),
      },
      $transaction: jest.fn(async (fn: any) =>
        fn({
          referral: { create: jest.fn().mockResolvedValue({ id: 'ref-1' }) },
          auditLog: { create: jest.fn().mockResolvedValue({}) },
        }),
      ),
    } as any;
  }

  const freshUser = { id: 'user-1', referralCode: 'MINE1234', createdAt: new Date() };
  const otherUser = { id: 'user-2' };

  it('rejects your own code', async () => {
    const prisma = prismaFor(freshUser, { id: 'user-1' }, null);
    const svc = new ReferralsService(prisma, makeRewards(), { dispatch: jest.fn(async () => ({ attempted: 0 })), recentlySent: jest.fn(async () => false) } as any);
    await expect(svc.applyCode('user-1', 'MINE1234')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SELF_REFERRAL' }),
    });
  });

  it('rejects codes applied after the 7-day window', async () => {
    const oldUser = { ...freshUser, createdAt: new Date(Date.now() - 8 * 86400000) };
    const prisma = prismaFor(oldUser, otherUser, null);
    const svc = new ReferralsService(prisma, makeRewards(), { dispatch: jest.fn(async () => ({ attempted: 0 })), recentlySent: jest.fn(async () => false) } as any);
    await expect(svc.applyCode('user-1', 'OTHER999')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'APPLY_WINDOW_EXPIRED' }),
    });
  });

  it('rejects when a referral was already applied', async () => {
    const prisma = prismaFor(freshUser, otherUser, { id: 'ref-0' });
    const svc = new ReferralsService(prisma, makeRewards(), { dispatch: jest.fn(async () => ({ attempted: 0 })), recentlySent: jest.fn(async () => false) } as any);
    await expect(svc.applyCode('user-1', 'OTHER999')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'REFERRAL_ALREADY_APPLIED' }),
    });
  });

  it('rejects unknown codes', async () => {
    const prisma = prismaFor(freshUser, null, null);
    const svc = new ReferralsService(prisma, makeRewards(), { dispatch: jest.fn(async () => ({ attempted: 0 })), recentlySent: jest.fn(async () => false) } as any);
    await expect(svc.applyCode('user-1', 'NOPE1234')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CODE_NOT_FOUND' }),
    });
  });

  it('creates an INVITED referral on the happy path', async () => {
    const prisma = prismaFor(freshUser, otherUser, null);
    const svc = new ReferralsService(prisma, makeRewards(), { dispatch: jest.fn(async () => ({ attempted: 0 })), recentlySent: jest.fn(async () => false) } as any);
    const res = await svc.applyCode('user-1', 'OTHER999');
    expect(res.applied).toBe(true);
  });
});

describe('ReferralsService.tryQualifyOnFirstRedemption', () => {
  function txFor(settings: Record<string, number>, referral: any) {
    return {
      referral: {
        // Respect the service's status filter so REWARDED/QUALIFIED rows are invisible.
        findFirst: jest.fn(async ({ where }: any) =>
          referral && (!where?.status || referral.status === where.status) ? referral : null,
        ),
        update: jest.fn().mockResolvedValue({}),
      },
      systemSetting: {
        findUnique: jest.fn(async ({ where: { key } }: any) =>
          key in settings ? { value: settings[key] } : null,
        ),
      },
      referralReward: { create: jest.fn().mockResolvedValue({}) },
      cashback: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }), create: jest.fn().mockResolvedValue({ id: 'cb-1' }) },
      cashbackTransaction: { create: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
  }

  it('grants both sides from settings and moves INVITED -> QUALIFIED -> REWARDED', async () => {
    const rewards = makeRewards();
    const svc = new ReferralsService({} as any, rewards, { dispatch: jest.fn(async () => ({ attempted: 0 })), recentlySent: jest.fn(async () => false) } as any);
    const tx = txFor(
      {
        'referral.referrer_points': 200,
        'referral.referred_points': 100,
        'referral.referrer_cashback_paisa': 5000,
      },
      { id: 'ref-1', referrerId: 'user-ref', referredUserId: 'user-1', status: 'INVITED' },
    );
    const done = await svc.tryQualifyOnFirstRedemption(tx, 'user-1');
    expect(done).toEqual({ referrerId: 'user-ref', referredUserId: 'user-1' });
    // Referrer: 200 points; referred: 100 points.
    expect(rewards.creditPoints).toHaveBeenCalledWith(
      tx, 'user-ref', 200, 'referral:ref-1', expect.objectContaining({ side: 'referrer' }),
    );
    expect(rewards.creditPoints).toHaveBeenCalledWith(
      tx, 'user-1', 100, 'referral:ref-1', expect.objectContaining({ side: 'referred' }),
    );
    // Referrer cashback row created (APPROVED).
    expect(tx.cashback.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'user-ref', amount: 5000, status: 'APPROVED' }) }),
    );
    // Status transitions + audit.
    const updates = (tx.referral.update as jest.Mock).mock.calls.map((c) => c[0].data.status);
    expect(updates).toEqual(['QUALIFIED', 'REWARDED']);
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'referral.qualified' }) }),
    );
  });

  it('does nothing when the referral is already REWARDED (no double grant)', async () => {
    const rewards = makeRewards();
    const svc = new ReferralsService({} as any, rewards, { dispatch: jest.fn(async () => ({ attempted: 0 })), recentlySent: jest.fn(async () => false) } as any);
    const tx = txFor(
      { 'referral.referrer_points': 200 },
      { id: 'ref-1', referrerId: 'user-ref', referredUserId: 'user-1', status: 'REWARDED' },
    );
    const done = await svc.tryQualifyOnFirstRedemption(tx, 'user-1');
    expect(done).toBeNull();
    expect(rewards.creditPoints).not.toHaveBeenCalled();
    expect(tx.referral.update).not.toHaveBeenCalled();
  });

  it('does nothing when there is no referral', async () => {
    const rewards = makeRewards();
    const svc = new ReferralsService({} as any, rewards, { dispatch: jest.fn(async () => ({ attempted: 0 })), recentlySent: jest.fn(async () => false) } as any);
    const tx = txFor({ 'referral.referrer_points': 200 }, null);
    const done = await svc.tryQualifyOnFirstRedemption(tx, 'user-1');
    expect(done).toBeNull();
  });
});

describe('ReferralsService.getStats', () => {
  it('returns real counts and earned rewards', async () => {
    const prisma = {
      referral: {
        count: jest.fn(async (args: any) => {
          if (args.where.status === 'INVITED') return 2;
          if (args.where.status?.in) return 3;
          return 5;
        }),
      },
      referralReward: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { pointsAmount: 300, cashbackAmount: 10000 } }),
      },
    } as any;
    const svc = new ReferralsService(prisma, makeRewards(), { dispatch: jest.fn(async () => ({ attempted: 0 })), recentlySent: jest.fn(async () => false) } as any);
    const stats = await svc.getStats('user-1');
    expect(stats).toMatchObject({
      referredCount: 5,
      qualifiedCount: 3,
      pendingCount: 2,
      totalPointsEarned: 300,
      totalCashbackEarnedPaisa: 10000,
    });
  });
});
