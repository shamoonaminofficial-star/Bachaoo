import { BadRequestException, ConflictException } from '@nestjs/common';
import { DealsService } from './deals.service';
import { FavoritesService } from '../favorites/favorites.service';
import {
  BADGE_THRESHOLDS,
  computeBadges,
  computeSavings,
  normalizeDaysAvailable,
  validateDealPricing,
} from './deal-helpers';

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('computeBadges', () => {
  const base = {
    requiresMembership: false,
    eligiblePlanIds: [],
    redemptionCount: 0,
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30d old
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30d left
  };

  it('returns no badges for a plain old deal', () => {
    expect(computeBadges(base, 0)).toEqual([]);
  });

  it('marks MEMBERS_ONLY when membership is required (no plan restriction)', () => {
    expect(computeBadges({ ...base, requiresMembership: true }, 0)).toContain('MEMBERS_ONLY');
  });

  it('marks EXCLUSIVE (not MEMBERS_ONLY) when specific plans are eligible', () => {
    const badges = computeBadges(
      { ...base, requiresMembership: true, eligiblePlanIds: ['plan-1'] },
      0,
    );
    expect(badges).toContain('EXCLUSIVE');
    expect(badges).not.toContain('MEMBERS_ONLY');
  });

  it('marks NEW for deals created within 7 days', () => {
    const badges = computeBadges({ ...base, createdAt: new Date(Date.now() - 86400000) }, 0);
    expect(badges).toContain('NEW');
  });

  it('marks LIMITED_TIME when the deal ends within 72 hours', () => {
    const badges = computeBadges(
      { ...base, endDate: new Date(Date.now() + 24 * 60 * 60 * 1000) },
      0,
    );
    expect(badges).toContain('LIMITED_TIME');
  });

  it('does not mark LIMITED_TIME for already-expired deals', () => {
    const badges = computeBadges(
      { ...base, endDate: new Date(Date.now() - 1000) },
      0,
    );
    expect(badges).not.toContain('LIMITED_TIME');
  });

  it('marks TRENDING when trailing-7-day redemptions hit the threshold', () => {
    const badges = computeBadges(base, BADGE_THRESHOLDS.TRENDING_REDEMPTIONS_7D);
    expect(badges).toContain('TRENDING');
    expect(computeBadges(base, BADGE_THRESHOLDS.TRENDING_REDEMPTIONS_7D - 1)).not.toContain(
      'TRENDING',
    );
  });

  it('marks POPULAR at the lifetime redemption threshold', () => {
    const badges = computeBadges(
      { ...base, redemptionCount: BADGE_THRESHOLDS.POPULAR_REDEMPTIONS },
      0,
    );
    expect(badges).toContain('POPULAR');
  });
});

describe('computeSavings (server-side, paisa integers)', () => {
  it('computes exact saving when both prices are known', () => {
    // Rs. 1,499 -> Rs. 1,199 = Rs. 300 saved
    expect(computeSavings({ originalPrice: 149900, dealPrice: 119900 })).toEqual({
      youSavePaisa: 30000,
      memberPricePaisa: 119900,
    });
  });

  it('returns nulls when the saving cannot be calculated accurately', () => {
    expect(computeSavings({ originalPrice: 149900, dealPrice: null })).toEqual({
      youSavePaisa: null,
      memberPricePaisa: null,
    });
    expect(computeSavings({ originalPrice: null, dealPrice: null })).toEqual({
      youSavePaisa: null,
      memberPricePaisa: null,
    });
  });

  it('clamps negative savings to zero instead of reporting a negative', () => {
    expect(computeSavings({ originalPrice: 10000, dealPrice: 12000 }).youSavePaisa).toBe(0);
  });
});

