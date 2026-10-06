import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { PartnerAnalyticsService } from '../businesses/partner-analytics.service';

const KARACHI_OFFSET_MS = 5 * 60 * 60 * 1000;
const DEFAULT_DAYS = 30;
// Phase 13: aggregation endpoints pull the whole date range into memory, so
// unbounded ranges are rejected with RANGE_TOO_LARGE.
const MAX_RANGE_DAYS = 366;
const CACHE_TTL_SEC = 600; // 10 minutes per range; TTL is the net (ranges make targeted busts unreliable)

function karachiDayKey(date: Date): string {
  return new Date(date.getTime() + KARACHI_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Phase 12 — platform analytics.
 *
 * - admin/overview: platform trends over a date range (Asia/Karachi day
 *   bucketing), Redis-cached 10 minutes per range.
 * - business/:id: delegates to the canonical PartnerAnalyticsService (one
 *   implementation, no duplication).
 * - customer/me: caller-level savings/redemption trends feeding the savings page.
 *
 * Device/channel splits are omitted — the platform does not track them yet.
 * All money is integer paisa.
 */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly partnerAnalytics: PartnerAnalyticsService,
  ) {}

  // ------------------------------------------------------------- admin trends

  async adminOverview(from?: string, to?: string) {
    const { start, end } = this.parseRange(from, to);
    const key = `analytics:admin:${karachiDayKey(start)}:${karachiDayKey(end)}`;
    try {
      const hit = await this.redis.get(key);
      if (hit) return JSON.parse(hit);
    } catch {
      /* cache miss / redis down — rebuild */
    }
    const payload = await this.buildAdminOverview(start, end);
    try {
      await this.redis.set(key, JSON.stringify(payload), CACHE_TTL_SEC);
    } catch (err: any) {
      this.logger.warn(`analytics cache write failed: ${err?.message}`);
    }
    return payload;
  }

  private async buildAdminOverview(start: Date, end: Date) {
    const range = { gte: start, lte: end };
    const [redemptions, payments, users, savingsTx] = await Promise.all([
      this.prisma.redemption.findMany({
        where: { status: 'CONFIRMED', createdAt: range },
        select: {
          createdAt: true,
          savingAmount: true,
          paidAmount: true,
          businessId: true,
          dealId: true,
          business: { select: { name: true } },
          deal: { select: { title: true } },
        },
      }),
      this.prisma.payment.findMany({
        where: { status: 'PAID', paidAt: range },
        select: { paidAt: true, amount: true, orderType: true },
      }),
      this.prisma.user.findMany({
        where: { createdAt: range, status: { not: 'DELETED' } },
        select: { createdAt: true },
      }),
      this.prisma.savingsTransaction.findMany({
        where: { createdAt: range },
        select: { createdAt: true, amount: true, categoryId: true, category: { select: { name: true } } },
      }),
    ]);

    // ---- day series (continuous, Karachi days) ----
    const days: string[] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      days.push(karachiDayKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    const redemptionsByDay = days.map((day) => ({ day, redemptions: 0, savings: 0, paid: 0 }));
    const byDay = new Map(days.map((d, i) => [d, redemptionsByDay[i]]));
    for (const r of redemptions) {
      const slot = byDay.get(karachiDayKey(r.createdAt));
      if (slot) {
        slot.redemptions += 1;
        slot.savings += r.savingAmount;
        slot.paid += r.paidAmount;
      }
    }
    const newUsersByDay = days.map((day) => ({ day, users: 0 }));
    const usersByDay = new Map(newUsersByDay.map((s) => [s.day, s]));
    for (const u of users) {
      const slot = usersByDay.get(karachiDayKey(u.createdAt));
      if (slot) slot.users += 1;
    }
    const membershipRevenueByDay = days.map((day) => ({ day, revenue: 0 }));
    const revByDay = new Map(membershipRevenueByDay.map((s) => [s.day, s]));
    for (const p of payments) {
      if (p.orderType !== 'MEMBERSHIP' || !p.paidAt) continue;
      const slot = revByDay.get(karachiDayKey(p.paidAt));
      if (slot) slot.revenue += p.amount;
    }

    // ---- top businesses / deals ----
    const bizAgg = new Map<string, { businessId: string; name: string; redemptions: number; savings: number }>();
    for (const r of redemptions) {
      const a = bizAgg.get(r.businessId) ?? { businessId: r.businessId, name: r.business.name, redemptions: 0, savings: 0 };
      a.redemptions += 1;
      a.savings += r.savingAmount;
      bizAgg.set(r.businessId, a);
    }
    const topBusinesses = [...bizAgg.values()].sort((a, b) => b.redemptions - a.redemptions).slice(0, 10);

    const dealAgg = new Map<string, { dealId: string; title: string; redemptions: number; savings: number }>();
    for (const r of redemptions) {
      const a = dealAgg.get(r.dealId) ?? { dealId: r.dealId, title: r.deal.title, redemptions: 0, savings: 0 };
      a.redemptions += 1;
      a.savings += r.savingAmount;
      dealAgg.set(r.dealId, a);
    }
    const topDeals = [...dealAgg.values()].sort((a, b) => b.redemptions - a.redemptions).slice(0, 10);

    // ---- category breakdown (savings by category) ----
    const catAgg = new Map<string, { categoryId: string; name: string; savings: number; redemptions: number }>();
    for (const s of savingsTx) {
      const key = s.categoryId ?? 'uncategorized';
      const a = catAgg.get(key) ?? { categoryId: key, name: s.category?.name ?? 'Uncategorized', savings: 0, redemptions: 0 };
      a.savings += s.amount;
      a.redemptions += 1;
      catAgg.set(key, a);
    }
    const categoryBreakdown = [...catAgg.values()].sort((a, b) => b.savings - a.savings);

    return {
      range: { from: start.toISOString(), to: end.toISOString() },
      totals: {
        redemptions: redemptions.length,
        savingsGiven: redemptions.reduce((s, r) => s + r.savingAmount, 0),
        paidVolume: redemptions.reduce((s, r) => s + r.paidAmount, 0),
        newUsers: users.length,
        membershipRevenue: payments.filter((p) => p.orderType === 'MEMBERSHIP').reduce((s, p) => s + p.amount, 0),
      },
      redemptionsByDay,
      newUsersByDay,
      membershipRevenueByDay,
      topBusinesses,
      topDeals,
      categoryBreakdown,
    };
  }

  // ---------------------------------------------------- business (delegated)

  /** Canonical per-business analytics live in PartnerAnalyticsService. */
  async businessAnalytics(id: string, from?: string, to?: string) {
    return this.partnerAnalytics.getAnalytics(id, from, to);
  }

  // ----------------------------------------------------- customer (caller)

  /** Caller-level trends feeding the savings page. */
  async customerAnalytics(userId: string, from?: string, to?: string) {
    const { start, end } = this.parseRange(from, to, 90);
    const range = { gte: start, lte: end };
    const [txs, redemptions] = await Promise.all([
      this.prisma.savingsTransaction.findMany({
        where: { userId, createdAt: range },
        select: { createdAt: true, amount: true, category: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.redemption.count({ where: { userId, status: 'CONFIRMED', createdAt: range } }),
    ]);
    const days: string[] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      days.push(karachiDayKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    const savingsByDay = days.map((day) => ({ day, savings: 0 }));
    const byDay = new Map(savingsByDay.map((s) => [s.day, s]));
    let cumulative = 0;
    for (const t of txs) {
      const slot = byDay.get(karachiDayKey(t.createdAt));
      if (slot) slot.savings += t.amount;
      cumulative += t.amount;
    }
    const catAgg = new Map<string, { name: string; savings: number }>();
    for (const t of txs) {
      const name = t.category?.name ?? 'Uncategorized';
      const a = catAgg.get(name) ?? { name, savings: 0 };
      a.savings += t.amount;
      catAgg.set(name, a);
    }
    return {
      range: { from: start.toISOString(), to: end.toISOString() },
      totals: { savings: cumulative, redemptions },
      savingsByDay,
      categoryBreakdown: [...catAgg.values()].sort((a, b) => b.savings - a.savings),
    };
  }

  // ------------------------------------------------------------------ helpers

  private parseRange(from?: string, to?: string, defaultDays = DEFAULT_DAYS): { start: Date; end: Date } {
    const end = to ? new Date(to) : new Date();
    const start = from ? new Date(from) : new Date(end.getTime() - defaultDays * 24 * 60 * 60 * 1000);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      throw new BadRequestException({
        code: 'INVALID_DATE_RANGE',
        message: 'from/to must be valid dates with from <= to.',
      });
    }
    // Phase 13: unbounded ranges would pull the whole table into memory.
    if (end.getTime() - start.getTime() > MAX_RANGE_DAYS * 24 * 60 * 60 * 1000) {
      throw new BadRequestException({
        code: 'RANGE_TOO_LARGE',
        message: `Date range must be ${MAX_RANGE_DAYS} days or less. Narrow from/to and retry.`,
      });
    }
    return { start, end };
  }
}
