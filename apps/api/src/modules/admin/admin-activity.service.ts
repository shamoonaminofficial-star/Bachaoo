import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ActivityItem {
  type: 'redemption' | 'membership' | 'payment' | 'business' | 'deal' | 'review' | 'ticket';
  label: string;
  at: string;
  amount?: number; // paisa, when money is involved
  actor?: string;
  meta?: Record<string, unknown>;
}

/**
 * Phase 9 — unified recent-activity feed for the admin overview page.
 * Read-only fan-out over the latest rows of the main activity tables.
 */
@Injectable()
export class AdminActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async getActivity(limit = 30): Promise<ActivityItem[]> {
    const take = Math.min(Math.max(limit, 1), 50);
    const [redemptions, memberships, payments, businesses, deals, reviews, tickets] = await Promise.all([
      this.prisma.redemption.findMany({
        take,
        orderBy: { createdAt: 'desc' },
        where: { status: 'CONFIRMED' },
        include: {
          deal: { select: { title: true } },
          business: { select: { name: true } },
          user: { select: { firstName: true } },
        },
      }),
      this.prisma.membership.findMany({
        take,
        orderBy: { createdAt: 'desc' },
        include: { plan: { select: { name: true } }, user: { select: { firstName: true } } },
      }),
      this.prisma.payment.findMany({
        take,
        orderBy: { createdAt: 'desc' },
        where: { status: { in: ['PAID', 'AWAITING_VERIFICATION'] } },
        select: { id: true, amount: true, status: true, orderType: true, gateway: true, createdAt: true },
      }),
      this.prisma.businessApplication.findMany({
        take,
        orderBy: { createdAt: 'desc' },
        select: { id: true, businessName: true, status: true, createdAt: true },
      }),
      this.prisma.deal.findMany({
        take,
        orderBy: { updatedAt: 'desc' },
        where: { deletedAt: null },
        select: { id: true, title: true, status: true, updatedAt: true, business: { select: { name: true } } },
      }),
      this.prisma.review.findMany({
        take,
        orderBy: { createdAt: 'desc' },
        select: { id: true, rating: true, status: true, createdAt: true, business: { select: { name: true } } },
      }),
      this.prisma.supportTicket.findMany({
        take,
        orderBy: { createdAt: 'desc' },
        select: { id: true, ticketNumber: true, subject: true, status: true, priority: true, createdAt: true },
      }),
    ]);

    const items: ActivityItem[] = [
      ...redemptions.map((r) => ({
        type: 'redemption' as const,
        label: `${r.user.firstName} redeemed "${r.deal.title}" at ${r.business.name}`,
        at: r.createdAt.toISOString(),
        amount: r.savingAmount ?? undefined,
        actor: r.user.firstName,
        meta: { dealId: r.dealId, businessId: r.businessId },
      })),
      ...memberships.map((m) => ({
        type: 'membership' as const,
        label: `${m.user.firstName} — ${m.plan.name} membership ${m.status.toLowerCase()}`,
        at: m.createdAt.toISOString(),
        actor: m.user.firstName,
        meta: { planId: m.planId, status: m.status },
      })),
      ...payments.map((p) => ({
        type: 'payment' as const,
        label: `${p.orderType.toLowerCase()} payment ${p.status.toLowerCase()} via ${p.gateway}`,
        at: p.createdAt.toISOString(),
        amount: p.amount,
        meta: { orderType: p.orderType, status: p.status },
      })),
      ...businesses.map((b) => ({
        type: 'business' as const,
        label: `Application "${b.businessName}" is ${b.status.toLowerCase().replace(/_/g, ' ')}`,
        at: b.createdAt.toISOString(),
        meta: { applicationId: b.id, status: b.status },
      })),
      ...deals.map((d) => ({
        type: 'deal' as const,
        label: `Deal "${d.title}" (${d.business.name}) is ${d.status.toLowerCase().replace(/_/g, ' ')}`,
        at: d.updatedAt.toISOString(),
        meta: { dealId: d.id, status: d.status },
      })),
      ...reviews.map((r) => ({
        type: 'review' as const,
        label: `${r.rating}★ review for ${r.business.name} (${r.status.toLowerCase()})`,
        at: r.createdAt.toISOString(),
        meta: { reviewId: r.id, rating: r.rating },
      })),
      ...tickets.map((t) => ({
        type: 'ticket' as const,
        label: `Ticket ${t.ticketNumber}: "${t.subject}" (${t.status.toLowerCase()})`,
        at: t.createdAt.toISOString(),
        meta: { ticketId: t.id, priority: t.priority },
      })),
    ];

    return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, take);
  }
}
