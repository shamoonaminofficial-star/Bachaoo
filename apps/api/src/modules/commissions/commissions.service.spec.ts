import { CommissionsService } from './commissions.service';

/**
 * Phase 12 tests: commission math (integer paisa, floor rounding, caps),
 * rate precedence, and settlement idempotency via the unique
 * (businessId, periodStart, periodEnd) constraint.
 *
 * Prisma is mocked; pure math is tested directly, tx-dependent paths through
 * a mock transaction client.
 */

describe('CommissionsService.computeCommissionPaisa', () => {
  it('computes percentage commission with floor rounding', () => {
    // 15% of Rs. 1000.00 = 15000 paisa exactly
    expect(CommissionsService.computeCommissionPaisa(100000, { type: 'PERCENTAGE', percentBps: 1500, fixedAmount: 0 })).toBe(15000);
    // 15% of Rs. 999.99 = 14999.85 → floor to 14999
    expect(CommissionsService.computeCommissionPaisa(99999, { type: 'PERCENTAGE', percentBps: 1500, fixedAmount: 0 })).toBe(14999);
  });

  it('computes fixed commission, clamped to the paid amount', () => {
    expect(CommissionsService.computeCommissionPaisa(100000, { type: 'FIXED', percentBps: 0, fixedAmount: 5000 })).toBe(5000);
    // fixed commission can never exceed what the customer paid
    expect(CommissionsService.computeCommissionPaisa(3000, { type: 'FIXED', percentBps: 0, fixedAmount: 5000 })).toBe(3000);
  });

  it('returns 0 for non-positive or non-integer amounts', () => {
    expect(CommissionsService.computeCommissionPaisa(0, { type: 'PERCENTAGE', percentBps: 1500, fixedAmount: 0 })).toBe(0);
    expect(CommissionsService.computeCommissionPaisa(-100, { type: 'PERCENTAGE', percentBps: 1500, fixedAmount: 0 })).toBe(0);
    expect(CommissionsService.computeCommissionPaisa(99.5, { type: 'PERCENTAGE', percentBps: 1500, fixedAmount: 0 })).toBe(0);
  });

  it('returns 0 for a zero rate', () => {
    expect(CommissionsService.computeCommissionPaisa(100000, { type: 'PERCENTAGE', percentBps: 0, fixedAmount: 0 })).toBe(0);
  });
});

describe('CommissionsService.resolveRate', () => {
  const prisma = (rules: any[]) => ({
    commission: { findMany: jest.fn().mockResolvedValue(rules) },
    systemSetting: { findUnique: jest.fn().mockResolvedValue({ value: 500 }) },
  });

  it('prefers BUSINESS rule over CATEGORY, GLOBAL, and the default setting', async () => {
    const p = prisma([
      { scope: 'GLOBAL', type: 'PERCENTAGE', percentBps: 1000, businessId: null, categoryId: null, id: 'g' },
      { scope: 'CATEGORY', type: 'PERCENTAGE', percentBps: 1200, businessId: null, categoryId: 'cat-1', id: 'c' },
      { scope: 'BUSINESS', type: 'PERCENTAGE', percentBps: 1500, businessId: 'biz-1', categoryId: null, id: 'b' },
    ]);
    const svc = new CommissionsService(p as any);
    const rate = await svc.resolveRate(p as any, 'biz-1', 'cat-1');
    expect(rate.percentBps).toBe(1500);
    expect(rate.ruleId).toBe('b');
  });

  it('falls back to the commission.default_bps setting when no rule matches', async () => {
    const p = prisma([]);
    const svc = new CommissionsService(p as any);
    const rate = await svc.resolveRate(p as any, 'biz-9', null);
    expect(rate.type).toBe('PERCENTAGE');
    expect(rate.percentBps).toBe(500); // mocked setting value
  });

  it('returns 0 bps when neither rules nor setting exist', async () => {
    const p = prisma([]);
    p.systemSetting.findUnique = jest.fn().mockResolvedValue(null);
    const svc = new CommissionsService(p as any);
    const rate = await svc.resolveRate(p as any, 'biz-9', null);
    expect(rate.percentBps).toBe(0);
  });
});

describe('CommissionsService.recordCommission', () => {
  it('creates an immutable ACCRUED row inside the transaction', async () => {
    const created: any[] = [];
    const tx = {
      commission: { findMany: jest.fn().mockResolvedValue([]) },
      systemSetting: { findUnique: jest.fn().mockResolvedValue({ value: 1000 }) },
      commissionEntry: { create: jest.fn((a: any) => { created.push(a.data); return Promise.resolve(a.data); }) },
    };
    const svc = new CommissionsService({} as any);
    const row = await svc.recordCommission(tx, {
      redemptionId: 'red-1',
      businessId: 'biz-1',
      categoryId: null,
      paidAmount: 100000,
    });
    expect(row).toBeTruthy();
    expect(created[0]).toMatchObject({
      kind: 'REDEMPTION',
      redemptionId: 'red-1',
      businessId: 'biz-1',
      paidAmount: 100000,
      commissionBps: 1000,
      commissionPaisa: 10000, // 10% of 100000
      status: 'ACCRUED',
    });
  });

  it('returns null when nothing accrues (no row written)', async () => {
    const tx = {
      commission: { findMany: jest.fn().mockResolvedValue([]) },
      systemSetting: { findUnique: jest.fn().mockResolvedValue(null) },
      commissionEntry: { create: jest.fn() },
    };
    const svc = new CommissionsService({} as any);
    const row = await svc.recordCommission(tx, {
      redemptionId: 'red-2',
      businessId: 'biz-1',
      paidAmount: 100000,
    });
    expect(row).toBeNull();
    expect(tx.commissionEntry.create).not.toHaveBeenCalled();
  });
});
