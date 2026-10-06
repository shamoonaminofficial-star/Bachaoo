import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// ---------------------------------------------------------------------------
// Phase 8 — partner-scoped analytics for a single business.
//
// - redemptionsByDay / savingsGivenByDay: bucketed in Asia/Karachi days.
// - hourlyHeat: 24 buckets of redemption counts across the whole range —
//   staffing insight (when do customers actually show up?).
// - dealViews: cumulative lifetime counters (Deal.viewCount) — the platform
//   does not store per-day view events yet, so no per-day view breakdown is
//   claimed. Documented in docs/API.md.
//
// Deliberately NOT cached: the (from, to) range makes cache keys explode and
// invalidation unreliable; queries are bounded by the date range (default 30
// days), so they stay cheap.
// ---------------------------------------------------------------------------

const KARACHI_OFFSET_MS = 5 * 60 * 60 * 1000;
const DEFAULT_DAYS = 30;

function karachiDayKey(date: Date): string {
  const shifted = new Date(date.getTime() + KARACHI_OFFSET_MS);
  return shifted.toISOString().slice(0, 10); // YYYY-MM-DD
}

function karachiHour(date: Date): number {
  return new Date(date.getTime() + KARACHI_OFFSET_MS).getUTCHours();
}

@Injectable()
export class PartnerAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAnalytics(businessId: string, from?: string, to?: string) {
    const end = to ? new Date(to) : new Date();
    const start = from ? new Date(from) : new Date(end.getTime() - DEFAULT_DAYS * 24 * 60 * 60 * 1000);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      throw new BadRequestException({ code: 'INVALID_DATE_RANGE', message: 'from/to must be valid dates with from <= to.' });
    }
    return this.buildAnalytics(businessId, start, end);
  }

  private async buildAnalytics(businessId: string, start: Date, end: Date) {
    const [redemptions, deals, uniqueCustomers] = await Promise.all([
      this.prisma.redemption.findMany({
        where: { businessId, status: 'CONFIRMED', createdAt: { gte: start, lte: end } },
        select: { createdAt: true, savingAmount: true, branchId: true, dealId: true, userId: true },
      }),
      this.prisma.deal.findMany({
        where: { businessId, deletedAt: null },
        orderBy: { viewCount: 'desc' },
        take: 10,
        select: { id: true, title: true, viewCount: true, redemptionCount: true },
      }),
      this.prisma.redemption.groupBy({
        by: ['userId'],
        where: { businessId, status: 'CONFIRMED', createdAt: { gte: start, lte: end } },
      }),
    ]);

    const byDay = new Map<string, { redemptions: number; savingsGiven: number }>();
    const hourly = new Array<number>(24).fill(0);
    const branchAgg = new Map<string, { redemptions: number; savingsGiven: number }>();
    let savingsTotal = 0;

    for (const r of redemptions) {
      const day = karachiDayKey(r.createdAt);
      const slot = byDay.get(day) ?? { redemptions: 0, savingsGiven: 0 };
      slot.redemptions += 1;
      slot.savingsGiven += r.savingAmount;
      byDay.set(day, slot);
      hourly[karachiHour(r.createdAt)] += 1;
      savingsTotal += r.savingAmount;
      if (r.branchId) {
        const b = branchAgg.get(r.branchId) ?? { redemptions: 0, savingsGiven: 0 };
        b.redemptions += 1;
        b.savingsGiven += r.savingAmount;
        branchAgg.set(r.branchId, b);
      }
    }

    // Fill missing days so charts render a continuous series.
    const redemptionsByDay: Array<{ date: string; redemptions: number; savingsGiven: number }> = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      const day = karachiDayKey(cursor);
      const slot = byDay.get(day) ?? { redemptions: 0, savingsGiven: 0 };
      redemptionsByDay.push({ date: day, redemptions: slot.redemptions, savingsGiven: slot.savingsGiven });
      cursor.setDate(cursor.getDate() + 1);
    }

    const branchIds = [...branchAgg.keys()];
    const branchNames = new Map<string, string>();
    if (branchIds.length) {
      const branches = await this.prisma.branch.findMany({
        where: { id: { in: branchIds } },
        select: { id: true, name: true },
      });
      for (const b of branches) branchNames.set(b.id, b.name);
    }
    const topBranches = [...branchAgg.entries()]
      .map(([branchId, a]) => ({
        branchId,
        branchName: branchNames.get(branchId) ?? 'Unknown branch',
        redemptions: a.redemptions,
        savingsGiven: a.savingsGiven,
      }))
      .sort((a, b) => b.redemptions - a.redemptions);

    return {
      range: { from: start.toISOString(), to: end.toISOString(), timezone: 'Asia/Karachi' },
      summary: {
        redemptions: redemptions.length,
        savingsGiven: savingsTotal, // paisa
        uniqueCustomers: uniqueCustomers.length,
        viewsTotal: deals.reduce((s, d) => s + d.viewCount, 0), // lifetime cumulative
      },
      redemptionsByDay,
      hourlyHeat: hourly,
      topBranches,
      dealViews: deals.map((d) => ({
        dealId: d.id,
        title: d.title,
        views: d.viewCount,
        redemptions: d.redemptionCount,
      })),
    };
  }
}
