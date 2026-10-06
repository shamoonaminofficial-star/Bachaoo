import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { ADMIN_ROLES, ROLES } from '../../common/constants';
import { SettlementsService } from './settlements.service';
import { CancelSettlementDto, MarkPaidDto, RunSettlementDto, SettlementQueryDto } from './dto/settlement.dto';

/**
 * Phase 12 — settlement batches.
 *
 * A settlement is the platform's commission invoice to a business for a
 * period (netAmount = what the business owes the platform). mark-paid records
 * the business's payment; the weekly cron only generates PENDING drafts.
 */
@ApiTags('settlements')
@ApiBearerAuth()
@Controller('settlements')
export class SettlementsController {
  constructor(private readonly settlements: SettlementsService) {}

  /** Admin: list settlement batches with filters. */
  @Get()
  @Roles(...ADMIN_ROLES, ROLES.FINANCE_MANAGER)
  list(@Query() query: SettlementQueryDto) {
    return this.settlements.listSettlements(query);
  }

  /** Partner: own business settlements. */
  @Get('business/:id')
  @Roles(...ADMIN_ROLES, ROLES.FINANCE_MANAGER, ROLES.BUSINESS_OWNER, ROLES.BUSINESS_MANAGER)
  businessSettlements(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.settlements.businessSettlements(user.id, user.roles, id);
  }

  /** Admin: run settlement aggregation for a period (idempotent per business+period). */
  @Post('run')
  @Roles(...ADMIN_ROLES, ROLES.FINANCE_MANAGER)
  @Audit('settlement.run')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  run(@Body() dto: RunSettlementDto) {
    return this.settlements.runSettlement(dto);
  }

  /** Admin/finance: mark a settlement paid with the business's payout reference. */
  @Post(':id/mark-paid')
  @Roles(...ADMIN_ROLES, ROLES.FINANCE_MANAGER)
  @Audit('settlement.mark-paid')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  markPaid(@Param('id') id: string, @Body() dto: MarkPaidDto) {
    return this.settlements.markPaid(id, dto);
  }

  /** Admin: cancel a settlement with a reason (entries return to ACCRUED). */
  @Post(':id/cancel')
  @Roles(...ADMIN_ROLES)
  @Audit('settlement.cancel')
  cancel(@Param('id') id: string, @Body() dto: CancelSettlementDto) {
    return this.settlements.cancelSettlement(id, dto);
  }
}
