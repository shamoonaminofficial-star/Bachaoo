import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { ROLES, ADMIN_ROLES } from '../../common/constants';
import { CashbackService } from './cashback.service';
import { ModerateWithdrawalDto, WithdrawCashbackDto } from './dto/cashback.dto';

/**
 * Phase 10 — cashback balances, approval workflow, withdrawals.
 */
@ApiTags('cashback')
@ApiBearerAuth()
@Controller('cashback')
export class CashbackController {
  constructor(private readonly cashbackService: CashbackService) {}

  /** Signed-in customer's cashback summary (paisa). */
  @Get()
  @Roles(ROLES.CUSTOMER)
  getCashbackSummary(@CurrentUser('id') userId: string) {
    return this.cashbackService.getSummary(userId);
  }

  /** Signed-in customer's cashback ledger. */
  @Get('transactions')
  @Roles(ROLES.CUSTOMER)
  getCashbackTransactions(
    @CurrentUser('id') userId: string,
    @Query() query: { page?: number; pageSize?: number },
  ) {
    return this.cashbackService.getTransactions(userId, query);
  }

  /**
   * Request a withdrawal. Idempotent via `Idempotency-Key` header (or
   * `idempotencyKey` body field) — retries replay the stored response.
   */
  @Post('withdraw')
  @Roles(ROLES.CUSTOMER)
  @Audit('cashback.withdraw-request')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  withdraw(
    @CurrentUser('id') userId: string,
    @Body() dto: WithdrawCashbackDto,
    @Headers('idempotency-key') headerKey: string | undefined,
  ) {
    return this.cashbackService.withdraw(userId, dto, headerKey ?? dto.idempotencyKey);
  }

  /** The signed-in customer's withdrawal history (account numbers masked). */
  @Get('withdrawals')
  @Roles(ROLES.CUSTOMER)
  listWithdrawals(
    @CurrentUser('id') userId: string,
    @Query() query: { page?: number; pageSize?: number },
  ) {
    return this.cashbackService.listWithdrawals(userId, query);
  }

  /** Admin queue of PENDING cashback. */
  @Get('admin/pending')
  @Roles(...ADMIN_ROLES, ROLES.FINANCE_MANAGER)
  pendingList(@Query() query: { page?: number; pageSize?: number }) {
    return this.cashbackService.pendingList(query);
  }

  /** Approve a PENDING cashback row. */
  @Post(':id/approve')
  @Roles(...ADMIN_ROLES, ROLES.FINANCE_MANAGER)
  @Audit('cashback.approve')
  approve(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.cashbackService.approveCashback(user.id, id);
  }

  /** Reject a PENDING cashback row (reason required). */
  @Post(':id/reject')
  @Roles(...ADMIN_ROLES, ROLES.FINANCE_MANAGER)
  @Audit('cashback.reject')
  reject(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() body: { reason: string }) {
    return this.cashbackService.rejectCashback(user.id, id, body?.reason);
  }

  /** Admin queue of PENDING withdrawal requests. */
  @Get('admin/withdrawals/pending')
  @Roles(...ADMIN_ROLES, ROLES.FINANCE_MANAGER)
  pendingWithdrawals(@Query() query: { page?: number; pageSize?: number }) {
    return this.cashbackService.pendingWithdrawals(query);
  }

  /** Approve a withdrawal (records the payout reference). */
  @Patch('admin/withdrawals/:id/approve')
  @Roles(...ADMIN_ROLES, ROLES.FINANCE_MANAGER)
  @Audit('cashback.withdrawal-approve')
  approveWithdrawal(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: ModerateWithdrawalDto,
  ) {
    return this.cashbackService.approveWithdrawal(user.id, id, dto.payoutReference);
  }

  /** Reject a withdrawal (reason required; reservation released). */
  @Patch('admin/withdrawals/:id/reject')
  @Roles(...ADMIN_ROLES, ROLES.FINANCE_MANAGER)
  @Audit('cashback.withdrawal-reject')
  rejectWithdrawal(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: ModerateWithdrawalDto,
  ) {
    return this.cashbackService.rejectWithdrawal(user.id, id, dto.reason ?? '');
  }
}
