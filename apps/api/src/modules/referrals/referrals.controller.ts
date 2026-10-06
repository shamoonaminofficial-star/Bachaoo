import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ROLES, ADMIN_ROLES } from '../../common/constants';
import { ReferralsService } from './referrals.service';
import { ApplyReferralDto } from './dto/referral.dto';

/**
 * Phase 10 — referrals: my code, stats, post-signup apply, admin list.
 */
@ApiTags('referrals')
@ApiBearerAuth()
@Controller('referrals')
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  /** The signed-in user's shareable referral code + link. */
  @Get('my-code')
  @Roles(ROLES.CUSTOMER)
  getMyCode(@CurrentUser('id') userId: string) {
    return this.referralsService.getMyCode(userId);
  }

  /** Real referral stats — counts and rewards earned. */
  @Get('stats')
  @Roles(ROLES.CUSTOMER)
  getStats(@CurrentUser('id') userId: string) {
    return this.referralsService.getStats(userId);
  }

  /**
   * Apply someone else's referral code (within 7 days of signup, one code per
   * user, never your own code).
   */
  @Post('apply')
  @Roles(ROLES.CUSTOMER)
  @Audit('referral.apply')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  applyReferralCode(@CurrentUser('id') userId: string, @Body() dto: ApplyReferralDto) {
    return this.referralsService.applyCode(userId, dto.code);
  }

  /** Admin: referral list with status filter (paginated). */
  @Get('admin')
  @Roles(...ADMIN_ROLES)
  adminList(@CurrentUser('id') _adminId: string) {
    return this.referralsService.adminList();
  }

  /** Admin: one referral's detail + rewards. */
  @Get('admin/:id')
  @Roles(...ADMIN_ROLES)
  adminDetail(@Param('id') id: string) {
    return this.referralsService.adminDetail(id);
  }
}
