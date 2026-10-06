import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { RedemptionsService } from './redemptions.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { ADMIN_ROLES, REDEMPTION_STAFF_ROLES, ROLES } from '../../common/constants';
import { CreateQrDto } from './dto/create-qr.dto';
import { ValidateQrDto } from './dto/validate-qr.dto';
import { ConfirmRedemptionDto } from './dto/confirm-redemption.dto';

@ApiTags('redemptions')
@ApiBearerAuth()
@Controller('redemptions')
export class RedemptionsController {
  constructor(private readonly redemptions: RedemptionsService) {}

  /**
   * Issue a signed, short-lived QR token for the current customer.
   * Runs the full eligibility gate before signing. Rate-limited to 10/min.
   * The JWT carries only { jti, dealId, branchId?, exp } — ownership lives
   * in the server-side Redis issuance record.
   */
  @Roles(ROLES.CUSTOMER)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('qr')
  @HttpCode(HttpStatus.CREATED)
  createQr(@CurrentUser('id') userId: string, @Body() dto: CreateQrDto) {
    return this.redemptions.createQrToken(userId, dto);
  }

  /**
   * Partner scan step: verify a QR token and return customer/deal context.
   * Does NOT mark the token used. Staff roles only.
   */
  @Roles(...REDEMPTION_STAFF_ROLES)
  @Post('validate')
  @HttpCode(HttpStatus.OK)
  validate(@CurrentUser() staff: JwtUser, @Body() dto: ValidateQrDto) {
    return this.redemptions.validateQrToken(staff.id, staff.roles, dto);
  }

  /**
   * Confirm a redemption from a scanned QR token. Server recomputes ALL money
   * math (discount, paid, saving, cashback, points) inside one DB transaction
   * and snapshots it. Replay-protected via atomic Redis SET NX. Staff roles only.
   */
  @Roles(...REDEMPTION_STAFF_ROLES)
  @Post('confirm')
  @HttpCode(HttpStatus.CREATED)
  confirm(@CurrentUser() staff: JwtUser, @Body() dto: ConfirmRedemptionDto) {
    return this.redemptions.confirmRedemption(staff.id, staff.roles, dto);
  }

  /** Paginated redemption history for the current customer. */
  @Roles(ROLES.CUSTOMER)
  @Get('history')
  history(
    @CurrentUser('id') userId: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    return this.redemptions.getHistory(userId, parseInt(page, 10) || 1, parseInt(pageSize, 10) || 20);
  }

  /**
   * Customer savings dashboard: totals + by-category + by-month, all in
   * integer paisa, aggregated from the immutable SavingsTransaction ledger.
   */
  @Roles(ROLES.CUSTOMER)
  @Get('savings/summary')
  savingsSummary(@CurrentUser('id') userId: string) {
    return this.redemptions.getSavingsSummary(userId);
  }

  /** Paginated redemption list for platform admins (support/finance review). */
  @Roles(...ADMIN_ROLES)
  @Get('admin')
  adminList(
    @Query('status') status?: string,
    @Query('businessId') businessId?: string,
    @Query('q') q?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    return this.redemptions.getAdminRedemptions({
      status,
      businessId,
      q,
      page: parseInt(page, 10) || 1,
      pageSize: parseInt(pageSize, 10) || 20,
    });
  }

  /** Redeem-button state: { eligible, reasons[] } (never throws). */
  @Roles(ROLES.CUSTOMER)
  @Get('deal/:id/eligibility')
  eligibility(
    @CurrentUser('id') userId: string,
    @Param('id') dealId: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.redemptions.getEligibility(userId, dealId, branchId);
  }
}
