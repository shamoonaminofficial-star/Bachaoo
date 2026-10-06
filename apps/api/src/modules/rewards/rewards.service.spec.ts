import { RewardsService } from './rewards.service';

/**
 * Phase 10 tests: reward redeem idempotency + admin adjust guards.
 * Prisma is mocked; transactions run the callback against a mock tx.
 */

const FUTURE = new Date(Date.now() + 30 * 86400000);

function makeTx() {
  return {
    idempotencyKey: {
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    reward: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'rw-1', title: 'Rs 500 off', pointsCost: 500, stock: 10,
        codePrefix: 'RWD',
        voucher: {
          id: 'v-1', title: 'Rs 500 off', valueAmount: 50000,
          validTo: FUTURE, codePrefix: 'RWD',
        },
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    rewardAccount: {
      upsert: jest.fn().mockResolvedValue({ id: 'acc-1', availablePoints: 1000 }),
      update: jest.fn().mockResolvedValue({ id: 'acc-1', availablePoints: 500 }),
    },
    rewardTransaction: { create: jest.fn().mockResolvedValue({ id: 'rt-1' }) },
    userVoucher: {
      create: jest.fn().mockResolvedValue({ id: 'uv-1', code: 'RWD-ABC', expiresAt: FUTURE }),
    },
  };
}

describe('RewardsService.redeemReward', () => {
  it('replays the stored response when the idempotency key already exists', async () => {
    const stored = { rewardId: 'rw-1', pointsDebited: 500, voucher: { code: 'RWD-ABC' } };
    const prisma = {
      idempotencyKey: {
        findUnique: jest.fn().mockResolvedValue({ key: 'k', expiresAt: FUTURE, response: stored }),
      },
      $transaction: jest.fn(),
    } as any;
    const svc = new RewardsService(prisma, { dispatch: jest.fn(async () => ({ attempted: 0 })), recentlySent: jest.fn(async () => false) } as any);
    const res = await svc.redeemReward('user-1', 'rw-1', 'client-key-1');
    expect(res).toMatchObject({ ...stored, idempotentReplay: true });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('debits points and mints a voucher on the happy path', async () => {
    const tx = makeTx();
    const prisma = {
      idempotencyKey: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    } as any;
    const svc = new RewardsService(prisma, { dispatch: jest.fn(async () => ({ attempted: 0 })), recentlySent: jest.fn(async () => false) } as any);
    const res: any = await svc.redeemReward('user-1', 'rw-1', 'client-key-1');
    expect(res.pointsDebited).toBe(500);
    expect(res.balanceAfter).toBe(500);
    expect(res.voucher.code).toMatch(/^RWD-/);
    expect(tx.rewardTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'REDEEM', points: 500 }) }),
    );
    expect(tx.userVoucher.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ source: 'REWARD' }) }),
    );
  });

  it('rejects when points are insufficient', async () => {
    const tx = makeTx();
    tx.rewardAccount.upsert.mockResolvedValue({ id: 'acc-1', availablePoints: 100 });
    const prisma = {
      idempotencyKey: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    } as any;
    const svc = new RewardsService(prisma, { dispatch: jest.fn(async () => ({ attempted: 0 })), recentlySent: jest.fn(async () => false) } as any);
    await expect(svc.redeemReward('user-1', 'rw-1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INSUFFICIENT_POINTS' }),
    });
  });

  it('rejects sold-out rewards via the atomic stock decrement', async () => {
    const tx = makeTx();
    tx.reward.updateMany.mockResolvedValue({ count: 0 });
    const prisma = {
      idempotencyKey: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    } as any;
    const svc = new RewardsService(prisma, { dispatch: jest.fn(async () => ({ attempted: 0 })), recentlySent: jest.fn(async () => false) } as any);
    await expect(svc.redeemReward('user-1', 'rw-1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'REWARD_SOLD_OUT' }),
    });
  });
});

describe('RewardsService.adjustPoints', () => {
  function prismaWith(account = { id: 'acc-1', availablePoints: 1000 }) {
    return {
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'user-1' }) },
      $transaction: jest.fn(async (fn: any) =>
        fn({
          rewardAccount: {
            upsert: jest.fn().mockResolvedValue(account),
            update: jest.fn().mockResolvedValue({ ...account, id: 'acc-1' }),
          },
          rewardTransaction: { create: jest.fn().mockResolvedValue({ id: 'rt-1' }) },
          auditLog: { create: jest.fn().mockResolvedValue({}) },
        }),
      ),
    } as any;
  }

  it('requires a reason', async () => {
    const svc = new RewardsService(prismaWith(), { dispatch: jest.fn(async () => ({ attempted: 0 })), recentlySent: jest.fn(async () => false) } as any);
    await expect(
      svc.adjustPoints('admin-1', ['SUPER_ADMIN'], { userId: 'user-1', points: 100, reason: '' }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'REASON_REQUIRED' }) });
  });

  it('rejects negative adjustments without super-admin', async () => {
    const svc = new RewardsService(prismaWith(), { dispatch: jest.fn(async () => ({ attempted: 0 })), recentlySent: jest.fn(async () => false) } as any);
    await expect(
      svc.adjustPoints('admin-1', ['ADMIN'], { userId: 'user-1', points: -100, reason: 'correction', approvalNote: 'ok' }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'SUPER_ADMIN_REQUIRED' }) });
  });

  it('rejects negative adjustments without an approval note', async () => {
    const svc = new RewardsService(prismaWith(), { dispatch: jest.fn(async () => ({ attempted: 0 })), recentlySent: jest.fn(async () => false) } as any);
    await expect(
      svc.adjustPoints('admin-1', ['SUPER_ADMIN'], { userId: 'user-1', points: -100, reason: 'correction' }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'APPROVAL_NOTE_REQUIRED' }) });
  });

  it('rejects negative adjustments beyond the user balance', async () => {
    const svc = new RewardsService(prismaWith({ id: 'acc-1', availablePoints: 50 }), { dispatch: jest.fn(async () => ({ attempted: 0 })), recentlySent: jest.fn(async () => false) } as any);
    await expect(
      svc.adjustPoints('admin-1', ['SUPER_ADMIN'], { userId: 'user-1', points: -100, reason: 'correction', approvalNote: 'ok' }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'INSUFFICIENT_POINTS' }) });
  });

  it('credits positive adjustments with an ADJUST ledger row', async () => {
    const txMocks = {
      rewardAccount: {
        upsert: jest.fn().mockResolvedValue({ id: 'acc-1', availablePoints: 1000 }),
        update: jest.fn().mockResolvedValue({ id: 'acc-1', availablePoints: 1500 }),
      },
      rewardTransaction: { create: jest.fn().mockResolvedValue({ id: 'rt-1' }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'user-1' }) },
      $transaction: jest.fn(async (fn: any) => fn(txMocks)),
    } as any;
    const svc = new RewardsService(prisma, { dispatch: jest.fn(async () => ({ attempted: 0 })), recentlySent: jest.fn(async () => false) } as any);
    const res = await svc.adjustPoints('admin-1', ['ADMIN'], { userId: 'user-1', points: 500, reason: 'goodwill' });
    expect(res.balanceAfter).toBe(1500);
    expect(txMocks.rewardTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'ADJUST', points: 500 }) }),
    );
    expect(txMocks.auditLog.create).toHaveBeenCalled();
  });
});
