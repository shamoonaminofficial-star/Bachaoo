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
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DealsService } from './deals.service';
import { Public } from '../../common/decorators/public.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { ADMIN_ROLES, ROLES } from '../../common/constants';
import { CreateDealDto } from './dto/create-deal.dto';
import { UpdateDealDto } from './dto/update-deal.dto';
import { DealQueryDto, DealQueueQueryDto, MyDealsQueryDto } from './dto/deal-query.dto';

const OWNER_ROLES = [ROLES.BUSINESS_OWNER, ROLES.BUSINESS_MANAGER] as const;

@ApiTags('deals')
@Controller('deals')
export class DealsController {
  constructor(private readonly deals: DealsService) {}

  // ------------------------------------------------------------- public read

  @Public()
  @Get()
  list(@Query() query: DealQueryDto) {
    return this.deals.listDeals(query);
  }

  // ------------------------------------------------------------ partner read

  @ApiBearerAuth()
  @Roles(...OWNER_ROLES)
  @Get('mine')
  myDeals(@CurrentUser('id') userId: string, @Query() query: MyDealsQueryDto) {
    return this.deals.myDeals(userId, query);
  }

  // ------------------------------------------------------------ admin queue
  // NOTE: declared before ':slug' so it isn't captured as a slug.

  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @Permissions('deal.approve')
  @Get('admin/queue')
  queue(@Query() query: DealQueueQueryDto) {
    return this.deals.queue(query);
  }

  @Public()
  @Get(':slug')
  getBySlug(@Param('slug') slug: string, @CurrentUser('id') userId?: string) {
    // userId is undefined for anonymous callers (optional auth) — the detail
    // still renders; eligibility just reports NOT_LOGGED_IN.
    return this.deals.getBySlug(slug, userId);
  }

  // ------------------------------------------------------------ partner write

  @ApiBearerAuth()
  @Roles(...OWNER_ROLES)
  @Audit('deal.create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser('id') userId: string, @Body() dto: CreateDealDto) {
    return this.deals.create(userId, dto);
  }

  @ApiBearerAuth()
  @Roles(...OWNER_ROLES)
  @Audit('deal.update')
  @Patch(':id')
  update(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: UpdateDealDto) {
    return this.deals.update(userId, id, dto);
  }

  @ApiBearerAuth()
  @Roles(...OWNER_ROLES)
  @Audit('deal.duplicate')
  @Post(':id/duplicate')
  @HttpCode(HttpStatus.CREATED)
  duplicate(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.deals.duplicate(userId, id);
  }

  @ApiBearerAuth()
  @Roles(...OWNER_ROLES)
  @Audit('deal.upload-images')
  @Post(':id/images')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FilesInterceptor('files', 8, { limits: { fileSize: 2 * 1024 * 1024 } }))
  uploadImages(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.deals.uploadImages(userId, id, files ?? []);
  }

  @ApiBearerAuth()
  @Roles(...OWNER_ROLES)
  @Audit('deal.delete-image')
  @Delete('images/:imageId')
  deleteImage(@CurrentUser('id') userId: string, @Param('imageId') imageId: string) {
    return this.deals.deleteImage(userId, imageId);
  }

  @ApiBearerAuth()
  @Roles(...OWNER_ROLES)
  @Audit('deal.submit')
  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  submit(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.deals.submitForApproval(userId, id);
  }

  @ApiBearerAuth()
  @Roles(...OWNER_ROLES)
  @Audit('deal.pause')
  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  pause(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.deals.pause(userId, id);
  }

  @ApiBearerAuth()
  @Roles(...OWNER_ROLES)
  @Audit('deal.resume')
  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  resume(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.deals.resume(userId, id);
  }

  /**
   * Publish an APPROVED deal. Partners publish their own; admins any.
   */
  @ApiBearerAuth()
  @Roles(...OWNER_ROLES, ...ADMIN_ROLES)
  @Audit('deal.publish')
  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  publish(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.deals.publish(user.id, user.roles, id);
  }

  @ApiBearerAuth()
  @Roles(...OWNER_ROLES)
  @Audit('deal.delete')
  @Delete(':id')
  remove(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.deals.remove(userId, id);
  }

  // ------------------------------------------------------------ admin review

  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @Permissions('deal.approve')
  @Audit('deal.approve')
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  approve(@CurrentUser('id') adminId: string, @Param('id') id: string) {
    return this.deals.approve(adminId, id);
  }

  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @Permissions('deal.approve')
  @Audit('deal.reject')
  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  reject(
    @CurrentUser('id') adminId: string,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.deals.reject(adminId, id, body?.reason);
  }

  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @Permissions('deal.approve')
  @Audit('deal.request-changes')
  @Post(':id/request-changes')
  @HttpCode(HttpStatus.OK)
  requestChanges(
    @CurrentUser('id') adminId: string,
    @Param('id') id: string,
    @Body() body: { notes?: string },
  ) {
    return this.deals.requestChanges(adminId, id, body?.notes);
  }
}
