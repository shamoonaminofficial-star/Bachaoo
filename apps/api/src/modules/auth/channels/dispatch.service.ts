import { Injectable } from '@nestjs/common';
import { EmailChannel } from './email.channel';
import { SmsChannel, WhatsappChannel } from './sms-whatsapp.channel';
import {
  NotificationChannel,
  OtpChannel,
  SendResult,
} from './notification-channel.interface';

const APP_NAME = process.env.APP_NAME || 'Bachatly';

/**
 * Picks the right channel adapter for an auth message (OTP / verification /
 * password reset) and sends it. Falls back to the dev-log behaviour inside
 * each adapter when provider credentials are missing, so flows stay testable
 * in every environment.
 */
@Injectable()
export class DispatchService {
  constructor(
    private readonly email: EmailChannel,
    private readonly sms: SmsChannel,
    private readonly whatsapp: WhatsappChannel,
  ) {}

  private adapter(channel: OtpChannel): NotificationChannel {
    switch (channel) {
      case 'sms':
        return this.sms;
      case 'whatsapp':
        return this.whatsapp;
      case 'email':
      default:
        return this.email;
    }
  }

  sendOtp(to: string, channel: OtpChannel, code: string): Promise<SendResult> {
    const subject = `${APP_NAME} verification code`;
    const text = `Your ${APP_NAME} verification code is ${code}. It expires in 5 minutes. Never share this code.`;
    const html = `<p>Your <strong>${APP_NAME}</strong> verification code is <strong>${code}</strong>.</p><p>It expires in 5 minutes. Never share this code with anyone.</p>`;
    return this.adapter(channel).send(to, subject, text, html);
  }

  sendEmailVerification(to: string, link: string): Promise<SendResult> {
    const subject = `Verify your ${APP_NAME} email`;
    const text = `Welcome to ${APP_NAME}! Verify your email by opening this link (valid 24 hours): ${link}`;
    const html = `<p>Welcome to <strong>${APP_NAME}</strong>!</p><p><a href="${link}">Verify your email address</a> — this link is valid for 24 hours.</p>`;
    return this.email.send(to, subject, text, html);
  }

  sendPasswordReset(to: string, link: string): Promise<SendResult> {
    const subject = `Reset your ${APP_NAME} password`;
    const text = `You requested a password reset. Open this link within 30 minutes to set a new password: ${link}. If you did not request this, ignore this email.`;
    const html = `<p>You requested a password reset for <strong>${APP_NAME}</strong>.</p><p><a href="${link}">Set a new password</a> — this link expires in 30 minutes and can be used once.</p><p>If you did not request this, you can safely ignore this email.</p>`;
    return this.email.send(to, subject, text, html);
  }
}
