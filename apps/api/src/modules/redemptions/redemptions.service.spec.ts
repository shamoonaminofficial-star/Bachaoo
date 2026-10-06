import { ConflictException } from '@nestjs/common';
import { RedemptionsService } from './redemptions.service';
import { signRedemptionToken } from '../../common/utils/qr-token';

/**
 * Phase 6 tests: eligibility matrix + replay protection.
 *
 * Prisma/Redis are mocked; the QR JWT is REAL (signed with a test secret via
 * signRedemptionToken) so token-shape regressions are caught too.
 */

const TEST_SECRET = 'test-secret-qr-phase6';

const DAY = 86400000;

function baseDeal(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    id: 'deal-1',
    status: 'PUBLISHED',
    startDate: new Date(now - DAY),
    endDate: new Date(now + DAY),
    business: { id: 'biz-1', isActive: true, isVerified: true, deletedAt: null },
    dealBranches: [],
    requiresMembership: true,
    eligiblePlanIds: [],
    perUserLimit: null,
    dailyLimit: null,
    monthlyLimit: null,
    usageLimit: null,
    redemptionCount: 0,
    deletedAt: null,
    categoryId: 'cat-1',
    discountPercent: 20,
    maxDiscountAmount: null,
    dealType: 'PERCENT_OFF',
    originalPrice: null,
    dealPrice: null,
    ...overrides,
  };
}

function baseMembership() {
  return {
    id: 'mem-1',
    planId: 'plan-1',
    plan: { id: 'plan-1', name: 'Gold', cashbackPercent: 5, rewardMultiplierBps: 10000 },
  };
}

function makePrisma() {
  return {
    deal: { findUnique: jest.fn(), update: jest.fn() },
    branch: { findFirst: jest.fn(), findUnique: jest.fn() },
    business: { findFirst: jest.fn() },
    membership: { findFirst: jest.fn() },
    redemption: { count: jest.fn() },
    category: { findMany: jest.fn() },
    savingsTransaction: { aggregate: jest.fn(), groupBy: jest.fn() },
    user: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  } as any;
}

function makeRedis() {
  return {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    markQrJtiUsed: jest.fn(),
    isQrJtiUsed: jest.fn(),
    incrWithExpire: jest.fn(),
  } as any;
}

/** Phase 10 economy collaborators (mocked; old tests assert no voucher/hook behavior). */
function makeEconomyMocks() {
  return {
    vouchers: { applyVoucherAtConfirm: jest.fn() },
    referrals: { tryQualifyOnFirstRedemption: jest.fn().mockResolvedValue(false) },
    /** Phase 12: commission accrual inside the confirm transaction. */
    commissions: { recordCommission: jest.fn().mockResolvedValue(null) },
  };
}

/** Prime every mock for the happy-path eligible case. */
function primeEligible(prisma: any) {
  prisma.deal.findUnique.mockResolvedValue(baseDeal());
  prisma.branch.findFirst.mockResolvedValue({
    id: 'branch-1',
    businessId: 'biz-1',
    isActive: true,
    deletedAt: null,
  });
  prisma.membership.findFirst.mockResolvedValue(baseMembership());
  prisma.redemption.count.mockResolvedValue(0);
}

