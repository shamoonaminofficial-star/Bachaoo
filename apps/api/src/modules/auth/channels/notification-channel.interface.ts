/**
 * Outbound messaging contract for auth flows (OTP, email verification,
 * password reset). Implementations are channel adapters; the dispatch service
 * picks one based on the requested channel.
 *
 * Status: EMAIL is fully implemented (nodemailer SMTP from env).
 * SMS and WhatsApp adapters are READY-STUBS — wire a provider (Jazz/Telenor
 * gateway, Twilio, Meta WhatsApp Cloud API) and flip the `configured` flag.
 */
export type OtpChannel = 'email' | 'sms' | 'whatsapp';

export interface SendResult {
  ok: boolean;
  channel: OtpChannel;
  /** Provider message id when available. */
  providerId?: string;
  /** Human-readable reason when ok === false. */
  reason?: string;
}

export interface NotificationChannel {
  readonly channel: OtpChannel;
  /** True when provider credentials are configured for this channel. */
  readonly configured: boolean;
  send(to: string, subject: string, text: string, html?: string): Promise<SendResult>;
}
