import { VouchersService } from './vouchers.service';

/**
 * Phase 10 tests: voucher claim atomicity + bill-time application guards.
 * Prisma is mocked; the atomic claim relies on the updateMany row count
 * (the single-claim race guard).
 */

const FUTURE = new Date(Date.now() + 30 * 86400000);

function makePrisma() {
  return {
    business: { findFirst: jest.fn().mockResolvedValue({ id: 'biz-1' }) },
    voucher: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    voucherCode: {
      createMany: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    userVoucher: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
    },
    $transaction: jest.fn(async (fn: any) => fn({
      userVoucher: { create: jest.fn() },
      voucherCode: { update: jest.fn() },
    })),
  } as any;
}

const businesses = { assertCanManage: jest.fn().mockResolvedValue(undefined) } as any;

describe('VouchersService.claimVoucher', () => {
  it('rejects a double-claim race: second updateMany wins 0 rows -> CODE_ALREADY_CLAIMED', async () => {
    const prisma = makePrisma();
    prisma.voucher.findFirst.mockResolvedValue({
      id: 'v1', title: 'T', valueAmount: 10000, perUserLimit: 1,
      isActive: true, validFrom: new Date(Date.now() - 86400000), validTo: FUTURE,
    });
    // Both callers race; the first flips claimedAt, the second gets count 0.
    prisma.voucherCode.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    prisma.voucherCode.findUnique.mockResolvedValue({ voucherId: 'v1', claimedAt: new Date() });
    prisma.$transaction.mockImplementation(async (fn: any) =>
      fn({
        userVoucher: { create: jest.fn().mockResolvedValue({ id: 'uv-1', code: 'BCH-ABC', expiresAt: FUTURE }) },
        voucherCode: { update: jest.fn().mockResolvedValue({}) },
      }),
    );

    const svc = new VouchersService(prisma, businesses, { dispatch: jest.fn(async () => ({ attempted: 0 })), recentlySent: jest.fn(async () => false) } as any);
    const first = await svc.claimVoucher('user-1', 'v1', 'BCH-ABC');
    expect(first.status).toBe('ACTIVE');

    await expect(svc.claimVoucher('user-2', 'v1', 'BCH-ABC')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CODE_ALREADY_CLAIMED' }),
    });
  });

  it('rejects expired campaigns before touching the code pool', async () => {
    const prisma = makePrisma();
    prisma.voucher.findFirst.mockResolvedValue({
      id: 'v1', title: 'T', valueAmount: 10000, perUserLimit: 1,
      isActive: true, validFrom: new Date(Date.now() - 86400000),
      validTo: new Date(Date.now() - 1000),
    });
    const svc = new VouchersService(prisma, businesses, { dispatch: jest.fn(async () => ({ attempted: 0 })), recentlySent: jest.fn(async () => false) } as any);
    await expect(svc.claimVoucher('user-1', 'v1', 'BCH-ABC')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'VOUCHER_EXPIRED' }),
    });
    expect(prisma.voucherCode.updateMany).not.toHaveBeenCalled();
  });

  it('enforces the per-user claim limit', async () => {
    const prisma = makePrisma();
    prisma.voucher.findFirst.mockResolvedValue({
      id: 'v1', title: 'T', valueAmount: 10000, perUserLimit: 1,
      isActive: true, validFrom: new Date(Date.now() - 86400000), validTo: FUTURE,
    });
    prisma.userVoucher.count.mockResolvedValue(1);
    const svc = new VouchersService(prisma, businesses, { dispatch: jest.fn(async () => ({ attempted: 0 })), recentlySent: jest.fn(async () => false) } as any);
    await expect(svc.claimVoucher('user-1', 'v1', 'BCH-ABC')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PER_USER_LIMIT_REACHED' }),
    });
  });
});

describe('VouchersService.applyVoucherAtConfirm', () => {
  function txWith(voucher: any, userVoucher: any, consumeCount = 1) {
    return {
      userVoucher: {
        findUnique: jest.fn().mockResolvedValue(userVoucher ? { ...userVoucher, voucher } : null),
        updateMany: jest.fn().mockResolvedValue({ count: consumeCount }),
      },
    };
  }

  const liveVoucher = {
    id: 'v1', isActive: true, deletedAt: null,
    validFrom: new Date(Date.now() - 86400000), validTo: FUTURE,
    valueAmount: 50000, minBillPaisa: 100000, businessId: 'biz-1',
  };

  it('consumes the voucher and clamps the discount to the remaining bill', async () => {
    const prisma = makePrisma();
    const svc = new VouchersService(prisma, businesses, { dispatch: jest.fn(async () => ({ attempted: 0 })), recentlySent: jest.fn(async () => false) } as any);
    const tx = txWith(liveVoucher, {
      id: 'uv-1', userId: 'user-1', status: 'AVAILABLE',
      expiresAt: FUTURE,
    });
    // Bill 200000, deal discount 180000 -> only 20000 remains; voucher is 50000.
    const res = await svc.applyVoucherAtConfirm(tx as any, 'user-1', 'BCH-ABC', 200000, 'biz-1', 20000);
    expect(res.voucherDiscount).toBe(20000);
    expect(res.userVoucherId).toBe('uv-1');
  });

  it('rejects a voucher below the min-bill floor', async () => {
    const prisma = makePrisma();
    const svc = new VouchersService(prisma, businesses, { dispatch: jest.fn(async () => ({ attempted: 0 })), recentlySent: jest.fn(async () => false) } as any);
    const tx = txWith(liveVoucher, { id: 'uv-1', userId: 'user-1', status: 'AVAILABLE', expiresAt: FUTURE });
    await expect(
      svc.applyVoucherAtConfirm(tx as any, 'user-1', 'BCH-ABC', 50000, 'biz-1', 40000),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'VOUCHER_MIN_BILL_NOT_MET' }) });
  });

  it('rejects another customer\'s voucher', async () => {
    const prisma = makePrisma();
    const svc = new VouchersService(prisma, businesses, { dispatch: jest.fn(async () => ({ attempted: 0 })), recentlySent: jest.fn(async () => false) } as any);
    const tx = txWith(liveVoucher, { id: 'uv-1', userId: 'user-9', status: 'AVAILABLE', expiresAt: FUTURE });
    await expect(
      svc.applyVoucherAtConfirm(tx as any, 'user-1', 'BCH-ABC', 200000, 'biz-1', 100000),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'VOUCHER_NOT_OWNED' }) });
  });

  it('rejects a voucher scoped to another business', async () => {
    const prisma = makePrisma();
    const svc = new VouchersService(prisma, businesses, { dispatch: jest.fn(async () => ({ attempted: 0 })), recentlySent: jest.fn(async () => false) } as any);
    const tx = txWith(liveVoucher, { id: 'uv-1', userId: 'user-1', status: 'AVAILABLE', expiresAt: FUTURE });
    await expect(
      svc.applyVoucherAtConfirm(tx as any, 'user-1', 'BCH-ABC', 200000, 'biz-2', 100000),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'VOUCHER_BUSINESS_MISMATCH' }) });
  });
});
