import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { MembershipsService } from './memberships.service';
import { PaymentsService } from '../payments/payments.service';
import { assertIntPaisa } from '../../common/utils/money';

const PLAN = {
  id: 'plan-1',
  name: 'Premium',
  slug: 'premium',
  regularPrice: 199900,
  salePrice: 149900, // Rs. 1,499 — integer paisa
  durationDays: 180,
  deletedAt: null,
  isActive: true,
};

const PAYMENT = {
  id: 'pay-1',
  userId: 'user-1',
  orderType: 'MEMBERSHIP',
  amount: 149900,
  currency: 'PKR',
  gateway: 'MANUAL',
  status: 'PENDING',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildMembershipsService(overrides: Record<string, any> = {}) {
  const tx: Record<string, any> = {
    payment: {
      findUnique: jest.fn(async () => null),
      update: jest.fn(async (a: any) => ({ ...PAYMENT, ...a.data })),
    },
    membership: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async (a: any) => ({ id: 'mem-1', ...a.data })),
      count: jest.fn(async () => 1), // not first membership → no signup bonus
      update: jest.fn(async (a: any) => ({ id: 'mem-1', ...a.data })),
    },
    membershipPlan: { findUnique: jest.fn(async () => PLAN) },
    membershipHistory: { create: jest.fn(async (a: any) => a.data) },
    referral: { findFirst: jest.fn(async () => null) },
    systemSetting: { findUnique: jest.fn(async () => null) },
    manualPaymentReceipt: {
      upsert: jest.fn(async (a: any) => ({ id: 'rcpt-1', ...a.create })),
    },
    paymentAttempt: { create: jest.fn(async () => ({})) },
    ...overrides.tx,
  };
  const prisma: Record<string, any> = {
    membershipPlan: {
      findUnique: jest.fn(async () => PLAN),
      findMany: jest.fn(async () => [PLAN]),
      create: jest.fn(async (a: any) => ({ id: 'plan-1', ...a.data })),
      update: jest.fn(async (a: any) => ({ ...PLAN, ...a.data })),
    },
    membership: {
      findFirst: jest.fn(async () => null),
      findUnique: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
    membershipHistory: { findMany: jest.fn(async () => []), createMany: jest.fn() },
    payment: {
      create: jest.fn(async (a: any) => ({ ...PAYMENT, ...a.data })),
      findUnique: jest.fn(async () => null),
      update: jest.fn(async (a: any) => ({ ...PAYMENT, ...a.data })),
    },
    paymentAttempt: { create: jest.fn(async () => ({})) },
    user: { findUnique: jest.fn(async () => ({ id: 'user-1' })) },
    $transaction: jest.fn(async (cb: any) => cb(tx)),
    ...overrides.prisma,
  };
  const gateway = {
    createIntent: jest.fn(async () => ({
      kind: 'MANUAL_INSTRUCTIONS',
      clientData: { accounts: [], amountPaisa: PLAN.salePrice },
    })),
    verifyWebhook: jest.fn(),
  };
  const gateways = { resolve: jest.fn(() => gateway), supported: () => ['MANUAL'] };
  const storage = { upload: jest.fn(async () => ({ url: 'https://cdn/rcpt.jpg', key: 'k' })), delete: jest.fn() };
  const service = new MembershipsService(prisma as any, gateways as any, storage as any, { del: jest.fn(async () => 1), get: jest.fn(async () => null), set: jest.fn(async () => 'OK') } as any, { dispatch: jest.fn(async () => ({ attempted: 0 })), recentlySent: jest.fn(async () => false) } as any);
  return { service, prisma, tx, gateway, gateways };
}

// ---------------------------------------------------------------------------
// Purchase
// ---------------------------------------------------------------------------

