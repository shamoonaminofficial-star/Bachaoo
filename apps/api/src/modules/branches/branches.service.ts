import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessesService } from '../businesses/businesses.service';
import { RedisService } from '../../redis/redis.service';
import { CreateBranchDto, NearbyQueryDto, UpdateBranchDto } from './dto/branch.dto';
import { buildPaginatedResponse, parsePagination } from '../../common/utils/pagination';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Pure Haversine distance in kilometres. Exported for unit testing; the
 * SQL in nearby() implements the same formula.
 */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Validates the openingHours JSON shape: { mon: ["09:00","22:00"], ... }.
 * Throws BadRequestException on any malformed day/time.
 */
export function validateOpeningHours(value: unknown): Record<string, [string, string]> | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException({ code: 'INVALID_HOURS', message: 'openingHours must be an object keyed by day.' });
  }
  const out: Record<string, [string, string]> = {};
  for (const [day, range] of Object.entries(value as Record<string, unknown>)) {
    if (!DAYS.includes(day)) {
      throw new BadRequestException({ code: 'INVALID_HOURS', message: `Invalid day key "${day}". Use ${DAYS.join(', ')}.` });
    }
    if (!Array.isArray(range) || range.length !== 2 || !range.every((t) => typeof t === 'string' && TIME_RE.test(t))) {
      throw new BadRequestException({ code: 'INVALID_HOURS', message: `Day "${day}" must be ["HH:MM","HH:MM"].` });
    }
    out[day] = range as [string, string];
  }
  return out;
}

const branchSelect = {
  id: true,
  businessId: true,
  name: true,
  managerName: true,
  phone: true,
  address: true,
  latitude: true,
  longitude: true,
  openingHours: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  city: { select: { id: true, name: true } },
  area: { select: { id: true, name: true } },
} as const;

/**
 * Branches belong to a business; all writes are scoped through the
 * BusinessesService ownership check (owner/manager of the business, or admin).
 */
