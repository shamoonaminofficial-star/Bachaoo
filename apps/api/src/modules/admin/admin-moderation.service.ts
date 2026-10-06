import { BadRequestException, Inject, Injectable, Logger, NotFoundException, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { BusinessesService } from '../businesses/businesses.service';
import { DealsService } from '../deals/deals.service';
import { ReviewsService } from '../reviews/reviews.service';
import { AdminOverviewService } from './admin-overview.service';
import { FRAUD_ALERTS_KEY } from '../redemptions/redemptions.service';
import type { BatchBusinessesDto, BatchDealsDto, ModerateReviewDto, UpdateTicketDto } from './dto/admin.dto';

export interface BatchItemResult {
  id: string;
  ok: boolean;
  error?: { code: string; message: string };
}

/**
 * Phase 9 — admin moderation workflows: bulk business/deal actions, review
 * moderation queue, support ticket triage, and fraud-alert surfacing.
 *
 * Batch actions run per-item so one bad id never kills the batch; each item
 * returns ok/error. Destructive actions require a reason (suspend, reject).
 * Writes are audited via @Audit on the controller.
 */
@Injectable()
export class AdminModerationService {
  private readonly logger = new Logger(AdminModerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly businesses: BusinessesService,
    private readonly deals: DealsService,
    private readonly overview: AdminOverviewService,
    @Inject(forwardRef(() => ReviewsService)) private readonly reviews: ReviewsService,
  ) {}

  // ------------------------------------------------------------------ batch

  async batchBusinesses(adminId: string, dto: BatchBusinessesDto): Promise<{ results: BatchItemResult[] }> {
    if (dto.ids.length > 50) {
      throw new BadRequestException({ code: 'BATCH_TOO_LARGE', message: 'At most 50 items per batch.' });
    }
    if (dto.action === 'suspend' && (!dto.reason || !dto.reason.trim())) {
      throw new BadRequestException({ code: 'REASON_REQUIRED', message: 'A reason is required to suspend businesses.' });
    }
    const results: BatchItemResult[] = [];
    for (const id of dto.ids) {
      try {
        if (dto.action === 'verify') await this.businesses.verify(id);
        else if (dto.action === 'reactivate') await this.businesses.reactivate(id);
        else await this.businesses.suspend(id, { reason: dto.reason!.trim() });
        results.push({ id, ok: true });
      } catch (err) {
        results.push({ id, ok: false, error: this.toError(err) });
      }
    }
    await this.overview.invalidateOverview().catch(() => null);
    return { results };
  }

  async batchDeals(adminId: string, roles: string[], dto: BatchDealsDto): Promise<{ results: BatchItemResult[] }> {
    if (dto.ids.length > 50) {
      throw new BadRequestException({ code: 'BATCH_TOO_LARGE', message: 'At most 50 items per batch.' });
    }
    if (dto.action === 'reject' && (!dto.reason || !dto.reason.trim())) {
      throw new BadRequestException({ code: 'REASON_REQUIRED', message: 'A reason is required to reject deals.' });
    }
    const results: BatchItemResult[] = [];
    for (const id of dto.ids) {
      try {
        if (dto.action === 'approve') await this.deals.approve(adminId, id);
        else if (dto.action === 'reject') await this.deals.reject(adminId, id, dto.reason!.trim());
        else if (dto.action === 'publish') await this.deals.publish(adminId, roles, id);
        else await this.adminPauseDeal(id);
        results.push({ id, ok: true });
      } catch (err) {
        results.push({ id, ok: false, error: this.toError(err) });
      }
    }
    await this.overview.invalidateOverview().catch(() => null);
    return { results };
  }

  /**
   * Admin-level pause (PUBLISHED -> PAUSED). The partner-only deals.pause()
   * asserts partner ownership, so admins use this direct transition instead.
   */
  private async adminPauseDeal(id: string) {
    const deal = await this.prisma.deal.findFirst({ where: { id, deletedAt: null } });
    if (!deal) throw new NotFoundException({ code: 'DEAL_NOT_FOUND', message: 'Deal not found.' });
    if (deal.status !== 'PUBLISHED') {
      throw new BadRequestException({ code: 'INVALID_STATUS_TRANSITION', message: 'Only published deals can be paused.' });
    }
    return this.prisma.deal.update({ where: { id }, data: { status: 'PAUSED' } });
  }

  // ---------------------------------------------------------------- reviews

  /** Moderation queue: newest unreviewed first. */
  async pendingReviews(page = 1, pageSize = 20) {
    const take = Math.min(Math.max(pageSize, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;
    const [total, rows] = await Promise.all([
      this.prisma.review.count({ where: { status: 'PENDING' } }),
      this.prisma.review.findMany({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          business: { select: { id: true, name: true } },
          user: { select: { id: true, firstName: true, lastName: true } },
          deal: { select: { id: true, title: true } },
        },
      }),
    ]);
    return { items: rows, page, pageSize: take, total, totalPages: Math.max(1, Math.ceil(total / take)) };
  }

  async moderateReview(adminId: string, id: string, dto: ModerateReviewDto) {
    const review = await this.prisma.review.findUnique({ where: { id } });
    if (!review) throw new NotFoundException({ code: 'REVIEW_NOT_FOUND', message: 'Review not found.' });
    if (review.status !== 'PENDING') {
      throw new BadRequestException({ code: 'ALREADY_MODERATED', message: `Review is already ${review.status.toLowerCase()}.` });
    }
    if (dto.action === 'REJECT' && (!dto.reason || !dto.reason.trim())) {
      throw new BadRequestException({ code: 'REASON_REQUIRED', message: 'A reason is required to reject a review.' });
    }
    const updated = await this.prisma.review.update({
      where: { id },
      data: { status: dto.action === 'APPROVE' ? 'APPROVED' : 'REJECTED' },
    });
    // Keep the denormalized business rating honest after every moderation.
    await this.reviews.recomputeBusinessRating(review.businessId).catch((e: Error) => {
      this.logger.warn(`rating recompute failed for ${review.businessId}: ${e.message}`);
    });
    await this.overview.invalidateOverview().catch(() => null);
    return updated;
  }

  // ---------------------------------------------------------------- support

  async listTickets(query: { page?: number; pageSize?: number; status?: string; q?: string }) {
    const page = Math.max(query.page ?? 1, 1);
    const take = Math.min(Math.max(query.pageSize ?? 20, 1), 100);
    const skip = (page - 1) * take;
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.q) {
      where.OR = [
        { ticketNumber: { contains: query.q, mode: 'insensitive' } },
        { subject: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    const [total, rows] = await Promise.all([
      this.prisma.supportTicket.count({ where }),
      this.prisma.supportTicket.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
          assignee: { select: { id: true, firstName: true, lastName: true } },
          business: { select: { id: true, name: true } },
        },
      }),
    ]);
    return { items: rows, page, pageSize: take, total, totalPages: Math.max(1, Math.ceil(total / take)) };
  }

  async getTicket(id: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignee: { select: { id: true, firstName: true, lastName: true } },
        business: { select: { id: true, name: true } },
        messages: { orderBy: { createdAt: 'asc' }, include: { sender: { select: { id: true, firstName: true } } } },
      },
    });
    if (!ticket) throw new NotFoundException({ code: 'TICKET_NOT_FOUND', message: 'Ticket not found.' });
    return ticket;
  }

  async updateTicket(adminId: string, id: string, dto: UpdateTicketDto) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException({ code: 'TICKET_NOT_FOUND', message: 'Ticket not found.' });
    if (dto.assignedTo) {
      const assignee = await this.prisma.user.findFirst({ where: { id: dto.assignedTo, deletedAt: null } });
      if (!assignee) throw new NotFoundException({ code: 'ASSIGNEE_NOT_FOUND', message: 'Assignee not found.' });
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const t = await tx.supportTicket.update({
        where: { id },
        data: {
          ...(dto.status ? { status: dto.status } : {}),
          ...(dto.priority ? { priority: dto.priority } : {}),
          ...(dto.assignedTo !== undefined ? { assignedTo: dto.assignedTo || null } : {}),
        },
      });
      if (dto.note?.trim()) {
        await tx.supportMessage.create({
          data: { ticketId: id, senderId: adminId, message: `[internal] ${dto.note.trim()}` },
        });
      }
      return t;
    });
    await this.overview.invalidateOverview().catch(() => null);
    return updated;
  }

  // ------------------------------------------------------------ fraud alerts

  /**
   * Fraud signals persisted by Phase 6's validate() hook (SUSPICIOUS_QR_RATE).
   * Stored in a capped Redis list (200 events, 7d TTL) — never blocks redemption.
   */
  async fraudAlerts(limit = 50) {
    const take = Math.min(Math.max(limit, 1), 200);
    try {
      const raw = await this.redis.lrange(FRAUD_ALERTS_KEY, 0, take - 1);
      return {
        items: raw.map((r) => {
          try {
            return JSON.parse(r);
          } catch {
            return { raw: r };
          }
        }),
        total: await this.redis.llen(FRAUD_ALERTS_KEY),
      };
    } catch (err) {
      this.logger.warn(`fraud alerts read failed: ${(err as Error).message}`);
      return { items: [], total: 0 };
    }
  }

  /** Clear the feed after review (the ack itself is recorded in the audit log). */
  async ackFraudAlerts(): Promise<{ acknowledged: boolean; cleared: number }> {
    try {
      const cleared = await this.redis.llen(FRAUD_ALERTS_KEY);
      await this.redis.del(FRAUD_ALERTS_KEY);
      return { acknowledged: true, cleared };
    } catch (err) {
      this.logger.warn(`fraud alerts ack failed: ${(err as Error).message}`);
      return { acknowledged: false, cleared: 0 };
    }
  }

  // ---------------------------------------------------------------- helpers

  private toError(err: unknown): { code: string; message: string } {
    const e = err as { response?: { code?: string; message?: string }; message?: string; status?: number };
    const code = e?.response?.code ?? (e?.status === 404 ? 'NOT_FOUND' : 'ACTION_FAILED');
    const message = e?.response?.message ?? e?.message ?? 'Action failed.';
    return { code: String(code), message: String(message) };
  }
}
