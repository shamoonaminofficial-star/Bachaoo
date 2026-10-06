import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import {
  CreateAreaDto,
  CreateCityDto,
  CreateCountryDto,
  CreateProvinceDto,
  ToggleActiveDto,
  UpdateAreaDto,
  UpdateCityDto,
  UpdateCountryDto,
} from './dto/location.dto';

const CACHE_TTL = 300; // 5 minutes

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Location hierarchy: Country -> Province -> City -> Area.
 * Reads are cached in Redis (5-min TTL); writes invalidate the affected keys.
 */
@Injectable()
export class LocationsService {
  private readonly logger = new Logger(LocationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ------------------------------------------------------------------ cache

  private async cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
    try {
      const hit = await this.redis.get(key);
      if (hit) return JSON.parse(hit) as T;
    } catch (err) {
      this.logger.warn(`Location cache read failed for ${key}: ${(err as Error).message}`);
    }
    const value = await loader();
    try {
      await this.redis.set(key, JSON.stringify(value), CACHE_TTL);
    } catch (err) {
      this.logger.warn(`Location cache write failed for ${key}: ${(err as Error).message}`);
    }
    return value;
  }

  private async invalidate(keys: string[]): Promise<void> {
    for (const key of keys) {
      try {
        await this.redis.del(key);
      } catch (err) {
        this.logger.warn(`Location cache invalidate failed for ${key}: ${(err as Error).message}`);
      }
    }
  }

  // ------------------------------------------------------------------ public

