import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ADMIN_ROLES, ROLES } from '../../common/constants';
import { AnalyticsService } from './analytics.service';

/**
 * Phase 12 — platform analytics.
 *
 * Device/channel splits are intentionally omitted: the platform does not
 * track device or channel attribution yet, so no such breakdown is claimed.
 */
@ApiTags('analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /** Admin: platform trends over a date range (cached 10 min per range). */
  @Get('admin/overview')
  @Roles(...ADMIN_ROLES)
  adminOverview(@Query('from') from?: string, @Query('to') to?: string) {
    return this.analyticsService.adminOverview(from, to);
  }

  /** Per-business analytics (delegates to the canonical partner implementation). */
  @Get('business/:id')
  @Roles(...ADMIN_ROLES, ROLES.BUSINESS_OWNER, ROLES.BUSINESS_MANAGER)
  businessAnalytics(
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analyticsService.businessAnalytics(id, from, to);
  }

  /** Caller-level savings/redemption trends (feeds the savings page). */
  @Get('customer/me')
  @Roles(ROLES.CUSTOMER)
  myAnalytics(@CurrentUser('id') userId: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.analyticsService.customerAnalytics(userId, from, to);
  }
}
