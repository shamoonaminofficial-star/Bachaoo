import { SettlementsService } from './settlements.service';

/**
 * Phase 12 tests: settlement idempotency (unique business+period constraint
 * returns the existing row instead of duplicating), mark-paid transitions,
 * and cancel releasing entries back to ACCRUED.
 *
 * Prisma is mocked; the P2002 unique-violation path is simulated.
 */

function makePrisma(overrides: any = {}) {
  return {
    commissionEntry: {
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    business: { findUnique: jest.fn().mockResolvedValue({ id: 'biz-1', name: 'Test Biz' }) },
    settlement: {
      create: jest.fn(),
      findUnique: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn((a: any) => Promise.resolve(a.data)),
    },
    $transaction: jest.fn((ops: any[]) => Promise.all(ops.map((op) => op))),
    ...overrides,
  };
}

const FROM = '2026-09-28T00:00:00.000Z';
const TO = '2026-10-04T23:59:59.999Z';

describe('SettlementsService.runSettlement idempotency', () => {
  it('returns the existing settlement when the unique constraint fires', async () => {
    const prisma = makePrisma({
      commissionEntry: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'ce-1', paidAmount: 100000, commissionPaisa: 10000 },
        ]),
      },
      settlement: {
        create: jest.fn().mockRejectedValue({ code: 'P2002' }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'stl-existing',
          settlementNumber: 'STL-2026-ABC123',
        }),
      },
    });
    const svc = new SettlementsService(prisma as any);
    const result: any = await svc.runSettlement({ businessId: 'biz-1', from: FROM, to: TO });
    expect(result.settlements).toHaveLength(1);
    expect(result.settlements[0].existing).toBe(true);
    expect(result.settlements[0].settlementId).toBe('stl-existing');
  });

  it('skips businesses with no accrued entries', async () => {
    const prisma = makePrisma();
    const svc = new SettlementsService(prisma as any);
    const result: any = await svc.runSettlement({ businessId: 'biz-1', from: FROM, to: TO });
    expect(result.settlements[0]).toMatchObject({ businessId: 'biz-1', skipped: true, reason: 'NO_ACCRUED_ENTRIES' });
  });

  it('computes gross/commission/net in integer paisa', async () => {
    const prisma = makePrisma({
      commissionEntry: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'ce-1', paidAmount: 100000, commissionPaisa: 10000 },
          { id: 'ce-2', paidAmount: 50000, commissionPaisa: 5000 },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      settlement: {
        create: jest.fn((a: any) => Promise.resolve({ id: 'stl-1', ...a.data })),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    });
    const svc = new SettlementsService(prisma as any);
    const result: any = await svc.runSettlement({ businessId: 'biz-1', from: FROM, to: TO });
    const s = result.settlements[0];
    expect(s.grossAmount).toBe(150000);
    expect(s.commissionAmount).toBe(15000);
    expect(s.netAmount).toBe(15000);
    expect(s.entries).toBe(2);
  });
});

describe('SettlementsService.markPaid / cancel', () => {
  it('marks a settlement PAID and settles its entries', async () => {
    const prisma = makePrisma({
      settlement: {
        findUnique: jest.fn().mockResolvedValue({ id: 'stl-1', status: 'PENDING' }),
        update: jest.fn((a: any) => Promise.resolve({ id: 'stl-1', ...a.data })),
      },
    });
    const svc = new SettlementsService(prisma as any);
    const updated: any = await svc.markPaid('stl-1', { payoutReference: 'TXN-123' });
    expect(updated.status).toBe('PAID');
    expect(updated.payoutReference).toBe('TXN-123');
    expect(updated.paidAt).toBeInstanceOf(Date);
    expect(prisma.commissionEntry.updateMany).toHaveBeenCalledWith({
      where: { settlementId: 'stl-1', status: 'ACCRUED' },
      data: { status: 'SETTLED' },
    });
  });

  it('rejects marking an already-paid settlement', async () => {
    const prisma = makePrisma({
      settlement: { findUnique: jest.fn().mockResolvedValue({ id: 'stl-1', status: 'PAID' }) },
    });
    const svc = new SettlementsService(prisma as any);
    await expect(svc.markPaid('stl-1', { payoutReference: 'TXN-1' })).rejects.toMatchObject({ response: { code: 'ALREADY_PAID' } });
  });

  it('cancelling releases entries back to ACCRUED', async () => {
    const prisma = makePrisma({
      settlement: {
        findUnique: jest.fn().mockResolvedValue({ id: 'stl-1', status: 'PENDING' }),
        update: jest.fn((a: any) => Promise.resolve({ id: 'stl-1', ...a.data })),
      },
    });
    const svc = new SettlementsService(prisma as any);
    const updated: any = await svc.cancelSettlement('stl-1', { reason: 'duplicate run' });
    expect(updated.status).toBe('CANCELLED');
    expect(updated.cancelReason).toBe('duplicate run');
    expect(prisma.commissionEntry.updateMany).toHaveBeenCalledWith({
      where: { settlementId: 'stl-1', status: 'ACCRUED' },
      data: { settlementId: null },
    });
  });

  it('requires a reason to cancel', async () => {
    const prisma = makePrisma({
      settlement: { findUnique: jest.fn().mockResolvedValue({ id: 'stl-1', status: 'PENDING' }) },
    });
    const svc = new SettlementsService(prisma as any);
    await expect(svc.cancelSettlement('stl-1', { reason: '  ' })).rejects.toMatchObject({ response: { code: 'REASON_REQUIRED' } });
  });
});
