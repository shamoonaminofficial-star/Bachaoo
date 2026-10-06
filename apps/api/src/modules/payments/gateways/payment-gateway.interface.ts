/**
 * Modular payment gateway architecture for Bachatly.
 *
 * Adding a new gateway = create a class implementing PaymentGateway and
 * register it in PaymentsModule's GATEWAYS provider. No other changes needed.
 *
 * SECURITY RULES (enforced by callers, documented here):
 * - Never accept the amount from the client: the amount always comes from the
 *   server-side Payment row (plan price, voucher price, ...).
 * - Never store card numbers / CVV. Gateways return opaque tokens/ids only.
 * - Webhook authenticity is verified over the RAW request body (rawBody: true)
 *   before any state change. Idempotency is enforced on gatewayTxnId.
 */

export type GatewayName = 'STRIPE' | 'JAZZCASH' | 'EASYPASA' | 'BANK_TRANSFER' | 'MANUAL';

/** What the client should do next to complete the payment. */
export type IntentKind = 'MANUAL_INSTRUCTIONS' | 'REDIRECT' | 'CLIENT_SECRET' | 'MOBILE_WALLET';

export interface GatewayIntent {
  kind: IntentKind;
  /** Gateway-specific payload: bank accounts, redirect URL, client secret... */
  clientData: Record<string, unknown>;
}

/** Normalized event parsed from a verified webhook. */
export interface WebhookEvent {
  /** The gateway's transaction id (idempotency key). */
  gatewayTxnId: string;
  /** Our payment id echoed back by the gateway (when supported). */
  orderRef?: string;
  /** Amount in integer paisa, for cross-checking against the Payment row. */
  amountPaisa?: number;
  status: 'PAID' | 'FAILED';
  failureReason?: string;
  raw: Record<string, unknown>;
}

export interface RefundRequest {
  paymentId: string;
  gatewayTxnId?: string | null;
  /** Integer paisa. Omit for a full refund. */
  amountPaisa?: number;
  reason: string;
}

export interface RefundResult {
  gatewayRefundId: string;
  amountPaisa: number;
}

export interface PaymentGateway {
  readonly name: GatewayName;

  /**
   * Build the client-facing instructions for a PENDING payment.
   * The payment (id, amount in paisa, currency) is passed server-side —
   * gateways must NEVER take the amount from client input.
   */
  createIntent(payment: {
    id: string;
    amount: number;
    currency: string;
    userId: string;
  }): Promise<GatewayIntent>;

  /**
   * Verify the webhook signature over the RAW body and parse the event.
   * Must throw UnauthorizedException (or a Nest HttpException) when the
   * signature is missing/invalid or the secret is not configured.
   */
  verifyWebhook(
    rawBody: Buffer,
    signature: string | undefined,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<WebhookEvent>;

  /**
   * Optional: issue a refund through the gateway.
   * Gateways that don't support programmatic refunds omit this — the
   * PaymentsService then records a manual/offline refund instead.
   */
  refund?(req: RefundRequest): Promise<RefundResult>;
}