describe('MembershipsService.purchasePlan', () => {
  it('creates the payment from the plan price (never client input) and returns gateway clientData', async () => {
    const { service, prisma, gateway } = buildMembershipsService();
    const res = await service.purchasePlan('user-1', { planId: 'plan-1', gateway: 'MANUAL' as any });

    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-1', amount: 149900, status: 'PENDING' }),
      }),
    );
    expect(gateway.createIntent).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 149900, currency: 'PKR' }),
    );
    expect(res).toEqual(
      expect.objectContaining({ paymentId: 'pay-1', gateway: 'MANUAL', kind: 'MANUAL_INSTRUCTIONS' }),
    );
    expect(res.clientData).toBeDefined();
  });

  it('cancels the payment when the gateway cannot build an intent (keys not configured)', async () => {
    const { service, prisma, gateway } = buildMembershipsService();
    gateway.createIntent.mockRejectedValueOnce(
      new ServiceUnavailableException({ code: 'GATEWAY_NOT_CONFIGURED', message: 'no keys' }),
    );
    await expect(
      service.purchasePlan('user-1', { planId: 'plan-1', gateway: 'JAZZCASH' as any }),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELLED' }) }),
    );
  });

  it('rejects inactive or missing plans', async () => {
    const { service, prisma } = buildMembershipsService({
      prisma: { membershipPlan: { findUnique: jest.fn(async () => null) } },
    });
    await expect(
      service.purchasePlan('user-1', { planId: 'nope', gateway: 'MANUAL' as any }),
    ).rejects.toThrow('This membership plan is not available.');
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Activation: idempotency, stacking, rewards
// ---------------------------------------------------------------------------

describe('MembershipsService.activateMembership', () => {
  function paidPaymentTx(overrides: Record<string, any> = {}) {
    return {
      payment: {
        findUnique: jest.fn(async () => ({
          ...PAYMENT,
          status: 'PAID',
          attempts: [{ requestPayload: { planId: 'plan-1', amount: 149900 } }],
        })),
        update: jest.fn(async (a: any) => a),
      },
      membership: {
        findFirst: jest.fn(async (q: any) => {
          // idempotency lookup by paymentId → null (first activation)
          if (q?.where?.paymentId) return null;
          return null; // no current active membership → starts now
        }),
        create: jest.fn(async (a: any) => ({ id: 'mem-1', ...a.data })),
        count: jest.fn(async () => 0), // first-ever membership → signup bonus
      },
      membershipPlan: { findUnique: jest.fn(async () => PLAN) },
      membershipHistory: { create: jest.fn(async (a: any) => a.data) },
      referral: { findFirst: jest.fn(async () => null), update: jest.fn() },
      referralReward: { create: jest.fn() },
      rewardAccount: {
        upsert: jest.fn(async () => ({ id: 'ra-1', availablePoints: 0, lifetimePoints: 0 })),
        update: jest.fn(),
      },
      rewardTransaction: { create: jest.fn() },
      systemSetting: {
        findUnique: jest.fn(async ({ where }: any) =>
          where.key === 'signup.reward_points' ? { value: 100 } : null,
        ),
      },
      ...overrides,
    };
  }

  it('activates, stacks nothing when no current membership, and awards signup points once', async () => {
    const tx = paidPaymentTx();
    const { service } = buildMembershipsService({ tx });
    const res: any = await service.activateMembership('pay-1');

    expect(res.status).toBe('ACTIVE');
    // 180 days from now, integer math
    const expectedMs = 180 * 24 * 60 * 60 * 1000;
    expect(res.endDate.getTime() - res.startDate.getTime()).toBe(expectedMs);
    expect(tx.membershipHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'ACTIVATED' }) }),
    );
    // signup bonus: ledgered EARN transaction
    expect(tx.rewardTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'EARN', points: 100, reference: 'signup:mem-1' }),
      }),
    );
  });

  it('stacks the new period onto the current active membership end date', async () => {
    const currentEnd = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const tx = paidPaymentTx({
      membership: {
        findFirst: jest.fn(async (q: any) => {
          if (q?.where?.paymentId) return null;
          return { id: 'mem-old', endDate: currentEnd }; // active membership
        }),
        create: jest.fn(async (a: any) => ({ id: 'mem-2', ...a.data })),
        count: jest.fn(async () => 1),
      },
    });
    const { service } = buildMembershipsService({ tx });
    const res: any = await service.activateMembership('pay-1');
    expect(res.startDate.getTime()).toBe(currentEnd.getTime());
  });

  it('is idempotent: returns the existing membership when the payment is already linked', async () => {
    const existing = { id: 'mem-9', status: 'ACTIVE' };
    const tx = paidPaymentTx({
      membership: {
        findFirst: jest.fn(async (q: any) => (q?.where?.paymentId ? existing : null)),
        create: jest.fn(),
        count: jest.fn(async () => 1),
      },
    });
    const { service } = buildMembershipsService({ tx });
    const res = await service.activateMembership('pay-1');
    expect(res).toBe(existing);
    expect(tx.membership.create).not.toHaveBeenCalled();
  });

  it('fires the referral qualifying event and credits the referrer (ledgered)', async () => {
    const tx = paidPaymentTx({
      referral: {
        findFirst: jest.fn(async () => ({ id: 'ref-1', referrerId: 'user-referrer', status: 'INVITED' })),
        update: jest.fn(async (a: any) => a),
      },
      systemSetting: {
        findUnique: jest.fn(async ({ where }: any) =>
          where.key === 'referral.reward_points' ? { value: 500 } : null,
        ),
      },
    });
    const { service } = buildMembershipsService({ tx });
    await service.activateMembership('pay-1');
    expect(tx.referral.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'REWARDED' }) }),
    );
    expect(tx.referralReward.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'POINTS', pointsAmount: 500, status: 'APPROVED' }),
      }),
    );
    expect(tx.rewardTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-referrer', points: 500 }),
      }),
    );
  });

  it('rejects activation for unpaid payments', async () => {
    const tx = paidPaymentTx({
      payment: {
        findUnique: jest.fn(async () => ({ ...PAYMENT, status: 'PENDING', attempts: [] })),
        update: jest.fn(),
      },
    });
    const { service } = buildMembershipsService({ tx });
    await expect(service.activateMembership('pay-1')).rejects.toThrow(UnprocessableEntityException);
  });
});

