import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import {
  GatewayIntent,
  PaymentGateway,
  WebhookEvent,
} from './payment-gateway.interface';

/**
 * Stripe gateway — READY STUB.
 *
 * Webhook signature verification is implemented (it follows Stripe's public,
 * stable `Stripe-Signature: t=...,v1=...` scheme: HMAC-SHA256 over
 * "<timestamp>.<rawBody>" with the webhook endpoint secret). Intent creation
 * and event parsing are marked TODO until STRIPE_SECRET_KEY is set and the
 * `stripe` SDK is added as a dependency.
 *
 * TODO(Stripe):
 *  1. `pnpm add stripe`; createIntent() should create a PaymentIntent for
 *     payment.amount (paisa -> Stripe expects the smallest currency unit, so
 *     pass paisa through directly for PKR) and return kind 'CLIENT_SECRET'.
 *  2. verifyWebhook(): after signature verification below, parse the event
 *     JSON — handle `payment_intent.succeeded` (-> PAID) and
 *     `payment_intent.payment_failed` (-> FAILED), mapping
 *     data.object.id -> gatewayTxnId and our payment id from
 *     data.object.metadata.bachatlyPaymentId -> orderRef.
 *  3. refund(): implement via Stripe's Refunds API (idempotency key =
 *     `bachatly-refund-${paymentId}`).
 */
@Injectable()
export class StripeGateway implements PaymentGateway {
  readonly name = 'STRIPE' as const;
  private readonly logger = new Logger(StripeGateway.name);

  private assertConfigured(): void {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new ServiceUnavailableException({
        code: 'GATEWAY_NOT_CONFIGURED',
        message:
          'Stripe is not configured yet. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET, add the stripe SDK, then complete the TODOs in stripe.gateway.ts.',
      });
    }
  }

  async createIntent(): Promise<GatewayIntent> {
    this.assertConfigured();
    // TODO: create a Stripe PaymentIntent (see class comment).
    throw new ServiceUnavailableException({
      code: 'GATEWAY_NOT_IMPLEMENTED',
      message: 'Stripe PaymentIntent creation is not implemented yet.',
    });
  }

  async verifyWebhook(
    rawBody: Buffer,
    signature: string | undefined,
  ): Promise<WebhookEvent> {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      throw new ServiceUnavailableException({
        code: 'GATEWAY_NOT_CONFIGURED',
        message: 'STRIPE_WEBHOOK_SECRET is not set.',
      });
    }
    if (!signature) {
      throw new UnauthorizedException({
        code: 'INVALID_SIGNATURE',
        message: 'Missing Stripe-Signature header.',
      });
    }
    // Stripe-Signature: t=<timestamp>,v1=<hex hmac>
    const parts = Object.fromEntries(
      signature.split(',').map((p) => {
        const [k, v] = p.split('=');
        return [k?.trim(), v?.trim()];
      }),
    );
    const timestamp = parts['t'];
    const v1 = parts['v1'];
    if (!timestamp || !v1 || !/^[a-f0-9]+$/i.test(v1)) {
      throw new UnauthorizedException({
        code: 'INVALID_SIGNATURE',
        message: 'Malformed Stripe-Signature header.',
      });
    }
    // Tolerance: reject webhooks older than 5 minutes (replay protection).
    const ageSec = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
    if (!Number.isFinite(ageSec) || ageSec < 0 || ageSec > 300) {
      throw new UnauthorizedException({
        code: 'STALE_WEBHOOK',
        message: 'Webhook timestamp is outside the tolerance window.',
      });
    }
    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody.toString('utf8')}`, 'utf8')
      .digest('hex');
    const a = Buffer.from(v1, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new UnauthorizedException({
        code: 'INVALID_SIGNATURE',
        message: 'Stripe webhook signature verification failed.',
      });
    }

    // Signature is valid. Event parsing is TODO until the stripe SDK is wired
    // (see class comment) — fail closed rather than guessing the payload shape.
    throw new ServiceUnavailableException({
      code: 'GATEWAY_NOT_IMPLEMENTED',
      message: 'Stripe event parsing is not implemented yet.',
    });
  }
}
