import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { parsePagination, buildPaginatedResponse } from '../../common/utils/pagination';

export interface NotificationDto {
  id: string;
  type: string | null;
  title: string;
  body: string;
  channel: string;
  status: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  sentAt: string | null;
  createdAt: string;
}

/**
 * Phase 11 — caller's in-app notification inbox.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listNotifications(
    userId: string,
    query: { page?: number | string; pageSize?: number | string; unreadOnly?: boolean | string },
  ) {
    const { page, take, skip } = parsePagination(query as never);
    const unreadOnly = query.unreadOnly === true || query.unreadOnly === 'true';
    const where: Record<string, unknown> = { userId, channel: 'IN_APP' };
    if (unreadOnly) where.readAt = null;
    const [total, rows] = await Promise.all([
      this.prisma.notification.count({ where: where as never }),
      this.prisma.notification.findMany({
        where: where as never,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);
    return buildPaginatedResponse(rows.map(mapDto), total, page, take);
  }

  async unreadCount(userId: string): Promise<{ unread: number }> {
    const unread = await this.prisma.notification.count({
      where: { userId, channel: 'IN_APP', readAt: null } as never,
    });
    return { unread };
  }

  async markAsRead(userId: string, id: string) {
    const row = await this.prisma.notification.findFirst({
      where: { id, userId, channel: 'IN_APP' } as never,
    });
    if (!row) {
      throw new NotFoundException({ code: 'NOTIFICATION_NOT_FOUND', message: 'Notification not found.' });
    }
    if (!row.readAt) {
      await this.prisma.notification.update({ where: { id }, data: { readAt: new Date(), status: 'OPENED' } as never });
    }
    return mapDto({ ...row, readAt: row.readAt ?? new Date() });
  }

  async markAllAsRead(userId: string): Promise<{ marked: number }> {
    const res = await this.prisma.notification.updateMany({
      where: { userId, channel: 'IN_APP', readAt: null } as never,
      data: { readAt: new Date(), status: 'OPENED' } as never,
    });
    return { marked: res.count };
  }
}

function mapDto(n: Record<string, any>): NotificationDto {
  return {
    id: n.id,
    type: n.type ?? null,
    title: n.title,
    body: n.body,
    channel: n.channel,
    status: n.status,
    data: n.data ?? null,
    readAt: n.readAt ? new Date(n.readAt).toISOString() : null,
    sentAt: n.sentAt ? new Date(n.sentAt).toISOString() : null,
    createdAt: new Date(n.createdAt).toISOString(),
  };
}
