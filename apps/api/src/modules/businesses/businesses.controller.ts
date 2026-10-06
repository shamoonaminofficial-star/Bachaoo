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
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BusinessesService } from './businesses.service';
import { Public } from '../../common/decorators/public.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { ADMIN_ROLES, ROLES } from '../../common/constants';
import { Throttle } from '@nestjs/throttler';
import { PartnerDashboardService } from './partner-dashboard.service';
import { PartnerAnalyticsService } from './partner-analytics.service';
import { StaffService } from './staff.service';
import {
  InviteStaffDto,
  PartnerAnalyticsQueryDto,
  PartnerRedemptionQueryDto,
  UpdateStaffRoleDto,
} from './dto/staff.dto';
import {
  BusinessQueryDto,
  CreateBusinessDto,
  SuspendBusinessDto,
  UpdateBusinessDto,
} from './dto/business.dto';
import {
  ApplicationQueryDto,
  CreateApplicationDto,
  ReviewApplicationDto,
} from './dto/application.dto';

const OWNER_ROLES = [ROLES.BUSINESS_OWNER, ROLES.BUSINESS_MANAGER] as const;

@ApiTags('businesses')
@Controller('businesses')
export class BusinessesController {
  constructor(
    private readonly businesses: BusinessesService,
    private readonly partnerDashboard: PartnerDashboardService,
    private readonly partnerAnalytics: PartnerAnalyticsService,
    private readonly staff: StaffService,
  ) {}

  // ------------------------------------------------------------- public read

  @Public()
  @Get()
  list(@Query() query: BusinessQueryDto) {
    return this.businesses.listPublic(query);
  }

  // ------------------------------------------------------ partner application

