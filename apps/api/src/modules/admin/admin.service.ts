import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuditLogQueryDto } from './dto/admin.dto';

/**
 * Admin domain logic — audit trail listing.
 * AuditLog rows are immutable (no updatedAt); writes come from the
 * AuditInterceptor attached via @Audit on mutating endpoints.
 */
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  /** Paginated audit trail, newest first, with actor info. */
  async getAuditLogs(query: AuditLogQueryDto) {
    const page = Math.max(query.page ?? 1, 1);
    const take = Math.min(Math.max(query.pageSize ?? 20, 1), 100);
    const skip = (page - 1) * take;
    const where: Record<string, unknown> = {};
    if (query.action) where.action = { contains: query.action, mode: 'insensitive' };
    if (query.actorId) where.actorId = query.actorId;
    if (query.entity) where.entity = query.entity;

    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { actor: { select: { id: true, firstName: true, lastName: true, email: true } } },
      }),
    ]);
    return { items: rows, page, pageSize: take, total, totalPages: Math.max(1, Math.ceil(total / take)) };
  }
}
