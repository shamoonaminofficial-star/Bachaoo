import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { STORAGE_SERVICE, IStorageService } from '../../common/storage/storage.interface';
import { parsePagination, buildPaginatedResponse } from '../../common/utils/pagination';

const BANNER_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const BANNER_MAX_BYTES = 5 * 1024 * 1024;

export interface UpsertPageInput {
  slug: string;
  title: string;
  content: string;
  metaTitle?: string;
  metaDescription?: string;
  isPublished?: boolean;
}

export interface UpsertBannerInput {
  placement: string;
  heading?: string;
  description?: string;
  ctaText?: string;
  ctaUrl?: string;
  imageUrl?: string;
  mobileImageUrl?: string;
  startDate?: string;
  endDate?: string;
  priority?: number;
  isActive?: boolean;
}

export interface UpsertFaqInput {
  category?: string;
  question: string;
  answer: string;
  sortOrder?: number;
  isPublished?: boolean;
}

/**
 * Phase 11 — CMS: legal/content pages, homepage banners, structured FAQs.
 * Public reads only surface published content; admin writes are audited at the
 * controller.
 */
@Injectable()
export class CmsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
  ) {}

  // ------------------------------------------------------------------ pages

  async getPageBySlug(slug: string) {
    const page = await this.prisma.cMSPage.findFirst({
      where: { slug: slug.toLowerCase(), isPublished: true },
    });
    if (!page) {
      throw new NotFoundException({ code: 'PAGE_NOT_FOUND', message: 'Page not found.' });
    }
    return mapPage(page);
  }

  async listPages(query: { page?: number | string; pageSize?: number | string; q?: string }) {
    const { page, take, skip } = parsePagination(query as never);
    const where: Record<string, unknown> = {};
    if (query.q) where.OR = [{ slug: { contains: query.q, mode: 'insensitive' } }, { title: { contains: query.q, mode: 'insensitive' } }];
    const [total, rows] = await Promise.all([
      this.prisma.cMSPage.count({ where: where as never }),
      this.prisma.cMSPage.findMany({ where: where as never, orderBy: { updatedAt: 'desc' }, skip, take }),
    ]);
    return buildPaginatedResponse(rows.map(mapPage), total, page, take);
  }

  async createPage(adminId: string, input: UpsertPageInput) {
    const slug = slugify(input.slug);
    const existing = await this.prisma.cMSPage.findUnique({ where: { slug } });
    if (existing) {
      throw new ConflictException({ code: 'SLUG_TAKEN', message: 'A page with this slug already exists.' });
    }
    assertPage(input);
    const page = await this.prisma.cMSPage.create({
      data: {
        slug,
        title: input.title.trim(),
        content: input.content,
        metaTitle: input.metaTitle?.trim() || null,
        metaDescription: input.metaDescription?.trim() || null,
        isPublished: input.isPublished ?? false,
        updatedBy: adminId,
      },
    });
    return mapPage(page);
  }

  async updatePage(adminId: string, id: string, input: Partial<UpsertPageInput>) {
    const page = await this.prisma.cMSPage.findUnique({ where: { id } });
    if (!page) throw new NotFoundException({ code: 'PAGE_NOT_FOUND', message: 'Page not found.' });
    if (input.slug) {
      const slug = slugify(input.slug);
      const clash = await this.prisma.cMSPage.findFirst({ where: { slug, id: { not: id } } });
      if (clash) throw new ConflictException({ code: 'SLUG_TAKEN', message: 'A page with this slug already exists.' });
    }
    if (input.title !== undefined && input.title.trim().length < 3) {
      throw new BadRequestException({ code: 'INVALID_TITLE', message: 'Title must be at least 3 characters.' });
    }
    const updated = await this.prisma.cMSPage.update({
      where: { id },
      data: {
        ...(input.slug ? { slug: slugify(input.slug) } : {}),
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.content !== undefined ? { content: input.content } : {}),
        ...(input.metaTitle !== undefined ? { metaTitle: input.metaTitle?.trim() || null } : {}),
        ...(input.metaDescription !== undefined ? { metaDescription: input.metaDescription?.trim() || null } : {}),
        ...(input.isPublished !== undefined ? { isPublished: input.isPublished } : {}),
        updatedBy: adminId,
      },
    });
    return mapPage(updated);
  }

  // ----------------------------------------------------------------- banners

  async getActiveBanners(placement?: string) {
    const now = new Date();
    const where: Record<string, unknown> = { isActive: true, deletedAt: null };
    if (placement) where.placement = placement;
    const rows = await this.prisma.banner.findMany({
      where: where as never,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
    return rows
      .filter((b: any) => (!b.startDate || b.startDate <= now) && (!b.endDate || b.endDate >= now))
      .map(mapBanner);
  }

  async listBanners() {
    const rows = await this.prisma.banner.findMany({
      where: { deletedAt: null },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(mapBanner);
  }

  async createBanner(input: UpsertBannerInput) {
    assertBanner(input);
    const row = await this.prisma.banner.create({
      data: {
        placement: input.placement as never,
        heading: input.heading?.trim() || null,
        description: input.description?.trim() || null,
        ctaText: input.ctaText?.trim() || null,
        ctaUrl: input.ctaUrl?.trim() || null,
        imageUrl: input.imageUrl!,
        mobileImageUrl: input.mobileImageUrl || null,
        startDate: input.startDate ? new Date(input.startDate) : null,
        endDate: input.endDate ? new Date(input.endDate) : null,
        priority: input.priority ?? 0,
        isActive: input.isActive ?? true,
      },
    });
    return mapBanner(row);
  }

  async updateBanner(id: string, input: Partial<UpsertBannerInput>) {
    const row = await this.prisma.banner.findFirst({ where: { id, deletedAt: null } });
    if (!row) throw new NotFoundException({ code: 'BANNER_NOT_FOUND', message: 'Banner not found.' });
    const updated = await this.prisma.banner.update({
      where: { id },
      data: {
        ...(input.placement ? { placement: input.placement as never } : {}),
        ...(input.heading !== undefined ? { heading: input.heading?.trim() || null } : {}),
        ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
        ...(input.ctaText !== undefined ? { ctaText: input.ctaText?.trim() || null } : {}),
        ...(input.ctaUrl !== undefined ? { ctaUrl: input.ctaUrl?.trim() || null } : {}),
        ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
        ...(input.mobileImageUrl !== undefined ? { mobileImageUrl: input.mobileImageUrl || null } : {}),
        ...(input.startDate !== undefined ? { startDate: input.startDate ? new Date(input.startDate) : null } : {}),
        ...(input.endDate !== undefined ? { endDate: input.endDate ? new Date(input.endDate) : null } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
    return mapBanner(updated);
  }

  async deleteBanner(id: string) {
    const row = await this.prisma.banner.findFirst({ where: { id, deletedAt: null } });
    if (!row) throw new NotFoundException({ code: 'BANNER_NOT_FOUND', message: 'Banner not found.' });
    await this.prisma.banner.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    return { deleted: true };
  }

  async uploadBannerImage(file: Express.Multer.File): Promise<{ url: string }> {
    if (!file) throw new BadRequestException({ code: 'FILE_REQUIRED', message: 'An image file is required.' });
    if (!BANNER_MIME.includes(file.mimetype)) {
      throw new BadRequestException({ code: 'INVALID_IMAGE_TYPE', message: `Image must be one of: ${BANNER_MIME.join(', ')}.` });
    }
    if (file.size > BANNER_MAX_BYTES) {
      throw new BadRequestException({ code: 'IMAGE_TOO_LARGE', message: 'Image must be 5 MB or smaller.' });
    }
    const uploaded = await this.storage.upload({
      filename: file.originalname || 'banner',
      mimetype: file.mimetype,
      buffer: file.buffer,
      folder: 'banners',
    });
    return { url: uploaded.url };
  }

  // -------------------------------------------------------------------- FAQs

  async getFaqs(): Promise<Array<{ category: string; items: Array<{ id: string; question: string; answer: string }> }>> {
    const rows = await this.prisma.faqEntry.findMany({
      where: { isPublished: true },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
    });
    const groups = new Map<string, Array<{ id: string; question: string; answer: string }>>();
    for (const r of rows) {
      const list = groups.get(r.category) ?? [];
      list.push({ id: r.id, question: r.question, answer: r.answer });
      groups.set(r.category, list);
    }
    return [...groups.entries()].map(([category, items]) => ({ category, items }));
  }

  async listFaqs() {
    return this.prisma.faqEntry.findMany({ orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }] });
  }

  async createFaq(input: UpsertFaqInput) {
    assertFaq(input);
    return this.prisma.faqEntry.create({
      data: {
        category: (input.category || 'General').trim(),
        question: input.question.trim(),
        answer: input.answer.trim(),
        sortOrder: input.sortOrder ?? 0,
        isPublished: input.isPublished ?? false,
      },
    });
  }

  async updateFaq(id: string, input: Partial<UpsertFaqInput>) {
    const row = await this.prisma.faqEntry.findUnique({ where: { id } });
    if (!row) throw new NotFoundException({ code: 'FAQ_NOT_FOUND', message: 'FAQ entry not found.' });
    if (input.question !== undefined) assertFaq({ ...input, question: input.question, answer: input.answer ?? row.answer });
    return this.prisma.faqEntry.update({
      where: { id },
      data: {
        ...(input.category !== undefined ? { category: input.category.trim() || 'General' } : {}),
        ...(input.question !== undefined ? { question: input.question.trim() } : {}),
        ...(input.answer !== undefined ? { answer: input.answer.trim() } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.isPublished !== undefined ? { isPublished: input.isPublished } : {}),
      },
    });
  }

  async deleteFaq(id: string) {
    const row = await this.prisma.faqEntry.findUnique({ where: { id } });
    if (!row) throw new NotFoundException({ code: 'FAQ_NOT_FOUND', message: 'FAQ entry not found.' });
    await this.prisma.faqEntry.delete({ where: { id } });
    return { deleted: true };
  }
}

// ------------------------------------------------------------------ helpers

function slugify(s: string): string {
  return (s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function assertPage(input: UpsertPageInput) {
  if (!slugify(input.slug)) throw new BadRequestException({ code: 'INVALID_SLUG', message: 'Slug is required.' });
  if (!input.title || input.title.trim().length < 3) {
    throw new BadRequestException({ code: 'INVALID_TITLE', message: 'Title must be at least 3 characters.' });
  }
  if (!input.content || input.content.trim().length < 10) {
    throw new BadRequestException({ code: 'INVALID_CONTENT', message: 'Content must be at least 10 characters.' });
  }
}

const PLACEMENTS = ['HOME_HERO', 'HOME_SECONDARY', 'DEALS_PAGE', 'CATEGORY_PAGE', 'MEMBERSHIP_PAGE', 'CUSTOMER_DASHBOARD'];

function assertBanner(input: UpsertBannerInput) {
  if (!PLACEMENTS.includes(input.placement)) {
    throw new BadRequestException({ code: 'INVALID_PLACEMENT', message: `Placement must be one of: ${PLACEMENTS.join(', ')}.` });
  }
  if (!input.imageUrl || !/^https?:\/\//.test(input.imageUrl)) {
    throw new BadRequestException({ code: 'IMAGE_REQUIRED', message: 'A valid imageUrl is required.' });
  }
  if (input.startDate && input.endDate && new Date(input.startDate) > new Date(input.endDate)) {
    throw new BadRequestException({ code: 'INVALID_DATES', message: 'startDate must be before endDate.' });
  }
}

function assertFaq(input: { question?: string; answer?: string }) {
  if (!input.question || input.question.trim().length < 5) {
    throw new BadRequestException({ code: 'INVALID_QUESTION', message: 'Question must be at least 5 characters.' });
  }
  if (!input.answer || input.answer.trim().length < 10) {
    throw new BadRequestException({ code: 'INVALID_ANSWER', message: 'Answer must be at least 10 characters.' });
  }
}

function mapPage(p: any) {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    content: p.content,
    metaTitle: p.metaTitle ?? null,
    metaDescription: p.metaDescription ?? null,
    isPublished: p.isPublished,
    updatedAt: new Date(p.updatedAt).toISOString(),
  };
}

function mapBanner(b: any) {
  return {
    id: b.id,
    placement: b.placement,
    imageUrl: b.imageUrl,
    mobileImageUrl: b.mobileImageUrl ?? null,
    heading: b.heading ?? null,
    description: b.description ?? null,
    ctaText: b.ctaText ?? null,
    ctaUrl: b.ctaUrl ?? null,
    startDate: b.startDate ? new Date(b.startDate).toISOString() : null,
    endDate: b.endDate ? new Date(b.endDate).toISOString() : null,
    priority: b.priority,
    isActive: b.isActive,
  };
}