describe('validateDealPricing', () => {
  const valid = {
    startDate: '2026-11-01T00:00:00Z',
    endDate: '2026-12-01T00:00:00Z',
    discountPercent: 20,
    originalPrice: 149900,
    dealPrice: 119900,
  };

  it('accepts a sane deal', () => {
    expect(() => validateDealPricing(valid)).not.toThrow();
  });

  it('rejects endDate <= startDate', () => {
    let thrownErr: any = null;
    try {
      validateDealPricing({ ...valid, endDate: '2026-10-01T00:00:00Z' });
    } catch (err: any) {
      thrownErr = err;
    }
    expect(thrownErr).not.toBeNull();
    expect(thrownErr).toBeInstanceOf(BadRequestException);
    expect(thrownErr.getResponse().code).toBe('INVALID_DATE_RANGE');
  });

  it('rejects dealPrice greater than originalPrice', () => {
    let thrownErr: any = null;
    try {
      validateDealPricing({ ...valid, dealPrice: 159900 });
    } catch (err: any) {
      thrownErr = err;
    }
    expect(thrownErr).not.toBeNull();
    expect(thrownErr.getResponse().code).toBe('DEAL_PRICE_EXCEEDS_ORIGINAL');
  });

  it('rejects discountPercent outside 0-100', () => {
    let thrownErr: any = null;
    try {
      validateDealPricing({ ...valid, discountPercent: 150 });
    } catch (err: any) {
      thrownErr = err;
    }
    expect(thrownErr).not.toBeNull();
    expect(thrownErr.getResponse().code).toBe('INVALID_DISCOUNT_PERCENT');
  });

  it('rejects a lone timeStart without timeEnd', () => {
    let thrownErr: any = null;
    try {
      validateDealPricing({ ...valid, timeStart: '09:00', timeEnd: null });
    } catch (err: any) {
      thrownErr = err;
    }
    expect(thrownErr).not.toBeNull();
    expect(thrownErr.getResponse().code).toBe('INVALID_TIME_WINDOW');
  });
});

describe('normalizeDaysAvailable', () => {
  it('normalizes lowercase codes', () => {
    expect(normalizeDaysAvailable(['mon', 'tue'])).toEqual(['MON', 'TUE']);
  });

  it('dedupes and returns [] for empty input', () => {
    expect(normalizeDaysAvailable(['MON', 'MON'])).toEqual(['MON']);
    expect(normalizeDaysAvailable([])).toEqual([]);
    expect(normalizeDaysAvailable(undefined)).toEqual([]);
  });

  it('rejects unknown day codes', () => {
    expect(() => normalizeDaysAvailable(['FUNDAY'])).toThrow(BadRequestException);
  });
});

// ---------------------------------------------------------------------------
// Service behaviour (mocked Prisma)
// ---------------------------------------------------------------------------

