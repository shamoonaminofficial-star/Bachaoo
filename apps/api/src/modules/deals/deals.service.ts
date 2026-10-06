import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHash, randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PaginatedResponse } from '@bachatly/types';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { IStorageService, STORAGE_SERVICE } from '../../common/storage/storage.interface';
import { Inject } from '@nestjs/common';
import { ADMIN_ROLES, ROLES } from '../../common/constants';
import { ADMIN_OVERVIEW_CACHE_KEY } from '../admin/admin-overview.service';
import { haversineKm } from '../branches/branches.service';
import { NotificationDispatchService } from '../notifications/dispatch.service';
import { CreateDealDto } from './dto/create-deal.dto';
import { DealQueryDto, DealQueueQueryDto, DealSort, MyDealsQueryDto } from './dto/deal-query.dto';
import { UpdateDealDto } from './dto/update-deal.dto';
import {
  BADGE_THRESHOLDS,
  computeBadges,
  computeSavings,
  normalizeDaysAvailable,
  validateDealPricing,
  type BadgeDeal,
} from './deal-helpers';

const STATUS = {
  DRAFT: 'DRAFT',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  PUBLISHED: 'PUBLISHED',
  PAUSED: 'PAUSED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
} as const;

const REDEMPTION_CONFIRMED = 'CONFIRMED';
const MEMBERSHIP_ACTIVE = 'ACTIVE';

const DEAL_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const DEAL_IMAGE_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const DEAL_IMAGE_MAX_COUNT = 8;

/** Public list cache: 60s, version-bumped on any deal write. */
const LIST_CACHE_TTL_SEC = 60;
const LIST_CACHE_VERSION_KEY = 'deals:list:version';

/** Candidate cap for in-memory nearby sorting (documented approximation). */
const NEARBY_CANDIDATE_LIMIT = 300;

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v,
  );
}

const DEAL_LIST_INCLUDE = {
  business: {
    select: {
      id: true,
      name: true,
      slug: true,
      logo: true,
      isVerified: true,
      ratingAvg: true,
      ratingCount: true,
      isActive: true,
      branches: { select: { latitude: true, longitude: true }, where: { isActive: true, deletedAt: null } },
      _count: { select: { branches: true } },
    },
  },
  category: { select: { id: true, name: true, slug: true } },
  subcategory: { select: { id: true, name: true, slug: true } },
  images: { orderBy: { sortOrder: 'asc' as const }, take: 1 },
  dealBranches: { select: { branch: { select: { latitude: true, longitude: true } } } },
} satisfies Prisma.DealInclude;

export interface EligibilityResult {
  eligible: boolean;
  reasons: string[];
}

@Injectable()
export class DealsService {
  private readonly logger = new Logger(DealsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
    private readonly notify: NotificationDispatchService,
  ) {}

  // ================================================================== public

  /**
   * Public deal search. Results are cached 60s in Redis (version key is bumped
   * on every deal write, so publishes/updates invalidate immediately).
   */
  async listDeals(query: DealQueryDto): Promise<PaginatedResponse<unknown>> {
    const cacheKey = await this.listCacheKey(query).catch(() => null);
    if (cacheKey) {
      const hit = await this.redis.get(cacheKey).catch(() => null);
      if (hit) {
        try {
          return JSON.parse(hit) as PaginatedResponse<unknown>;
        } catch {
          /* fall through and recompute */
        }
      }
    }

    const result = await this.queryDeals(query);

    if (cacheKey) {
      await this.redis.set(cacheKey, JSON.stringify(result), LIST_CACHE_TTL_SEC).catch(() => null);
    }
    return result;
  }

