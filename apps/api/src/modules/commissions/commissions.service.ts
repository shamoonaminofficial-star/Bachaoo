import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { getSettingValue } from '../../common/utils/settings';
import { parsePagination, buildPaginatedResponse } from '../../common/utils/pagination';
import { AdjustCommissionDto, CommissionQueryDto, CommissionRuleDto } from './dto/commission.dto';

export interface CommissionRate {
  type: 'PERCENTAGE' | 'FIXED';
  percentBps: number;
  fixedAmount: number; // paisa
  ruleId?: string;
}

/**
 * Phase 12 — platform commission economy.
 *
 * Commission rates are config rows (Commission model, scope BUSINESS > CATEGORY
 * > GLOBAL), falling back to the `commission.default_bps` system setting
 * (default 0 — never hardcoded). Per-redemption commission is recorded as an
 * immutable CommissionEntry row inside the redemption confirm transaction.
 * Adjustments are new ADJUSTMENT rows; history is never edited.
 */
@Injectable()
export class CommissionsService {
  constructor(private readonly prisma: PrismaService) {}

  // ------------------------------------------------------------ rate resolution

  /**
   * Resolve the effective rate for a business. Precedence: BUSINESS rule >
   * CATEGORY rule > GLOBAL rule > `commission.default_bps` setting.
   * Works with the root prisma client or an interactive transaction client.
   */
  async resolveRate(
    txOrPrisma: any,
    businessId: string,
    categoryId?: string | null,
  ): Promise<CommissionRate> {
    const rules = await txOrPrisma.commission.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    const pick = (scope: string, key?: string | null) =>
      rules.find(
        (r: any) =>
          r.scope === scope &&
          (scope === 'GLOBAL' ||
            (key && (scope === 'BUSINESS' ? r.businessId === key : r.categoryId === key))),
      );
    const rule = pick('BUSINESS', businessId) ?? pick('CATEGORY', categoryId) ?? pick('GLOBAL');
    if (rule) {
      return {
        type: rule.type,
        percentBps: rule.percentBps ?? 0,
        fixedAmount: rule.fixedAmount ?? 0,
        ruleId: rule.id,
      };
    }
    const defaultBps = await getSettingValue<number>(txOrPrisma, 'commission.default_bps', 0);
    return { type: 'PERCENTAGE', percentBps: Math.max(0, defaultBps), fixedAmount: 0 };
  }

  /** Pure math: integer paisa, floor rounding. Exported for tests. */
  static computeCommissionPaisa(paidAmountPaisa: number, rate: CommissionRate): number {
    if (!Number.isInteger(paidAmountPaisa) || paidAmountPaisa <= 0) return 0;
    if (rate.type === 'FIXED') return Math.min(Math.max(0, rate.fixedAmount), paidAmountPaisa);
    return Math.floor((paidAmountPaisa * Math.max(0, rate.percentBps)) / 10000);
  }

  /**
   * Record the per-redemption commission row. MUST be called inside the
   * redemption confirm transaction (tx) so commission accrues atomically with
   * the redemption. Returns the created row, or null when nothing accrues.
   */
  async recordCommission(
    tx: any,
    args: { redemptionId: string; businessId: string; categoryId?: string | null; paidAmount: number },
  ) {
    const rate = await this.resolveRate(tx, args.businessId, args.categoryId);
    const commissionPaisa = CommissionsService.computeCommissionPaisa(args.paidAmount, rate);
    if (commissionPaisa <= 0) return null;
    return tx.commissionEntry.create({
      data: {
        kind: 'REDEMPTION',
        redemptionId: args.redemptionId,
        businessId: args.businessId,
        paidAmount: args.paidAmount,
        commissionBps: rate.type === 'PERCENTAGE' ? rate.percentBps : null,
        commissionPaisa,
        status: 'ACCRUED',
      },
    });
  }

  // ------------------------------------------------------------------ listing