function buildDealsService(overrides: { deal?: Record<string, jest.Mock> } = {}) {
  const deal = {
    findUnique: jest.fn(),
    findMany: jest.fn(async () => []),
    count: jest.fn(async () => 0),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(async () => ({ count: 0 })),
    groupBy: jest.fn(async () => []),
    ...overrides.deal,
  };
  const prisma = {
    deal,
    dealImage: { count: jest.fn(async () => 0), create: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
    redemption: { count: jest.fn(async () => 0), groupBy: jest.fn(async () => []) },
    membership: { findFirst: jest.fn(async (): Promise<any> => null) },
    membershipPlan: { findMany: jest.fn(async () => []) },
    category: { findUnique: jest.fn(async () => ({ id: 'cat-1', isActive: true, deletedAt: null })) },
    subcategory: { findFirst: jest.fn(async () => ({ id: 'sub-1' })) },
    business: { findUnique: jest.fn() },
    branch: { findMany: jest.fn(async () => []) },
  };
  const redis = {
    get: jest.fn(async () => null),
    set: jest.fn(async () => 'OK'),
    del: jest.fn(async () => 0),
    incrWithExpire: jest.fn(async () => 2),
  };
  const storage = { upload: jest.fn(), delete: jest.fn(async () => undefined) };
  const service = new DealsService(prisma as any, redis as any, storage as any, { dispatch: jest.fn(async () => ({ attempted: 0 })), recentlySent: jest.fn(async () => false) } as any);
  return { service, prisma, redis, storage };
}

describe('DealsService status transitions', () => {
  it('rejects approve from a non-pending status with 409', async () => {
    const { service } = buildDealsService({
      deal: {
        findUnique: jest.fn(async () => ({ id: 'd1', status: 'PUBLISHED', deletedAt: null })),
      },
    });
    let thrownErr: any = null;
    try {
      await service.approve('admin-1', 'd1');
    } catch (err: any) {
      thrownErr = err;
    }
    expect(thrownErr).not.toBeNull();
    expect(thrownErr).toBeInstanceOf(ConflictException);
    expect(thrownErr.getResponse().code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('approves a pending deal and records the reviewer', async () => {
    const { service, prisma } = buildDealsService({
      deal: {
        findUnique: jest.fn(async () => ({ id: 'd1', status: 'PENDING_APPROVAL', deletedAt: null })),
        update: jest.fn(async (args: any) => ({ id: 'd1', ...args.data })),
      },
    });
    const result: any = await service.approve('admin-1', 'd1');
    expect(result.status).toBe('APPROVED');
    expect(prisma.deal.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: expect.objectContaining({ status: 'APPROVED', reviewedBy: 'admin-1' }),
    });
  });

  it('rejects reject() without a reason (400)', async () => {
    const { service } = buildDealsService();
    let thrownErr: any = null;
    try {
      await service.reject('admin-1', 'd1', '   ');
    } catch (err: any) {
      thrownErr = err;
    }
    expect(thrownErr).not.toBeNull();
    expect(thrownErr).toBeInstanceOf(BadRequestException);
    expect(thrownErr.getResponse().code).toBe('REASON_REQUIRED');
  });

  it('rejects requestChanges() without notes (400)', async () => {
    const { service } = buildDealsService();
    let thrownErr: any = null;
    try {
      await service.requestChanges('admin-1', 'd1');
    } catch (err: any) {
      thrownErr = err;
    }
    expect(thrownErr).not.toBeNull();
    expect(thrownErr.getResponse().code).toBe('NOTES_REQUIRED');
  });

  it('blocks partner update of a published deal with 409', async () => {
    const { service } = buildDealsService({
      deal: {
        findUnique: jest.fn(async () => ({
          id: 'd1',
          status: 'PUBLISHED',
          deletedAt: null,
          businessId: 'b1',
          business: { ownerUserId: 'u1', staff: [] },
        })),
      },
    });
    let thrownErr: any = null;
    try {
      await service.update('u1', 'd1', { title: 'New title' } as any);
    } catch (err: any) {
      thrownErr = err;
    }
    expect(thrownErr).not.toBeNull();
    expect(thrownErr).toBeInstanceOf(ConflictException);
    expect(thrownErr.getResponse().code).toBe('DEAL_NOT_EDITABLE');
  });
});

describe('DealsService.checkEligibility', () => {
  const liveDeal = (over: Record<string, any> = {}) => ({
    id: 'd1',
    status: 'PUBLISHED',
    deletedAt: null,
    startDate: new Date(Date.now() - 86400000),
    endDate: new Date(Date.now() + 86400000),
    requiresMembership: true,
    eligiblePlanIds: [],
    usageLimit: null,
    perUserLimit: 2,
    redemptionCount: 0,
    business: { isActive: true },
    ...over,
  });

  function buildWithDeal(deal: any, membership: any = null, usedCount = 0) {
    return buildDealsService({
      deal: { findUnique: jest.fn(async () => deal) },
    });
  }

  it('reports NOT_LOGGED_IN for anonymous callers', async () => {
    const { service, prisma } = buildWithDeal(liveDeal());
    (prisma as any).membership.findFirst = jest.fn(async () => null);
    const res = await service.checkEligibility('d1', undefined);
    expect(res).toEqual({ eligible: false, reasons: ['NOT_LOGGED_IN'] });
  });

  it('reports MEMBERSHIP_REQUIRED when the deal needs a membership', async () => {
    const { service, prisma } = buildDealsService({
      deal: { findUnique: jest.fn(async () => liveDeal()) },
    });
    prisma.membership.findFirst = jest.fn(async () => null);
    prisma.redemption.count = jest.fn(async () => 0);
    const res = await service.checkEligibility('d1', 'u1');
    expect(res.eligible).toBe(false);
    expect(res.reasons).toContain('MEMBERSHIP_REQUIRED');
  });

  it('reports PLAN_NOT_ELIGIBLE for the wrong plan', async () => {
    const { service, prisma } = buildDealsService({
      deal: { findUnique: jest.fn(async () => liveDeal({ eligiblePlanIds: ['plan-premium'] })) },
    });
    prisma.membership.findFirst = jest.fn(async () => ({ id: 'm1', planId: 'plan-starter' }));
    prisma.redemption.count = jest.fn(async () => 0);
    const res = await service.checkEligibility('d1', 'u1');
    expect(res.reasons).toContain('PLAN_NOT_ELIGIBLE');
    expect(res.reasons).not.toContain('MEMBERSHIP_REQUIRED');
  });

  it('is eligible with an active membership on an eligible plan', async () => {
    const { service, prisma } = buildDealsService({
      deal: { findUnique: jest.fn(async () => liveDeal({ eligiblePlanIds: ['plan-premium'] })) },
    });
    prisma.membership.findFirst = jest.fn(async () => ({ id: 'm1', planId: 'plan-premium' }));
    prisma.redemption.count = jest.fn(async () => 0);
    expect(await service.checkEligibility('d1', 'u1')).toEqual({ eligible: true, reasons: [] });
  });

  it('reports DEAL_EXPIRED and PER_USER_LIMIT_REACHED', async () => {
    const { service, prisma } = buildDealsService({
      deal: {
        findUnique: jest.fn(async () =>
          liveDeal({ endDate: new Date(Date.now() - 1000), requiresMembership: false }),
        ),
      },
    });
    prisma.membership.findFirst = jest.fn(async () => null);
    prisma.redemption.count = jest.fn(async () => 2);
    const res = await service.checkEligibility('d1', 'u1');
    expect(res.reasons).toContain('DEAL_EXPIRED');
    expect(res.reasons).toContain('PER_USER_LIMIT_REACHED');
  });
});

// ---------------------------------------------------------------------------
// Favorites
// ---------------------------------------------------------------------------

describe('FavoritesService', () => {
  function build(overrides: Record<string, any> = {}) {
    const prisma = {
      favorite: {
        create: jest.fn(),
        findUnique: jest.fn(async (): Promise<any> => null),
        findFirst: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(async () => 0),
        findMany: jest.fn(async () => []),
      },
      deal: { findFirst: jest.fn(async (): Promise<any> => ({ id: 'd1' })) },
      business: { findFirst: jest.fn(async () => ({ id: 'b1' })) },
      ...overrides,
    };
    const redis = { del: jest.fn(async () => 0) };
    return { service: new FavoritesService(prisma as any, redis as any), prisma };
  }

  it('maps P2002 unique violations to 409 FAVORITE_EXISTS', async () => {
    const { service, prisma } = build();
    prisma.favorite.create.mockRejectedValueOnce({ code: 'P2002' });
    let thrownErr: any = null;
    try {
      await service.add('u1', { targetType: 'deal', targetId: 'd1' });
    } catch (err: any) {
      thrownErr = err;
    }
    expect(thrownErr).not.toBeNull();
    expect(thrownErr).toBeInstanceOf(ConflictException);
    expect(thrownErr.getResponse().code).toBe('FAVORITE_EXISTS');
  });

  it('refuses to remove another user\'s favorite (403)', async () => {
    const { service, prisma } = build();
    prisma.favorite.findUnique.mockResolvedValueOnce({ id: 'f1', userId: 'other' });
    await expect(service.remove('u1', 'f1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'FORBIDDEN' }),
    });
  });

  it('404s when the target deal does not exist', async () => {
    const { service, prisma } = build();
    prisma.deal.findFirst.mockResolvedValueOnce(null);
    let thrownErr: any = null;
    try {
      await service.add('u1', { targetType: 'deal', targetId: 'nope' });
    } catch (err: any) {
      thrownErr = err;
    }
    expect(thrownErr).not.toBeNull();
    expect(thrownErr.getResponse().code).toBe('DEAL_NOT_FOUND');
  });
});
