import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ADMIN_ROLES, ROLES } from '../../common/constants';
import { CmsService, UpsertPageInput, UpsertBannerInput, UpsertFaqInput } from './cms.service';

class UpsertPageDto implements UpsertPageInput {
  @IsString() @MinLength(1) @MaxLength(120)
  slug!: string;

  @IsString() @MinLength(3) @MaxLength(200)
  title!: string;

  @IsString() @MinLength(10)
  content!: string;

  @IsString() @IsOptional() @MaxLength(200)
  metaTitle?: string;

  @IsString() @IsOptional() @MaxLength(400)
  metaDescription?: string;

  @IsBoolean() @IsOptional()
  isPublished?: boolean;
}

class UpdatePageDto {
  @IsString() @IsOptional() @MaxLength(120)
  slug?: string;

  @IsString() @IsOptional() @MaxLength(200)
  title?: string;

  @IsString() @IsOptional()
  content?: string;

  @IsString() @IsOptional() @MaxLength(200)
  metaTitle?: string;

  @IsString() @IsOptional() @MaxLength(400)
  metaDescription?: string;

  @IsBoolean() @IsOptional()
  isPublished?: boolean;
}

class UpsertBannerDto implements UpsertBannerInput {
  @IsIn(['HOME_HERO', 'HOME_SECONDARY', 'DEALS_PAGE', 'CATEGORY_PAGE', 'MEMBERSHIP_PAGE', 'CUSTOMER_DASHBOARD'])
  placement!: string;

  @IsString() @IsOptional() @MaxLength(120)
  heading?: string;

  @IsString() @IsOptional() @MaxLength(500)
  description?: string;

  @IsString() @IsOptional() @MaxLength(40)
  ctaText?: string;

  @IsString() @IsOptional() @MaxLength(500)
  ctaUrl?: string;

  @IsString() @IsOptional()
  imageUrl?: string;

  @IsString() @IsOptional()
  mobileImageUrl?: string;

  @IsString() @IsOptional()
  startDate?: string;

  @IsString() @IsOptional()
  endDate?: string;

  @IsInt() @Min(0) @IsOptional()
  priority?: number;

  @IsBoolean() @IsOptional()
  isActive?: boolean;
}

class UpsertFaqDto implements UpsertFaqInput {
  @IsString() @IsOptional() @MaxLength(60)
  category?: string;

  @IsString() @MinLength(5) @MaxLength(300)
  question!: string;

  @IsString() @MinLength(10)
  answer!: string;

  @IsInt() @Min(0) @IsOptional()
  sortOrder?: number;

  @IsBoolean() @IsOptional()
  isPublished?: boolean;
}

/**
 * Phase 11 — CMS.
 * Public reads: /cms/pages/:slug, /cms/banners/active, /cms/faqs.
 * Admin writes: /cms/admin/* (ADMIN + CONTENT_MANAGER).
 */
@ApiTags('cms')
@ApiBearerAuth()
@Controller('cms')
export class CmsController {
  constructor(private readonly cmsService: CmsService) {}

  // ------------------------------------------------------------------ public

  @Public()
  @Get('pages/:slug')
  getPage(@Param('slug') slug: string) {
    return this.cmsService.getPageBySlug(slug);
  }

  @Public()
  @Get('banners/active')
  getActiveBanners(@Query('placement') placement?: string) {
    return this.cmsService.getActiveBanners(placement);
  }

  @Public()
  @Get('faqs')
  getFaqs() {
    return this.cmsService.getFaqs();
  }

  // ------------------------------------------------------------------- admin

  @Roles(...ADMIN_ROLES, ROLES.CONTENT_MANAGER)
  @Get('admin/pages')
  listPages(@Query() query: { page?: number; pageSize?: number; q?: string }) {
    return this.cmsService.listPages(query);
  }

  @Roles(...ADMIN_ROLES, ROLES.CONTENT_MANAGER)
  @Post('admin/pages')
  @Audit('cms.page-create')
  createPage(@CurrentUser('id') adminId: string, @Body() dto: UpsertPageDto) {
    return this.cmsService.createPage(adminId, dto);
  }

  @Roles(...ADMIN_ROLES, ROLES.CONTENT_MANAGER)
  @Patch('admin/pages/:id')
  @Audit('cms.page-update')
  updatePage(@CurrentUser('id') adminId: string, @Param('id') id: string, @Body() dto: UpdatePageDto) {
    return this.cmsService.updatePage(adminId, id, dto);
  }

  @Roles(...ADMIN_ROLES, ROLES.CONTENT_MANAGER)
  @Get('admin/banners')
  listBanners() {
    return this.cmsService.listBanners();
  }

  @Roles(...ADMIN_ROLES, ROLES.CONTENT_MANAGER)
  @Post('admin/banners')
  @Audit('cms.banner-create')
  createBanner(@Body() dto: UpsertBannerDto) {
    return this.cmsService.createBanner(dto);
  }

  @Roles(...ADMIN_ROLES, ROLES.CONTENT_MANAGER)
  @Patch('admin/banners/:id')
  @Audit('cms.banner-update')
  updateBanner(@Param('id') id: string, @Body() dto: Partial<UpsertBannerDto>) {
    return this.cmsService.updateBanner(id, dto);
  }

  @Roles(...ADMIN_ROLES, ROLES.CONTENT_MANAGER)
  @Delete('admin/banners/:id')
  @Audit('cms.banner-delete')
  deleteBanner(@Param('id') id: string) {
    return this.cmsService.deleteBanner(id);
  }

  @Roles(...ADMIN_ROLES, ROLES.CONTENT_MANAGER)
  @Post('admin/banners/upload')
  @Audit('cms.banner-upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  uploadBannerImage(@UploadedFile() file: Express.Multer.File) {
    return this.cmsService.uploadBannerImage(file);
  }

  @Roles(...ADMIN_ROLES, ROLES.CONTENT_MANAGER)
  @Get('admin/faqs')
  listFaqs() {
    return this.cmsService.listFaqs();
  }

  @Roles(...ADMIN_ROLES, ROLES.CONTENT_MANAGER)
  @Post('admin/faqs')
  @Audit('cms.faq-create')
  createFaq(@Body() dto: UpsertFaqDto) {
    return this.cmsService.createFaq(dto);
  }

  @Roles(...ADMIN_ROLES, ROLES.CONTENT_MANAGER)
  @Patch('admin/faqs/:id')
  @Audit('cms.faq-update')
  updateFaq(@Param('id') id: string, @Body() dto: Partial<UpsertFaqDto>) {
    return this.cmsService.updateFaq(id, dto);
  }

  @Roles(...ADMIN_ROLES, ROLES.CONTENT_MANAGER)
  @Delete('admin/faqs/:id')
  @Audit('cms.faq-delete')
  deleteFaq(@Param('id') id: string) {
    return this.cmsService.deleteFaq(id);
  }
}
