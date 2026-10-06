import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { ADMIN_ROLES } from '../../common/constants';
import { CreateIntentDto } from './dto/create-intent.dto';
import { PaymentQueryDto, RefundPaymentDto } from './dto/refund.dto';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @ApiBearerAuth()
  @Post('intent')
  @HttpCode(HttpStatus.CREATED)
  createIntent(@CurrentUser('id') userId: string, @Body() dto: CreateIntentDto) {
    return this.payments.createIntent(userId, dto);
  }

  /** Public: bank accounts for manual transfers (active only, no secrets). */
  @Public()
  @Get('bank-accounts')
  bankAccounts() {
    return this.payments.getBankAccounts();
  }

  /**
   * Gateway webhook receiver. @Public() because gateways can't hold our JWT —
   * authenticity comes from per-gateway signature verification over the RAW
   * body (NestFactory was created with { rawBody: true }).
   */
  @Public()
  @Post('webhook/:gateway')
  @HttpCode(HttpStatus.OK)
  webhook(
    @Param('gateway') gateway: string,
    @Req() req: { headers: Record<string, string | string[] | undefined>; rawBody?: Buffer },
    @Body() body: Record<string, unknown>,
  ) {
    const headers = req.headers;
    const signature =
      (headers['x-gateway-signature'] as string) ||
      (headers['stripe-signature'] as string) ||
      (headers['x-signature'] as string);
    return this.payments.handleWebhook(gateway, body, signature, req.rawBody, headers);
  }

  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @Permissions('payment.read')
  @Get('admin')
  listAdmin(@Query() query: PaymentQueryDto) {
    return this.payments.listPaymentsAdmin(query);
  }

  @ApiBearerAuth()
  @Get(':id')
  getPayment(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.payments.getPayment(id, user.id, user.roles);
  }

  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @Permissions('payment.refund')
  @Audit('payment.refund')
  @Post(':id/refund')
  @HttpCode(HttpStatus.OK)
  refund(
    @CurrentUser('id') adminId: string,
    @Param('id') id: string,
    @Body() dto: RefundPaymentDto,
  ) {
    return this.payments.refundPayment(id, dto, adminId);
  }

  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @Permissions('payment.verify')
  @Audit('payment.manual-approve')
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  approveManual(
    @CurrentUser('id') adminId: string,
    @Param('id') id: string,
    @Body() body: { note?: string },
  ) {
    return this.payments.approveManualPayment(id, adminId, body?.note);
  }

  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @Permissions('payment.verify')
  @Audit('payment.manual-reject')
  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  rejectManual(
    @CurrentUser('id') adminId: string,
    @Param('id') id: string,
    @Body() body: { reason: string },
  ) {
    return this.payments.rejectManualPayment(id, adminId, body?.reason);
  }
}
