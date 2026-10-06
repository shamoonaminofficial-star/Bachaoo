import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import {
  GatewayIntent,
  PaymentGateway,
  WebhookEvent,
} from './payment-gateway.interface';

/**
 * JazzCash gateway — INTEGRATION STUB.
 *
 * The interface is implemented so the rest of the platform (purchase flow,
 * webhooks, refunds) works unchanged once credentials are issued. Every method
 * currently throws NOT_CONFIGURED until the integration is completed.
 *
 * TODO(JazzCash integration) — do NOT guess the API shape; implement strictly
 * from JazzCash's merchant documentation once credentials are issued:
 *  1. createIntent(): call JazzCash's transaction API to create a payment and
 *     return the hosted-checkout redirect URL (kind: 'REDIRECT'). Required
 *     config: JAZZCASH_MERCHANT_ID, JAZZCASH_PASSWORD, JAZZCASH_INTEGRITY_SALT,
 *     JAZZCASH_RETURN_URL.
 *  2. verifyWebhook(): JazzCash posts back transaction fields. Verify using
 *     their documented "Secure Hash": SHA-256 over the sorted pp_* response
 *     fields joined with '&', plus the integrity salt. Only pp_ResponseCode
 *     '000' counts as PAID; map pp_TxnRefNo -> gatewayTxnId and echo our
 *     payment id via the merchant-provided reference field -> orderRef.
 *  3. Amounts: JazzCash expects the amount in lowest denomination — keep our
 *     integer-paisa convention and convert at the boundary only.
 */
@Injectable()
export class JazzCashGateway implements PaymentGateway {
  readonly name = 'JAZZCASH' as const;
  private readonly logger = new Logger(JazzCashGateway.name);

  private assertConfigured(): void {
    if (!process.env.JAZZCASH_MERCHANT_ID || !process.env.JAZZCASH_INTEGRITY_SALT) {
      throw new ServiceUnavailableException({
        code: 'GATEWAY_NOT_CONFIGURED',
        message:
          'JazzCash is not configured yet. Set JAZZCASH_MERCHANT_ID, JAZZCASH_PASSWORD and JAZZCASH_INTEGRITY_SALT, then complete the integration TODOs in jazzcash.gateway.ts.',
      });
    }
  }

  async createIntent(): Promise<GatewayIntent> {
    this.assertConfigured();
    // TODO: implement against JazzCash merchant docs (see class comment).
    throw new ServiceUnavailableException({
      code: 'GATEWAY_NOT_IMPLEMENTED',
      message: 'JazzCash transaction creation is not implemented yet.',
    });
  }

  async verifyWebhook(): Promise<WebhookEvent> {
    this.assertConfigured();
    // TODO: implement Secure-Hash verification against JazzCash merchant docs.
    throw new ServiceUnavailableException({
      code: 'GATEWAY_NOT_IMPLEMENTED',
      message: 'JazzCash webhook verification is not implemented yet.',
    });
  }
}
