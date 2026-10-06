import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { ROLES, ADMIN_ROLES } from '../../common/constants';
import { VouchersService } from './vouchers.service';
import { ClaimVoucherDto, CreateVoucherCampaignDto } from './dto/voucher.dto';

/**
 * Phase 10 — voucher campaigns (admin/partner), customer claiming, my vouchers.
 */
@ApiTags('vouchers')
@ApiBearerAuth()
@Controller('vouchers')
export class VouchersController {
  constructor(private readonly vouchersService: VouchersService) {}

  /** Create a voucher campaign (admin or partner for their own business). */
  @Post('campaigns')
  @Roles(...ADMIN_ROLES, ROLES.BUSINESS_OWNER, ROLES.BUSINESS_MANAGER, ROLES.MARKETING_MANAGER)
  @Audit('voucher.campaign-create')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  createCampaign(@CurrentUser() user: JwtUser, @Body() dto: CreateVoucherCampaignDto) {
    return this.vouchersService.createCampaign(user.id, user.roles, dto);
  }

  /** List campaigns (admins see all; partners see their own businesses'). */
  @Get('campaigns')
  @Roles(...ADMIN_ROLES, ROLES.BUSINESS_OWNER, ROLES.BUSINESS_MANAGER, ROLES.MARKETING_MANAGER)
  listCampaigns(@CurrentUser() user: JwtUser) {
    return this.vouchersService.listCampaigns(user.id, user.roles);
  }

  /** The signed-in customer's claimed vouchers. */
  @Get('my')
  @Roles(ROLES.CUSTOMER)
  getMyVouchers(@CurrentUser('id') userId: string) {
    return this.vouchersService.getMyVouchers(userId);
  }

  /** Claim a code without knowing the campaign id (resolves the code → campaign). */
  @Post('claim')
  @Roles(ROLES.CUSTOMER)
  @Audit('voucher.claim')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  claimVoucherByCode(@CurrentUser('id') userId: string, @Body() dto: ClaimVoucherDto) {
    return this.vouchersService.claimVoucherByCode(userId, dto.code);
  }

  /** Claim one of the campaign's pre-generated codes (atomic single-claim). */
  @Post(':id/claim')
  @Roles(ROLES.CUSTOMER)
  @Audit('voucher.claim')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  claimVoucher(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: ClaimVoucherDto,
  ) {
    return this.vouchersService.claimVoucher(userId, id, dto.code);
  }
}
