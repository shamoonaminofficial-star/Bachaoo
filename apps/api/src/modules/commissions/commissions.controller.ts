import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { ADMIN_ROLES, ROLES } from '../../common/constants';
import { CommissionsService } from './commissions.service';
import { AdjustCommissionDto, CommissionQueryDto, CommissionRuleDto } from './dto/commission.dto';

/**
 * Phase 12 — commission ledger + rate rules.
 *
 * Commission accrues automatically inside the redemption confirm transaction
 * (immutable CommissionEntry rows). Adjustments are new signed rows.
 */
@ApiTags('commissions')
@ApiBearerAuth()
@Controller('commissions')
export class CommissionsController {
  constructor(private readonly commissions: CommissionsService) {}

  /** Admin: commission ledger with filters. */
  @Get()
  @Roles(...ADMIN_ROLES, ROLES.FINANCE_MANAGER)
  list(@Query() query: CommissionQueryDto) {
    return this.commissions.listCommissions(query);
  }

  /** Partner: own business commission ledger. */
  @Get('business/:id')
  @Roles(...ADMIN_ROLES, ROLES.FINANCE_MANAGER, ROLES.BUSINESS_OWNER, ROLES.BUSINESS_MANAGER)
  businessLedger(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.commissions.businessCommissions(user.id, user.roles, id);
  }

  /** Admin: adjust a commission entry (new signed ADJUSTMENT row). */
  @Post(':id/adjust')
  @Roles(...ADMIN_ROLES)
  @Audit('commission.adjust')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  adjust(@Param('id') id: string, @Body() dto: AdjustCommissionDto) {
    return this.commissions.adjustCommission(id, dto);
  }

  // ------------------------------------------------------------- rate rules

  /** Admin: commission rate rules (BUSINESS > CATEGORY > GLOBAL precedence). */
  @Get('rules')
  @Roles(...ADMIN_ROLES)
  rules() {
    return this.commissions.listRules();
  }

  @Post('rules')
  @Roles(...ADMIN_ROLES)
  @Audit('commission.rule-create')
  createRule(@Body() dto: CommissionRuleDto) {
    return this.commissions.createRule(dto);
  }

  @Patch('rules/:id')
  @Roles(...ADMIN_ROLES)
  @Audit('commission.rule-update')
  updateRule(@Param('id') id: string, @Body() dto: Partial<CommissionRuleDto>) {
    return this.commissions.updateRule(id, dto);
  }

  @Delete('rules/:id')
  @Roles(...ADMIN_ROLES)
  @Audit('commission.rule-delete')
  deleteRule(@Param('id') id: string) {
    return this.commissions.deleteRule(id);
  }
}
