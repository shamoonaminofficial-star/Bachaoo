import { CashbackService } from './cashback.service';

/**
 * Phase 10 tests: withdrawal over-balance rejection, idempotent withdraw,
 * and admin moderation guards.
 */

const FUTURE = new Date(Date.now() + 24 * 3600000);

function serviceWith(opts: {
  earned?: number;
  pending?: number;
  reserved?: number;
  idempotencyExisting?: any;
} = {}) {
  const { earned = 50000, pending = 0, reserved = 0, idempotencyExisting = null } = opts;
  const tx = {
    $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    idempotencyKey: {
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    cashback: {
      aggregate: jest.fn(async (args: any) => {
        const status = args?.where?.status;
        if (status === 'APPROVED') return { _sum: { amount: earned } };
        if (status === 'PENDING') return { _sum: { amount: pending } };
        return { _sum: { amount: 0 } };
      }),
    },
    cashbackWithdrawal: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: reserved } }),
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'wd-1', ...data })),
    },
    cashbackTransaction: { create: jest.fn().mockResolvedValue({ id: 'ct-1' }) },
  };
  const prisma = {
    idempotencyKey: { findUnique: jest.fn().mockResolvedValue(idempotencyExisting) },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
    cashback: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: earned } }),
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
    },
    cashbackWithdrawal: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: reserved } }),
      findUnique: jest.fn(),
    },
    cashbackTransaction: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
  } as any;
  const redis = { del: jest.fn().mockResolvedValue(1) } as any;
  return { svc: new CashbackService(prisma, redis, { dispatch: jest.fn(async () => ({ attempted: 0 })), recentlySent: jest.fn(async () => false) } as any), prisma, tx, redis };
}

describe('CashbackService.withdraw', () => {
  it('rejects withdrawals above the available balance', async () => {
    const { svc } = serviceWith({ earned: 50000, reserved: 0 }); // Rs 500 available
    await expect(
      svc.withdraw('user-1', { amountPaisa: 100000, method: 'JAZZCASH', accountDetails: '03001234567' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INSUFFICIENT_CASHBACK' }),
    });
  });

  it('reserves the amount and writes a DEBIT ledger row on the happy path', async () => {
    const { svc, tx } = serviceWith({ earned: 50000, reserved: 0 });
    const res: any = await svc.withdraw(
      'user-1',
      { amountPaisa: 20000, method: 'EASYPAISA', accountDetails: '03451234567' },
      'key-1',
    );
    expect(res.status).toBe('PENDING');
    expect(res.balanceAfter).toBe(30000);
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_xact_lock'),
      expect.anything(),
    );
    expect(tx.cashbackTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'DEBIT', amount: 20000, balanceAfter: 30000 }),
      }),
    );
  });

  it('treats pending withdrawals as reserved (not available)', async () => {
    const { svc } = serviceWith({ earned: 50000, reserved: 40000 }); // only Rs 100 available
    await expect(
      svc.withdraw('user-1', { amountPaisa: 20000, method: 'BANK', accountDetails: 'PK1234' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INSUFFICIENT_CASHBACK' }),
    });
  });

  it('replays the stored response for a repeated idempotency key', async () => {
    const stored = { id: 'wd-1', status: 'PENDING', balanceAfter: 30000 };
    const { svc, prisma } = serviceWith({
      earned: 50000,
      idempotencyExisting: { key: 'k', expiresAt: FUTURE, response: stored },
    });
    const res = await svc.withdraw(
      'user-1',
      { amountPaisa: 20000, method: 'BANK', accountDetails: 'PK1234' },
      'key-1',
    );
    expect(res).toMatchObject({ ...stored, idempotentReplay: true });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('CashbackService moderation', () => {
  it('approveCashback moves PENDING -> APPROVED and audits', async () => {
    const { svc, prisma, tx: _tx } = serviceWith();
    const txAudit = { create: jest.fn().mockResolvedValue({}) };
    (prisma.cashback.findUnique as jest.Mock).mockResolvedValue({
      id: 'cb-1', userId: 'user-1', amount: 5000, status: 'PENDING',
    });
    prisma.$transaction.mockImplementation(async (fn: any) =>
      fn({
        cashback: { update: jest.fn().mockResolvedValue({ id: 'cb-1', status: 'APPROVED' }) },
        auditLog: txAudit,
      }),
    );
    const res = await svc.approveCashback('admin-1', 'cb-1');
    expect(res.status).toBe('APPROVED');
    expect(txAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'cashback.approve' }) }),
    );
  });

  it('approveCashback refuses already-moderated rows', async () => {
    const { svc, prisma } = serviceWith();
    (prisma.cashback.findUnique as jest.Mock).mockResolvedValue({
      id: 'cb-1', userId: 'user-1', amount: 5000, status: 'APPROVED',
    });
    await expect(svc.approveCashback('admin-1', 'cb-1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ALREADY_MODERATED' }),
    });
  });

  it('rejectCashback requires a reason', async () => {
    const { svc } = serviceWith();
    await expect(svc.rejectCashback('admin-1', 'cb-1', '')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'REASON_REQUIRED' }),
    });
  });
});
