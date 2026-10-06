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
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MembershipsService } from './memberships.service';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ADMIN_ROLES } from '../../common/constants';
import { PurchasePlanDto } from './dto/purchase-plan.dto';
import { ManualReceiptDto } from './dto/manual-receipt.dto';
import { CreatePlanDto, UpdatePlanDto } from './dto/plan.dto';
import {
  AssignMembershipDto,
  CancelMembershipDto,
  ExtendMembershipDto,
  MembershipQueryDto,
} from './dto/manage-membership.dto';

@ApiTags('memberships')
@Controller('memberships')
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  /** Public: list active membership plans. */
  @Public()
  @Get('plans')
  plans() {
    return this.memberships.listPlans();
  }

  // ------------------------------------------------------------------ purchase

  /**
   * Start a membership purchase. Rate-limited: 10/min per IP.
   * The price always comes from the plan row — never from the client.
   */
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Audit('membership.purchase')
  @Post('purchase')
  @HttpCode(HttpStatus.CREATED)
  purchase(@CurrentUser('id') userId: string, @Body() dto: PurchasePlanDto) {
    return this.memberships.purchasePlan(userId, dto);
  }

  /**
   * Upload proof of a bank transfer (multipart `file`: image/PDF ≤5 MB).
   * Moves the payment to AWAITING_VERIFICATION.
   */
  @ApiBearerAuth()
  @Audit('membership.manual-receipt')
  @Post('manual-receipt/:paymentId')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  uploadReceipt(
    @CurrentUser('id') userId: string,
    @Param('paymentId') paymentId: string,
    @Body() dto: ManualReceiptDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.memberships.uploadManualReceipt(userId, paymentId, dto, file);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser('id') userId: string) {
    return this.memberships.getMyMembership(userId);
  }

  @ApiBearerAuth()
  @Get('history')
  history(@CurrentUser('id') userId: string) {
    return this.memberships.getHistory(userId);
  }

  /** Customer cancels their own active membership (reason recorded + audited). */
  @ApiBearerAuth()
  @Audit('membership.cancelMine')
  @Post('me/cancel')
  @HttpCode(HttpStatus.OK)
  cancelMine(@CurrentUser('id') userId: string, @Body() dto: CancelMembershipDto) {
    return this.memberships.cancelMyMembership(userId, dto);
  }

  // ------------------------------------------------------------------ admin: plans

  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @Permissions('membership.read')
  @Get('plans/admin')
  plansAdmin() {
    return this.memberships.listPlansAdmin();
  }

  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @Permissions('membership.manage')
  @Audit('membership.plan-create')
  @Post('plans')
  @HttpCode(HttpStatus.CREATED)
  createPlan(@Body() dto: CreatePlanDto) {
    return this.memberships.createPlan(dto);
  }

  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @Permissions('membership.manage')
  @Audit('membership.plan-update')
  @Patch('plans/:id')
  updatePlan(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.memberships.updatePlan(id, dto);
  }

  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @Permissions('membership.manage')
  @Audit('membership.plan-delete')
  @Delete('plans/:id')
  deletePlan(@Param('id') id: string) {
    return this.memberships.deletePlan(id);
  }

  // ------------------------------------------------------------ admin: memberships

  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @Permissions('membership.read')
  @Get('admin')
  listAdmin(@Query() query: MembershipQueryDto) {
    return this.memberships.listMembershipsAdmin(query);
  }

  /**
   * Hook for the notifications module (Phase 11): memberships expiring soon.
   * Declared before ':id/*' routes so it isn't captured as an id.
   */
  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @Permissions('membership.read')
  @Get('expiring-soon')
  expiringSoon(@Query('days') days?: string) {
    const n = Math.min(Math.max(parseInt(days ?? '7', 10) || 7, 1), 60);
    return this.memberships.getExpiringSoon(n);
  }

  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @Permissions('membership.manage')
  @Audit('membership.assign')
  @Post('admin/assign')
  @HttpCode(HttpStatus.CREATED)
  assign(@CurrentUser('id') actorId: string, @Body() dto: AssignMembershipDto) {
    return this.memberships.assignMembership(dto, actorId);
  }

  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @Permissions('membership.manage')
  @Audit('membership.extend')
  @Post(':id/extend')
  @HttpCode(HttpStatus.OK)
  extend(@CurrentUser('id') actorId: string, @Param('id') id: string, @Body() dto: ExtendMembershipDto) {
    return this.memberships.extendMembership(id, dto, actorId);
  }

  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @Permissions('membership.manage')
  @Audit('membership.cancel')
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@CurrentUser('id') actorId: string, @Param('id') id: string, @Body() dto: CancelMembershipDto) {
    return this.memberships.cancelMembership(id, dto, actorId);
  }
}
