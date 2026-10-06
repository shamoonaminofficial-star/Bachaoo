import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaginatedResponse } from '@bachatly/types';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { CreateFavoriteDto, FavoriteQueryDto } from './favorites.dto';

@Injectable()
export class FavoritesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Phase 7: keep the cached customer dashboard honest (favoritesCount). */
  private async bustDashboard(userId: string): Promise<void> {
    try {
      await this.redis.del(`dashboard:${userId}`);
    } catch {
      /* best effort — 5-minute TTL is the safety net */
    }
  }

  /**
   * Save a deal or business. Unique per user+target (409 FAVORITE_EXISTS on
   * duplicates — enforced by the @@unique constraints in schema.prisma).
   */
  async add(userId: string, dto: CreateFavoriteDto) {
    if (dto.targetType === 'deal') {
      const deal = await this.prisma.deal.findFirst({
        where: { id: dto.targetId, deletedAt: null },
        select: { id: true },
      });
      if (!deal) throw new NotFoundException({ code: 'DEAL_NOT_FOUND', message: 'Deal not found.' });
    } else {
      const business = await this.prisma.business.findFirst({
        where: { id: dto.targetId, deletedAt: null },
        select: { id: true },
      });
      if (!business) {
        throw new NotFoundException({ code: 'BUSINESS_NOT_FOUND', message: 'Business not found.' });
      }
    }

    const data =
      dto.targetType === 'deal'
        ? { userId, dealId: dto.targetId }
        : { userId, businessId: dto.targetId };

    try {
      const fav = await this.prisma.favorite.create({ data });
      await this.bustDashboard(userId);
      return fav;
    } catch (err: any) {
      // Prisma P2002 = unique constraint violation (userId+dealId / userId+businessId).
      if (err?.code === 'P2002') {
        throw new ConflictException({
          code: 'FAVORITE_EXISTS',
          message: 'This is already in your favorites.',
        });
      }
      throw err;
    }
  }

  /** Remove — only the owner of the favorite row. */
  async remove(userId: string, id: string) {
    const fav = await this.prisma.favorite.findUnique({ where: { id } });
    if (!fav) throw new NotFoundException({ code: 'FAVORITE_NOT_FOUND', message: 'Favorite not found.' });
    if (fav.userId !== userId) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You cannot remove this favorite.' });
    }
    await this.prisma.favorite.delete({ where: { id } });
    await this.bustDashboard(userId);
    return { deleted: true, id };
  }

  /** Paginated favorites for the user, with deal/business summaries. */
  async list(userId: string, query: FavoriteQueryDto): Promise<PaginatedResponse<unknown>> {
    const where: Prisma.FavoriteWhereInput = { userId };
    if (query.type === 'deal') where.dealId = { not: null };
    if (query.type === 'business') where.businessId = { not: null };

    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(Math.max(1, Number(query.pageSize) || 20), 100);

    const [total, rows] = await Promise.all([
      this.prisma.favorite.count({ where }),
      this.prisma.favorite.findMany({
        where,
        include: {
          deal: {
            select: {
              id: true,
              slug: true,
              title: true,
              shortDescription: true,
              discountPercent: true,
              dealPrice: true,
              originalPrice: true,
              endDate: true,
              status: true,
              images: { orderBy: { sortOrder: 'asc' }, take: 1 },
              business: { select: { id: true, name: true, slug: true, logo: true } },
            },
          },
          business: {
            select: {
              id: true,
              slug: true,
              name: true,
              logo: true,
              ratingAvg: true,
              category: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const items = rows.map((fav: any) => ({
      id: fav.id,
      type: fav.dealId ? 'deal' : 'business',
      createdAt: fav.createdAt,
      deal: fav.deal,
      business: fav.business,
    }));

    return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  /** Lightweight "is this favorited?" check for deal/business pages. */
  async check(userId: string, targetType: 'deal' | 'business', targetId: string) {
    const fav = await this.prisma.favorite.findFirst({
      where: {
        userId,
        ...(targetType === 'deal' ? { dealId: targetId } : { businessId: targetId }),
      },
      select: { id: true },
    });
    return { favorited: !!fav, favoriteId: fav?.id ?? null };
  }
}
