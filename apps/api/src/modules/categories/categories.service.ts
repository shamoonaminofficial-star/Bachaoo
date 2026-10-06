import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { STORAGE_SERVICE, IStorageService } from '../../common/storage/storage.interface';
import { Prisma } from '@prisma/client';
import {
  CreateCategoryDto,
  CreateSubcategoryDto,
  ReorderCategoriesDto,
  ToggleCategoryDto,
  UpdateCategoryDto,
  UpdateSubcategoryDto,
} from './dto/category.dto';

export const CATEGORY_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
export const CATEGORY_IMAGE_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const categorySelect = {
  id: true,
  name: true,
  slug: true,
  icon: true,
  image: true,
  sortOrder: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Category taxonomy with unlimited subcategories.
 * Public reads show active categories ordered by sortOrder with live counts.
 * Deletes are soft; a category with live businesses/deals cannot be deleted (409).
 */
@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
  ) {}

  // ------------------------------------------------------------------ public

  async listPublic() {
    const now = new Date();
    const categories = await this.prisma.category.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      select: {
        ...categorySelect,
        subcategories: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          select: { id: true, name: true, slug: true, sortOrder: true },
        },
      },
    });
    const dealCounts = await this.prisma.deal.groupBy({
      by: ['categoryId'],
      where: {
        status: 'PUBLISHED',
        startDate: { lte: now },
        endDate: { gte: now },
        business: { isActive: true, deletedAt: null },
      },
      _count: { id: true },
    });
    const countByCategory = new Map(dealCounts.map((d) => [d.categoryId, d._count.id]));
    return categories.map((c) => ({
      ...c,
      subcategoryCount: c.subcategories.length,
      activeDealCount: countByCategory.get(c.id) ?? 0,
    }));
  }

  async getBySlug(slug: string) {
    const category = await this.prisma.category.findFirst({
      where: { slug, deletedAt: null },
      select: {
        ...categorySelect,
        subcategories: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          select: { id: true, name: true, slug: true, sortOrder: true },
        },
      },
    });
    if (!category || !category.isActive) {
      throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND', message: 'Category not found.' });
    }
    return category;
  }

  // ------------------------------------------------------------------- admin

  async listAdmin(includeInactive = true) {
    return this.prisma.category.findMany({
      where: { deletedAt: null, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: { sortOrder: 'asc' },
      select: {
        ...categorySelect,
        _count: { select: { subcategories: true, businesses: true, deals: true } },
      },
    });
  }

  async create(dto: CreateCategoryDto) {
    const slug = dto.slug ?? slugify(dto.name);
    const existing = await this.prisma.category.findFirst({ where: { slug, deletedAt: null } });
    if (existing) {
      throw new ConflictException({ code: 'CATEGORY_SLUG_EXISTS', message: 'A category with this slug already exists.' });
    }
    const maxOrder = await this.prisma.category.aggregate({ _max: { sortOrder: true }, where: { deletedAt: null } });
    return this.prisma.category.create({
      data: {
        name: dto.name,
        slug,
        icon: dto.icon,
        image: dto.image,
        sortOrder: dto.sortOrder ?? (maxOrder._max.sortOrder ?? -1) + 1,
      },
      select: categorySelect,
    });
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.assertExists(id);
    if (dto.slug) {
      const clash = await this.prisma.category.findFirst({ where: { slug: dto.slug, deletedAt: null, NOT: { id } } });
      if (clash) throw new ConflictException({ code: 'CATEGORY_SLUG_EXISTS', message: 'A category with this slug already exists.' });
    }
    return this.prisma.category.update({ where: { id }, data: dto, select: categorySelect });
  }

  /** Soft-delete. Refuses when live businesses or deals reference the category. */
  async remove(id: string) {
    const category = await this.assertExists(id);
    const [businesses, deals] = await Promise.all([
      this.prisma.business.count({ where: { categoryId: id, deletedAt: null } }),
      this.prisma.deal.count({ where: { categoryId: id, status: { in: ['PUBLISHED', 'PENDING_APPROVAL', 'APPROVED'] } } }),
    ]);
    if (businesses > 0 || deals > 0) {
      throw new ConflictException({
        code: 'CATEGORY_IN_USE',
        message: 'Category cannot be deleted while businesses or live deals use it.',
        details: { businesses, deals },
      });
    }
    await this.prisma.category.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    return { deleted: true, id: category.id };
  }

  /** Reorder: ids in desired display order; sortOrder is rewritten 0..n in a transaction. */
  async reorder(dto: ReorderCategoriesDto) {
    const unique = [...new Set(dto.ids)];
    if (unique.length !== dto.ids.length) {
      throw new BadRequestException({ code: 'DUPLICATE_IDS', message: 'Reorder list contains duplicate ids.' });
    }
    const existing = await this.prisma.category.findMany({ where: { id: { in: unique }, deletedAt: null }, select: { id: true } });
    if (existing.length !== unique.length) {
      throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND', message: 'One or more categories do not exist.' });
    }
    await this.prisma.$transaction(
      unique.map((id, index) => this.prisma.category.update({ where: { id }, data: { sortOrder: index } })),
    );
    return this.listAdmin();
  }

  async toggle(id: string, dto: ToggleCategoryDto) {
    await this.assertExists(id);
    return this.prisma.category.update({ where: { id }, data: { isActive: dto.isActive }, select: categorySelect });
  }

  /** Upload icon or image for a category. Validates MIME + size before storing. */
  async uploadAsset(id: string, kind: 'icon' | 'image', file: Express.Multer.File) {
    await this.assertExists(id);
    this.validateImage(file);
    const { url } = await this.storage.upload({ filename: file.originalname, mimetype: file.mimetype, buffer: file.buffer, folder: 'categories' });
    const data: Prisma.CategoryUpdateInput = kind === 'icon' ? { icon: url } : { image: url };
    return this.prisma.category.update({ where: { id }, data, select: categorySelect });
  }

  // ------------------------------------------------------------ subcategories

  async listSubcategories(categoryId: string) {
    await this.assertExists(categoryId);
    return this.prisma.subcategory.findMany({
      where: { categoryId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createSubcategory(categoryId: string, dto: CreateSubcategoryDto) {
    await this.assertExists(categoryId);
    const slug = slugify(dto.name);
    const existing = await this.prisma.subcategory.findUnique({ where: { categoryId_slug: { categoryId, slug } } });
    if (existing) throw new ConflictException({ code: 'SUBCATEGORY_EXISTS', message: 'This subcategory already exists.' });
    const maxOrder = await this.prisma.subcategory.aggregate({ _max: { sortOrder: true }, where: { categoryId } });
    return this.prisma.subcategory.create({
      data: { categoryId, name: dto.name, slug, sortOrder: dto.sortOrder ?? (maxOrder._max.sortOrder ?? -1) + 1 },
    });
  }

  async updateSubcategory(categoryId: string, subcategoryId: string, dto: UpdateSubcategoryDto) {
    const sub = await this.prisma.subcategory.findFirst({ where: { id: subcategoryId, categoryId } });
    if (!sub) throw new NotFoundException({ code: 'SUBCATEGORY_NOT_FOUND', message: 'Subcategory not found.' });
    const data: Prisma.SubcategoryUpdateInput = { ...dto };
    if (dto.name) {
      const slug = slugify(dto.name);
      const clash = await this.prisma.subcategory.findFirst({ where: { categoryId, slug, NOT: { id: subcategoryId } } });
      if (clash) throw new ConflictException({ code: 'SUBCATEGORY_EXISTS', message: 'This subcategory already exists.' });
      data.slug = slug;
    }
    return this.prisma.subcategory.update({ where: { id: subcategoryId }, data });
  }

  async removeSubcategory(categoryId: string, subcategoryId: string) {
    const sub = await this.prisma.subcategory.findFirst({ where: { id: subcategoryId, categoryId } });
    if (!sub) throw new NotFoundException({ code: 'SUBCATEGORY_NOT_FOUND', message: 'Subcategory not found.' });
    const deals = await this.prisma.deal.count({ where: { subcategoryId, status: { in: ['PUBLISHED', 'PENDING_APPROVAL', 'APPROVED'] } } });
    if (deals > 0) {
      throw new ConflictException({ code: 'SUBCATEGORY_IN_USE', message: 'Subcategory cannot be deleted while live deals use it.', details: { deals } });
    }
    await this.prisma.subcategory.delete({ where: { id: subcategoryId } });
    return { deleted: true, id: subcategoryId };
  }

  // ----------------------------------------------------------------- helpers

  private async assertExists(id: string) {
    const category = await this.prisma.category.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
    if (!category) throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND', message: 'Category not found.' });
    return category;
  }

  private validateImage(file: Express.Multer.File) {
    if (!file) throw new BadRequestException({ code: 'FILE_REQUIRED', message: 'An image file is required.' });
    if (!CATEGORY_IMAGE_MIME.includes(file.mimetype)) {
      throw new BadRequestException({
        code: 'INVALID_IMAGE_TYPE',
        message: `Image must be one of: ${CATEGORY_IMAGE_MIME.join(', ')}.`,
      });
    }
    if (file.size > CATEGORY_IMAGE_MAX_BYTES) {
      throw new BadRequestException({ code: 'IMAGE_TOO_LARGE', message: 'Image must be 2 MB or smaller.' });
    }
  }
}