  @Public()
  @Post('applications')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'logo', maxCount: 1 },
        { name: 'documents', maxCount: 5 },
      ],
      { limits: { fileSize: 5 * 1024 * 1024 } },
    ),
  )
  submitApplication(
    @Body() dto: CreateApplicationDto,
    @UploadedFiles() files: { logo?: Express.Multer.File[]; documents?: Express.Multer.File[] },
    @CurrentUser() user?: JwtUser,
  ) {
    return this.businesses.submitApplication(dto, files ?? {}, user?.id);
  }

  @ApiBearerAuth()
  @Get('applications/mine')
  myApplications(@CurrentUser() user: JwtUser) {
    return this.businesses.myApplications(user.id, user.email);
  }

  // ------------------------------------------------------------ owner routes
  // NOTE: 'mine' is declared before ':slug' so it isn't captured as a slug.

  @ApiBearerAuth()
  @Roles(...OWNER_ROLES, ...ADMIN_ROLES)
  @Get('mine')
  myBusinesses(@CurrentUser('id') userId: string) {
    return this.businesses.myBusinesses(userId);
  }

  // ------------------------------------------------------- Phase 8: partner

  /**
   * Aggregated partner dashboard for one business. `?businessId=` picks the
   * business for multi-business owners; defaults to their first business.
   */
  @ApiBearerAuth()
  @Roles(...OWNER_ROLES, ...ADMIN_ROLES)
  @Get('mine/dashboard')
  myDashboard(@CurrentUser() user: JwtUser, @Query('businessId') businessId?: string) {
    return this.businesses.myDashboard(user.id, user.roles, businessId);
  }

  /** Partner-scoped analytics: redemptions/savings by day, hourly heat, top branches. */
  @ApiBearerAuth()
  @Roles(...OWNER_ROLES, ...ADMIN_ROLES)
  @Get('mine/:id/analytics')
  async myAnalytics(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Query() query: PartnerAnalyticsQueryDto,
  ) {
    await this.businesses.assertCanManage(user.id, user.roles, id);
    return this.partnerAnalytics.getAnalytics(id, query.from, query.to);
  }

  /** Partner redemption ledger with filters + frozen calculation snapshots. */
  @ApiBearerAuth()
  @Roles(...OWNER_ROLES, ...ADMIN_ROLES)
  @Get('mine/:id/redemptions')
  async myRedemptions(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Query() query: PartnerRedemptionQueryDto,
  ) {
    await this.businesses.assertCanManage(user.id, user.roles, id);
    return this.partnerDashboard.listRedemptions(id, query);
  }

  // ---------------------------------------------------------- Phase 8: staff

  /** List active staff of a business. */
  @ApiBearerAuth()
  @Roles(...OWNER_ROLES, ...ADMIN_ROLES)
  @Get('mine/:id/staff')
  async listStaff(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    await this.businesses.assertCanManage(user.id, user.roles, id);
    return this.staff.listStaff(id);
  }

  /**
   * Invite staff by email. Existing users are linked immediately; otherwise a
   * pending invitation with an accept token is created. Rate-limited.
   */
  @ApiBearerAuth()
  @Roles(...OWNER_ROLES, ...ADMIN_ROLES)
  @Audit('business.staff.invite')
  @Throttle({ default: { limit: 10, ttl: 600000 } })
  @Post('mine/:id/staff')
  async inviteStaff(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: InviteStaffDto) {
    await this.businesses.assertCanManage(user.id, user.roles, id);
    return this.staff.inviteStaff(user.id, id, dto);
  }

  /** Change a staff member's role (last-owner protection applies). */
  @ApiBearerAuth()
  @Roles(...OWNER_ROLES, ...ADMIN_ROLES)
  @Audit('business.staff.updateRole')
  @Patch('mine/:id/staff/:staffId')
  async updateStaffRole(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('staffId') staffId: string,
    @Body() dto: UpdateStaffRoleDto,
  ) {
    await this.businesses.assertCanManage(user.id, user.roles, id);
    return this.staff.updateStaffRole(id, staffId, dto);
  }

  /** Remove a staff member (last-owner protection applies). */
  @ApiBearerAuth()
  @Roles(...OWNER_ROLES, ...ADMIN_ROLES)
  @Audit('business.staff.remove')
  @Delete('mine/:id/staff/:staffId')
  async removeStaff(@CurrentUser() user: JwtUser, @Param('id') id: string, @Param('staffId') staffId: string) {
    await this.businesses.assertCanManage(user.id, user.roles, id);
    return this.staff.removeStaff(id, staffId);
  }

  /**
   * Accept a staff invitation (token from the invite link). The signed-in
   * user's email must match the invited email. Any authenticated user may
   * call this — the email match IS the authorization.
   */
  @ApiBearerAuth()
  @Post('staff-invitations/:token/accept')
  acceptStaffInvitation(@CurrentUser('id') userId: string, @Param('token') token: string) {
    return this.staff.acceptInvitation(userId, token);
  }

  @ApiBearerAuth()
  @Roles(...OWNER_ROLES, ...ADMIN_ROLES)
  @Audit('business.updateMine')
  @Patch('mine/:id')
  updateMine(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdateBusinessDto,
  ) {
    return this.businesses.updateMine(user.id, user.roles, id, dto);
  }

  @ApiBearerAuth()
  @Roles(...OWNER_ROLES, ...ADMIN_ROLES)
  @Audit('business.uploadMineLogo')
  @Post('mine/:id/logo')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 3 * 1024 * 1024 } }))
  uploadMineLogo(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.businesses.uploadMineAsset(user.id, user.roles, id, 'logo', file);
  }

  @ApiBearerAuth()
  @Roles(...OWNER_ROLES, ...ADMIN_ROLES)
  @Audit('business.uploadMineCover')
  @Post('mine/:id/cover')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 3 * 1024 * 1024 } }))
  uploadMineCover(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.businesses.uploadMineAsset(user.id, user.roles, id, 'cover', file);
  }

  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @Get('admin/all')
  adminList(@Query() query: BusinessQueryDto) {
    return this.businesses.listAdmin(query);
  }

  @Public()
  @Get(':slug')
  getBySlug(@Param('slug') slug: string) {
    return this.businesses.getBySlug(slug);
  }

  // ------------------------------------------------------------------- admin

  @ApiBearerAuth()
  @Permissions('business.create')
  @Audit('business.create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateBusinessDto) {
    return this.businesses.create(dto);
  }

  @ApiBearerAuth()
  @Permissions('business.update')
  @Audit('business.update')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBusinessDto) {
    return this.businesses.update(id, dto);
  }

  @ApiBearerAuth()
  @Permissions('business.approve')
  @Audit('business.verify')
  @Post(':id/verify')
  @HttpCode(HttpStatus.OK)
  verify(@Param('id') id: string) {
    return this.businesses.verify(id);
  }

  @ApiBearerAuth()
  @Permissions('business.update')
  @Audit('business.suspend')
  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  suspend(@Param('id') id: string, @Body() dto: SuspendBusinessDto) {
    return this.businesses.suspend(id, dto);
  }

  @ApiBearerAuth()
  @Permissions('business.update')
  @Audit('business.reactivate')
  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  reactivate(@Param('id') id: string) {
    return this.businesses.reactivate(id);
  }

  @ApiBearerAuth()
  @Permissions('business.update')
  @Audit('business.delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.businesses.remove(id);
  }

  // ------------------------------------------------- admin application review

  @ApiBearerAuth()
  @Permissions('business.approve')
  @Get('applications')
  listApplications(@Query() query: ApplicationQueryDto) {
    return this.businesses.listApplications(query);
  }

  @ApiBearerAuth()
  @Permissions('business.approve')
  @Get('applications/:id')
  getApplication(@Param('id') id: string) {
    return this.businesses.getApplication(id);
  }

  @ApiBearerAuth()
  @Permissions('business.approve')
  @Audit('business.applicationReview')
  @Post('applications/:id/review')
  @HttpCode(HttpStatus.OK)
  markUnderReview(@CurrentUser('id') adminId: string, @Param('id') id: string) {
    return this.businesses.markUnderReview(adminId, id);
  }

  @ApiBearerAuth()
  @Permissions('business.approve')
  @Audit('business.applicationApprove')
  @Post('applications/:id/approve')
  @HttpCode(HttpStatus.OK)
  approveApplication(@CurrentUser('id') adminId: string, @Param('id') id: string) {
    return this.businesses.approveApplication(adminId, id);
  }

  @ApiBearerAuth()
  @Permissions('business.approve')
  @Audit('business.applicationReject')
  @Post('applications/:id/reject')
  @HttpCode(HttpStatus.OK)
  rejectApplication(
    @CurrentUser('id') adminId: string,
    @Param('id') id: string,
    @Body() dto: ReviewApplicationDto,
  ) {
    return this.businesses.rejectApplication(adminId, id, dto);
  }

  @ApiBearerAuth()
  @Permissions('business.approve')
  @Audit('business.applicationRequestInfo')
  @Post('applications/:id/request-info')
  @HttpCode(HttpStatus.OK)
  requestInfo(
    @CurrentUser('id') adminId: string,
    @Param('id') id: string,
    @Body() dto: ReviewApplicationDto,
  ) {
    return this.businesses.requestInfo(adminId, id, dto);
  }
}
