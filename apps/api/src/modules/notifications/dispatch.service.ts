import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailChannel } from '../auth/channels/email.channel';
import { SmsChannel, WhatsappChannel } from '../auth/channels/sms-whatsapp.channel';

/**
 * Phase 11 — platform notification dispatcher.
 *
 * Design notes:
 * - IN_APP is always persisted (Notification rows); the app/website renders the inbox.
 * - EMAIL goes through the working SMTP adapter; SMS/WhatsApp through the
 *   ready-stub adapters. When a provider is NOT configured the channel is
 *   recorded as SKIPPED — never pretend-delivered.
 * - Notification *type* (machine key) routes to the user's topic preferences
 *   (NotificationPreference). Transactional types (support replies, security)
 *   bypass preferences — they are always delivered in-app.
 * - Best-effort: dispatch() never throws; callers fire-and-forget.
 */
export type DispatchChannel = 'IN_APP' | 'EMAIL' | 'SMS' | 'WHATSAPP';

export interface DispatchPayload {
  /** Machine key, e.g. MEMBERSHIP_EXPIRING — drives dedup + preference routing. */
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channels: DispatchChannel[];
}

/** Notification type → NotificationPreference field. `null` = always deliver (transactional). */
const TYPE_PREFERENCE: Record<string, string | null> = {
  MEMBERSHIP_EXPIRING: 'membershipReminders',
  MEMBERSHIP_ACTIVATED: 'membershipReminders',
  MEMBERSHIP_EXPIRED: 'membershipReminders',
  DEAL_APPROVED: 'dealAlerts',
  DEAL_REJECTED: 'dealAlerts',
  DEAL_EXPIRING: 'dealAlerts',
  VOUCHER_CLAIMED: 'savingsSummary',
  REWARD_REDEEMED: 'savingsSummary',
  CASHBACK_APPROVED: 'savingsSummary',
  CASHBACK_REJECTED: 'savingsSummary',
  CASHBACK_WITHDRAWAL_APPROVED: 'savingsSummary',
  CASHBACK_WITHDRAWAL_REJECTED: 'savingsSummary',
  REFERRAL_QUALIFIED: 'referralUpdates',
  REFERRAL_APPLIED: 'referralUpdates',
  SUPPORT_REPLY: null,
  TICKET_STATUS: null,
  REVIEW_REPLY: 'dealAlerts',
  ANNOUNCEMENT: 'marketing',
};

const BROADCAST_CHUNK = 250;

@Injectable()
export class NotificationDispatchService {
  private readonly logger = new Logger(NotificationDispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailChannel,
    private readonly sms: SmsChannel,
    private readonly whatsapp: WhatsappChannel,
  ) {}

  /**
   * Dispatch to one or many users. Never throws — every per-user failure is
   * swallowed and logged so the primary transaction is never affected.
   */
  async dispatch(userIds: string | string[], payload: DispatchPayload): Promise<{ attempted: number }> {
    const ids = (Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean);
    if (ids.length === 0) return { attempted: 0 };
    try {
      const users = await this.prisma.user.findMany({
        where: { id: { in: ids }, deletedAt: null },
        select: { id: true, email: true, phone: true, firstName: true },
      });
      const prefs = await this.prisma.notificationPreference.findMany({
        where: { userId: { in: users.map((u) => u.id) } },
      });
      const prefByUser = new Map(prefs.map((p) => [p.userId, p]));
      for (const user of users) {
        try {
          await this.dispatchToUser(user, prefByUser.get(user.id), payload);
        } catch (e) {
          this.logger.warn(`dispatch failed for user ${user.id}: ${(e as Error).message}`);
        }
      }
      return { attempted: users.length };
    } catch (e) {
      this.logger.warn(`dispatch batch failed: ${(e as Error).message}`);
      return { attempted: 0 };
    }
  }

  /**
   * True when a notification of this type was already sent to the user within
   * the window — used by reminder crons to avoid daily duplicates.
   */
  async recentlySent(userId: string, type: string, withinMs: number): Promise<boolean> {
    const since = new Date(Date.now() - withinMs);
    const count = await this.prisma.notification.count({
      where: { userId, type, createdAt: { gte: since } },
    });
    return count > 0;
  }