describe('RedemptionsService eligibility matrix', () => {
  let prisma: any;
  let redis: any;
  let service: RedemptionsService;

  beforeEach(() => {
    prisma = makePrisma();
    redis = makeRedis();
    const { vouchers, referrals, commissions } = makeEconomyMocks();
    service = new RedemptionsService(prisma, redis, vouchers as any, referrals as any, undefined as any, commissions as any);
    primeEligible(prisma);
  });

  async function reason(dealId = 'deal-1', branchId?: string) {
    const res = await service.getEligibility('user-1', dealId, branchId);
    return res;
  }

  it('eligible happy path', async () => {
    const res = await reason();
    expect(res.eligible).toBe(true);
    expect(res.reasons).toEqual([]);
  });

  it('DEAL_NOT_FOUND when the deal does not exist', async () => {
    prisma.deal.findUnique.mockResolvedValue(null);
    const res = await reason();
    expect(res.eligible).toBe(false);
    expect(res.reasons).toEqual(['DEAL_NOT_FOUND']);
  });

  it('DEAL_NOT_LIVE when status is not PUBLISHED', async () => {
    prisma.deal.findUnique.mockResolvedValue(baseDeal({ status: 'DRAFT' }));
    expect((await reason()).reasons).toEqual(['DEAL_NOT_LIVE']);
  });

  it('DEAL_EXPIRED when the deal status is EXPIRED', async () => {
    prisma.deal.findUnique.mockResolvedValue(baseDeal({ status: 'EXPIRED' }));
    expect((await reason()).reasons).toEqual(['DEAL_EXPIRED']);
  });

  it('DEAL_EXPIRED when endDate is in the past', async () => {
    prisma.deal.findUnique.mockResolvedValue(
      baseDeal({ endDate: new Date(Date.now() - DAY) }),
    );
    expect((await reason()).reasons).toEqual(['DEAL_EXPIRED']);
  });

  it('DEAL_NOT_LIVE when startDate is in the future', async () => {
    prisma.deal.findUnique.mockResolvedValue(
      baseDeal({ startDate: new Date(Date.now() + DAY) }),
    );
    expect((await reason()).reasons).toEqual(['DEAL_NOT_LIVE']);
  });

  it('DEAL_NOT_LIVE when the business is inactive', async () => {
    prisma.deal.findUnique.mockResolvedValue(
      baseDeal({ business: { id: 'biz-1', isActive: false, isVerified: true, deletedAt: null } }),
    );
    expect((await reason()).reasons).toEqual(['DEAL_NOT_LIVE']);
  });

  it('MEMBERSHIP_REQUIRED when the deal needs membership and the user never had one', async () => {
    prisma.membership.findFirst.mockResolvedValue(null); // active: none, any: none
    expect((await reason()).reasons).toEqual(['MEMBERSHIP_REQUIRED']);
  });

  it('MEMBERSHIP_INACTIVE when the user has a lapsed membership', async () => {
    // First call (active lookup) -> null; second call (any membership) -> exists.
    prisma.membership.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'mem-old' });
    expect((await reason()).reasons).toEqual(['MEMBERSHIP_INACTIVE']);
  });

  it('PLAN_NOT_ELIGIBLE when the plan is not in eligiblePlanIds', async () => {
    prisma.deal.findUnique.mockResolvedValue(baseDeal({ eligiblePlanIds: ['plan-9'] }));
    expect((await reason()).reasons).toEqual(['PLAN_NOT_ELIGIBLE']);
  });

  it('BRANCH_NOT_ELIGIBLE when the branch is not covered by the deal', async () => {
    prisma.deal.findUnique.mockResolvedValue(
      baseDeal({ dealBranches: [{ branchId: 'other-branch' }] }),
    );
    expect((await reason('deal-1', 'branch-1')).reasons).toEqual(['BRANCH_NOT_ELIGIBLE']);
  });

  it('BRANCH_NOT_ELIGIBLE when the branch is inactive', async () => {
    prisma.branch.findFirst.mockResolvedValue({
      id: 'branch-1',
      businessId: 'biz-1',
      isActive: false,
      deletedAt: null,
    });
    expect((await reason('deal-1', 'branch-1')).reasons).toEqual(['BRANCH_NOT_ELIGIBLE']);
  });

  it('USAGE_LIMIT_REACHED when the global cap is hit', async () => {
    prisma.deal.findUnique.mockResolvedValue(baseDeal({ usageLimit: 100, redemptionCount: 100 }));
    expect((await reason()).reasons).toEqual(['USAGE_LIMIT_REACHED']);
  });

  it('PER_USER_LIMIT_REACHED when the user exhausted their quota', async () => {
    prisma.deal.findUnique.mockResolvedValue(baseDeal({ perUserLimit: 1 }));
    prisma.redemption.count.mockResolvedValue(1);
    expect((await reason()).reasons).toEqual(['PER_USER_LIMIT_REACHED']);
  });

  it('DAILY_LIMIT_REACHED when the daily quota is hit', async () => {
    prisma.deal.findUnique.mockResolvedValue(baseDeal({ dailyLimit: 1 }));
    prisma.redemption.count.mockResolvedValue(1);
    expect((await reason()).reasons).toEqual(['DAILY_LIMIT_REACHED']);
  });

  it('MONTHLY_LIMIT_REACHED when the monthly quota is hit', async () => {
    prisma.deal.findUnique.mockResolvedValue(baseDeal({ monthlyLimit: 1 }));
    prisma.redemption.count.mockResolvedValue(1);
    expect((await reason()).reasons).toEqual(['MONTHLY_LIMIT_REACHED']);
  });

  it('does not require membership when the deal opts out', async () => {
    prisma.deal.findUnique.mockResolvedValue(
      baseDeal({ requiresMembership: false, eligiblePlanIds: [] }),
    );
    prisma.membership.findFirst.mockResolvedValue(null);
    const res = await reason();
    expect(res.eligible).toBe(true);
  });
});

