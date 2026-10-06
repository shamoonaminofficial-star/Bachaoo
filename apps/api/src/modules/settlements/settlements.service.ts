import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { parsePagination, buildPaginatedResponse } from '../../common/utils/pagination';
import { CancelSettlementDto, MarkPaidDto, RunSettlementDto, SettlementQueryDto } from './dto/settlement.dto';

/**
 * Phase 12 — settlement batches.
 *
 * A Settlement is the platform's commission invoice to a business for a
 * period: grossAmount = total customer-paid amounts in the period (paisa),
 * commissionAmount = accrued commission entries (paisa), netAmount =
 * commissionAmount + adjustments = what the business owes the platform.
 * mark-paid records the business's payment; cancel releases entries back to
 * ACCRUED. The weekly cron only generates PENDING drafts — never auto-pays.
 */
@Injectable()
export class SettlementsService {
  private readonly logger = new Logger(SettlementsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // --------------------------------------------------------------------- run

  /**
   * Aggregate ACCRUED commission entries for a period into Settlement rows.
   * Idempotent per (businessId, periodStart, periodEnd) — the unique
   * constraint returns the existing settlement instead of duplicating.
   */
  async runSettlement(dto: RunSettlementDto) {
    const { periodStart, periodEnd } = this.parsePeriod(dto.from, dto.to);
    const businessIds = dto.businessId
      ? [dto.businessId]
      : await this.businessesWithAccruedEntries(periodStart, periodEnd);

    const results: any[] = [];
    for (const businessId of businessIds) {
      results.push(await this.runForBusiness(businessId, periodStart, periodEnd));
    }
    return { settlements: results };
  }

  private async runForBusiness(businessId: string, periodStart: Date, periodEnd: Date) {
    const entries = await this.prisma.commissionEntry.findMany({
      where: {
        businessId,
        status: 'ACCRUED',
        settlementId: null,
        createdAt: { gte: periodStart, lte: periodEnd },
      },
      select: { id: true, paidAmount: true, commissionPaisa: true },
    });
    if (entries.length === 0) {
      return { businessId, skipped: true, reason: 'NO_ACCRUED_ENTRIES' };
    }
    const grossAmount = entries.reduce((s, e) => s + (e.paidAmount ?? 0), 0);
    const commissionAmount = entries.reduce((s, e) => s + e.commissionPaisa, 0);
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, name: true },
    });
    if (!business) {
      throw new NotFoundException({ code: 'BUSINESS_NOT_FOUND', message: 'Business not found.' });
    }

    try {
      const settlement = await this.prisma.settlement.create({
        data: {
          settlementNumber: await this.nextSettlementNumber(),
          businessId,
          periodStart,
          periodEnd,
          grossAmount,
          commissionAmount,
          adjustments: 0,
          netAmount: commissionAmount,
          status: 'PENDING',
        },
      });
      await this.prisma.commissionEntry.updateMany({
        where: { id: { in: entries.map((e) => e.id) } },
        data: { settlementId: settlement.id },
      });
      return { businessId, businessName: business.name, settlementId: settlement.id, settlementNumber: settlement.settlementNumber, grossAmount, commissionAmount, netAmount: commissionAmount, entries: entries.length };
    } catch (err: any) {
      // Idempotency: a settlement for this business+period already exists.
      if (err?.code === 'P2002') {
        const existing = await this.prisma.settlement.findUnique({
          where: { businessId_periodStart_periodEnd: { businessId, periodStart, periodEnd } },
        });
        return { businessId, businessName: business.name, existing: true, settlementId: existing?.id, settlementNumber: existing?.settlementNumber };
      }
      throw err;
    }
  }

  // -------------------------------------------------------------------- list

  async listSettlements(query: SettlementQueryDto & { page?: number | string; pageSize?: number | string }) {
    const { page, pageSize, skip, take } = parsePagination(query as any);
    const where: any = {};
    if (query.businessId) where.businessId = query.businessId;
    if (query.status) where.status = query.status;
    if (query.from || query.to) {
      where.periodStart = {};
      if (query.from) where.periodStart.gte = new Date(query.from);
      if (query.to) where.periodStart.lte = new Date(query.to);
    }
    const [total, rows] = await Promise.all([
      this.prisma.settlement.count({ where }),
      this.prisma.settlement.findMany({
        where,
        include: { business: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);
    return buildPaginatedResponse(rows, total, page, pageSize);
  }

  /** Partner-scoped: caller must own/manage the business. */
  async businessSettlements(userId: string, roles: string[], businessId: string) {
    await this.assertCanViewBusiness(userId, roles, businessId);
    return this.prisma.settlement.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  // ---------------------------------------------------------------- mark-paid

  async markPaid(id: string, dto: MarkPaidDto) {
    const settlement = await this.prisma.settlement.findUnique({ where: { id } });
    if (!settlement) {
      throw new NotFoundException({ code: 'SETTLEMENT_NOT_FOUND', message: 'Settlement not found.' });
    }
    if (settlement.status === 'PAID') {
      throw new BadRequestException({ code: 'ALREADY_PAID', message: 'Settlement is already marked paid.' });
    }
    if (settlement.status === 'CANCELLED') {
      throw new BadRequestException({ code: 'SETTLEMENT_CANCELLED', message: 'A cancelled settlement cannot be marked paid.' });
    }
    if (!dto.payoutReference?.trim()) {
      throw new BadRequestException({ code: 'REFERENCE_REQUIRED', message: 'payoutReference is required.' });
    }
    const now = new Date();
    const [updated] = await this.prisma.$transaction([
      this.prisma.settlement.update({
        where: { id },
        data: {
          status: 'PAID',
          paidAt: now,
          payoutReference: dto.payoutReference.trim(),
          payoutMethod: dto.method ?? null,
        },
      }),
      this.prisma.commissionEntry.updateMany({
        where: { settlementId: id, status: 'ACCRUED' },
        data: { status: 'SETTLED' },
      }),
    ]);
    return updated;
  }

  // ------------------------------------------------------------------ cancel

  async cancelSettlement(id: string, dto: CancelSettlementDto) {
    const settlement = await this.prisma.settlement.findUnique({ where: { id } });
    if (!settlement) {
      throw new NotFoundException({ code: 'SETTLEMENT_NOT_FOUND', message: 'Settlement not found.' });
    }
    if (settlement.status === 'PAID') {
      throw new BadRequestException({ code: 'ALREADY_PAID', message: 'A paid settlement cannot be cancelled.' });
    }
    if (!dto.reason?.trim()) {
      throw new BadRequestException({ code: 'REASON_REQUIRED', message: 'A reason is required to cancel a settlement.' });
    }
    const now = new Date();
    const [updated] = await this.prisma.$transaction([
      this.prisma.settlement.update({
        where: { id },
        data: { status: 'CANCELLED', cancelledAt: now, cancelReason: dto.reason.trim() },
      }),
      // Release the entries back to ACCRUED so a future run can pick them up.
      this.prisma.commissionEntry.updateMany({
        where: { settlementId: id, status: 'ACCRUED' },
        data: { settlementId: null },
      }),
    ]);
    return updated;
  }

  // -------------------------------------------------------------------- cron

  /**
   * Weekly draft generation — every Monday 00:05 Asia/Karachi, for the
   * previous Monday–Sunday. Creates PENDING drafts only; never auto-pays.
   */
  @Cron('5 0 * * 1')
  async weeklySettlementDrafts() {
    const now = new Date();
    const karachi = new Date(now.getTime() + 5 * 60 * 60 * 1000);
    const day = karachi.getUTCDay(); // 0=Sun..6=Sat
    const daysSinceMonday = (day + 6) % 7;
    const thisMonday = new Date(Date.UTC(karachi.getUTCFullYear(), karachi.getUTCMonth(), karachi.getUTCDate() - daysSinceMonday));
    const lastMonday = new Date(thisMonday.getTime() - 7 * 24 * 60 * 60 * 1000);
    const lastSundayEnd = new Date(thisMonday.getTime() - 1000);
    // Convert back from Karachi wall-clock to UTC instants.
    const periodStart = new Date(lastMonday.getTime() - 5 * 60 * 60 * 1000);
    const periodEnd = new Date(lastSundayEnd.getTime() - 5 * 60 * 60 * 1000);
    try {
      const result = await this.runSettlement({
        from: periodStart.toISOString(),
        to: periodEnd.toISOString(),
      });
      this.logger.log(`Weekly settlement drafts: ${result.settlements.length} businesses processed.`);
    } catch (err: any) {
      this.logger.error(`Weekly settlement draft run failed: ${err?.message}`);
    }
  }

  // ----------------------------------------------------------------- helpers

  private parsePeriod(from: string, to: string): { periodStart: Date; periodEnd: Date } {
    const periodStart = new Date(from);
    const periodEnd = new Date(to);
    if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime()) || periodStart >= periodEnd) {
      throw new BadRequestException({ code: 'INVALID_PERIOD', message: 'from/to must be valid dates with from < to.' });
    }
    return { periodStart, periodEnd };
  }

  private async businessesWithAccruedEntries(periodStart: Date, periodEnd: Date): Promise<string[]> {
    const rows = await this.prisma.commissionEntry.groupBy({
      by: ['businessId'],
      where: { status: 'ACCRUED', settlementId: null, createdAt: { gte: periodStart, lte: periodEnd } },
    });
    return rows.map((r: any) => r.businessId);
  }

  private async nextSettlementNumber(): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const n = `STL-${new Date().getUTCFullYear()}-${randomBytes(3).toString('hex').toUpperCase()}`;
      const exists = await this.prisma.settlement.findUnique({ where: { settlementNumber: n } });
      if (!exists) return n;
    }
    return `STL-${new Date().getUTCFullYear()}-${randomBytes(4).toString('hex').toUpperCase()}`;
  }

  private async assertCanViewBusiness(userId: string, roles: string[], businessId: string) {
    if (roles.includes('SUPER_ADMIN') || roles.includes('ADMIN') || roles.includes('FINANCE_MANAGER')) return;
    const link = await this.prisma.business.findFirst({
      where: {
        id: businessId,
        OR: [
          { ownerUserId: userId },
          { staff: { some: { userId, isActive: true, role: { in: ['OWNER', 'MANAGER'] } } } },
        ],
      },
      select: { id: true },
    });
    if (!link) {
      throw new ForbiddenException({ code: 'NOT_BUSINESS_STAFF', message: 'You cannot view this business.' });
    }
  }
}