// ---------------------------------------------------------------------------
// Manual receipt
// ---------------------------------------------------------------------------

describe('MembershipsService.uploadManualReceipt', () => {
  const file = { originalname: 'rcpt.jpg', mimetype: 'image/jpeg', size: 1024, buffer: Buffer.from('x') } as any;

  it('uploads the receipt and moves the payment to AWAITING_VERIFICATION', async () => {
    const { service, tx, prisma } = buildMembershipsService({
      prisma: { payment: { findUnique: jest.fn(async () => PAYMENT) } },
    });
    const res: any = await service.uploadManualReceipt('user-1', 'pay-1', { bankName: 'Demo Bank' }, file);
    expect(res.receiptUrl).toBe('https://cdn/rcpt.jpg');
    expect(tx.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'AWAITING_VERIFICATION' }) }),
    );
    expect(prisma.payment.findUnique).toHaveBeenCalled();
  });

  it('rejects non-pending payments', async () => {
    const { service } = buildMembershipsService({
      prisma: { payment: { findUnique: jest.fn(async () => ({ ...PAYMENT, status: 'PAID' })) } },
    });
    await expect(service.uploadManualReceipt('user-1', 'pay-1', {}, file)).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('rejects invalid file types', async () => {
    const { service } = buildMembershipsService({
      prisma: { payment: { findUnique: jest.fn(async () => PAYMENT) } },
    });
    const bad = { ...file, mimetype: 'application/zip' };
    await expect(service.uploadManualReceipt('user-1', 'pay-1', {}, bad)).rejects.toThrow(
      'Receipt must be one of',
    );
  });
});

// ---------------------------------------------------------------------------
// Plans: pricing validation + delete guard
// ---------------------------------------------------------------------------