describe('RedemptionsService confirm — replay protection & idempotency', () => {
  let prisma: any;
  let redis: any;
  let service: RedemptionsService;
  let tx: any;
  let vouchersMock: any;
  let referralsMock: any;
  const usedJtis = new Set<string>();

  beforeAll(() => {
    process.env.JWT_SECRET = TEST_SECRET;
  });

  beforeEach(() => {
    usedJtis.clear();
    prisma = makePrisma();
    redis = makeRedis();
    const { vouchers, referrals, commissions } = makeEconomyMocks();
    vouchersMock = vouchers;
    referralsMock = referrals;
    service = new RedemptionsService(prisma, redis, vouchers as any, referrals as any, undefined as any, commissions as any);
    primeEligible(prisma);
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', status: 'ACTIVE' });

    tx = {
      redemption: { create: jest.fn().mockResolvedValue({ id: 'red-1' }) },
      savingsTransaction: { create: jest.fn() },
      cashback: { create: jest.fn().mockResolvedValue({ id: 'cb-1' }) },
      cashbackTransaction: { create: jest.fn() },
      rewardAccount: {
        upsert: jest.fn().mockResolvedValue({ id: 'ra-1', availablePoints: 4000 }),
      },
      rewardTransaction: { create: jest.fn() },
      deal: { update: jest.fn() },
      auditLog: { create: jest.fn() },
      systemSetting: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

    redis.get.mockImplementation(async (key: string) => {
      if (key.startsWith('qr:jti:')) {
        return JSON.stringify({
          userId: 'user-1',
          dealId: 'deal-1',
          branchId: null,
          issuedAt: new Date().toISOString(),
        });
      }
      return null;
    });
    // Atomic SET NX semantics: first use wins, every later use loses.
    redis.markQrJtiUsed.mockImplementation(async (jti: string) => {
      if (usedJtis.has(jti)) return false;
      usedJtis.add(jti);
      return true;
    });
    redis.isQrJtiUsed.mockImplementation(async (jti: string) => usedJtis.has(jti));
  });

  it('confirms once with a server-computed receipt, then rejects the replay with 409', async () => {
    const { token } = signRedemptionToken({ dealId: 'deal-1' }, TEST_SECRET, 90);

    const receipt = await service.confirmRedemption('staff-1', ['SUPER_ADMIN'], {
      token,
      billAmountPaisa: 500000, // Rs. 5,000; 20% off -> 100000 discount
    });
    expect(receipt).toEqual({
      redemptionId: 'red-1',
      bill: 500000,
      discount: 100000,
      paid: 400000,
      saving: 100000,
      cashback: 20000, // 5% of PAID 400000
      points: 4000, // floor(400000/100) * 1x
      voucherDiscount: 0, // Phase 10: no voucher on this confirm
    });

    // The DB write happened exactly once.
    expect(tx.redemption.create).toHaveBeenCalledTimes(1);
    // Idempotency key = jti persisted for DB-level double-submit safety.
    expect(tx.redemption.create.mock.calls[0][0].data.idempotencyKey).toBeTruthy();
    // Audit trail written.
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    // Cashback defaults to APPROVED via the setting default.
    expect(tx.cashback.create.mock.calls[0][0].data.status).toBe('APPROVED');

    // Replay: same token again -> 409 QR_ALREADY_USED, no second DB write.
    let replayErr: unknown = null;
    try {
      await service.confirmRedemption('staff-1', ['SUPER_ADMIN'], { token, billAmountPaisa: 500000 });
    } catch (err) {
      replayErr = err;
    }
    expect(replayErr).toBeInstanceOf(ConflictException);
    expect((replayErr as ConflictException).getResponse()).toMatchObject({
      code: 'QR_ALREADY_USED',
    });
    expect(tx.redemption.create).toHaveBeenCalledTimes(1);
  });

  it('rejects a token whose issuance record is gone (expired)', async () => {
    const { token } = signRedemptionToken({ dealId: 'deal-1' }, TEST_SECRET, 90);
    redis.get.mockResolvedValue(null); // record expired out of Redis
    let err: unknown = null;
    try {
      await service.confirmRedemption('staff-1', ['SUPER_ADMIN'], { token, billAmountPaisa: 100000 });
    } catch (e) {
      err = e;
    }
    expect(err).not.toBeNull();
    expect((err as any).getResponse()).toMatchObject({ code: 'QR_EXPIRED' });
    expect(tx.redemption.create).not.toHaveBeenCalled();
  });

  it('Phase 10: applies a voucher code inside the same transaction', async () => {
    vouchersMock.applyVoucherAtConfirm.mockResolvedValue({ userVoucherId: 'uv-1', voucherDiscount: 30000 });
    const { token } = signRedemptionToken({ dealId: 'deal-1' }, TEST_SECRET, 90);

    const receipt = await service.confirmRedemption('staff-1', ['SUPER_ADMIN'], {
      token,
      billAmountPaisa: 500000, // Rs. 5,000; 20% off -> 100000 deal discount + 30000 voucher
      voucherCode: 'BCH-VOUCHER1',
    });

    expect(receipt).toEqual({
      redemptionId: 'red-1',
      bill: 500000,
      discount: 130000, // 100000 deal + 30000 voucher
      paid: 370000,
      saving: 130000,
      cashback: 20000, // 5% of PAID-before-voucher 400000 (cashback is deal math)
      points: 4000,
      voucherDiscount: 30000,
    });
    // The voucher was consumed with the tx-scoped client, before the row write.
    expect(vouchersMock.applyVoucherAtConfirm).toHaveBeenCalledWith(
      tx,
      'user-1',
      'BCH-VOUCHER1',
      500000,
      'biz-1',
      400000, // bill - deal discount = max applicable
    );
    const created = tx.redemption.create.mock.calls[0][0].data;
    expect(created.userVoucherId).toBe('uv-1');
    expect(created.discountAmount).toBe(130000);
    expect(created.paidAmount).toBe(370000);
    expect(created.savingAmount).toBe(130000);
    expect(created.calculationSnapshot.voucher).toEqual({
      code: 'BCH-VOUCHER1',
      userVoucherId: 'uv-1',
      voucherDiscount: 30000,
    });
    // Savings ledger records the full saving incl. the voucher.
    expect(tx.savingsTransaction.create.mock.calls[0][0].data.amount).toBe(130000);
    // Referral qualifying hook ran (returns false in old mocks).
    expect(referralsMock.tryQualifyOnFirstRedemption).toHaveBeenCalledWith(tx, 'user-1');
  });
});

/**
 * Phase 8: staff scoping — a cashier from business A must never validate or
 * confirm a QR token minted for business B's deal.
 */
describe('RedemptionsService staff scoping (Phase 8)', () => {
  let prisma: any;
  let redis: any;
  let service: RedemptionsService;

  beforeEach(() => {
    prisma = makePrisma();
    redis = makeRedis();
    const { vouchers, referrals, commissions } = makeEconomyMocks();
    service = new RedemptionsService(prisma, redis, vouchers as any, referrals as any, undefined as any, commissions as any);
    primeEligible(prisma);
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', firstName: 'Ali', status: 'ACTIVE' });
    prisma.membership.findFirst.mockResolvedValue(null);
    prisma.deal.findUnique.mockImplementation(async () => ({
      id: 'deal-1',
      title: 'Deal 1',
      businessId: 'biz-1',
      discountPercent: 20,
      maxDiscountAmount: null,
      dealType: 'PERCENT_OFF',
    }));
    redis.get.mockImplementation(async (key: string) => {
      if (key.startsWith('qr:jti:')) {
        return JSON.stringify({
          userId: 'user-1',
          dealId: 'deal-1',
          branchId: null,
          issuedAt: new Date().toISOString(),
        });
      }
      if (key.startsWith('qr:mint:')) return '3';
      return null;
    });
    redis.isQrJtiUsed.mockResolvedValue(false);
    redis.markQrJtiUsed.mockResolvedValue(true);
    prisma.$transaction.mockImplementation(async (cb: any) => cb({}));
  });

  it('validateQrToken rejects a cashier with no link to the deal business (NOT_BUSINESS_STAFF)', async () => {
    const { token } = signRedemptionToken({ dealId: 'deal-1' }, TEST_SECRET, 90);
    prisma.business.findFirst.mockResolvedValue(null); // not staff of biz-1

    let err: unknown = null;
    try {
      await service.validateQrToken('cashier-a', ['CASHIER'], { token });
    } catch (e) {
      err = e;
    }
    expect(err).not.toBeNull();
    expect((err as any).getResponse()).toMatchObject({ code: 'NOT_BUSINESS_STAFF' });
  });

  it('validateQrToken passes for an ACTIVE BusinessStaff link of the deal business', async () => {
    const { token } = signRedemptionToken({ dealId: 'deal-1' }, TEST_SECRET, 90);
    prisma.business.findFirst.mockResolvedValue({ id: 'biz-1' });

    const result = await service.validateQrToken('cashier-b', ['CASHIER'], { token });
    expect(result.customer.firstName).toBe('Ali');
    expect(result.deal.id).toBe('deal-1');
  });

  it('validateQrToken lets platform admins bypass the staff check', async () => {
    const { token } = signRedemptionToken({ dealId: 'deal-1' }, TEST_SECRET, 90);
    // admin bypass: business.findFirst must NOT be called
    const result = await service.validateQrToken('admin-1', ['ADMIN'], { token });
    expect(result.deal.id).toBe('deal-1');
    expect(prisma.business.findFirst).not.toHaveBeenCalled();
  });
});
