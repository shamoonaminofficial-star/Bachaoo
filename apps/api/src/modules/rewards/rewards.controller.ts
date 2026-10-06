import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { ROLES, ADMIN_ROLES } from '../../common/constants';
import { RewardsService } from './rewards.service';
import { AdjustPointsDto } from './dto/reward.dto';
import { CreateRewardDto, UpdateRewardDto } from './dto/create-reward.dto';

/**
 * Phase 10 — points economy: account, ledger, catalog, redemption, admin adjust.
 */
@ApiTags('rewards')
@ApiBearerAuth()
@Controller('rewards')
export class RewardsController {
  constructor(private readonly rewardsService: RewardsService) {}

  /** The signed-in customer's points balance. */
  @Get('account')
  @Roles(ROLES.CUSTOMER)
  getAccount(@CurrentUser('id') userId: string) {
    return this.rewardsService.getAccount(userId);
  }

  /** The signed-in customer's immutable points ledger. */
  @Get('transactions')
  @Roles(ROLES.CUSTOMER)
  getTransactions(@CurrentUser('id') userId: string, @Query() query: { page?: number; pageSize?: number }) {
    return this.rewardsService.getTransactions(userId, query);
  }

  /** Public rewards catalog (points → voucher). */
  @Get('catalog')
  @Roles(ROLES.CUSTOMER, ...ADMIN_ROLES)
  getCatalog() {
    return this.rewardsService.getCatalog();
  }

  /**
   * Redeem a catalog reward. Idempotent: send the same `Idempotency-Key`
   * header (or `idempotencyKey` body field) on retries — the stored response
   * is replayed instead of debiting twice.
   */
  @Post(':id/redeem')
  @Roles(ROLES.CUSTOMER)
  @Audit('reward.redeem')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  redeemReward(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Headers('idempotency-key') headerKey: string | undefined,
    @Body() body: { idempotencyKey?: string },
  ) {
    return this.rewardsService.redeemReward(userId, id, headerKey ?? body?.idempotencyKey);
  }

  /** Admin: create a rewards-catalog entry (points → voucher). */
  @Post()
  @Roles(...ADMIN_ROLES)
  @Audit('reward.create')
  createReward(@Body() dto: CreateRewardDto) {
    return this.rewardsService.createReward(dto);
  }

  /** Admin: update a rewards-catalog entry. */
  @Patch(':id')
  @Roles(...ADMIN_ROLES)
  @Audit('reward.update')
  updateReward(@Param('id') id: string, @Body() dto: UpdateRewardDto) {
    return this.rewardsService.updateReward(id, dto);
  }

  /** Admin: soft-delete a rewards-catalog entry. */
  @Delete(':id')
  @Roles(...ADMIN_ROLES)
  @Audit('reward.delete')
  deleteReward(@Param('id') id: string) {
    return this.rewardsService.deleteReward(id);
  }

  /** Admin point adjustment (audited; negative needs SUPER_ADMIN + note). */
  @Post('adjust')
  @Roles(...ADMIN_ROLES)
  @Audit('reward.adjust')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  adjustPoints(@CurrentUser() user: JwtUser, @Body() dto: AdjustPointsDto) {
    return this.rewardsService.adjustPoints(user.id, user.roles, dto);
  }
}