@Injectable()
export class BranchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businesses: BusinessesService,
    private readonly redis: RedisService,
  ) {}

  /** Phase 8: partner dashboard cache invalidation (best-effort; TTL is the net). */
  private async bumpPartnerCache(businessId: string) {
    try {
      await this.redis.del(`partner-dashboard:${businessId}`);
    } catch {
      /* best effort */
    }
  }

  async listByBusiness(businessId: string, user?: { id: string; roles: string[] }, includeInactive = false) {
    const business = await this.prisma.business.findFirst({ where: { id: businessId, deletedAt: null }, select: { id: true } });
    if (!business) throw new NotFoundException({ code: 'BUSINESS_NOT_FOUND', message: 'Business not found.' });
    let canSeeInactive = false;
    if (includeInactive && user) {
      try {
        await this.businesses.assertCanManage(user.id, user.roles, businessId);
        canSeeInactive = true;
      } catch {
        canSeeInactive = false;
      }
    }
    return this.prisma.branch.findMany({
      where: { businessId, deletedAt: null, ...(canSeeInactive ? {} : { isActive: true }) },
      orderBy: { name: 'asc' },
      select: branchSelect,
    });
  }

  /** Admin: all branches with optional business / text filters. */
  async adminList(query: { businessId?: string; q?: string; page?: number; pageSize?: number }) {
    const { page, pageSize, skip, take, orderBy } = parsePagination(
      { page: query.page, pageSize: query.pageSize },
      ['createdAt', 'name'],
    );
    const where: Prisma.BranchWhereInput = { deletedAt: null };
    if (query.businessId) where.businessId = query.businessId;
    if (query.q) where.OR = [{ name: { contains: query.q, mode: 'insensitive' } }, { address: { contains: query.q, mode: 'insensitive' } }];
    const [items, total] = await Promise.all([
      this.prisma.branch.findMany({
        where,
        select: { ...branchSelect, business: { select: { id: true, name: true, slug: true } } },
        orderBy,
        skip,
        take,
      }),
      this.prisma.branch.count({ where }),
    ]);
    return buildPaginatedResponse(items, total, page, pageSize);
  }

  async getById(id: string) {    const branch = await this.prisma.branch.findFirst({
      where: { id, deletedAt: null },
      select: { ...branchSelect, business: { select: { id: true, name: true, slug: true, isActive: true } } },
    });
    if (!branch) throw new NotFoundException({ code: 'BRANCH_NOT_FOUND', message: 'Branch not found.' });
    return branch;
  }

  async create(businessId: string, dto: CreateBranchDto, user: { id: string; roles: string[] }) {
    await this.businesses.assertCanManage(user.id, user.roles, businessId);
    await this.assertCity(dto.cityId);
    if (dto.areaId) await this.assertArea(dto.areaId, dto.cityId);
    const openingHours = validateOpeningHours(dto.openingHours);
    const created = await this.prisma.branch.create({
      data: {
        businessId,
        name: dto.name,
        managerName: dto.managerName,
        phone: dto.phone,
        address: dto.address,
        cityId: dto.cityId,
        areaId: dto.areaId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        openingHours: openingHours ?? Prisma.DbNull,
        isActive: dto.isActive ?? true,
      },
      select: branchSelect,
    });
    await this.bumpPartnerCache(businessId);
    return created;
  }

  async update(id: string, dto: UpdateBranchDto, user: { id: string; roles: string[] }) {
    const branch = await this.assertBranch(id);
    await this.businesses.assertCanManage(user.id, user.roles, branch.businessId);
    if (dto.cityId) await this.assertCity(dto.cityId);
    if (dto.areaId) await this.assertArea(dto.areaId, dto.cityId ?? branch.cityId);
    const openingHours = validateOpeningHours(dto.openingHours);
    const { cityId, areaId, ...rest } = dto;
    const updated = await this.prisma.branch.update({
      where: { id },
      data: {
        ...rest,
        ...(cityId ? { city: { connect: { id: cityId } } } : {}),
        ...(areaId ? { area: { connect: { id: areaId } } } : {}),
        ...(dto.openingHours !== undefined ? { openingHours: openingHours ?? Prisma.DbNull } : {}),
      },
      select: branchSelect,
    });
    await this.bumpPartnerCache(branch.businessId);
    return updated;
  }

  async remove(id: string, user: { id: string; roles: string[] }) {
    const branch = await this.assertBranch(id);
    await this.businesses.assertCanManage(user.id, user.roles, branch.businessId);
    const dealLinks = await this.prisma.dealBranch.count({ where: { branchId: id } });
    if (dealLinks > 0) {
      throw new ForbiddenException({
        code: 'BRANCH_HAS_DEALS',
        message: 'Branch is attached to deals. Deactivate it instead of deleting, or detach the deals first.',
        details: { dealLinks },
      });
    }
    await this.prisma.branch.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    await this.bumpPartnerCache(branch.businessId);
    return { deleted: true, id };
  }

  /**
   * Branches near a point, ordered by distance. Haversine in SQL so the
   * database filters/orders — the TS haversineKm() mirrors the formula.
   */
  async nearby(query: NearbyQueryDto) {
    const { lat, lng, radiusKm } = query;
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        address: string;
        latitude: number;
        longitude: number;
        businessId: string;
        businessName: string;
        businessSlug: string;
        businessLogo: string | null;
        cityName: string;
        areaName: string | null;
        distanceKm: number;
      }>
    >`
      SELECT b.id, b.name, b.address, b.latitude, b.longitude,
             biz.id AS "businessId", biz.name AS "businessName", biz.slug AS "businessSlug", biz.logo AS "businessLogo",
             c.name AS "cityName", a.name AS "areaName",
             (6371 * acos(
               LEAST(1, GREATEST(-1,
                 cos(radians(${lat})) * cos(radians(b.latitude)) *
                 cos(radians(b.longitude) - radians(${lng})) +
                 sin(radians(${lat})) * sin(radians(b.latitude))
               ))
             )) AS "distanceKm"
      FROM "Branch" b
      JOIN "Business" biz ON biz.id = b."businessId"
      JOIN "City" c ON c.id = b."cityId"
      LEFT JOIN "Area" a ON a.id = b."areaId"
      WHERE b."deletedAt" IS NULL AND b."isActive" = true
        AND biz."deletedAt" IS NULL AND biz."isActive" = true
        AND b.latitude IS NOT NULL AND b.longitude IS NOT NULL
      ORDER BY "distanceKm" ASC
      LIMIT 100
    `;
    return rows
      .filter((r) => r.distanceKm <= radiusKm)
      .map((r) => ({ ...r, distanceKm: Math.round(r.distanceKm * 10) / 10 }));
  }

  // ----------------------------------------------------------------- helpers

  private async assertBranch(id: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, businessId: true, cityId: true },
    });
    if (!branch) throw new NotFoundException({ code: 'BRANCH_NOT_FOUND', message: 'Branch not found.' });
    return branch;
  }

  private async assertCity(id: string) {
    const city = await this.prisma.city.findUnique({ where: { id }, select: { id: true } });
    if (!city) throw new NotFoundException({ code: 'CITY_NOT_FOUND', message: 'City not found.' });
  }

  private async assertArea(id: string, cityId: string) {
    const area = await this.prisma.area.findFirst({ where: { id, cityId }, select: { id: true } });
    if (!area) throw new NotFoundException({ code: 'AREA_NOT_FOUND', message: 'Area not found in this city.' });
  }
}