  async listCommissions(query: CommissionQueryDto & { page?: number | string; pageSize?: number | string }) {
    const { page, pageSize, skip, take } = parsePagination(query as any);
    const where: any = {};
    if (query.businessId) where.businessId = query.businessId;
    if (query.kind) where.kind = query.kind;
    if (query.status) where.status = query.status;
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }
    const [total, rows] = await Promise.all([
      this.prisma.commissionEntry.count({ where }),
      this.prisma.commissionEntry.findMany({
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
  async businessCommissions(userId: string, roles: string[], businessId: string) {
    await this.assertCanViewBusiness(userId, roles, businessId);
    const [rows, totals] = await Promise.all([
      this.prisma.commissionEntry.findMany({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.commissionEntry.groupBy({
        by: ['status'],
        where: { businessId },
        _sum: { commissionPaisa: true },
      }),
    ]);
    return {
      items: rows,
      totals: Object.fromEntries(totals.map((t: any) => [t.status, t._sum.commissionPaisa ?? 0])),
    };
  }

  // ------------------------------------------------------------------ adjust

  /** Admin adjustment: creates a new signed ADJUSTMENT row (never edits history). */
  async adjustCommission(entryId: string, dto: AdjustCommissionDto) {
    const entry = await this.prisma.commissionEntry.findUnique({ where: { id: entryId } });
    if (!entry) {
      throw new NotFoundException({ code: 'COMMISSION_NOT_FOUND', message: 'Commission entry not found.' });
    }
    if (!dto.reason?.trim()) {
      throw new BadRequestException({ code: 'REASON_REQUIRED', message: 'A reason is required for commission adjustments.' });
    }
    if (!Number.isInteger(dto.amountPaisa) || dto.amountPaisa === 0) {
      throw new BadRequestException({ code: 'INVALID_AMOUNT', message: 'amountPaisa must be a non-zero integer paisa amount.' });
    }
    return this.prisma.commissionEntry.create({
      data: {
        kind: 'ADJUSTMENT',
        businessId: entry.businessId,
        commissionPaisa: dto.amountPaisa,
        status: 'ACCRUED',
        note: `Adjustment of entry ${entry.id}: ${dto.reason.trim()}`,
      },
    });
  }

  // ------------------------------------------------------------- rules (admin)

  async listRules() {
    return this.prisma.commission.findMany({
      where: { deletedAt: null },
      include: {
        business: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createRule(dto: CommissionRuleDto) {
    this.validateRule(dto);
    return this.prisma.commission.create({
      data: {
        scope: dto.scope as any,
        businessId: dto.businessId ?? null,
        categoryId: dto.categoryId ?? null,
        type: dto.type as any,
        percentBps: dto.type === 'PERCENTAGE' ? (dto.percentBps ?? 0) : null,
        fixedAmount: dto.type === 'FIXED' ? (dto.fixedAmount ?? 0) : null,
      },
    });
  }

  async updateRule(id: string, dto: Partial<CommissionRuleDto>) {
    const rule = await this.prisma.commission.findFirst({ where: { id, deletedAt: null } });
    if (!rule) throw new NotFoundException({ code: 'RULE_NOT_FOUND', message: 'Commission rule not found.' });
    const merged = { ...rule, ...dto } as any;
    this.validateRule(merged);
    return this.prisma.commission.update({
      where: { id },
      data: {
        scope: merged.scope,
        businessId: merged.businessId ?? null,
        categoryId: merged.categoryId ?? null,
        type: merged.type,
        percentBps: merged.type === 'PERCENTAGE' ? (merged.percentBps ?? 0) : null,
        fixedAmount: merged.type === 'FIXED' ? (merged.fixedAmount ?? 0) : null,
        isActive: merged.isActive ?? true,
      },
    });
  }

  async deleteRule(id: string) {
    const rule = await this.prisma.commission.findFirst({ where: { id, deletedAt: null } });
    if (!rule) throw new NotFoundException({ code: 'RULE_NOT_FOUND', message: 'Commission rule not found.' });
    return this.prisma.commission.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  }

  private validateRule(dto: any) {
    if (dto.scope === 'BUSINESS' && !dto.businessId) {
      throw new BadRequestException({ code: 'BUSINESS_REQUIRED', message: 'businessId is required for BUSINESS scope.' });
    }
    if (dto.scope === 'CATEGORY' && !dto.categoryId) {
      throw new BadRequestException({ code: 'CATEGORY_REQUIRED', message: 'categoryId is required for CATEGORY scope.' });
    }
    if (dto.type === 'PERCENTAGE' && (dto.percentBps === undefined || dto.percentBps < 0 || dto.percentBps > 10000)) {
      throw new BadRequestException({ code: 'INVALID_BPS', message: 'percentBps must be 0–10000.' });
    }
    if (dto.type === 'FIXED' && (dto.fixedAmount === undefined || dto.fixedAmount < 0)) {
      throw new BadRequestException({ code: 'INVALID_FIXED', message: 'fixedAmount must be a non-negative paisa amount.' });
    }
  }

  // ------------------------------------------------------------------ helpers

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
