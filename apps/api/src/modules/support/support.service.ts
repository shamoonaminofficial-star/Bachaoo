import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationDispatchService } from '../notifications/dispatch.service';
import { parsePagination, buildPaginatedResponse } from '../../common/utils/pagination';
import { ADMIN_ROLES } from '../../common/constants';

export const TICKET_CATEGORIES = [
  'PAYMENT',
  'DEAL',
  'MEMBERSHIP',
  'ACCOUNT',
  'BUSINESS',
  'TECHNICAL',
  'OTHER',
] as const;

export interface CreateTicketInput {
  subject: string;
  category?: string;
  message: string;
  attachments?: string[];
  businessId?: string;
}

/**
 * Phase 11 — customer/partner support tickets.
 *
 * - Customers and partners open and manage their own tickets.
 * - Admins/support agents see all tickets; their replies move the ticket to
 *   WAITING_FOR_CUSTOMER and notify the owner (best-effort).
 * - Messages are immutable (no updatedAt on the model) — corrections are new messages.
 */
@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotificationDispatchService,
  ) {}

  private isStaff(roles: string[]): boolean {
    return roles.some((r) => [...ADMIN_ROLES, 'SUPPORT_AGENT'].includes(r));
  }

  async listTickets(userId: string, roles: string[], query: { page?: number | string; pageSize?: number | string; status?: string }) {
    const { page, take, skip } = parsePagination(query as never);
    const where: Record<string, unknown> = this.isStaff(roles) ? {} : { userId };
    if (query.status) where.status = query.status;
    const [total, rows] = await Promise.all([
      this.prisma.supportTicket.count({ where: where as never }),
      this.prisma.supportTicket.findMany({
        where: where as never,
        include: {
          user: { select: { firstName: true, lastName: true, email: true } },
          _count: { select: { messages: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
      }),
    ]);
    return buildPaginatedResponse(rows.map(mapTicket), total, page, take);
  }

  async getTicket(userId: string, roles: string[], id: string) {
    const ticket = await this.assertVisible(userId, roles, id);
    const messages = await this.prisma.supportMessage.findMany({
      where: { ticketId: id },
      include: { sender: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return {
      ...mapTicket(ticket),
      messages: messages.map((m: any) => ({
        id: m.id,
        senderId: m.senderId,
        senderName: [m.sender?.firstName, m.sender?.lastName].filter(Boolean).join(' ') || 'User',
        message: m.message,
        attachments: m.attachments ?? [],
        createdAt: new Date(m.createdAt).toISOString(),
      })),
    };
  }

  async createTicket(userId: string, input: CreateTicketInput) {
    const subject = (input.subject || '').trim();
    const message = (input.message || '').trim();
    if (subject.length < 5 || subject.length > 200) {
      throw new BadRequestException({ code: 'INVALID_SUBJECT', message: 'Subject must be 5–200 characters.' });
    }
    if (message.length < 10 || message.length > 5000) {
      throw new BadRequestException({ code: 'INVALID_MESSAGE', message: 'Message must be 10–5000 characters.' });
    }
    const category = (input.category || 'OTHER').toUpperCase();
    if (!(TICKET_CATEGORIES as readonly string[]).includes(category)) {
      throw new BadRequestException({ code: 'INVALID_CATEGORY', message: `Category must be one of: ${TICKET_CATEGORIES.join(', ')}.` });
    }
    const attachments = sanitizeAttachments(input.attachments);
    const ticketNumber = await this.uniqueTicketNumber();
    const ticket = await this.prisma.$transaction(async (tx: any) => {
      const t = await tx.supportTicket.create({
        data: {
          ticketNumber,
          userId,
          businessId: input.businessId ?? null,
          category,
          subject,
          description: message,
          status: 'OPEN',
        },
      });
      await tx.supportMessage.create({
        data: { ticketId: t.id, senderId: userId, message, attachments: attachments as never },
      });
      return t;
    });
    return this.getTicket(userId, [], ticket.id);
  }

  async addMessage(userId: string, roles: string[], ticketId: string, input: { message: string; attachments?: string[] }) {
    const ticket = await this.assertVisible(userId, roles, ticketId);
    if (ticket.status === 'CLOSED') {
      throw new BadRequestException({ code: 'TICKET_CLOSED', message: 'This ticket is closed. Open a new ticket to continue.' });
    }
    const message = (input.message || '').trim();
    if (message.length < 1 || message.length > 5000) {
      throw new BadRequestException({ code: 'INVALID_MESSAGE', message: 'Message must be 1–5000 characters.' });
    }
    const staff = this.isStaff(roles);
    const nextStatus = staff ? 'WAITING_FOR_CUSTOMER' : 'OPEN';
    await this.prisma.$transaction(async (tx: any) => {
      await tx.supportMessage.create({
        data: {
          ticketId,
          senderId: userId,
          message,
          attachments: sanitizeAttachments(input.attachments) as never,
        },
      });
      await tx.supportTicket.update({ where: { id: ticketId }, data: { status: nextStatus } });
    });
    if (staff && ticket.userId !== userId) {
      // Notify the ticket owner about the staff reply — best-effort.
      this.notify?.dispatch(ticket.userId, {
          type: 'SUPPORT_REPLY',
          title: `Support replied: ${ticket.subject}`,
          body: message.slice(0, 200),
          data: { ticketId, ticketNumber: ticket.ticketNumber },
          channels: ['IN_APP', 'EMAIL'],
        })
        ?.catch(() => null);
    }
    return this.getTicket(userId, roles, ticketId);
  }

  async closeTicket(userId: string, roles: string[], ticketId: string) {
    const ticket = await this.assertVisible(userId, roles, ticketId);
    if (ticket.status === 'CLOSED') {
      throw new BadRequestException({ code: 'TICKET_CLOSED', message: 'Ticket is already closed.' });
    }
    await this.prisma.supportTicket.update({ where: { id: ticketId }, data: { status: 'CLOSED' } });
    return this.getTicket(userId, roles, ticketId);
  }

  /** Public FAQ, grouped by category, from CMS entries. */
  async getFaq(): Promise<Array<{ category: string; items: Array<{ question: string; answer: string }> }>> {
    const rows = await this.prisma.faqEntry.findMany({
      where: { isPublished: true },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
    });
    const groups = new Map<string, Array<{ question: string; answer: string }>>();
    for (const r of rows) {
      const list = groups.get(r.category) ?? [];
      list.push({ question: r.question, answer: r.answer });
      groups.set(r.category, list);
    }
    return [...groups.entries()].map(([category, items]) => ({ category, items }));
  }

  // ------------------------------------------------------------------ helpers

  private async assertVisible(userId: string, roles: string[], id: string) {
    const ticket: any = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    });
    if (!ticket) {
      throw new NotFoundException({ code: 'TICKET_NOT_FOUND', message: 'Ticket not found.' });
    }
    if (!this.isStaff(roles) && ticket.userId !== userId) {
      throw new ForbiddenException({ code: 'NOT_TICKET_OWNER', message: 'You do not own this ticket.' });
    }
    return ticket;
  }

  private async uniqueTicketNumber(): Promise<string> {
    const year = new Date().getFullYear();
    for (let i = 0; i < 5; i++) {
      const suffix = randomBytes(3).toString('hex').toUpperCase();
      const ticketNumber = `TKT-${year}-${suffix}`;
      const exists = await this.prisma.supportTicket.findUnique({ where: { ticketNumber }, select: { id: true } });
      if (!exists) return ticketNumber;
    }
    return `TKT-${year}-${randomBytes(4).toString('hex').toUpperCase()}`;
  }
}

function mapTicket(t: any) {
  return {
    id: t.id,
    ticketNumber: t.ticketNumber,
    category: t.category,
    subject: t.subject,
    status: t.status,
    priority: t.priority,
    messageCount: t._count?.messages ?? undefined,
    customerName: t.user ? [t.user.firstName, t.user.lastName].filter(Boolean).join(' ') || t.user.email : undefined,
    createdAt: new Date(t.createdAt).toISOString(),
    updatedAt: new Date(t.updatedAt).toISOString(),
  };
}

function sanitizeAttachments(attachments?: string[]): string[] {
  if (!Array.isArray(attachments)) return [];
  const out: string[] = [];
  for (const a of attachments.slice(0, 5)) {
    if (typeof a === 'string' && /^https?:\/\//.test(a) && a.length <= 2000 && !out.includes(a)) out.push(a);
  }
  return out;
}
