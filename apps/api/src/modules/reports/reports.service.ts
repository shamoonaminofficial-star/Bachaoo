import { BadRequestException, Injectable, NotFoundException, NotImplementedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ExportQueryDto, ReportQueryDto } from './dto/report.dto';

const EXPORT_ROW_LIMIT = 10000;

type CsvRow = Record<string, string | number | null | undefined>;

/**
 * Phase 12 — platform reports + CSV exports.
 *
 * Every report returns `{ summary, columns, rows }` where `rows` is the same
 * tabular shape the CSV exporter streams. XLSX is intentionally unsupported:
 * no spreadsheet library is installed, so `format=xlsx` returns 501 with an
 * honest message instead of a fake file.
 *
 * All money is integer paisa; reports are read-only and bounded
 * (exports cap at 10,000 rows).
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // ------------------------------------------------------------- date bounds

  // Phase 13: report builders aggregate the whole range in memory — cap it.
  private static readonly MAX_RANGE_DAYS = 366;

  private bounds(query: ReportQueryDto): { gte?: Date; lte?: Date } {
    const where: { gte?: Date; lte?: Date } = {};
    if (query.from) {
      const d = new Date(query.from);
      if (Number.isNaN(d.getTime())) throw new BadRequestException({ code: 'INVALID_FROM', message: 'from must be a valid date.' });
      where.gte = d;
    }
    if (query.to) {
      const d = new Date(query.to);
      if (Number.isNaN(d.getTime())) throw new BadRequestException({ code: 'INVALID_TO', message: 'to must be a valid date.' });
      where.lte = d;
    }
    if (where.gte && where.lte && where.gte > where.lte) {
      throw new BadRequestException({ code: 'INVALID_DATE_RANGE', message: 'from must be <= to.' });
    }
    if (where.gte && where.lte && where.lte.getTime() - where.gte.getTime() > ReportsService.MAX_RANGE_DAYS * 24 * 60 * 60 * 1000) {
      throw new BadRequestException({
        code: 'RANGE_TOO_LARGE',
        message: `Date range must be ${ReportsService.MAX_RANGE_DAYS} days or less. Narrow from/to and retry.`,
      });
    }
    return where;
  }

  // -------------------------------------------------------------- memberships

  async membershipSales(query: ReportQueryDto) {
    const created = this.bounds(query);
    const payments = await this.prisma.payment.findMany({
      where: { status: 'PAID', orderType: 'MEMBERSHIP', paidAt: created },
      select: {
        paidAt: true,
        amount: true,
        gateway: true,
        membership: { select: { plan: { select: { name: true } } } },
      },
      orderBy: { paidAt: 'asc' },
    });
    const byPlan = new Map<string, { plan: string; count: number; revenue: number }>();
    for (const p of payments) {
      const plan = p.membership?.plan?.name ?? 'Unknown plan';
      const a = byPlan.get(plan) ?? { plan, count: 0, revenue: 0 };
      a.count += 1;
      a.revenue += p.amount;
      byPlan.set(plan, a);
    }
    const rows = [...byPlan.values()];
    return {
      summary: {
        count: payments.length,
        total: payments.reduce((s, p) => s + p.amount, 0), // paisa
      },
      columns: ['plan', 'count', 'revenue_paisa'],
      rows: rows.map((r) => ({ plan: r.plan, count: r.count, revenue_paisa: r.revenue })),
    };
  }

  // -------------------------------------------------------------- redemptions

  async redemptionReport(query: ReportQueryDto) {
    const created = this.bounds(query);
    const where: any = { status: 'CONFIRMED', createdAt: created };
    if (query.businessId) where.businessId = query.businessId;
    const redemptions = await this.prisma.redemption.findMany({
      where,
      select: {
        createdAt: true,
        billAmount: true,
        discountAmount: true,
        paidAmount: true,
        savingAmount: true,
        business: { select: { name: true } },
        deal: { select: { title: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: EXPORT_ROW_LIMIT,
    });
    const totalSavings = redemptions.reduce((s, r) => s + r.savingAmount, 0);
    const totalPaid = redemptions.reduce((s, r) => s + r.paidAmount, 0);
    return {
      summary: {
        count: redemptions.length,
        totalSavings,
        totalPaid,
        avgBill: redemptions.length ? Math.floor(totalPaid / redemptions.length) : 0,
      },
      columns: ['created_at', 'business', 'deal', 'bill_paisa', 'discount_paisa', 'paid_paisa', 'saving_paisa'],
      rows: redemptions.map((r) => ({
        created_at: r.createdAt.toISOString(),
        business: r.business.name,
        deal: r.deal.title,
        bill_paisa: r.billAmount,
        discount_paisa: r.discountAmount,
        paid_paisa: r.paidAmount,
        saving_paisa: r.savingAmount,
      })),
    };
  }

  // ------------------------------------------------------------------ savings

  async savingsReport(query: ReportQueryDto) {
    const created = this.bounds(query);
    const txs = await this.prisma.savingsTransaction.findMany({
      where: { createdAt: created },
      select: { createdAt: true, amount: true, category: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const byCategory = new Map<string, number>();
    const byMonth = new Map<string, number>();
    for (const t of txs) {
      const cat = t.category?.name ?? 'Uncategorized';
      byCategory.set(cat, (byCategory.get(cat) ?? 0) + t.amount);
      const m = `${t.createdAt.getUTCFullYear()}-${String(t.createdAt.getUTCMonth() + 1).padStart(2, '0')}`;
      byMonth.set(m, (byMonth.get(m) ?? 0) + t.amount);
    }
    return {
      summary: { totalSavings: txs.reduce((s, t) => s + t.amount, 0), count: txs.length },
      columns: ['category', 'savings_paisa', 'redemptions'],
      rows: [...byCategory.entries()].map(([category, savings_paisa]) => ({
        category,
        savings_paisa,
        redemptions: txs.filter((t) => (t.category?.name ?? 'Uncategorized') === category).length,
      })),
      byMonth: [...byMonth.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([month, savings_paisa]) => ({ month, savings_paisa })),
    };
  }

  // -------------------------------------------------------------- commissions

  async commissionReport(query: ReportQueryDto) {
    const created = this.bounds(query);
    const where: any = { createdAt: created };
    if (query.businessId) where.businessId = query.businessId;
    const entries = await this.prisma.commissionEntry.findMany({
      where,
      select: {
        createdAt: true,
        kind: true,
        status: true,
        commissionPaisa: true,
        business: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: EXPORT_ROW_LIMIT,
    });
    const accrued = entries.filter((e) => e.status === 'ACCRUED').reduce((s, e) => s + e.commissionPaisa, 0);
    const settled = entries.filter((e) => e.status === 'SETTLED').reduce((s, e) => s + e.commissionPaisa, 0);
    const byBusiness = new Map<string, { business: string; accrued: number; settled: number; entries: number }>();
    for (const e of entries) {
      const a = byBusiness.get(e.business.name) ?? { business: e.business.name, accrued: 0, settled: 0, entries: 0 };
      if (e.status === 'ACCRUED') a.accrued += e.commissionPaisa;
      if (e.status === 'SETTLED') a.settled += e.commissionPaisa;
      a.entries += 1;
      byBusiness.set(e.business.name, a);
    }
    return {
      summary: { entries: entries.length, accrued, settled },
      columns: ['business', 'entries', 'accrued_paisa', 'settled_paisa'],
      rows: [...byBusiness.values()].map((b) => ({
        business: b.business,
        entries: b.entries,
        accrued_paisa: b.accrued,
        settled_paisa: b.settled,
      })),
    };
  }

  // -------------------------------------------------------------- settlements

  async settlementReport(query: ReportQueryDto & { status?: string }) {
    const period = this.bounds(query);
    const where: any = {};
    if (period.gte || period.lte) where.periodStart = period;
    if (query.status) where.status = query.status;
    if (query.businessId) where.businessId = query.businessId;
    const rows = await this.prisma.settlement.findMany({
      where,
      include: { business: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: EXPORT_ROW_LIMIT,
    });
    const byStatus = new Map<string, { count: number; net: number }>();
    for (const s of rows) {
      const a = byStatus.get(s.status) ?? { count: 0, net: 0 };
      a.count += 1;
      a.net += s.netAmount;
      byStatus.set(s.status, a);
    }
    return {
      summary: {
        count: rows.length,
        byStatus: Object.fromEntries(byStatus),
      },
      columns: ['settlement_number', 'business', 'period_start', 'period_end', 'gross_paisa', 'commission_paisa', 'adjustments_paisa', 'net_paisa', 'status', 'paid_at'],
      rows: rows.map((s) => ({
        settlement_number: s.settlementNumber,
        business: s.business.name,
        period_start: s.periodStart.toISOString(),
        period_end: s.periodEnd.toISOString(),
        gross_paisa: s.grossAmount,
        commission_paisa: s.commissionAmount,
        adjustments_paisa: s.adjustments,
        net_paisa: s.netAmount,
        status: s.status,
        paid_at: s.paidAt?.toISOString() ?? null,
      })),
    };
  }

  // --------------------------------------------------------------- businesses

  async businessReport(query: ReportQueryDto) {
    const created = this.bounds(query);
    const businesses = await this.prisma.business.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, isVerified: true, isActive: true, ratingAvg: true, ratingCount: true },
      orderBy: { name: 'asc' },
    });
    const redemptions = await this.prisma.redemption.findMany({
      where: { status: 'CONFIRMED', createdAt: created },
      select: { businessId: true, savingAmount: true, paidAmount: true },
    });
    const commissions = await this.prisma.commissionEntry.findMany({
      where: { createdAt: created },
      select: { businessId: true, commissionPaisa: true },
    });
    const rAgg = new Map<string, { redemptions: number; savings: number; paid: number }>();
    for (const r of redemptions) {
      const a = rAgg.get(r.businessId) ?? { redemptions: 0, savings: 0, paid: 0 };
      a.redemptions += 1;
      a.savings += r.savingAmount;
      a.paid += r.paidAmount;
      rAgg.set(r.businessId, a);
    }
    const cAgg = new Map<string, number>();
    for (const c of commissions) cAgg.set(c.businessId, (cAgg.get(c.businessId) ?? 0) + c.commissionPaisa);
    return {
      summary: { businesses: businesses.length },
      columns: ['business', 'verified', 'active', 'redemptions', 'savings_given_paisa', 'paid_volume_paisa', 'commission_paisa', 'rating_avg', 'rating_count'],
      rows: businesses.map((b) => {
        const r = rAgg.get(b.id) ?? { redemptions: 0, savings: 0, paid: 0 };
        return {
          business: b.name,
          verified: b.isVerified,
          active: b.isActive,
          redemptions: r.redemptions,
          savings_given_paisa: r.savings,
          paid_volume_paisa: r.paid,
          commission_paisa: cAgg.get(b.id) ?? 0,
          rating_avg: b.ratingAvg,
          rating_count: b.ratingCount,
        };
      }),
    };
  }

  // -------------------------------------------------------------------- users

  async userReport(query: ReportQueryDto) {
    const created = this.bounds(query);
    const users = await this.prisma.user.findMany({
      where: { createdAt: created, status: { not: 'DELETED' } },
      select: { createdAt: true, roles: { select: { role: { select: { name: true } } } } },
    });
    const activeMemberships = await this.prisma.membership.count({ where: { status: 'ACTIVE', deletedAt: null } });
    const byDay = new Map<string, { day: string; customers: number; partners: number }>();
    for (const u of users) {
      const day = u.createdAt.toISOString().slice(0, 10);
      const a = byDay.get(day) ?? { day, customers: 0, partners: 0 };
      const roleNames = u.roles.map((r: any) => r.role.name);
      if (roleNames.includes('BUSINESS_OWNER') || roleNames.includes('BUSINESS_MANAGER')) a.partners += 1;
      else a.customers += 1;
      byDay.set(day, a);
    }
    const days = [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
    return {
      summary: {
        signups: users.length,
        customers: days.reduce((s, d) => s + d.customers, 0),
        partners: days.reduce((s, d) => s + d.partners, 0),
        activeMemberships,
      },
      columns: ['day', 'customers', 'partners'],
      rows: days,
    };
  }

  // ------------------------------------------------------------------- export

  /** Resolve a report type to its builder. Exported for tests. */
  reportBuilder(type: string) {
    const builders: Record<string, (q: any) => Promise<{ summary: any; columns: string[]; rows: CsvRow[] }>> = {
      'membership-sales': (q) => this.membershipSales(q),
      redemptions: (q) => this.redemptionReport(q),
      savings: (q) => this.savingsReport(q),
      commissions: (q) => this.commissionReport(q),
      settlements: (q) => this.settlementReport(q),
      businesses: (q) => this.businessReport(q) as unknown as Promise<{ summary: any; columns: string[]; rows: CsvRow[] }>,
      users: (q) => this.userReport(q),
    };
    const builder = builders[type];
    if (!builder) {
      throw new NotFoundException({
        code: 'REPORT_NOT_FOUND',
        message: `Unknown report type '${type}'. Valid types: ${Object.keys(builders).join(', ')}.`,
      });
    }
    return builder;
  }

  /**
   * Build a CSV file for a report type. XLSX is not supported — no
   * spreadsheet library is installed; requesting it returns 501.
   */
  async exportReport(type: string, query: ExportQueryDto): Promise<{ filename: string; csv: string; rows: number; truncated: boolean }> {
    if (query.format === 'xlsx') {
      throw new NotImplementedException({
        code: 'XLSX_NOT_SUPPORTED',
        message: 'XLSX export is not available (no spreadsheet library installed). Use format=csv.',
      });
    }
    const builder = this.reportBuilder(type);
    const report = await builder(query);
    const truncated = report.rows.length >= EXPORT_ROW_LIMIT;
    const csv = toCsv(report.columns, report.rows.slice(0, EXPORT_ROW_LIMIT));
    const stamp = new Date().toISOString().slice(0, 10);
    return { filename: `bachatly-${type}-${stamp}.csv`, csv, rows: Math.min(report.rows.length, EXPORT_ROW_LIMIT), truncated };
  }
}

/** Minimal RFC-4180 CSV writer. Exported for tests. */
export function toCsv(columns: string[], rows: CsvRow[]): string {
  const esc = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map(esc).join(',')];
  for (const row of rows) lines.push(columns.map((c) => esc(row[c])).join(','));
  return lines.join('\r\n') + '\r\n';
}
