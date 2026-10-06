import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationChannel,
  SendResult,
} from './notification-channel.interface';

/**
 * SMS adapter — STUB (SMS-ready architecture).
 * To activate: set SMS_PROVIDER=twilio|jazz|telenor plus provider credentials
 * (SMS_PROVIDER_KEY etc. — see .env.example), implement the HTTP call in
 * send(), and return configured=true.
 */
@Injectable()
export class SmsChannel implements NotificationChannel {
  readonly channel = 'sms' as const;
  private readonly logger = new Logger(SmsChannel.name);

  get configured(): boolean {
    return Boolean(process.env.SMS_PROVIDER && process.env.SMS_PROVIDER_KEY);
  }

  async send(to: string, _subject: string, text: string): Promise<SendResult> {
    if (!this.configured) {
      this.logger.log(`[dev-sms] to=${to} text="${text.slice(0, 120)}"`);
      return { ok: true, channel: 'sms', reason: 'dev-log (SMS provider not configured)' };
    }
    // TODO: provider HTTP call here.
    return { ok: false, channel: 'sms', reason: 'SMS provider integration pending' };
  }
}

/**
 * WhatsApp adapter — STUB (WhatsApp-ready architecture).
 * To activate: set WHATSAPP_PROVIDER=meta-cloud plus WHATSAPP_PROVIDER_KEY and
 * a template name (WHATSAPP_TEMPLATE_OTP), then implement the Graph API call.
 */
@Injectable()
export class WhatsappChannel implements NotificationChannel {
  readonly channel = 'whatsapp' as const;
  private readonly logger = new Logger(WhatsappChannel.name);

  get configured(): boolean {
    return Boolean(process.env.WHATSAPP_PROVIDER && process.env.WHATSAPP_PROVIDER_KEY);
  }

  async send(to: string, _subject: string, text: string): Promise<SendResult> {
    if (!this.configured) {
      this.logger.log(`[dev-whatsapp] to=${to} text="${text.slice(0, 120)}"`);
      return { ok: true, channel: 'whatsapp', reason: 'dev-log (WhatsApp provider not configured)' };
    }
    // TODO: Meta WhatsApp Cloud API call here.
    return { ok: false, channel: 'whatsapp', reason: 'WhatsApp provider integration pending' };
  }
}