  /**
   * Admin broadcast to an audience. Chunked (250 recipients at a time) so a
   * large audience can't blow up memory; the campaign row tracks progress.
   * Rate-limited + audited at the controller.
   */
  async broadcast(input: {
    title: string;
    body: string;
    audience: 'all' | 'customers' | 'partners';
    channels: DispatchChannel[];
    createdBy?: string;
  }): Promise<{ campaignId: string; recipients: number }> {
    const roleNames =
      input.audience === 'customers'
        ? ['CUSTOMER']
        : input.audience === 'partners'
          ? ['BUSINESS_OWNER', 'BUSINESS_MANAGER']
          : null;
    const where: Record<string, unknown> = { deletedAt: null };
    if (roleNames) {
      where.roles = { some: { role: { name: { in: roleNames } } } };
    }
    const recipients = await this.prisma.user.findMany({
      where: where as never,
      select: { id: true },
      take: 20000,
    });
    const campaign = await this.prisma.notificationCampaign.create({
      data: {
        name: input.title.slice(0, 120),
        audience: { audience: input.audience } as never,
        channel: (input.channels.includes('EMAIL') ? 'EMAIL' : 'IN_APP') as never,
        title: input.title,
        body: input.body,
        status: 'SENDING',
        createdBy: input.createdBy ?? null,
      },
    });
    let sent = 0;
    for (let i = 0; i < recipients.length; i += BROADCAST_CHUNK) {
      const chunk = recipients.slice(i, i + BROADCAST_CHUNK);
      const res = await this.dispatch(
        chunk.map((r) => r.id),
        { type: 'ANNOUNCEMENT', title: input.title, body: input.body, channels: input.channels, data: { campaignId: campaign.id } },
      );
      sent += res.attempted;
      await this.prisma.notificationCampaign
        .update({ where: { id: campaign.id }, data: { sentCount: sent } })
        .catch(() => null);
    }
    await this.prisma.notificationCampaign
      .update({ where: { id: campaign.id }, data: { status: 'SENT' } })
      .catch(() => null);
    return { campaignId: campaign.id, recipients: sent };
  }

  // ------------------------------------------------------------------ internals

  private async dispatchToUser(
    user: { id: string; email: string | null; phone: string | null; firstName: string | null },
    prefs: Record<string, unknown> | undefined,
    payload: DispatchPayload,
  ): Promise<void> {
    const prefField = TYPE_PREFERENCE[payload.type] ?? null;
    if (prefField && prefs && (prefs as Record<string, boolean>)[prefField] === false) {
      // User opted out of this topic — skip silently.
      return;
    }
    const now = new Date();
    const base = {
      userId: user.id,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      data: (payload.data ?? null) as never,
    };
    if (payload.channels.includes('IN_APP')) {
      await this.prisma.notification.create({
        data: { ...base, channel: 'IN_APP', status: 'SENT', sentAt: now } as never,
      });
    }
    if (payload.channels.includes('EMAIL')) {
      if (user.email && this.email.configured) {
        const html = `<p>${escapeHtml(payload.body)}</p>`;
        const res = await this.email.send(user.email, payload.title, payload.body, html);
        await this.prisma.notification.create({
          data: { ...base, channel: 'EMAIL', status: res.ok ? 'SENT' : 'FAILED', sentAt: res.ok ? now : null } as never,
        });
      } else {
        await this.prisma.notification.create({
          data: {
            ...base,
            channel: 'EMAIL',
            status: 'SKIPPED',
            data: { ...(payload.data ?? {}), reason: user.email ? 'SMTP not configured' : 'no email on file' } as never,
          } as never,
        });
      }
    }
    if (payload.channels.includes('SMS')) {
      await this.sendPhoneChannel(user, payload, base, now, 'SMS', this.sms);
    }
    if (payload.channels.includes('WHATSAPP')) {
      await this.sendPhoneChannel(user, payload, base, now, 'WHATSAPP', this.whatsapp);
    }
  }

  private async sendPhoneChannel(
    user: { id: string; phone: string | null },
    payload: DispatchPayload,
    base: Record<string, unknown>,
    now: Date,
    channel: 'SMS' | 'WHATSAPP',
    adapter: { configured: boolean; send: (to: string, subject: string, text: string) => Promise<{ ok: boolean; reason?: string }> },
  ): Promise<void> {
    if (user.phone && adapter.configured) {
      const res = await adapter.send(user.phone, payload.title, `${payload.title}: ${payload.body}`);
      await this.prisma.notification.create({
        data: { ...base, channel, status: res.ok ? 'SENT' : 'FAILED', sentAt: res.ok ? now : null } as never,
      });
    } else {
      // Honest bookkeeping: never mark a message sent when no provider exists.
      await this.prisma.notification.create({
        data: {
          ...base,
          channel,
          status: 'SKIPPED',
          data: { ...(payload.data ?? {}), reason: user.phone ? `${channel} provider not configured` : 'no phone on file' } as never,
        } as never,
      });
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