describe('MembershipsService plan management', () => {
  it('rejects salePrice above regularPrice (400)', async () => {
    const { service } = buildMembershipsService();
    await expect(
      service.createPlan({
        name: 'Bad',
        description: 'x',
        regularPrice: 100000,
        salePrice: 200000,
        durationDays: 30,
        benefits: ['a'],
        rewardMultiplierBps: 10000,
        cashbackPercent: 0,
        toSlug: () => 'bad',
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses to delete a plan with active memberships (409)', async () => {
    const { service, prisma } = buildMembershipsService({
      prisma: { membership: { count: jest.fn(async () => 3) } },
    });
    await expect(service.deletePlan('plan-1')).rejects.toThrow(ConflictException);
    expect(prisma.membershipPlan.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Extend / cancel guards
// ---------------------------------------------------------------------------

describe('MembershipsService extend/cancel', () => {
  it('refuses to extend a non-active membership (422)', async () => {
    const { service } = buildMembershipsService({
      prisma: { membership: { findUnique: jest.fn(async () => ({ id: 'm', status: 'EXPIRED' })) } },
    });
    await expect(service.extendMembership('m', { days: 30, reason: 'x' }, 'admin-1')).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('refuses to cancel an already-cancelled membership (422)', async () => {
    const { service } = buildMembershipsService({
      prisma: { membership: { findUnique: jest.fn(async () => ({ id: 'm', status: 'CANCELLED' })) } },
    });
    await expect(service.cancelMembership('m', { reason: 'x' }, 'admin-1')).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('extends by whole days with integer math', async () => {
    // Use a future end date: the service extends from now when the stored date is past.
    const endDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const { service, tx } = buildMembershipsService({
      prisma: { membership: { findUnique: jest.fn(async () => ({ id: 'm', status: 'ACTIVE', endDate, deletedAt: null })) } },
    });
    const res: any = await service.extendMembership('m', { days: 30, reason: 'goodwill' }, 'admin-1');
    expect(res.endDate.getTime() - endDate.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
    expect(tx.membershipHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'EXTENDED' }) }),
    );
  });
});

// ---------------------------------------------------------------------------
// Webhook idempotency (PaymentsService)
// ---------------------------------------------------------------------------

describe('PaymentsService.handleWebhook idempotency', () => {
  function buildPaymentsService() {
    const prisma: Record<string, any> = {
      payment: {
        findFirst: jest.fn(async () => ({ id: 'pay-1', status: 'PAID', gatewayTxnId: 'txn-1' })),
        update: jest.fn(),
      },
      paymentAttempt: { create: jest.fn() },
      $transaction: jest.fn(async (cb: any) => cb(prisma)),
    };
    const event = { gatewayTxnId: 'txn-1', status: 'PAID' as const, raw: {} };
    const gateway = { name: 'JAZZCASH', verifyWebhook: jest.fn(async () => event) };
    const gateways = { resolve: jest.fn(() => gateway) };
    const memberships = { activateMembership: jest.fn(async () => ({})) };
    const manualGateway = { getBankAccounts: jest.fn(async () => []) };
    const service = new PaymentsService(prisma as any, memberships as any, gateways as any, manualGateway as any, { del: jest.fn(async () => 0) } as any);
    return { service, prisma, memberships, gateway };
  }

  it('acknowledges a duplicate webhook without side effects (no double membership)', async () => {
    const { service, memberships } = buildPaymentsService();
    const res = await service.handleWebhook('JAZZCASH', {}, 'sig', Buffer.from('raw'), {});
    expect(res).toEqual({ paymentId: 'pay-1', alreadyProcessed: true });
    expect(memberships.activateMembership).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Money math: no floats, ever
// ---------------------------------------------------------------------------

describe('money safety', () => {
  it('rejects non-integer paisa amounts', () => {
    expect(() => assertIntPaisa(1499.99, 'amount')).toThrow();
    expect(() => assertIntPaisa('149900' as any, 'amount')).toThrow();
    expect(() => assertIntPaisa(149900, 'amount')).not.toThrow();
  });

  it('plan prices are integers: sale + discount math stays in paisa', () => {
    const sale = 149900;
    const regular = 199900;
    assertIntPaisa(sale, 'salePrice');
    assertIntPaisa(regular, 'regularPrice');
    const discount = regular - sale; // integer subtraction, no floats
    expect(discount).toBe(50000);
    expect(Number.isInteger(discount)).toBe(true);
  });
});
