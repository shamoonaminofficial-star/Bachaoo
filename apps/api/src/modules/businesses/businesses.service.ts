import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { ADMIN_OVERVIEW_CACHE_KEY } from '../admin/admin-overview.service';
import { STORAGE_SERVICE, IStorageService } from '../../common/storage/storage.interface';
import { parsePagination, buildPaginatedResponse } from '../../common/utils/pagination';
import { ADMIN_ROLES, ROLES } from '../../common/constants';
import { Prisma } from '@prisma/client';
import { PartnerDashboardService } from './partner-dashboard.service';
import {
  BUSINESS_SORT_FIELDS,
  BusinessQueryDto,
  CreateBusinessDto,
  SuspendBusinessDto,
  UpdateBusinessDto,
} from './dto/business.dto';
import {
  ApplicationQueryDto,
  CreateApplicationDto,
  ReviewApplicationDto,
} from './dto/application.dto';

export const APPLICATION_DOC_MIME = [
  'image/jpeg', 'image/png', 'image/webp',
  'application/pdf',
];
export const APPLICATION_DOC_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const BUSINESS_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'];
export const BUSINESS_IMAGE_MAX_BYTES = 3 * 1024 * 1024; // 3 MB

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function isAdminRole(roles: string[]): boolean {
  return roles.some((r) => (ADMIN_ROLES as readonly string[]).includes(r));
}

const businessListSelect = {
  id: true,
  slug: true,
  name: true,
  logo: true,
  coverImage: true,
  isVerified: true,
  ratingAvg: true,
  ratingCount: true,
  category: { select: { id: true, name: true, slug: true } },
} as const;

const LIVE_DEAL_WHERE = (now: Date) => ({
  status: 'PUBLISHED' as const,
  startDate: { lte: now },
  endDate: { gte: now },
});

/**
 * Businesses + partner applications.
 *
 * Suspension cascades: suspending a business sets its PUBLISHED deals to
 * PAUSED (documented choice — deals are inventory that must not stay
 * redeemable while the business is suspended; reactivation does NOT
 * auto-resume them, an admin/owner must republish).
 */