  /** Active countries, cached. */
  getCountries() {
    return this.cached('loc:countries', () =>
      this.prisma.country.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      }),
    );
  }

  getProvinces(countryCode: string) {
    return this.cached(`loc:provinces:${countryCode.toUpperCase()}`, async () => {
      const country = await this.prisma.country.findUnique({
        where: { code: countryCode.toUpperCase() },
        select: { id: true },
      });
      if (!country) throw new NotFoundException({ code: 'COUNTRY_NOT_FOUND', message: 'Country not found.' });
      return this.prisma.province.findMany({
        where: { countryId: country.id },
        orderBy: { name: 'asc' },
      });
    });
  }

  getCities(provinceId: string) {
    return this.cached(`loc:cities:${provinceId}`, () =>
      this.prisma.city.findMany({
        where: { provinceId, isActive: true },
        orderBy: { name: 'asc' },
        include: { province: { select: { name: true, country: { select: { name: true, code: true } } } } },
      }),
    );
  }

  getAreas(cityId: string) {
    return this.cached(`loc:areas:${cityId}`, () =>
      this.prisma.area.findMany({
        where: { cityId, isActive: true },
        orderBy: { name: 'asc' },
      }),
    );
  }

  /**
   * Flat city search for selects (registration city picker). Not cached per
   * query beyond the generic 5-min entry — result sets are small.
   */
  searchCities(search?: string) {
    const key = `loc:cities:search:${(search || '').toLowerCase()}`;
    return this.cached(key, () =>
      this.prisma.city.findMany({
        where: {
          isActive: true,
          ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
        },
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
        take: 50,
        include: {
          province: { select: { name: true, country: { select: { name: true, code: true } } } },
        },
      }),
    );
  }

  getDefaultCity() {
    return this.prisma.city.findFirst({ where: { isDefault: true, isActive: true } });
  }

  // ------------------------------------------------------------------- admin

  async createCountry(dto: CreateCountryDto) {
    const code = dto.code.toUpperCase();
    const existing = await this.prisma.country.findUnique({ where: { code } });
    if (existing) throw new ConflictException({ code: 'COUNTRY_EXISTS', message: 'A country with this code already exists.' });
    const country = await this.prisma.country.create({
      data: { name: dto.name, code, currency: dto.currency ?? 'PKR', timezone: dto.timezone ?? 'Asia/Karachi' },
    });
    await this.invalidate(['loc:countries']);
    return country;
  }

  async updateCountry(id: string, dto: UpdateCountryDto) {
    const country = await this.prisma.country.update({ where: { id }, data: dto }).catch(() => null);
    if (!country) throw new NotFoundException({ code: 'COUNTRY_NOT_FOUND', message: 'Country not found.' });
    await this.invalidate(['loc:countries']);
    return country;
  }

  async createProvince(countryId: string, dto: CreateProvinceDto) {
    await this.assertCountry(countryId);
    const province = await this.prisma.province.create({ data: { countryId, name: dto.name } });
    await this.invalidate(['loc:countries']);
    return province;
  }

  async createCity(provinceId: string, dto: CreateCityDto) {
    await this.assertProvince(provinceId);
    const slug = slugify(dto.name);
    const existing = await this.prisma.city.findUnique({ where: { slug } });
    if (existing) throw new ConflictException({ code: 'CITY_EXISTS', message: 'A city with this name already exists.' });
    const city = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.city.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      return tx.city.create({
        data: { provinceId, name: dto.name, slug, isDefault: dto.isDefault ?? false },
      });
    });
    await this.invalidate([`loc:cities:${provinceId}`, 'loc:cities:search:']);
    return city;
  }

  async updateCity(id: string, dto: UpdateCityDto) {
    const city = await this.prisma.city.findUnique({ where: { id } });
    if (!city) throw new NotFoundException({ code: 'CITY_NOT_FOUND', message: 'City not found.' });
    const updated = await this.prisma.city.update({
      where: { id },
      data: { ...dto, ...(dto.name ? { slug: slugify(dto.name) } : {}) },
    });
    await this.invalidate([`loc:cities:${city.provinceId}`]);
    return updated;
  }

  /** Set the default city — exactly one city may be default at a time. */
  async setDefaultCity(id: string) {
    const city = await this.prisma.city.findUnique({ where: { id } });
    if (!city) throw new NotFoundException({ code: 'CITY_NOT_FOUND', message: 'City not found.' });
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.city.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      return tx.city.update({ where: { id }, data: { isDefault: true, isActive: true } });
    });
    await this.invalidate([`loc:cities:${city.provinceId}`]);
    return updated;
  }

  async toggleCity(id: string, dto: ToggleActiveDto) {
    const city = await this.prisma.city.findUnique({ where: { id } });
    if (!city) throw new NotFoundException({ code: 'CITY_NOT_FOUND', message: 'City not found.' });
    if (city.isDefault && !dto.isActive) {
      throw new ConflictException({ code: 'DEFAULT_CITY_ACTIVE', message: 'The default city cannot be disabled. Set another default first.' });
    }
    const updated = await this.prisma.city.update({ where: { id }, data: { isActive: dto.isActive } });
    await this.invalidate([`loc:cities:${city.provinceId}`]);
    return updated;
  }

  async createArea(cityId: string, dto: CreateAreaDto) {
    await this.assertCity(cityId);
    const slug = slugify(dto.name);
    const existing = await this.prisma.area.findUnique({ where: { cityId_slug: { cityId, slug } } });
    if (existing) throw new ConflictException({ code: 'AREA_EXISTS', message: 'This area already exists in the city.' });
    const area = await this.prisma.area.create({ data: { cityId, name: dto.name, slug } });
    await this.invalidate([`loc:areas:${cityId}`]);
    return area;
  }

  async updateArea(id: string, dto: UpdateAreaDto) {
    const area = await this.prisma.area.findUnique({ where: { id } });
    if (!area) throw new NotFoundException({ code: 'AREA_NOT_FOUND', message: 'Area not found.' });
    const updated = await this.prisma.area.update({
      where: { id },
      data: { ...dto, ...(dto.name ? { slug: slugify(dto.name) } : {}) },
    }).catch(() => null);
    if (!updated) throw new ConflictException({ code: 'AREA_EXISTS', message: 'An area with this name already exists in the city.' });
    await this.invalidate([`loc:areas:${area.cityId}`]);
    return updated;
  }

  async deleteArea(id: string) {
    const area = await this.prisma.area.findUnique({ where: { id }, select: { id: true, cityId: true } });
    if (!area) throw new NotFoundException({ code: 'AREA_NOT_FOUND', message: 'Area not found.' });
    const inUse = await this.prisma.branch.count({ where: { areaId: id, deletedAt: null } });
    if (inUse > 0) {
      throw new ConflictException({
        code: 'AREA_IN_USE',
        message: `This area is used by ${inUse} branch(es) and cannot be deleted.`,
      });
    }
    await this.prisma.area.delete({ where: { id } });
    await this.invalidate([`loc:areas:${area.cityId}`]);
    return { deleted: true, id };
  }

  async getTree() {
    const countries = await this.prisma.country.findMany({
      orderBy: { name: 'asc' },
      include: {
        provinces: {
          orderBy: { name: 'asc' },
          include: {
            cities: {
              orderBy: { name: 'asc' },
              include: { areas: { orderBy: { name: 'asc' } } },
            },
          },
        },
      },
    });
    return { countries };
  }

  // ----------------------------------------------------------------- helpers

  private async assertCountry(id: string) {
    const country = await this.prisma.country.findUnique({ where: { id }, select: { id: true } });
    if (!country) throw new NotFoundException({ code: 'COUNTRY_NOT_FOUND', message: 'Country not found.' });
  }

  private async assertProvince(id: string) {
    const province = await this.prisma.province.findUnique({ where: { id }, select: { id: true } });
    if (!province) throw new NotFoundException({ code: 'PROVINCE_NOT_FOUND', message: 'Province not found.' });
  }

  private async assertCity(id: string) {
    const city = await this.prisma.city.findUnique({ where: { id }, select: { id: true } });
    if (!city) throw new NotFoundException({ code: 'CITY_NOT_FOUND', message: 'City not found.' });
  }
}
