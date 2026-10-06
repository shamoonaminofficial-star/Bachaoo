import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessesService } from '../businesses/businesses.service';
import { parsePagination, buildPaginatedResponse } from '../../common/utils/pagination';

export interface ReviewDto {
  id: string;
  businessId: string;
  userId: string;
  dealId: string | null;
  rating: number;
  title: string | null;
  body: string | null;
  photos: string[];
  status: string;
  reply: { body: string; repliedAt: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReviewInput {
  businessId: string;
  dealId?: string;
  rating: number;
  title?: string;
  body?: string;
  photos?: string[];
}

/**
 * Phase 11 — customer reviews.
 *
 * Trust rules:
 * - Only customers with ≥1 CONFIRMED redemption at the business may review
 *   (server-enforced, code NO_REDEMPTION). Reviews are earned, not bought.
 * - One review per user per (business, deal); posting again updates the
 *   existing review and re-queues it for moderation.
 * - Business ratingAvg/ratingCount are denormalized and recomputed whenever
 *   an APPROVED review appears or disappears.
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businesses: BusinessesService,
  ) {}

  async createReview(userId: string, input: CreateReviewInput) {
    const rating = Math.trunc(Number(input.rating));
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException({ code: 'INVALID_RATING', message: 'Rating must be an integer from 1 to 5.' });
    }
    const business = await this.prisma.business.findFirst({
      where: { id: input.businessId, deletedAt: null },
      select: { id: true, isActive: true },
    });
    if (!business || !business.isActive) {
      throw new NotFoundException({ code: 'BUSINESS_NOT_FOUND', message: 'Business not found.' });
    }
    if (input.dealId) {
      const deal = await this.prisma.deal.findFirst({
        where: { id: input.dealId, businessId: input.businessId, deletedAt: null },
        select: { id: true },
      });
      if (!deal) {
        throw new BadRequestException({ code: 'DEAL_NOT_IN_BUSINESS', message: 'Deal does not belong to this business.' });
      }
    }
    // Earned-review gate: at least one confirmed redemption at this business.
    const redemptions = await this.prisma.redemption.count({
      where: { userId, businessId: input.businessId, status: 'CONFIRMED' },
    });
    if (redemptions === 0) {
      throw new ForbiddenException({
        code: 'NO_REDEMPTION',
        message: 'You can only review a business after a confirmed visit (redemption).',
      });
    }

    const autoApprove = await this.getSettingBool('reviews.autoApprove', false);
    const status = autoApprove ? 'APPROVED' : 'PENDING';
    const photos = sanitizePhotos(input.photos);

    const result = await this.prisma.$transaction(async (tx: any) => {
      const existing = await tx.review.findFirst({
        where: {
          businessId: input.businessId,
          userId,
          dealId: input.dealId ?? null,
        },
      });
      let review: any;
      if (existing) {
        // Upsert-style update: new content re-queues for moderation.
        review = await tx.review.update({
          where: { id: existing.id },
          data: {
            rating,
            title: input.title?.trim() || null,
            body: input.body?.trim() || null,
            status,
          },
        });
        await tx.reviewPhoto.deleteMany({ where: { reviewId: existing.id } });
      } else {
        review = await tx.review.create({
          data: {
            businessId: input.businessId,
            userId,
            dealId: input.dealId ?? null,
            rating,
            title: input.title?.trim() || null,
            body: input.body?.trim() || null,
            status,
          },
        });
      }
      if (photos.length > 0) {
        await tx.reviewPhoto.createMany({ data: photos.map((url) => ({ reviewId: review.id, url })) });
      }
      return review;
    });

    if (status === 'APPROVED') {
      await this.recomputeBusinessRating(input.businessId).catch(() => null);
    }
    return this.toDto(result.id);
  }

  async getBusinessReviews(businessId: string, query: { page?: number | string; pageSize?: number | string }) {
    const business = await this.prisma.business.findFirst({
      where: { id: businessId, deletedAt: null },
      select: { id: true },
    });
    if (!business) {
      throw new NotFoundException({ code: 'BUSINESS_NOT_FOUND', message: 'Business not found.' });
    }
    const { page, take, skip } = parsePagination(query as never);
    const where = { businessId, status: 'APPROVED' } as never;
    const [total, rows, dist] = await Promise.all([
      this.prisma.review.count({ where }),
      this.prisma.review.findMany({
        where,
        include: { photos: { select: { url: true } }, user: { select: { firstName: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.review.groupBy({ by: ['rating'], where, _count: { rating: true } }),
    ]);
    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let sum = 0;
    for (const d of dist as Array<{ rating: number; _count: { rating: number } }>) {
      distribution[d.rating] = d._count.rating;
      sum += d.rating * d._count.rating;
    }
    return {
      aggregate: {
        average: total > 0 ? Math.round((sum / total) * 10) / 10 : 0,
        count: total,
        distribution,
      },
      ...buildPaginatedResponse(
        rows.map((r: any) => ({ ...this.mapDto(r), reviewerName: r.user?.firstName ?? 'Customer' })),
        total,
        page,
        take,
      ),
    };
  }

  /**
   * Partner reply — one reply per review. Only owners/managers of the business.
   */
  async replyToReview(userId: string, roles: string[], reviewId: string, body: string) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) {
      throw new NotFoundException({ code: 'REVIEW_NOT_FOUND', message: 'Review not found.' });
    }
    await this.businesses.assertCanManage(userId, roles, review.businessId);
    if (review.replyBody) {
      throw new ConflictException({ code: 'ALREADY_REPLIED', message: 'This review already has a reply.' });
    }
    const text = (body || '').trim();
    if (text.length < 2 || text.length > 2000) {
      throw new BadRequestException({ code: 'INVALID_REPLY', message: 'Reply must be 2–2000 characters.' });
    }
    await this.prisma.review.update({
      where: { id: reviewId },
      data: { replyBody: text, repliedAt: new Date(), repliedBy: userId },
    });
    return this.toDto(reviewId);
  }

  /**
   * Recompute denormalized Business.ratingAvg / ratingCount from APPROVED reviews.
   * Public so the admin moderation flow can call it after approve/reject.
   */
  async recomputeBusinessRating(businessId: string): Promise<void> {
    const agg = await this.prisma.review.aggregate({
      where: { businessId, status: 'APPROVED' },
      _avg: { rating: true },
      _count: { rating: true },
    });
    await this.prisma.business.update({
      where: { id: businessId },
      data: {
        ratingAvg: agg._avg.rating ?? 0,
        ratingCount: agg._count.rating ?? 0,
      },
    });
  }

  // ------------------------------------------------------------------ helpers

  private async toDto(id: string): Promise<ReviewDto> {
    const r: any = await this.prisma.review.findUnique({
      where: { id },
      include: { photos: { select: { url: true } } },
    });
    return this.mapDto(r);
  }

  private mapDto(r: any): ReviewDto {
    return {
      id: r.id,
      businessId: r.businessId,
      userId: r.userId,
      dealId: r.dealId ?? null,
      rating: r.rating,
      title: r.title ?? null,
      body: r.body ?? null,
      photos: (r.photos ?? []).map((p: any) => p.url),
      status: r.status,
      reply: r.replyBody ? { body: r.replyBody, repliedAt: new Date(r.repliedAt).toISOString() } : null,
      createdAt: new Date(r.createdAt).toISOString(),
      updatedAt: new Date(r.updatedAt).toISOString(),
    };
  }

  private async getSettingBool(key: string, fallback: boolean): Promise<boolean> {
    const s = await this.prisma.systemSetting.findUnique({ where: { key } }).catch(() => null);
    const v = (s?.value as unknown) ?? null;
    if (typeof v === 'boolean') return v;
    return fallback;
  }
}

function sanitizePhotos(photos?: string[]): string[] {
  if (!Array.isArray(photos)) return [];
  const out: string[] = [];
  for (const p of photos.slice(0, 5)) {
    if (typeof p === 'string' && /^https?:\/\//.test(p) && p.length <= 2000 && !out.includes(p)) out.push(p);
  }
  return out;
}
