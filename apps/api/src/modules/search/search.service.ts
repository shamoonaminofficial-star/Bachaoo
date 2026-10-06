import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Global search across deals, businesses and categories.
 *
 * Current implementation uses ILIKE (`contains … mode: insensitive`) which is
 * fine for catalog scale. Future improvement: PostgreSQL trigram indexes
 * (pg_trgm) or a dedicated search engine (pg_search / Typesense) when the
 * catalog grows past ~100k rows.
 */
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  /** Combined search: top 5 deals + top 5 businesses + top 5 categories. */
  async search(q: string) {
    const term = this.clean(q);

    const [deals, businesses, categories] = await Promise.all([
      this.prisma.deal.findMany({
        where: {
          status: 'PUBLISHED',
          deletedAt: null,
          startDate: { lte: new Date() },
          endDate: { gte: new Date() },
          business: { isActive: true, deletedAt: null },
          OR: [
            { title: { contains: term, mode: 'insensitive' } },
            { shortDescription: { contains: term, mode: 'insensitive' } },
            { business: { name: { contains: term, mode: 'insensitive' } } },
          ],
        },
        select: {
          id: true,
          slug: true,
          title: true,
          discountPercent: true,
          dealPrice: true,
          business: { select: { name: true, logo: true } },
          images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        },
        orderBy: [{ redemptionCount: 'desc' }, { createdAt: 'desc' }],
        take: 5,
      }),
      this.prisma.business.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { description: { contains: term, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          slug: true,
          name: true,
          logo: true,
          ratingAvg: true,
          category: { select: { name: true } },
        },
        orderBy: { ratingAvg: 'desc' },
        take: 5,
      }),
      this.prisma.category.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          name: { contains: term, mode: 'insensitive' },
        },
        select: { id: true, slug: true, name: true, icon: true },
        orderBy: { sortOrder: 'asc' },
        take: 5,
      }),
    ]);

    return {
      deals: deals.map((d: any) => ({ type: 'deal' as const, ...d, image: d.images?.[0]?.url ?? null, images: undefined })),
      businesses: businesses.map((b) => ({ type: 'business' as const, ...b })),
      categories: categories.map((c) => ({ type: 'category' as const, ...c })),
    };
  }

  /** Autocomplete suggestions: prefix matches on titles/names. */
  async suggest(q: string) {
    const term = this.clean(q);

    const [deals, businesses, categories] = await Promise.all([
      this.prisma.deal.findMany({
        where: {
          status: 'PUBLISHED',
          deletedAt: null,
          endDate: { gte: new Date() },
          title: { startsWith: term, mode: 'insensitive' },
        },
        select: { id: true, slug: true, title: true },
        orderBy: { redemptionCount: 'desc' },
        take: 5,
      }),
      this.prisma.business.findMany({
        where: { isActive: true, deletedAt: null, name: { startsWith: term, mode: 'insensitive' } },
        select: { id: true, slug: true, name: true },
        orderBy: { ratingAvg: 'desc' },
        take: 5,
      }),
      this.prisma.category.findMany({
        where: { isActive: true, deletedAt: null, name: { startsWith: term, mode: 'insensitive' } },
        select: { id: true, slug: true, name: true },
        orderBy: { sortOrder: 'asc' },
        take: 5,
      }),
    ]);

    return [
      ...deals.map((d) => ({ type: 'deal' as const, id: d.id, label: d.title, slug: d.slug })),
      ...businesses.map((b) => ({ type: 'business' as const, id: b.id, label: b.name, slug: b.slug })),
      ...categories.map((c) => ({ type: 'category' as const, id: c.id, label: c.name, slug: c.slug })),
    ];
  }

  private clean(q: string): string {
    const term = (q ?? '').trim();
    if (term.length < 2) {
      throw new BadRequestException({
        code: 'QUERY_TOO_SHORT',
        message: 'Search query must be at least 2 characters.',
      });
    }
    return term.slice(0, 100);
  }
}