@Injectable()
export class BusinessesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
    private readonly partnerDashboard: PartnerDashboardService,
    private readonly redis: RedisService,
  ) {}

  /** Phase 9: keep the admin overview honest after business mutations. */
  private bustAdminOverview(): Promise<unknown> {
    return this.redis.del(ADMIN_OVERVIEW_CACHE_KEY).catch(() => null);
  }

  /**
   * Phase 8 — resolve which business the partner dashboard shows. Partners
   * pick `?businessId=` when they own several; admins may pass any
   * businessId explicitly.
   */
  async myDashboard(userId: string, roles: string[], businessId?: string) {
    let targetId = businessId;
    if (!targetId) {
      const owned = await this.myBusinesses(userId);
      if (!owned.length) {
        throw new NotFoundException({ code: 'NO_BUSINESS', message: 'You do not own any business yet.' });
      }
      targetId = owned[0].id;
    }
    await this.assertCanManage(userId, roles, targetId);
    const payload = await this.partnerDashboard.getDashboard(targetId);
    if (!payload) {
      throw new NotFoundException({ code: 'BUSINESS_NOT_FOUND', message: 'Business not found.' });
    }
    return payload;
  }

  // ------------------------------------------------------------- public list

  async listPublic(query: BusinessQueryDto) {
    return this.listInternal(query, false);
  }

  /** Admin: same filters as public, plus suspended/inactive and `status` filter. */
  async listAdmin(query: BusinessQueryDto) {
    return this.listInternal(query, true);
  }

  private async listInternal(query: BusinessQueryDto, isAdmin: boolean) {
    const now = new Date();
    const { page, pageSize, skip, take } = parsePagination(query, BUSINESS_SORT_FIELDS, 'rating');
    const sort = (query.sort ?? 'rating') as string;
    const order = query.order === 'asc' ? 'asc' : 'desc';

    const where: Prisma.BusinessWhereInput = { deletedAt: null };
    if (isAdmin) {
      if (query.status === 'active') where.isActive = true;
      else if (query.status === 'suspended') where.isActive = false;
    } else {
      where.isActive = true;
    }
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { description: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.ratingMin) where.ratingAvg = { gte: query.ratingMin };
    if (query.verifiedOnly === 'true') where.isVerified = true;
    if (query.cityId || query.areaId) {
      where.branches = {
        some: {
          isActive: true,
          deletedAt: null,
          ...(query.cityId ? { cityId: query.cityId } : {}),
          ...(query.areaId ? { areaId: query.areaId } : {}),
        },
      };
    }
    if (query.hasDeals === 'true') {
      where.deals = { some: LIVE_DEAL_WHERE(now) };
    }

    // dealsCount sort needs an aggregation; otherwise use orderBy directly.
    let items: Array<Record<string, unknown>>;
    let total: number;
    if (sort === 'dealsCount') {
      // Phase 13 fix: previously this fetched ALL filtered businesses into
      // memory. Now the counts are computed first (with the business filter
      // embedded via the relation), the page window is sliced from the sorted
      // counts, and only those businesses are fetched. Zero-deal businesses
      // backfill the tail (desc) or head (asc) of the page.
      const grouped = await this.prisma.deal.groupBy({
        by: ['businessId'],
        where: { ...LIVE_DEAL_WHERE(now), business: where },
        _count: { id: true },
      });
      const counts = new Map(grouped.map((g) => [g.businessId, g._count.id]));
      const counted = [...counts.entries()]
        .map(([id, count]) => ({ id, count }))
        .sort((a, b) => (order === 'asc' ? a.count - b.count : b.count - a.count));
      total = await this.prisma.business.count({ where });
      const zeroTotal = total - counted.length;
      const countedIds = counted.map((c) => c.id);

      let pageIds: string[];
      if (order === 'asc') {
        // Zero-deal businesses rank first.
        const zeroTake = Math.min(take, Math.max(0, zeroTotal - skip));
        const zeroSkip = Math.min(skip, zeroTotal);
        const zeroRows =
          zeroTake > 0
            ? await this.prisma.business.findMany({
                where: { AND: [where, { id: { notIn: countedIds } }] },
                select: { id: true },
                orderBy: { createdAt: 'desc' },
                skip: zeroSkip,
                take: zeroTake,
              })
            : [];
        const countedSkip = Math.max(0, skip - zeroTotal);
        const countedTake = Math.max(0, take - zeroRows.length);
        pageIds = [...zeroRows.map((r) => r.id), ...counted.slice(countedSkip, countedSkip + countedTake).map((c) => c.id)];
      } else {
        // Zero-deal businesses rank last.
        const countedPage = counted.slice(skip, skip + take).map((c) => c.id);
        const zeroSkip = Math.max(0, skip + countedPage.length - counted.length);
        const zeroRows =
          countedPage.length < take
            ? await this.prisma.business.findMany({
                where: { AND: [where, { id: { notIn: countedIds } }] },
                select: { id: true },
                orderBy: { createdAt: 'desc' },
                skip: zeroSkip,
                take: take - countedPage.length,
              })
            : [];
        pageIds = [...countedPage, ...zeroRows.map((r) => r.id)];
      }

      const rows = pageIds.length
        ? await this.prisma.business.findMany({
            where: { id: { in: pageIds } },
            select: { ...businessListSelect, id: true },
          })
        : [];
      const byId = new Map(rows.map((r) => [r.id, r]));
      items = pageIds.map((id) => ({ ...(byId.get(id) as Record<string, unknown>), activeDealCount: counts.get(id) ?? 0 }));
    } else {
      const sortOrder = order as Prisma.SortOrder;
      const orderBy =
        sort === 'rating' ? { ratingAvg: sortOrder } : sort === 'name' ? { name: sortOrder } : { createdAt: sortOrder };
      [items, total] = await Promise.all([
        this.prisma.business.findMany({ where, select: businessListSelect, orderBy, skip, take }),
        this.prisma.business.count({ where }),
      ]);
      const ids = (items as Array<{ id: string }>).map((b) => b.id);
      const grouped = ids.length
        ? await this.prisma.deal.groupBy({
            by: ['businessId'],
            where: { businessId: { in: ids }, ...LIVE_DEAL_WHERE(now) },
            _count: { id: true },
          })
        : [];
      const counts = new Map(grouped.map((g) => [g.businessId, g._count.id]));
      items = (items as Array<{ id: string }>).map((b) => ({ ...b, activeDealCount: counts.get(b.id) ?? 0 }));
    }

    // minDiscountPercent across live deals per business (for "up to X% off" badges)
    const ids = (items as Array<{ id: string }>).map((b) => b.id);
    if (ids.length) {
      const mins = await this.prisma.deal.groupBy({
        by: ['businessId'],
        where: { businessId: { in: ids }, ...LIVE_DEAL_WHERE(now) },
        _max: { discountPercent: true },
      });
      const minBy = new Map(mins.map((m) => [m.businessId, m._max.discountPercent]));
      items = (items as Array<{ id: string }>).map((b) => ({ ...b, maxDiscountPercent: minBy.get(b.id) ?? 0 }));
    }

    return buildPaginatedResponse(items, total, page, pageSize);
  }

  async getBySlug(slug: string) {
    const now = new Date();
    const business = await this.prisma.business.findFirst({
      where: { slug, deletedAt: null },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        branches: {
          where: { isActive: true, deletedAt: null },
          orderBy: { name: 'asc' },
          include: { city: { select: { id: true, name: true } }, area: { select: { id: true, name: true } } },
        },
        deals: {
          where: LIVE_DEAL_WHERE(now),
          orderBy: { discountPercent: 'desc' },
          take: 10,
          select: { id: true, slug: true, title: true, discountPercent: true, dealPrice: true, originalPrice: true, endDate: true, requiresMembership: true },
        },
        reviews: {
          where: { status: 'APPROVED' },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { id: true, rating: true, body: true, createdAt: true, user: { select: { firstName: true } } },
        },
      },
    });
    if (!business || !business.isActive) {
      throw new NotFoundException({ code: 'BUSINESS_NOT_FOUND', message: 'Business not found.' });
    }
    return business;
  }

  // ------------------------------------------------------------ applications

  /**
   * Public partner application. Accepts optional logo + up to 5 documents
   * (business docs, owner ID). Files are validated then stored.
   */
  async submitApplication(
    dto: CreateApplicationDto,
    files: { logo?: Express.Multer.File[]; documents?: Express.Multer.File[] },
    applicantUserId?: string,
  ) {
    await this.assertCategory(dto.categoryId);
    await this.assertCity(dto.cityId);
    if (dto.areaId) await this.assertArea(dto.areaId, dto.cityId);

    const logoUrl = files.logo?.[0] ? await this.storeDoc(files.logo[0], 'applications') : undefined;
    const documentUrls: string[] = [];
    for (const doc of files.documents ?? []) {
      documentUrls.push(await this.storeDoc(doc, 'applications'));
    }

    return this.prisma.businessApplication.create({
      data: {
        businessName: dto.businessName,
        ownerName: dto.ownerName,
        email: dto.email,
        phone: dto.phone,
        whatsapp: dto.whatsapp,
        categoryId: dto.categoryId,
        cityId: dto.cityId,
        areaId: dto.areaId,
        address: dto.address,
        mapsUrl: dto.mapsUrl,
        website: dto.website,
        instagram: dto.instagram,
        facebook: dto.facebook,
        description: dto.description,
        logoUrl,
        documentUrls,
        status: 'SUBMITTED',
        applicantUserId,
      },
    });
  }

  async myApplications(userId: string, email?: string) {
    return this.prisma.businessApplication.findMany({
      where: { OR: [{ applicantUserId: userId }, ...(email ? [{ email }] : [])] },
      orderBy: { createdAt: 'desc' },
      include: { category: { select: { name: true } }, city: { select: { name: true } } },
    });
  }

  async listApplications(query: ApplicationQueryDto) {
    const { page, pageSize, skip, take } = parsePagination(query, ['createdAt', 'businessName'], 'createdAt');
    const where: Prisma.BusinessApplicationWhereInput = {};
    if (query.status) where.status = query.status as Prisma.BusinessApplicationWhereInput['status'];
    if (query.q) {
      where.OR = [
        { businessName: { contains: query.q, mode: 'insensitive' } },
        { ownerName: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.businessApplication.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { category: { select: { name: true } }, city: { select: { name: true } } },
      }),
      this.prisma.businessApplication.count({ where }),
    ]);
    return buildPaginatedResponse(items, total, page, pageSize);
  }

  async getApplication(id: string) {
    const app = await this.prisma.businessApplication.findUnique({
      where: { id },
      include: { category: true, city: true, area: true },
    });
    if (!app) throw new NotFoundException({ code: 'APPLICATION_NOT_FOUND', message: 'Application not found.' });
    return app;
  }

  /**
   * Approve: creates Business + BusinessOwner link in one transaction.
   * The owner User is found by email or created (passwordless — they set it
   * via forgot-password) and granted the BUSINESS_OWNER role.
   */
  async approveApplication(adminId: string, id: string) {
    const app = await this.getApplication(id);
    if (app.status === 'APPROVED') {
      throw new ConflictException({ code: 'ALREADY_APPROVED', message: 'Application is already approved.' });
    }
    if (app.status === 'REJECTED') {
      throw new ConflictException({ code: 'ALREADY_REJECTED', message: 'Application was rejected; ask the partner to re-apply.' });
    }

    return this.prisma.$transaction(async (tx) => {
      let owner = await tx.user.findFirst({ where: { email: app.email } });
      if (!owner) {
        const [firstName, ...rest] = app.ownerName.split(' ');
        owner = await tx.user.create({
          data: {
            email: app.email,
            phone: app.phone,
            passwordHash: null, // passwordless until they use forgot-password
            referralCode: `BC${Date.now().toString(36).toUpperCase().slice(-4)}${Math.random().toString(36).slice(2, 6).toUpperCase()}`, // unique invite code (8 chars)
            firstName: firstName || app.ownerName,
            lastName: rest.join(' ') || '-',
            cityId: app.cityId,
            status: 'ACTIVE',
          },
        });
      }
      const role = await tx.role.findUnique({ where: { name: ROLES.BUSINESS_OWNER } });
      if (role) {
        await tx.userRole.upsert({
          where: { userId_roleId: { userId: owner.id, roleId: role.id } },
          update: {},
          create: { userId: owner.id, roleId: role.id },
        });
      }

      const slug = await this.uniqueBusinessSlug(tx, app.businessName);
      const business = await tx.business.create({
        data: {
          slug,
          name: app.businessName,
          description: app.description,
          logo: app.logoUrl,
          categoryId: app.categoryId,
          ownerUserId: owner.id,
          website: app.website,
          phone: app.phone,
          email: app.email,
          isVerified: true,
          isActive: true,
          applicationStatus: 'APPROVED',
        },
      });
      await tx.businessOwner.create({ data: { businessId: business.id, userId: owner.id, role: 'OWNER' } });
      await tx.businessApplication.update({
        where: { id },
        data: { status: 'APPROVED', reviewedById: adminId, reviewedAt: new Date(), createdBusinessId: business.id },
      });
      return { applicationId: id, businessId: business.id, businessSlug: slug, ownerUserId: owner.id };
    }).then(async (result) => {
      await this.bustAdminOverview();
      return result;
    });
  }

  async rejectApplication(adminId: string, id: string, dto: ReviewApplicationDto) {
    if (!dto.reason?.trim()) {
      throw new BadRequestException({ code: 'REASON_REQUIRED', message: 'A reason is required to reject an application.' });
    }
    const app = await this.getApplication(id);
    if (app.status === 'APPROVED' || app.status === 'REJECTED') {
      throw new ConflictException({ code: 'APPLICATION_CLOSED', message: `Application is already ${app.status.toLowerCase()}.` });
    }
    const updated = await this.prisma.businessApplication.update({
      where: { id },
      data: { status: 'REJECTED', reviewedById: adminId, reviewedAt: new Date(), reviewReason: dto.reason },
    });
    await this.bustAdminOverview();
    return updated;
  }

  async requestInfo(adminId: string, id: string, dto: ReviewApplicationDto) {
    if (!dto.reason?.trim()) {
      throw new BadRequestException({ code: 'REASON_REQUIRED', message: 'Describe what information is needed.' });
    }
    const app = await this.getApplication(id);
    if (app.status === 'APPROVED' || app.status === 'REJECTED') {
      throw new ConflictException({ code: 'APPLICATION_CLOSED', message: `Application is already ${app.status.toLowerCase()}.` });
    }
    return this.prisma.businessApplication.update({
      where: { id },
      data: { status: 'MORE_INFO_REQUIRED', reviewedById: adminId, reviewedAt: new Date(), reviewReason: dto.reason },
    });
  }

  async markUnderReview(adminId: string, id: string) {
    const app = await this.getApplication(id);
    if (app.status !== 'SUBMITTED') {
      throw new ConflictException({ code: 'INVALID_TRANSITION', message: 'Only submitted applications can move to under review.' });
    }
    return this.prisma.businessApplication.update({
      where: { id },
      data: { status: 'UNDER_REVIEW', reviewedById: adminId, reviewedAt: new Date() },
    });
  }

  // ------------------------------------------------------------------- admin

  async create(dto: CreateBusinessDto) {
    await this.assertCategory(dto.categoryId);
    if (dto.ownerUserId) await this.assertUser(dto.ownerUserId);
    const slug = await this.uniqueBusinessSlug(this.prisma, dto.name);
    return this.prisma.business.create({
      data: {
        slug,
        name: dto.name,
        description: dto.description,
        logo: dto.logo,
        coverImage: dto.coverImage,
        website: dto.website,
        phone: dto.phone,
        email: dto.email,
        categoryId: dto.categoryId,
        ownerUserId: dto.ownerUserId,
        isVerified: dto.isVerified ?? false,
        applicationStatus: 'APPROVED',
      },
    });
  }

  async update(id: string, dto: UpdateBusinessDto) {
    await this.assertBusiness(id);
    if (dto.categoryId) await this.assertCategory(dto.categoryId);
    return this.prisma.business.update({ where: { id }, data: dto });
  }

  async verify(id: string) {
    await this.assertBusiness(id);
    const updated = await this.prisma.business.update({ where: { id }, data: { isVerified: true } });
    await this.bustAdminOverview();
    return updated;
  }

  /**
   * Suspend: deactivates the business and pauses its PUBLISHED deals so they
   * cannot be redeemed while suspended. Reactivation does NOT auto-resume
   * deals — an admin or the owner must republish them.
   */
  async suspend(id: string, dto: SuspendBusinessDto) {
    await this.assertBusiness(id);
    const result = await this.prisma.$transaction(async (tx) => {
      const business = await tx.business.update({ where: { id }, data: { isActive: false } });
      const paused = await tx.deal.updateMany({
        where: { businessId: id, status: 'PUBLISHED' },
        data: { status: 'PAUSED' },
      });
      return { business, dealsPaused: paused.count };
    });
    // Phase 8: deals were paused — bust the partner caches outside the txn.
    await this.partnerDashboard.invalidatePartnerDashboard(id).catch(() => null);
    // Phase 9: keep the admin overview honest.
    await this.bustAdminOverview();
    return result;
  }

  async reactivate(id: string) {
    await this.assertBusiness(id);
    const reactivated = await this.prisma.business.update({ where: { id }, data: { isActive: true } });
    // Phase 8: partner dashboard/analytics cache reflects isActive.
    await this.partnerDashboard.invalidatePartnerDashboard(id).catch(() => null);
    // Phase 9: keep the admin overview honest.
    await this.bustAdminOverview();
    return reactivated;
  }

  async remove(id: string) {
    await this.assertBusiness(id);
    await this.prisma.business.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    await this.partnerDashboard.invalidatePartnerDashboard(id).catch(() => null);
    return { deleted: true, id };
  }

  // ------------------------------------------------------------------- owner

  /** Businesses the user owns (ownerUserId or BusinessOwner link). */
  async myBusinesses(userId: string) {
    return this.prisma.business.findMany({
      where: {
        deletedAt: null,
        OR: [{ ownerUserId: userId }, { owners: { some: { userId } } }],
      },
      include: {
        _count: { select: { branches: true, deals: true } },
        category: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateMine(userId: string, roles: string[], businessId: string, dto: UpdateBusinessDto) {
    await this.assertCanManage(userId, roles, businessId);
    if (dto.categoryId) await this.assertCategory(dto.categoryId);
    // Owners cannot change verification or active flags — admin only.
    return this.prisma.business.update({ where: { id: businessId }, data: dto });
  }

  /** Shared ownership check: admins bypass, otherwise must own the business. */
  async assertCanManage(userId: string, roles: string[], businessId: string) {
    if (isAdminRole(roles)) return;
    const business = await this.prisma.business.findFirst({
      where: {
        id: businessId,
        deletedAt: null,
        OR: [{ ownerUserId: userId }, { owners: { some: { userId } } }, { staff: { some: { userId, isActive: true, role: { in: ['OWNER', 'MANAGER'] } } } }],
      },
      select: { id: true },
    });
    if (!business) {
      throw new ForbiddenException({ code: 'NOT_BUSINESS_MEMBER', message: 'You do not manage this business.' });
    }
  }

  // ----------------------------------------------------------------- helpers

  private async assertBusiness(id: string) {
    const business = await this.prisma.business.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
    if (!business) throw new NotFoundException({ code: 'BUSINESS_NOT_FOUND', message: 'Business not found.' });
    return business;
  }

  private async assertCategory(id: string) {
    const category = await this.prisma.category.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
    if (!category) throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND', message: 'Category not found.' });
  }

  private async assertCity(id: string) {
    const city = await this.prisma.city.findUnique({ where: { id }, select: { id: true } });
    if (!city) throw new NotFoundException({ code: 'CITY_NOT_FOUND', message: 'City not found.' });
  }

  private async assertArea(id: string, cityId: string) {
    const area = await this.prisma.area.findFirst({ where: { id, cityId }, select: { id: true } });
    if (!area) throw new NotFoundException({ code: 'AREA_NOT_FOUND', message: 'Area not found in this city.' });
  }

  private async assertUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Owner user not found.' });
  }

  private async uniqueBusinessSlug(tx: Pick<typeof this.prisma, 'business'>, name: string): Promise<string> {
    const base = slugify(name);
    let slug = base;
    let n = 2;
    while (await tx.business.findUnique({ where: { slug }, select: { id: true } })) {
      slug = `${base}-${n++}`;
    }
    return slug;
  }

  /** Partner: upload logo or cover for an owned business. Returns the stored URL. */
  async uploadMineAsset(
    userId: string,
    roles: string[],
    businessId: string,
    kind: 'logo' | 'cover',
    file: Express.Multer.File,
  ): Promise<{ url: string }> {
    await this.assertCanManage(userId, roles, businessId);
    if (!file) throw new BadRequestException({ code: 'FILE_REQUIRED', message: 'An image file is required.' });
    if (!BUSINESS_IMAGE_MIME.includes(file.mimetype)) {
      throw new BadRequestException({ code: 'INVALID_IMAGE_TYPE', message: `Image must be one of: ${BUSINESS_IMAGE_MIME.join(', ')}.` });
    }
    if (file.size > BUSINESS_IMAGE_MAX_BYTES) {
      throw new BadRequestException({ code: 'IMAGE_TOO_LARGE', message: 'Image must be 3 MB or smaller.' });
    }
    const { url } = await this.storage.upload({
      filename: file.originalname,
      mimetype: file.mimetype,
      buffer: file.buffer,
      folder: `businesses/${businessId}`,
    });
    await this.prisma.business.update({ where: { id: businessId }, data: { [kind === 'logo' ? 'logo' : 'coverImage']: url } });
    return { url };
  }

  private async storeDoc(file: Express.Multer.File, folder: string): Promise<string> {
    if (!APPLICATION_DOC_MIME.includes(file.mimetype)) {
      throw new BadRequestException({ code: 'INVALID_DOC_TYPE', message: `Document must be one of: ${APPLICATION_DOC_MIME.join(', ')}.` });
    }
    if (file.size > APPLICATION_DOC_MAX_BYTES) {
      throw new BadRequestException({ code: 'DOC_TOO_LARGE', message: 'Documents must be 5 MB or smaller.' });
    }
    const { url } = await this.storage.upload({ filename: file.originalname, mimetype: file.mimetype, buffer: file.buffer, folder });
    return url;
  }
}
