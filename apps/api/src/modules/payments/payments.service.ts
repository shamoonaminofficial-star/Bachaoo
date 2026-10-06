import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { ADMIN_OVERVIEW_CACHE_KEY } from '../admin/admin-overview.service';
import { MembershipsService } from '../memberships/memberships.service';
import { assertIntPaisa } from '../../common/utils/money';
import { parsePagination, buildPaginatedResponse } from '../../common/utils/pagination';
import { ADMIN_ROLES } from '../../common/constants';
import { GatewayFactory } from './gateways/gateway.factory';
import { ManualGateway } from './gateways/manual.gateway';
import { CreateIntentDto, PaymentOrderType } from './dto/create-intent.dto';
import { PaymentQueryDto, RefundPaymentDto } from './dto/refund.dto';

const PAYMENT_PENDING = 'PENDING';
const PAYMENT_AWAITING_VERIFICATION = 'AWAITING_VERIFICATION';
const PAYMENT_PAID = 'PAID';
const PAYMENT_REFUNDED = 'REFUNDED';
const PAYMENT_PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED';
const PAYMENT_CANCELLED = 'CANCELLED';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly memberships: MembershipsService,
    private readonly gateways: GatewayFactory,
    private readonly manualGateway: ManualGateway,
    private readonly redis: RedisService,
  ) {}

  // -------------------------------------------------------------------- intent

  /**
   * Create a payment intent. MEMBERSHIP orders delegate to the memberships
   * module (price comes from the plan); other order types create a generic
   * PENDING payment from the caller-supplied integer paisa amount.
   *
   * NOTE: for memberships prefer POST /memberships/purchase directly — it
   * returns the gateway-specific clientData via the GatewayFactory.
   */
  async createIntent(userId: string, dto: CreateIntentDto) {
    if (dto.orderType === PaymentOrderType.MEMBERSHIP) {
      if (!dto.planId) {
        throw new BadRequestException({
          code: 'PLAN_REQUIRED',
          message: 'planId is required for membership orders.',
        });
      }
      return this.memberships.purchasePlan(userId, {
        planId: dto.planId,
        gateway: dto.gateway,
      });
    }

    if (dto.amount === undefined) {
      throw new BadRequestException({
        code: 'AMOUNT_REQUIRED',
        message: 'amount (integer paisa) is required for this order type.',
      });
    }
    assertIntPaisa(dto.amount, 'amount');

    return this.prisma.payment.create({
      data: {
        userId,
        orderType: dto.orderType,
        amount: dto.amount,
        currency: 'PKR',
        gateway: dto.gateway,
        status: PAYMENT_PENDING,
        attempts: {
          create: {
            gateway: dto.gateway,
            status: PAYMENT_PENDING,
            requestPayload: { orderId: dto.orderId ?? null, amount: dto.amount } as never,
          },
        },
      },
      include: { attempts: true },
    });
  }

  // ------------------------------------------------------------------- webhook

  /**
   * Handle an incoming gateway webhook.
   *
   * 1. Resolve the gateway and verify the signature over the RAW body
   *    (NestFactory runs with rawBody: true). Each gateway implements its own
   *    documented verification scheme.
   * 2. Idempotency: if a payment with this gatewayTxnId is already PAID, the
   *    event is acknowledged without side effects — gateways retry webhooks.
   * 3. Mark PAID exactly once, then activate the membership for MEMBERSHIP
   *    orders (activation itself is idempotent).
   */
  async handleWebhook(
    gateway: string,
    payload: Record<string, unknown>,
    signature: string | undefined,
    rawBody: Buffer | undefined,
    headers: Record<string, string | string[] | undefined>,
  ) {
    const gw = this.gateways.resolve(gateway);

    if (!rawBody) {
      throw new BadRequestException({
        code: 'MISSING_RAW_BODY',
        message: 'Webhook raw body is required for signature verification.',
      });
    }
    // verifyWebhook throws on missing/invalid signature or missing config.
    const event = await gw.verifyWebhook(rawBody, signature, headers);

    // Idempotency first: already-applied transaction → acknowledge, no-op.
    const alreadyPaid = await this.prisma.payment.findFirst({
      where: { gatewayTxnId: event.gatewayTxnId, status: PAYMENT_PAID },
      select: { id: true },
    });
    if (alreadyPaid) {
      this.logger.log(`Duplicate webhook ignored: gatewayTxnId=${event.gatewayTxnId}`);
      return { paymentId: alreadyPaid.id, alreadyProcessed: true };
    }

    const payment = await this.prisma.payment.findFirst({
      where: {
        OR: [{ gatewayTxnId: event.gatewayTxnId }, ...(event.orderRef ? [{ id: event.orderRef }] : [])],
      },
    });
    if (!payment) {
      this.logger.warn(`Webhook for unknown payment: gateway=${gw.name} txn=${event.gatewayTxnId}`);
      throw new NotFoundException({
        code: 'PAYMENT_NOT_FOUND',
        message: 'No matching payment for this webhook.',
      });
    }

    // Cross-check the amount when the gateway reports it (paisa, integer).
    if (
      event.amountPaisa !== undefined &&
      Number.isInteger(event.amountPaisa) &&
      event.amountPaisa !== (payment as any).amount
    ) {
      this.logger.error(
        `Webhook amount mismatch: payment=${(payment as any).id} expected=${(payment as any).amount} got=${event.amountPaisa}`,
      );
      throw new UnprocessableEntityException({
        code: 'AMOUNT_MISMATCH',
        message: 'Webhook amount does not match the payment amount.',
      });
    }

    await this.prisma.paymentAttempt.create({
      data: {
        paymentId: (payment as any).id,
        gateway: gw.name,
        status: PAYMENT_PENDING,
        responsePayload: event.raw as never,
      },
    });

    if ((payment as any).status === PAYMENT_PAID) {
      return { paymentId: (payment as any).id, alreadyProcessed: true };
    }
    if ((payment as any).status !== PAYMENT_PENDING) {
      throw new UnprocessableEntityException({
        code: 'PAYMENT_NOT_PENDING',
        message: 'Payment is not in a payable state.',
      });
    }

    if (event.status === 'FAILED') {
      await this.prisma.$transaction(async (tx: any) => {
        await tx.payment.update({
          where: { id: (payment as any).id },
          data: { status: 'FAILED', failureReason: event.failureReason?.slice(0, 500) ?? null },
        });
        await tx.paymentAttempt.create({
          data: {
            paymentId: (payment as any).id,
            gateway: gw.name,
            status: 'FAILED',
            responsePayload: event.raw as never,
          },
        });
      });
      return { paymentId: (payment as any).id, failed: true };
    }

    const paidAt = new Date();
    const updated = await this.prisma.$transaction(async (tx: any) => {
      const p = await tx.payment.update({
        where: { id: (payment as any).id },
        data: { status: PAYMENT_PAID, paidAt, gatewayTxnId: event.gatewayTxnId },
      });
      await tx.paymentAttempt.create({
        data: {
          paymentId: p.id,
          gateway: gw.name,
          status: PAYMENT_PAID,
          responsePayload: event.raw as never,
        },
      });
      return p;
    });

    if ((updated as any).orderType === 'MEMBERSHIP') {
      // Runs in its own transaction; safe to retry thanks to idempotency.
      await this.memberships.activateMembership((updated as any).id);
    }

    return { paymentId: (updated as any).id, alreadyProcessed: false };
  }

  // ------------------------------------------------------- manual verification

  /** Admin/Finance: approve a manual bank-transfer payment (audited via @Audit). */
  async approveManualPayment(paymentId: string, adminId: string, note?: string) {
    const payment = await this.getVerifiableManualPayment(paymentId);

    const updated = await this.prisma.$transaction(async (tx: any) => {
      const p = await tx.payment.update({
        where: { id: paymentId },
        data: { status: PAYMENT_PAID, paidAt: new Date() },
      });
      await tx.paymentAttempt.create({
        data: {
          paymentId,
          gateway: (payment as any).gateway,
          status: PAYMENT_PAID,
          responsePayload: { note: note ?? null, verifiedBy: adminId } as never,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: adminId,
          actorRole: 'ADMIN',
          action: 'payment.manual-approve',
          entity: 'Payment',
          entityId: paymentId,
          newValues: { status: PAYMENT_PAID, note: note ?? null } as never,
          ip: null,
          userAgent: null,
        },
      });
      return p;
    });

    if ((updated as any).orderType === 'MEMBERSHIP') {
      await this.memberships.activateMembership((updated as any).id, adminId);
    }
    return updated;
  }

  /** Admin/Finance: reject a manual bank-transfer payment (audited via @Audit). */
  async rejectManualPayment(paymentId: string, adminId: string, reason: string) {
    const payment = await this.getVerifiableManualPayment(paymentId);

    const updated = await this.prisma.$transaction(async (tx: any) => {
      const p = await tx.payment.update({
        where: { id: paymentId },
        data: { status: PAYMENT_CANCELLED },
      });
      await tx.paymentAttempt.create({
        data: {
          paymentId,
          gateway: (payment as any).gateway,
          status: PAYMENT_CANCELLED,
          responsePayload: { reason, verifiedBy: adminId } as never,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: adminId,
          actorRole: 'ADMIN',
          action: 'payment.manual-reject',
          entity: 'Payment',
          entityId: paymentId,
          newValues: { status: PAYMENT_CANCELLED, reason } as never,
          ip: null,
          userAgent: null,
        },
      });
      return p;
    });
    // Phase 9: keep the admin overview honest (pending-payments queue).
    await this.redis.del(ADMIN_OVERVIEW_CACHE_KEY).catch(() => null);
    return updated;
  }

  private async getVerifiableManualPayment(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) {
      throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND', message: 'Payment not found.' });
    }
    if (!['BANK_TRANSFER', 'MANUAL'].includes((payment as any).gateway)) {
      throw new BadRequestException({
        code: 'NOT_MANUAL_PAYMENT',
        message: 'Only manual bank-transfer payments can be verified here.',
      });
    }
    if (![PAYMENT_PENDING, PAYMENT_AWAITING_VERIFICATION].includes((payment as any).status)) {
      throw new UnprocessableEntityException({
        code: 'PAYMENT_NOT_VERIFIABLE',
        message: 'Only pending or receipt-uploaded payments can be verified.',
      });
    }
    return payment;
  }

  // ------------------------------------------------------------------- refund

  /**
   * Issue a refund for a PAID payment. When the gateway supports programmatic
   * refunds it is called; otherwise an offline/manual refund is recorded and
   * must be executed by finance out-of-band. Audited via @Audit.
   */
  async refundPayment(paymentId: string, dto: RefundPaymentDto, adminId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) {
      throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND', message: 'Payment not found.' });
    }
    if ((payment as any).status !== PAYMENT_PAID) {
      throw new UnprocessableEntityException({
        code: 'PAYMENT_NOT_PAID',
        message: 'Only paid payments can be refunded.',
      });
    }
    const amount = dto.amount ?? (payment as any).amount;
    assertIntPaisa(amount, 'amount');
    if (amount <= 0 || amount > (payment as any).amount) {
      throw new BadRequestException({
        code: 'INVALID_REFUND_AMOUNT',
        message: 'Refund amount must be positive and not exceed the payment amount.',
      });
    }

    const gw = this.gateways.resolve((payment as any).gateway);
    let gatewayRefundId: string | null = null;
    if (typeof gw.refund === 'function') {
      const result = await gw.refund({
        paymentId,
        gatewayTxnId: (payment as any).gatewayTxnId,
        amountPaisa: amount,
        reason: dto.reason,
      });
      gatewayRefundId = result.gatewayRefundId;
    }

    const newStatus = amount === (payment as any).amount ? PAYMENT_REFUNDED : PAYMENT_PARTIALLY_REFUNDED;
    return this.prisma.$transaction(async (tx: any) => {
      const updated = await tx.payment.update({
        where: { id: paymentId },
        data: { status: newStatus },
      });
      await tx.paymentAttempt.create({
        data: {
          paymentId,
          gateway: (payment as any).gateway,
          status: newStatus,
          responsePayload: {
            refundAmountPaisa: amount,
            reason: dto.reason,
            refundedBy: adminId,
            gatewayRefundId,
            offline: gatewayRefundId === null,
          } as never,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: adminId,
          actorRole: 'ADMIN',
          action: 'payment.refund',
          entity: 'Payment',
          entityId: paymentId,
          oldValues: { status: PAYMENT_PAID } as never,
          newValues: { status: newStatus, refundAmountPaisa: amount, reason: dto.reason, gatewayRefundId } as never,
          ip: null,
          userAgent: null,
        },
      });
      return updated;
    });
  }

  // ----------------------------------------------------------------------- get

  /** Owner or admin may fetch a payment. */
  async getPayment(paymentId: string, userId: string, roles: string[]) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { attempts: { orderBy: { createdAt: 'desc' } }, manualReceipt: true },
    });
    if (!payment) {
      throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND', message: 'Payment not found.' });
    }
    const isAdmin = roles.some((r) => (ADMIN_ROLES as readonly string[]).includes(r));
    if ((payment as any).userId !== userId && !isAdmin) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You cannot view this payment.',
      });
    }
    return payment;
  }

  /** Admin: paginated payment list with status/gateway/search filters. */
  async listPaymentsAdmin(query: PaymentQueryDto) {
    const { page, pageSize, skip, take } = parsePagination(query, ['createdAt', 'amount'], 'createdAt');
    const where: any = { deletedAt: null };
    if (query.status) where.status = query.status.toUpperCase();
    if (query.gateway) where.gateway = query.gateway.toUpperCase();
    if (query.q) {
      where.OR = [
        { id: { equals: query.q } },
        { gatewayTxnId: { contains: query.q, mode: 'insensitive' } },
        { user: { email: { contains: query.q, mode: 'insensitive' } } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
          manualReceipt: { select: { id: true, receiptUrl: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.payment.count({ where }),
    ]);
    return buildPaginatedResponse(items, total, page, pageSize);
  }

  /** Public: active bank accounts for manual transfers (from SystemSetting). */
  async getBankAccounts() {
    return this.manualGateway.getBankAccounts();
  }
}
