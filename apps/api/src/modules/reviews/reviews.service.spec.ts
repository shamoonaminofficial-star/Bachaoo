import { ReviewsService } from './reviews.service';

/**
 * Phase 11 tests: review creation guards and upsert semantics.
 * Prisma/BusinessesService are mocked; we assert contract + error codes.
 */

const BUSINESS_ID = 'b1';
const USER_ID = 'u1';

function makePrisma(opts: { redemptions?: number; existing?: any; autoApprove?: boolean } = {}) {
  const { redemptions = 1, existing = null, autoApprove = false } = opts;
  const created: any = { id: 'r-new', businessId: BUSINESS_ID, userId: USER_ID, dealId: null, rating: 5, status: autoApprove ? 'APPROVED' : 'PENDING', createdAt: new Date(), updatedAt: new Date(), replyBody: null, repliedAt: null, photos: [] };
  const tx = {
    review: {
      findFirst: jest.fn().mockResolvedValue(existing),
      update: jest.fn().mockImplementation(async ({ data }: any) => ({ ...existing, ...data })),
      create: jest.fn().mockResolvedValue(created),
    },
    reviewPhoto: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  return {
    business: { findFirst: jest.fn().mockResolvedValue({ id: BUSINESS_ID, isActive: true }) },
    deal: { findFirst: jest.fn().mockResolvedValue({ id: 'd1' }) },
    redemption: { count: jest.fn().mockResolvedValue(redemptions) },
    review: {
      findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
        if (where.id === 'r-new') return created;
        if (existing && where.id === existing.id) {
          // Re-queued for moderation: the update flips status to PENDING (or APPROVED with autoApprove).
          return { ...existing, photos: [], createdAt: new Date(), updatedAt: new Date(), replyBody: null, repliedAt: null, title: null, body: 'Even better now', rating: 5, status: autoApprove ? 'APPROVED' : 'PENDING' };
        }
        return null;
      }),
      aggregate: jest.fn().mockResolvedValue({ _avg: { rating: 4.5 }, _count: { rating: 2 } }),
    },
    businessUpdate: jest.fn(),
    businessUpdateArgs: null as any,
    systemSetting: { findUnique: jest.fn().mockResolvedValue(autoApprove ? { value: true } : null) },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
    __tx: tx,
  } as any;
}

function makeService(prisma: any) {
  const businesses = { assertCanManage: jest.fn().mockResolvedValue(undefined) } as any;
  // patch business.update capture
  prisma.business = {
    findFirst: prisma.business.findFirst,
    update: jest.fn(async (args: any) => { prisma.businessUpdateArgs = args; return {}; }),
  };
  return new ReviewsService(prisma, businesses);
}

describe('ReviewsService.createReview', () => {
  it('rejects with NO_REDEMPTION when the user never redeemed at the business', async () => {
    const prisma = makePrisma({ redemptions: 0 });
    const svc = makeService(prisma);
    await expect(svc.createReview(USER_ID, { businessId: BUSINESS_ID, rating: 5 })).rejects.toMatchObject({
      response: { code: 'NO_REDEMPTION' },
    });
  });

  it('rejects ratings outside 1-5', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma);
    await expect(svc.createReview(USER_ID, { businessId: BUSINESS_ID, rating: 6 })).rejects.toMatchObject({
      response: { code: 'INVALID_RATING' },
    });
  });

  it('creates a PENDING review by default and upserts on repost', async () => {
    const existing = { id: 'r-old', businessId: BUSINESS_ID, userId: USER_ID, dealId: null, rating: 3, status: 'APPROVED' };
    const prisma = makePrisma({ existing });
    const svc = makeService(prisma);
    const dto = await svc.createReview(USER_ID, { businessId: BUSINESS_ID, rating: 5, body: 'Even better now' });
    // existing review updated (not duplicated), re-queued to PENDING
    expect(prisma.__tx.review.update).toHaveBeenCalled();
    expect(prisma.__tx.review.create).not.toHaveBeenCalled();
    expect(dto.status).toBe('PENDING');
  });

  it('creates an APPROVED review + recomputes rating when autoApprove is on', async () => {
    const prisma = makePrisma({ autoApprove: true });
    const svc = makeService(prisma);
    await svc.createReview(USER_ID, { businessId: BUSINESS_ID, rating: 5 });
    expect(prisma.businessUpdateArgs).toMatchObject({
      where: { id: BUSINESS_ID },
      data: { ratingAvg: 4.5, ratingCount: 2 },
    });
  });
});

describe('ReviewsService.replyToReview', () => {
  it('rejects a second reply with ALREADY_REPLIED', async () => {
    const prisma = makePrisma();
    prisma.review.findUnique = jest.fn().mockResolvedValue({
      id: 'r1', businessId: BUSINESS_ID, replyBody: 'Thanks!', repliedAt: new Date(),
    });
    const svc = makeService(prisma);
    await expect(svc.replyToReview('owner1', ['BUSINESS_OWNER'], 'r1', 'hello')).rejects.toMatchObject({
      response: { code: 'ALREADY_REPLIED' },
    });
  });
});
