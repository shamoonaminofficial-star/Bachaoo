import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationChannel,
  SendResult,
} from './notification-channel.interface';

/**
 * Working email sender via nodemailer + SMTP credentials from env:
 *   EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASSWORD, EMAIL_FROM, EMAIL_SECURE
 *
 * nodemailer is dynamically imported so the app boots even before
 * `pnpm install` brings the dependency in (dev convenience only —
 * package.json lists it as a real dependency).
 */
@Injectable()
export class EmailChannel implements NotificationChannel {
  readonly channel = 'email' as const;
  private readonly logger = new Logger(EmailChannel.name);

  get configured(): boolean {
    return Boolean(process.env.EMAIL_HOST && process.env.EMAIL_USER);
  }

  private async getTransporter(): Promise<any> {
    // Dynamic import keeps the module loadable without the dep installed.
    const nodemailer = await import('nodemailer');
    const port = parseInt(process.env.EMAIL_PORT || '587', 10);
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port,
      secure: (process.env.EMAIL_SECURE || (port === 465 ? 'true' : 'false')) === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });
  }

  async send(to: string, subject: string, text: string, html?: string): Promise<SendResult> {
    if (!this.configured) {
      // Dev fallback: log instead of sending so auth flows stay testable.
      this.logger.log(`[dev-email] to=${to} subject="${subject}" text="${text.slice(0, 120)}"`);
      return { ok: true, channel: 'email', reason: 'dev-log (SMTP not configured)' };
    }
    try {
      const transporter = await this.getTransporter();
      const info = await transporter.sendMail({
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to,
        subject,
        text,
        html: html ?? text,
      });
      return { ok: true, channel: 'email', providerId: info?.messageId };
    } catch (err) {
      this.logger.error(`Email send failed to ${to}: ${(err as Error).message}`);
      return { ok: false, channel: 'email', reason: (err as Error).message };
    }
  }
}
