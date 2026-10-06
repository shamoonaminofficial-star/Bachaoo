import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { ADMIN_ROLES } from '../../common/constants';
import {
  CreateCategoryDto,
  CreateSubcategoryDto,
  ReorderCategoriesDto,
  ToggleCategoryDto,
  UpdateCategoryDto,
  UpdateSubcategoryDto,
} from './dto/category.dto';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  // ------------------------------------------------------------- public read

  @Public()
  @Get()
  list() {
    return this.categories.listPublic();
  }

  @Public()
  @Get(':slug')
  getBySlug(@Param('slug') slug: string) {
    return this.categories.getBySlug(slug);
  }

  // ------------------------------------------------------------------- admin

  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @Get('admin/all')
  listAdmin(@Query('includeInactive') includeInactive?: string) {
    return this.categories.listAdmin(includeInactive !== 'false');
  }

  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @Audit('category.create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateCategoryDto) {
    return this.categories.create(dto);
  }

  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @Audit('category.update')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categories.update(id, dto);
  }

  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @Audit('category.delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.categories.remove(id);
  }

  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @Audit('category.reorder')
  @Post('reorder')
  @HttpCode(HttpStatus.OK)
  reorder(@Body() dto: ReorderCategoriesDto) {
    return this.categories.reorder(dto);
  }

  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @Audit('category.toggle')
  @Patch(':id/toggle')
  toggle(@Param('id') id: string, @Body() dto: ToggleCategoryDto) {
    return this.categories.toggle(id, dto);
  }

  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @Audit('category.uploadAsset')
  @Post(':id/icon')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }))
  uploadIcon(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    return this.categories.uploadAsset(id, 'icon', file);
  }

  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @Audit('category.uploadAsset')
  @Post(':id/image')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }))
  uploadImage(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    return this.categories.uploadAsset(id, 'image', file);
  }

  // ------------------------------------------------------------ subcategories

  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @Get(':id/subcategories')
  listSubcategories(@Param('id') id: string) {
    return this.categories.listSubcategories(id);
  }

  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @Audit('category.createSubcategory')
  @Post(':id/subcategories')
  @HttpCode(HttpStatus.CREATED)
  createSubcategory(@Param('id') id: string, @Body() dto: CreateSubcategoryDto) {
    return this.categories.createSubcategory(id, dto);
  }

  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @Audit('category.updateSubcategory')
  @Patch(':id/subcategories/:subId')
  updateSubcategory(
    @Param('id') id: string,
    @Param('subId') subId: string,
    @Body() dto: UpdateSubcategoryDto,
  ) {
    return this.categories.updateSubcategory(id, subId, dto);
  }

  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @Audit('category.deleteSubcategory')
  @Delete(':id/subcategories/:subId')
  removeSubcategory(@Param('id') id: string, @Param('subId') subId: string) {
    return this.categories.removeSubcategory(id, subId);
  }
}
