import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import {
  GatewayIntent,
  PaymentGateway,
  WebhookEvent,
} from './payment-gateway.interface';

/**
 * Easypaisa gateway — INTEGRATION STUB.
 *
 * The interface is implemented so the rest of the platform (purchase flow,
 * webhooks, refunds) works unchanged once credentials are issued. Every method
 * currently throws NOT_CONFIGURED until the integration is completed.
 *
 * TODO(Easypaisa integration) — do NOT guess the API shape; implement strictly
 * from Easypaisa's merchant documentation once credentials are issued:
 *  1. createIntent(): initiate a transaction via Easypaisa's merchant API and
 *     return either the hosted payment URL (kind: 'REDIRECT') or the
 *     mobile-account OTP flow payload (kind: 'MOBILE_WALLET'). Required config:
 *     EASYPASA_STORE_ID, EASYPASA_API_KEY / credentials, EASYPASA_RETURN_URL.
 *  2. verifyWebhook(): Easypaisa notifies via their documented callback. Verify
 *     using their documented hash over the transaction response payload plus
 *     the store secret. Map their transaction id -> gatewayTxnId and echo our
 *     payment id via the merchant order id -> orderRef. Only their documented
 *     success status counts as PAID.
 *  3. Amounts: keep our integer-paisa convention; convert at the boundary only.
 */
@Injectable()
export class EasypaisaGateway implements PaymentGateway {
  readonly name = 'EASYPASA' as const;
  private readonly logger = new Logger(EasypaisaGateway.name);

  private assertConfigured(): void {
    if (!process.env.EASYPASA_STORE_ID || !process.env.EASYPASA_API_KEY) {
      throw new ServiceUnavailableException({
        code: 'GATEWAY_NOT_CONFIGURED',
        message:
          'Easypaisa is not configured yet. Set EASYPASA_STORE_ID and EASYPASA_API_KEY, then complete the integration TODOs in easypaisa.gateway.ts.',
      });
    }
  }

  async createIntent(): Promise<GatewayIntent> {
    this.assertConfigured();
    // TODO: implement against Easypaisa merchant docs (see class comment).
    throw new ServiceUnavailableException({
      code: 'GATEWAY_NOT_IMPLEMENTED',
      message: 'Easypaisa transaction creation is not implemented yet.',
    });
  }

  async verifyWebhook(): Promise<WebhookEvent> {
    this.assertConfigured();
    // TODO: implement callback-hash verification against Easypaisa merchant docs.
    throw new ServiceUnavailableException({
      code: 'GATEWAY_NOT_IMPLEMENTED',
      message: 'Easypaisa webhook verification is not implemented yet.',
    });
  }
}