  private async queryDeals(query: DealQueryDto): Promise<PaginatedResponse<unknown>> {
    const now = new Date();
    const liveOnly = query.availableNow !== 'false';

    const and: Prisma.DealWhereInput[] = [
      { status: STATUS.PUBLISHED, deletedAt: null },
      liveOnly
        ? { startDate: { lte: now }, endDate: { gte: now } }
        : { endDate: { gte: now } },
      { business: { isActive: true, deletedAt: null } },
    ];

    if (query.q) {
      and.push({
        OR: [
          { title: { contains: query.q, mode: 'insensitive' } },
          { shortDescription: { contains: query.q, mode: 'insensitive' } },
          { description: { contains: query.q, mode: 'insensitive' } },
          { business: { name: { contains: query.q, mode: 'insensitive' } } },
        ],
      });
    }
    if (query.categoryId) and.push({ categoryId: query.categoryId });
    if (query.subcategoryId) and.push({ subcategoryId: query.subcategoryId });
    if (query.businessId) and.push({ businessId: query.businessId });
    if (query.dealType) and.push({ dealType: query.dealType as never });
    if (query.minDiscount !== undefined) and.push({ discountPercent: { gte: query.minDiscount } });
    if (query.maxDiscount !== undefined) and.push({ discountPercent: { lte: query.maxDiscount } });
    if (query.maxPrice !== undefined) and.push({ dealPrice: { not: null, lte: query.maxPrice } });
    if (query.ratingMin !== undefined) and.push({ business: { ratingAvg: { gte: query.ratingMin } } });
    if (query.membershipRequired === 'true') and.push({ requiresMembership: true });
    if (query.membershipRequired === 'false') and.push({ requiresMembership: false });

    if (query.cityId || query.areaId) {
      // Deals served through branches in the requested city/area. A deal with
      // no DealBranch rows applies to ALL branches of its business.
      const branchFilter: Prisma.BranchWhereInput = {
        isActive: true,
        deletedAt: null,
        ...(query.cityId ? { cityId: query.cityId } : {}),
        ...(query.areaId ? { areaId: query.areaId } : {}),
      };
      and.push({
        OR: [
          { dealBranches: { none: {} }, business: { branches: { some: branchFilter } } },
          { dealBranches: { some: { branch: branchFilter } } },
        ],
      });
    }

    const where: Prisma.DealWhereInput = { AND: and };
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const sort = query.sort ?? DealSort.RECOMMENDED;
    const hasGeo = typeof query.lat === 'number' && typeof query.lng === 'number';

    // Nearby sort is computed in memory (documented approximation): fetch the
    // top-N recommended candidates, score by min branch distance, paginate.
    if (sort === DealSort.NEARBY && hasGeo) {
      return this.queryNearby(where, query.lat as number, query.lng as number, page, pageSize);
    }

    const orderBy: Prisma.DealOrderByWithRelationInput[] =
      sort === DealSort.NEWEST
        ? [{ createdAt: 'desc' }]
        : sort === DealSort.DISCOUNT
          ? [{ discountPercent: 'desc' }, { createdAt: 'desc' }]
          : sort === DealSort.POPULAR
            ? [{ redemptionCount: 'desc' }, { createdAt: 'desc' }]
            : sort === DealSort.ENDING
              ? [{ endDate: 'asc' }]
              : sort === DealSort.NEARBY // no geo -> fall back to recommended
                ? [{ redemptionCount: 'desc' }, { viewCount: 'desc' }, { createdAt: 'desc' }]
                : [{ redemptionCount: 'desc' }, { viewCount: 'desc' }, { createdAt: 'desc' }];

    const [total, rows] = await Promise.all([
      this.prisma.deal.count({ where }),
      this.prisma.deal.findMany({
        where,
        include: DEAL_LIST_INCLUDE,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const items = await this.toListItems(rows, hasGeo ? { lat: query.lat as number, lng: query.lng as number } : undefined);

    return {
      items,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  private async queryNearby(
    where: Prisma.DealWhereInput,
    lat: number,
    lng: number,
    page: number,
    pageSize: number,
  ): Promise<PaginatedResponse<unknown>> {
    const candidates = await this.prisma.deal.findMany({
      where,
      include: DEAL_LIST_INCLUDE,
      orderBy: [{ redemptionCount: 'desc' }, { viewCount: 'desc' }],
      take: NEARBY_CANDIDATE_LIMIT,
    });

    const scored = candidates
      .map((deal) => ({ deal, distanceKm: this.minBranchDistance(deal as never, lat, lng) }))
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));

    const total = scored.length;
    const slice = scored.slice((page - 1) * pageSize, page * pageSize);
    const items = await this.toListItems(
      slice.map((s) => s.deal),
      { lat, lng },
      new Map(slice.map((s) => [(s.deal as { id: string }).id, s.distanceKm])),
    );

    return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  /** Minimum Haversine distance (km) across the deal's serving branches. */
  private minBranchDistance(
    deal: {
      dealBranches: Array<{ branch: { latitude: number | null; longitude: number | null } }>;
      business: { branches: Array<{ latitude: number | null; longitude: number | null }> };
    },
    lat: number,
    lng: number,
  ): number | null {
    const coords =
      deal.dealBranches.length > 0
        ? deal.dealBranches.map((db) => db.branch)
        : deal.business.branches;
    let best: number | null = null;
    for (const c of coords) {
      if (c.latitude === null || c.longitude === null) continue;
      const d = haversineKm(lat, lng, c.latitude, c.longitude);
      if (best === null || d < best) best = d;
    }
    return best === null ? null : Math.round(best * 10) / 10;
  }

  private async toListItems(
    rows: Array<Record<string, any>>,
    geo?: { lat: number; lng: number },
    distanceOverride?: Map<string, number | null>,
  ): Promise<unknown[]> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const trending = await this.prisma.redemption
      .groupBy({
        by: ['dealId'],
        where: { dealId: { in: rows.map((r) => r.id) }, createdAt: { gte: sevenDaysAgo } },
        _count: { id: true },
      })
      .catch(() => [] as Array<{ dealId: string; _count: { id: number } }>);
    const trendingMap = new Map(trending.map((t) => [t.dealId, t._count.id]));

    return rows.map((deal) => {
      const distanceKm = distanceOverride?.get(deal.id)
        ?? (geo ? this.minBranchDistance(deal as Parameters<DealsService['minBranchDistance']>[0], geo.lat, geo.lng) : null);
      const branchCount =
        deal.dealBranches?.length > 0
          ? deal.dealBranches.length
          : (deal.business?._count?.branches ?? deal.business?.branches?.length ?? 0);
      const { youSavePaisa, memberPricePaisa } = computeSavings(deal);
      return {
        id: deal.id,
        slug: deal.slug,
        title: deal.title,
        shortDescription: deal.shortDescription,
        dealType: deal.dealType,
        discountPercent: deal.discountPercent,
        originalPrice: deal.originalPrice,
        dealPrice: deal.dealPrice,
        requiresMembership: deal.requiresMembership,
        startDate: deal.startDate,
        endDate: deal.endDate,
        business: deal.business
          ? {
              id: deal.business.id,
              name: deal.business.name,
              slug: deal.business.slug,
              logo: deal.business.logo,
              ratingAvg: deal.business.ratingAvg,
              ratingCount: deal.business.ratingCount,
              isVerified: deal.business.isVerified,
            }
          : null,
        category: deal.category,
        subcategory: deal.subcategory ?? null,
        image: deal.images?.[0]?.url ?? null,
        branchCount,
        distanceKm,
        badges: computeBadges(deal as unknown as BadgeDeal, trendingMap.get(deal.id) ?? 0),
        computed: { youSavePaisa, memberPricePaisa },
        redemptionCount: deal.redemptionCount ?? 0,
        viewCount: deal.viewCount ?? 0,
      };
    });
  }

  private async listCacheKey(query: DealQueryDto): Promise<string> {
    const version = (await this.redis.get(LIST_CACHE_VERSION_KEY).catch(() => null)) ?? '1';
    const hash = createHash('sha256').update(stableStringify(query)).digest('hex').slice(0, 32);
    return `deals:list:v${version}:${hash}`;
  }

  private async bumpListCache(): Promise<void> {
    await this.redis.incrWithExpire(LIST_CACHE_VERSION_KEY, 3600).catch(() => null);
  }

  // --------------------------------------------------------------- detail

  /**
   * Public deal detail. `userId` is optional (public route + optional auth):
   * when present, eligibility is computed for that user.
   * viewCount increments fire-and-forget (never blocks the response).
   */
  async getBySlug(slug: string, userId?: string) {
    const deal = await this.prisma.deal.findUnique({
      where: { slug },
      include: {
        business: {
          select: {
            id: true,
            name: true,
            slug: true,
            logo: true,
            coverImage: true,
            description: true,
            phone: true,
            website: true,
            isVerified: true,
            ratingAvg: true,
            ratingCount: true,
            isActive: true,
            branches: {
              where: { isActive: true, deletedAt: null },
              select: {
                id: true,
                name: true,
                address: true,
                phone: true,
                latitude: true,
                longitude: true,
                openingHours: true,
                city: { select: { name: true } },
                area: { select: { name: true } },
              },
              orderBy: { name: 'asc' },
            },
          },
        },
        category: { select: { id: true, name: true, slug: true } },
        subcategory: { select: { id: true, name: true, slug: true } },
        images: { orderBy: { sortOrder: 'asc' } },
        dealBranches: {
          select: { branchId: true, branch: { select: { id: true, name: true } } },
        },
      },
    });

    const now = new Date();
    if (
      !deal ||
      deal.deletedAt ||
      deal.status !== STATUS.PUBLISHED ||
      new Date(deal.startDate) > now ||
      new Date(deal.endDate) < now
    ) {
      throw new NotFoundException({ code: 'DEAL_NOT_FOUND', message: 'Deal not found.' });
    }

    void this.prisma.deal
      .update({ where: { id: deal.id }, data: { viewCount: { increment: 1 } } })
      .catch((err: Error) => this.logger.warn(`viewCount increment failed: ${err.message}`));

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const redemptions7d = await this.prisma.redemption
      .count({ where: { dealId: deal.id, createdAt: { gte: sevenDaysAgo } } })
      .catch(() => 0);

    const { youSavePaisa, memberPricePaisa } = computeSavings(deal);
    const eligibility = await this.checkEligibility(deal.id, userId);

    const { dealBranches, ...rest } = deal as Record<string, any>;
    return {
      ...rest,
      branches: (dealBranches as Array<{ branchId: string; branch: unknown }>).map((db) => db.branch),
      branchIds: (dealBranches as Array<{ branchId: string }>).map((db) => db.branchId),
      allBranches: (dealBranches as unknown[]).length === 0,
      badges: computeBadges(deal as never, redemptions7d),
      computed: { youSavePaisa, memberPricePaisa },
      eligibility,
    };
  }

  /**
   * Eligibility for the requesting user. Shared logic also used by the
   * redemption flow (which throws instead of returning reasons).
   */
  async checkEligibility(dealId: string, userId?: string): Promise<EligibilityResult> {
    const reasons: string[] = [];
    const now = new Date();

    const deal = await this.prisma.deal.findUnique({
      where: { id: dealId },
      include: { business: { select: { isActive: true } } },
    });
    if (!deal || deal.deletedAt) {
      return { eligible: false, reasons: ['DEAL_NOT_FOUND'] };
    }

    if (!userId) {
      reasons.push('NOT_LOGGED_IN');
      return { eligible: false, reasons };
    }

    if (deal.status !== STATUS.PUBLISHED) reasons.push('DEAL_NOT_LIVE');
    if (new Date(deal.startDate) > now) reasons.push('DEAL_NOT_STARTED');
    if (new Date(deal.endDate) < now) reasons.push('DEAL_EXPIRED');
    if (!deal.business?.isActive) reasons.push('BUSINESS_INACTIVE');

    const membership = await this.prisma.membership.findFirst({
      where: { userId, status: MEMBERSHIP_ACTIVE, endDate: { gt: now } },
      orderBy: { endDate: 'desc' },
    });

    if (deal.requiresMembership && !membership) reasons.push('MEMBERSHIP_REQUIRED');
    const eligiblePlanIds: string[] = (deal.eligiblePlanIds as string[]) ?? [];
    if (eligiblePlanIds.length > 0 && (!membership || !eligiblePlanIds.includes(membership.planId))) {
      reasons.push('PLAN_NOT_ELIGIBLE');
    }

    if (deal.usageLimit && (deal.redemptionCount ?? 0) >= deal.usageLimit) {
      reasons.push('USAGE_LIMIT_REACHED');
    }
    if (deal.perUserLimit) {
      const used = await this.prisma.redemption.count({
        where: { userId, dealId, status: REDEMPTION_CONFIRMED },
      });
      if (used >= deal.perUserLimit) reasons.push('PER_USER_LIMIT_REACHED');
    }

    return { eligible: reasons.length === 0, reasons };
  }

  // ================================================================ partner

  /** Partner's own deals across all statuses (for the partner dashboard). */
  async myDeals(partnerUserId: string, query: MyDealsQueryDto): Promise<PaginatedResponse<unknown>> {
    const businessIds = await this.ownedBusinessIds(partnerUserId);
    const and: Prisma.DealWhereInput[] = [
      { businessId: { in: businessIds }, deletedAt: null },
    ];
    if (query.businessId) and.push({ businessId: query.businessId });
    if (query.status) and.push({ status: query.status as never });
    if (query.q) {
      and.push({
        OR: [
          { title: { contains: query.q, mode: 'insensitive' } },
          { shortDescription: { contains: query.q, mode: 'insensitive' } },
        ],
      });
    }
    const where: Prisma.DealWhereInput = { AND: and };
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);

    const [total, rows] = await Promise.all([
      this.prisma.deal.count({ where }),
      this.prisma.deal.findMany({
        where,
        include: {
          business: { select: { id: true, name: true, slug: true } },
          category: { select: { id: true, name: true } },
          images: { orderBy: { sortOrder: 'asc' }, take: 1 },
          _count: { select: { redemptions: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items: rows, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  /** Business ids the user owns (owner link) or staffs. */
  private async ownedBusinessIds(userId: string): Promise<string[]> {
    const businesses = await this.prisma.business.findMany({
      where: {
        deletedAt: null,
        OR: [
          { ownerUserId: userId },
          { owners: { some: { userId } } },
          { staff: { some: { userId, isActive: true } } },
        ],
      },
      select: { id: true },
    });
    return businesses.map((b) => b.id);
  }

  /**
   * Partner creates a deal in DRAFT. Validates pricing sanity, dates,
   * category/subcategory, plan ids and that branchIds belong to the business.
   */
  async create(partnerUserId: string, dto: CreateDealDto) {
    const business = await this.prisma.business.findUnique({
      where: { id: dto.businessId },
      include: { staff: { where: { userId: partnerUserId, isActive: true } } },
    });
    if (!business || business.deletedAt) {
      throw new NotFoundException({ code: 'BUSINESS_NOT_FOUND', message: 'Business not found.' });
    }
    const isOwner = business.ownerUserId === partnerUserId;
    const isStaff = business.staff.length > 0;
    if (!isOwner && !isStaff) {
      throw new ForbiddenException({
        code: 'NOT_BUSINESS_MEMBER',
        message: 'You are not associated with this business.',
      });
    }

    validateDealPricing(dto);
    const daysAvailable = normalizeDaysAvailable(dto.daysAvailable);
    await this.assertCategory(dto.categoryId, dto.subcategoryId);
    await this.assertPlans(dto.eligiblePlanIds);
    await this.assertBranchIds(dto.businessId, dto.branchIds);

    const slug = await this.uniqueSlug(dto.title);

    const deal = await this.prisma.deal.create({
      data: {
        businessId: dto.businessId,
        categoryId: dto.categoryId,
        subcategoryId: dto.subcategoryId ?? null,
        title: dto.title,
        slug,
        shortDescription: dto.shortDescription,
        description: dto.description ?? dto.shortDescription,
        terms: dto.terms ?? null,
        dealType: dto.dealType as never,
        discountPercent: dto.discountPercent ?? 0,
        maxDiscountAmount: dto.maxDiscountAmount ?? null,
        originalPrice: dto.originalPrice ?? null,
        dealPrice: dto.dealPrice ?? null,
        requiresMembership: dto.requiresMembership ?? false,
        eligiblePlanIds: dto.eligiblePlanIds ?? [],
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        daysAvailable,
        timeStart: dto.timeStart ?? null,
        timeEnd: dto.timeEnd ?? null,
        usageLimit: dto.usageLimit ?? null,
        perUserLimit: dto.perUserLimit ?? null,
        dailyLimit: dto.dailyLimit ?? null,
        monthlyLimit: dto.monthlyLimit ?? null,
        status: STATUS.DRAFT,
        // No branchIds = deal applies to ALL branches of the business.
        dealBranches:
          dto.branchIds && dto.branchIds.length > 0
            ? { create: dto.branchIds.map((branchId) => ({ branchId })) }
            : undefined,
      },
    });
    await this.bumpListCache();
    await this.bumpPartnerCache(dto.businessId);
    return deal;
  }

  /** Partner edits — only in DRAFT or REJECTED. */
  async update(partnerUserId: string, id: string, dto: UpdateDealDto) {
    const deal = await this.assertPartnerAccess(partnerUserId, id);
    if (!([STATUS.DRAFT, STATUS.REJECTED] as string[]).includes(deal.status)) {
      throw new ConflictException({
        code: 'DEAL_NOT_EDITABLE',
        message: 'Only draft or rejected deals can be edited.',
      });
    }

    // Cross-field pricing validation against the merged values.
    validateDealPricing({
      discountPercent: dto.discountPercent ?? (deal as any).discountPercent,
      originalPrice: dto.originalPrice ?? (deal as any).originalPrice,
      dealPrice: dto.dealPrice ?? (deal as any).dealPrice,
      maxDiscountAmount: dto.maxDiscountAmount ?? (deal as any).maxDiscountAmount,
      startDate: dto.startDate ?? (deal as any).startDate,
      endDate: dto.endDate ?? (deal as any).endDate,
      timeStart: dto.timeStart ?? (deal as any).timeStart,
      timeEnd: dto.timeEnd ?? (deal as any).timeEnd,
    });

    const { branchIds, daysAvailable, ...rest } = dto as Record<string, any>;
    if (dto.categoryId || dto.subcategoryId) {
      await this.assertCategory(
        (dto.categoryId ?? (deal as any).categoryId) as string,
        (dto.subcategoryId ?? (deal as any).subcategoryId ?? undefined) as string | undefined,
      );
    }
    if (dto.eligiblePlanIds) await this.assertPlans(dto.eligiblePlanIds);
    if (branchIds !== undefined && branchIds.length > 0) {
      await this.assertBranchIds((deal as any).businessId, branchIds);
    }

    const updated = await this.prisma.deal.update({
      where: { id },
      data: {
        ...rest,
        startDate: rest.startDate ? new Date(rest.startDate) : undefined,
        endDate: rest.endDate ? new Date(rest.endDate) : undefined,
        daysAvailable: daysAvailable !== undefined ? normalizeDaysAvailable(daysAvailable) : undefined,
        ...(branchIds !== undefined
          ? {
              dealBranches: {
                deleteMany: {},
                ...(branchIds.length > 0 ? { create: branchIds.map((branchId: string) => ({ branchId })) } : {}),
              },
            }
          : {}),
      } as never,
    });
    await this.bumpListCache();
    await this.bumpPartnerCache((deal as any).businessId);
    return updated;
  }

  /** Duplicate a deal into a fresh DRAFT (images + branch scope copied). */
  async duplicate(partnerUserId: string, id: string) {
    const deal = (await this.assertPartnerAccess(partnerUserId, id)) as any;
    const full = await this.prisma.deal.findUnique({
      where: { id },
      include: { images: { orderBy: { sortOrder: 'asc' } }, dealBranches: true },
    });
    if (!full) throw new NotFoundException({ code: 'DEAL_NOT_FOUND', message: 'Deal not found.' });

    const slug = await this.uniqueSlug(`${deal.title} copy`);
    const copy = await this.prisma.deal.create({
      data: {
        businessId: deal.businessId,
        categoryId: deal.categoryId,
        subcategoryId: deal.subcategoryId,
        title: `${deal.title} (Copy)`,
        slug,
        shortDescription: deal.shortDescription,
        description: deal.description,
        terms: deal.terms,
        dealType: deal.dealType,
        discountPercent: deal.discountPercent,
        maxDiscountAmount: deal.maxDiscountAmount,
        originalPrice: deal.originalPrice,
        dealPrice: deal.dealPrice,
        requiresMembership: deal.requiresMembership,
        eligiblePlanIds: deal.eligiblePlanIds ?? [],
        startDate: deal.startDate,
        endDate: deal.endDate,
        daysAvailable: deal.daysAvailable ?? [],
        timeStart: deal.timeStart,
        timeEnd: deal.timeEnd,
        usageLimit: deal.usageLimit,
        perUserLimit: deal.perUserLimit,
        dailyLimit: deal.dailyLimit,
        monthlyLimit: deal.monthlyLimit,
        status: STATUS.DRAFT,
        images: { create: full.images.map((img: any) => ({ url: img.url, sortOrder: img.sortOrder })) },
        dealBranches: { create: full.dealBranches.map((db: any) => ({ branchId: db.branchId })) },
      },
    });
    await this.bumpPartnerCache(deal.businessId);
    return copy;
  }

  /** Upload deal gallery images (multipart). */
  async uploadImages(partnerUserId: string, id: string, files: Express.Multer.File[]) {
    await this.assertPartnerAccess(partnerUserId, id);
    if (!files || files.length === 0) {
      throw new BadRequestException({ code: 'FILE_REQUIRED', message: 'At least one image is required.' });
    }
    const existing = await this.prisma.dealImage.count({ where: { dealId: id } });
    if (existing + files.length > DEAL_IMAGE_MAX_COUNT) {
      throw new BadRequestException({
        code: 'TOO_MANY_IMAGES',
        message: `A deal can have at most ${DEAL_IMAGE_MAX_COUNT} images.`,
      });
    }
    const created: Array<{ id: string; url: string; sortOrder: number }> = [];
    let sortOrder = existing;
    for (const file of files) {
      this.validateImage(file);
      const { url } = await this.storage.upload({
        filename: file.originalname,
        mimetype: file.mimetype,
        buffer: file.buffer,
        folder: `deals/${id}`,
      });
      const row = await this.prisma.dealImage.create({
        data: { dealId: id, url, sortOrder: sortOrder++ },
        select: { id: true, url: true, sortOrder: true },
      });
      created.push(row);
    }
    await this.bumpListCache();
    return created;
  }

  /** Delete a gallery image (DB row removed; file delete is best-effort). */
  async deleteImage(partnerUserId: string, imageId: string) {
    const image = await this.prisma.dealImage.findUnique({ where: { id: imageId } });
    if (!image) throw new NotFoundException({ code: 'IMAGE_NOT_FOUND', message: 'Image not found.' });
    await this.assertPartnerAccess(partnerUserId, image.dealId);
    await this.prisma.dealImage.delete({ where: { id: imageId } });
    // Best-effort file cleanup: derive the storage key from a local /uploads/ URL.
    const match = image.url.match(/\/uploads\/(.+)$/);
    if (match) {
      await this.storage.delete(match[1]).catch(() => null);
    }
    await this.bumpListCache();
    return { deleted: true, id: imageId };
  }

  private validateImage(file: Express.Multer.File) {
    if (!DEAL_IMAGE_MIME.includes(file.mimetype)) {
      throw new BadRequestException({
        code: 'INVALID_IMAGE_TYPE',
        message: `Image must be one of: ${DEAL_IMAGE_MIME.join(', ')}.`,
      });
    }
    if (file.size > DEAL_IMAGE_MAX_BYTES) {
      throw new BadRequestException({ code: 'IMAGE_TOO_LARGE', message: 'Images must be 2 MB or smaller.' });
    }
  }

  /** Partner: DRAFT/REJECTED -> PENDING_APPROVAL. */
  submitForApproval(partnerUserId: string, id: string) {
    return this.assertPartnerAccess(partnerUserId, id).then(() =>
      this.transition(
        id,
        { status: STATUS.PENDING_APPROVAL },
        [STATUS.DRAFT, STATUS.REJECTED],
        'Only draft or rejected deals can be submitted for approval.',
      ),
    );
  }

  /** Partner: PUBLISHED -> PAUSED. */
  pause(partnerUserId: string, id: string) {
    return this.assertPartnerAccess(partnerUserId, id).then(() =>
      this.transition(
        id,
        { status: STATUS.PAUSED },
        [STATUS.PUBLISHED],
        'Only published deals can be paused.',
      ).then((d) => this.bumpListCache().then(() => d)),
    );
  }

  /** Partner or admin: PAUSED -> PUBLISHED. */
  resume(partnerUserId: string, id: string) {
    return this.assertPartnerAccess(partnerUserId, id).then(() =>
      this.transition(
        id,
        { status: STATUS.PUBLISHED },
        [STATUS.PAUSED],
        'Only paused deals can be resumed.',
      ).then((d) => this.bumpListCache().then(() => d)),
    );
  }

  /**
   * Publish an APPROVED deal. Partners publish their own; admins publish any.
   */
  async publish(userId: string, roles: string[], id: string) {
    const deal = await this.prisma.deal.findUnique({ where: { id } });
    if (!deal || (deal as any).deletedAt) {
      throw new NotFoundException({ code: 'DEAL_NOT_FOUND', message: 'Deal not found.' });
    }
    if (!this.isAdminRole(roles)) {
      await this.assertPartnerAccess(userId, id);
    }
    const published = await this.transition(
      id,
      { status: STATUS.PUBLISHED },
      [STATUS.APPROVED],
      'Only approved deals can be published.',
    );
    await this.bumpListCache();
    return published;
  }

  /** Partner: soft-delete a DRAFT or REJECTED deal. */
  async remove(partnerUserId: string, id: string) {
    const deal = await this.assertPartnerAccess(partnerUserId, id);
    if (!([STATUS.DRAFT, STATUS.REJECTED] as string[]).includes(deal.status)) {
      throw new ConflictException({
        code: 'DEAL_NOT_DELETABLE',
        message: 'Only draft or rejected deals can be deleted. Pause a published deal instead.',
      });
    }
    await this.prisma.deal.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.bumpListCache();
    await this.bumpPartnerCache((deal as any).businessId);
    return { deleted: true, id };
  }

  // =================================================================== admin

  /** Approval queue (default: pending approval). */
  async queue(query: DealQueueQueryDto): Promise<PaginatedResponse<unknown>> {
    const status = query.status ?? STATUS.PENDING_APPROVAL;
    const where: Prisma.DealWhereInput = { status: status as never, deletedAt: null };
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const [total, rows] = await Promise.all([
      this.prisma.deal.count({ where }),
      this.prisma.deal.findMany({
        where,
        include: {
          business: { select: { id: true, name: true, slug: true, logo: true } },
          category: { select: { id: true, name: true } },
          images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        },
        orderBy: { updatedAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items: rows, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  /** Admin: PENDING_APPROVAL -> APPROVED (stores reviewedBy/reviewedAt). */
  async approve(adminId: string, id: string) {
    const deal: any = await this.transition(
      id,
      { status: STATUS.APPROVED, reviewedBy: adminId, reviewedAt: new Date(), reviewNotes: null },
      [STATUS.PENDING_APPROVAL],
      'Only deals pending approval can be approved.',
    );
    await this.bumpListCache();
    this.notifyDealOwner(deal, 'DEAL_APPROVED', 'Deal approved ✅', `Your deal "${deal.title}" is approved and ready to publish.`);
    return deal;
  }

  /** Admin: PENDING_APPROVAL -> REJECTED. Reason is required. */
  async reject(adminId: string, id: string, reason?: string) {
    if (!reason || !reason.trim()) {
      throw new BadRequestException({ code: 'REASON_REQUIRED', message: 'A rejection reason is required.' });
    }
    const deal: any = await this.transition(
      id,
      { status: STATUS.REJECTED, reviewedBy: adminId, reviewedAt: new Date(), reviewNotes: reason.trim() },
      [STATUS.PENDING_APPROVAL],
      'Only deals pending approval can be rejected.',
    );
    await this.bumpListCache();
    this.notifyDealOwner(
      deal,
      'DEAL_REJECTED',
      'Deal needs attention ⚠️',
      `Your deal "${deal.title}" was not approved. Reason: ${reason.trim()}`,
    );
    return deal;
  }

  /** Admin: PENDING_APPROVAL -> DRAFT with change notes. Notes are required. */
  async requestChanges(adminId: string, id: string, notes?: string) {
    if (!notes || !notes.trim()) {
      throw new BadRequestException({ code: 'NOTES_REQUIRED', message: 'Change notes are required.' });
    }
    const deal: any = await this.transition(
      id,
      { status: STATUS.DRAFT, reviewedBy: adminId, reviewedAt: new Date(), reviewNotes: notes.trim() },
      [STATUS.PENDING_APPROVAL],
      'Only deals pending approval can be sent back for changes.',
    );
    await this.bumpListCache();
    this.notifyDealOwner(
      deal,
      'DEAL_REJECTED',
      'Changes requested on your deal 📝',
      `The review team requested changes on "${deal.title}": ${notes.trim()}`,
    );
    return deal;
  }

  /**
   * Phase 11 — notify the business owner about a moderation decision.
   * Best-effort: never throws, never blocks the transition.
   */
  private async notifyDealOwner(deal: any, type: string, title: string, body: string): Promise<void> {
    try {
      const business: any = await this.prisma.business.findUnique({
        where: { id: deal.businessId },
        select: { ownerUserId: true, name: true },
      });
      if (!business?.ownerUserId) return;
      await this.notify?.dispatch(business.ownerUserId, {
        type,
        title,
        body,
        data: { dealId: deal.id, businessId: deal.businessId },
        channels: ['IN_APP', 'EMAIL'],
      });
    } catch {
      /* best effort */
    }
  }

  /**
   * Hourly: mark PUBLISHED deals past their endDate as EXPIRED.
   * Requires @nestjs/schedule + ScheduleModule.forRoot() (see app.module.ts).
   */
  @Cron(CronExpression.EVERY_HOUR)
  async expireDeals(): Promise<{ expired: number }> {
    // Phase 8: capture affected businesses BEFORE the bulk update so their
    // partner dashboards/analytics caches can be busted.
    const affected = await this.prisma.deal.findMany({
      where: { status: STATUS.PUBLISHED, endDate: { lt: new Date() }, deletedAt: null },
      select: { businessId: true },
    });
    const res = await this.prisma.deal.updateMany({
      where: { status: STATUS.PUBLISHED, endDate: { lt: new Date() }, deletedAt: null },
      data: { status: STATUS.EXPIRED },
    });
    if (res.count > 0) {
      this.logger.log(`Marked ${res.count} deal(s) as EXPIRED.`);
      await this.bumpListCache();
      const businessIds = [...new Set(affected.map((d) => (d as any).businessId))];
      for (const businessId of businessIds) await this.bumpPartnerCache(businessId);
      // Phase 9: keep the admin overview honest (deals + queues blocks).
      await this.redis.del(ADMIN_OVERVIEW_CACHE_KEY).catch(() => null);
    }
    return { expired: res.count };
  }

  // ================================================================= helpers

  private async assertPartnerAccess(partnerUserId: string, dealId: string) {
    const deal = await this.prisma.deal.findUnique({
      where: { id: dealId },
      include: { business: { include: { staff: { where: { userId: partnerUserId, isActive: true } } } } },
    });
    if (!deal || (deal as any).deletedAt) {
      throw new NotFoundException({ code: 'DEAL_NOT_FOUND', message: 'Deal not found.' });
    }
    const business = (deal as any).business;
    if (business.ownerUserId !== partnerUserId && business.staff.length === 0) {
      throw new ForbiddenException({
        code: 'NOT_BUSINESS_MEMBER',
        message: 'You are not associated with this business.',
      });
    }
    return deal as any;
  }

  private async bumpPartnerCache(businessId: string) {
    // Best-effort — the 5-minute TTL on the partner dashboard cache is the net.
    try {
      await this.redis.del(`partner-dashboard:${businessId}`);
    } catch {
      /* best effort */
    }
  }

  private async transition(
    id: string,
    data: Record<string, unknown>,
    expectedFrom: string[],
    message: string,
  ) {
    const deal = await this.prisma.deal.findUnique({ where: { id } });
    if (!deal || (deal as any).deletedAt) {
      throw new NotFoundException({ code: 'DEAL_NOT_FOUND', message: 'Deal not found.' });
    }
    if (!expectedFrom.includes((deal as any).status)) {
      throw new ConflictException({ code: 'INVALID_STATUS_TRANSITION', message });
    }
    const updated = await this.prisma.deal.update({ where: { id }, data: data as never });
    await this.bumpPartnerCache((deal as any).businessId);
    // Phase 9: keep the admin overview honest (deals + queues blocks).
    await this.redis.del(ADMIN_OVERVIEW_CACHE_KEY).catch(() => null);
    return updated;
  }

  private async uniqueSlug(title: string): Promise<string> {
    const base = slugify(title) || 'deal';
    let slug = `${base}-${randomUUID().slice(0, 8)}`;
    // Random suffix makes collisions vanishingly unlikely; still verify once.
    const exists = await this.prisma.deal.findUnique({ where: { slug }, select: { id: true } });
    if (exists) slug = `${base}-${randomUUID().slice(0, 8)}`;
    return slug;
  }

  private async assertCategory(categoryId: string, subcategoryId?: string) {
    const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!category || (category as any).deletedAt || !(category as any).isActive) {
      throw new BadRequestException({ code: 'CATEGORY_NOT_FOUND', message: 'Category not found or inactive.' });
    }
    if (subcategoryId) {
      const sub = await this.prisma.subcategory.findFirst({ where: { id: subcategoryId, categoryId } });
      if (!sub) {
        throw new BadRequestException({
          code: 'SUBCATEGORY_NOT_FOUND',
          message: 'Subcategory not found in this category.',
        });
      }
    }
  }

  private async assertPlans(planIds?: string[]) {
    if (!planIds || planIds.length === 0) return;
    const plans = await this.prisma.membershipPlan.findMany({
      where: { id: { in: planIds } },
      select: { id: true },
    });
    if (plans.length !== planIds.length) {
      throw new BadRequestException({ code: 'PLAN_NOT_FOUND', message: 'One or more membership plans do not exist.' });
    }
  }

  private async assertBranchIds(businessId: string, branchIds?: string[]) {
    if (!branchIds || branchIds.length === 0) return;
    const branches = await this.prisma.branch.findMany({
      where: { id: { in: branchIds }, businessId, deletedAt: null },
      select: { id: true },
    });
    if (branches.length !== branchIds.length) {
      throw new BadRequestException({
        code: 'BRANCH_NOT_FOUND',
        message: 'One or more branches do not belong to this business.',
      });
    }
  }

  isAdminRole(roles: string[]): boolean {
    return roles.some((r) => (ADMIN_ROLES as readonly string[]).includes(r));
  }

  partnerRoles(): string[] {
    return [ROLES.BUSINESS_OWNER, ROLES.BUSINESS_MANAGER];
  }
}

export { BADGE_THRESHOLDS };
