import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@bachatly/database';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLES } from '../../common/constants';
import { buildPaginatedResponse, parsePagination } from '../../common/utils/pagination';
import { UserQueryDto, USER_SORT_FIELDS } from './dto/user-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AssignRolesDto } from './dto/assign-roles.dto';

export interface UserListItem {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string;
  lastName: string;
  status: string;
  roles: string[];
  cityName: string | null;
  hasActiveMembership: boolean;
  createdAt: Date;
}

export interface UserDetail extends Record<string, unknown> {
  id: string;
  roles: string[];
  permissions: string[];
}

function stripHash(user: Record<string, unknown>): Record<string, unknown> {
  const { passwordHash: _ph, ...rest } = user;
  return rest;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // ------------------------------------------------------------------ list

  async listUsers(query: UserQueryDto) {
    const { page, pageSize, skip, take, orderBy } = parsePagination(query, USER_SORT_FIELDS);

    const where: Prisma.UserWhereInput = { deletedAt: null };
    if (query.q) {
      const q = query.q.trim();
      where.OR = [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
      ];
    }
    if (query.status) where.status = query.status;
    if (query.cityId) where.cityId = query.cityId;
    if (query.role) {
      where.roles = { some: { role: { name: query.role } } };
    }
    if (query.hasMembership === 'true') {
      where.memberships = { some: { status: 'ACTIVE' } };
    } else if (query.hasMembership === 'false') {
      where.memberships = { none: { status: 'ACTIVE' } };
    }

    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy,
        select: {
          id: true,
          email: true,
          phone: true,
          firstName: true,
          lastName: true,
          status: true,
          createdAt: true,
          city: { select: { name: true } },
          roles: { select: { role: { select: { name: true } } } },
          memberships: {
            where: { status: 'ACTIVE' },
            select: { id: true },
            take: 1,
          },
        },
      }),
    ]);

    const items: UserListItem[] = users.map((u) => ({
      id: u.id,
      email: u.email,
      phone: u.phone,
      firstName: u.firstName,
      lastName: u.lastName,
      status: u.status,
      roles: u.roles.map((r) => r.role.name),
      cityName: u.city?.name ?? null,
      hasActiveMembership: u.memberships.length > 0,
      createdAt: u.createdAt,
    }));

    return buildPaginatedResponse(items, total, page, pageSize);
  }

  // ------------------------------------------------------------------- detail

  async getUser(id: string): Promise<UserDetail> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: {
        profile: true,
        city: true,
        roles: {
          include: {
            role: { include: { permissions: { include: { permission: true } } } },
          },
        },
        memberships: {
          where: { status: 'ACTIVE' },
          include: { plan: true },
          orderBy: { endDate: 'desc' },
          take: 1,
        },
        wallet: true,
        rewardAccount: true,
      },
    });
    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found.' });
    }

    const cashbackAgg = await this.prisma.cashback.groupBy({
      by: ['status'],
      where: { userId: id },
      _sum: { amount: true },
      _count: true,
    });

    const referralStats = await this.prisma.referral.groupBy({
      by: ['status'],
      where: { referrerId: id },
      _count: true,
    });

    const sessions = await this.prisma.session.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        ip: true,
        userAgent: true,
        createdAt: true,
        expiresAt: true,
        revokedAt: true,
      },
    });

    const auditLogs = await this.prisma.auditLog.findMany({
      where: { OR: [{ actorId: id }, { entity: 'User', entityId: id }] },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const roles = user.roles.map((ur) => ur.role.name);
    const permissions = [
      ...new Set(
        user.roles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.key)),
      ),
    ];

    return {
      ...stripHash(user as unknown as Record<string, unknown>),
      roles,
      permissions,
      activeMembership: user.memberships[0] ?? null,
      cashbackByStatus: cashbackAgg,
      referralsByStatus: referralStats,
      recentSessions: sessions,
      recentAuditLogs: auditLogs,
    } as unknown as UserDetail;
  }

  // ------------------------------------------------------------------ update

  async updateUser(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, roles: { select: { role: { select: { name: true } } } } },
    });
    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found.' });
    }

    if (dto.phone) {
      const clash = await this.prisma.user.findFirst({
        where: { phone: dto.phone, id: { not: id }, deletedAt: null },
        select: { id: true },
      });
      if (clash) {
        throw new ConflictException({
          code: 'PHONE_TAKEN',
          message: 'This phone number is already in use.',
        });
      }
    }
    if (dto.cityId) {
      const city = await this.prisma.city.findUnique({
        where: { id: dto.cityId },
        select: { id: true },
      });
      if (!city) {
        throw new BadRequestException({ code: 'CITY_NOT_FOUND', message: 'City not found.' });
      }
    }
    if (dto.status === 'SUSPENDED' && user.roles.some((r) => r.role.name === ROLES.SUPER_ADMIN)) {
      throw new ForbiddenException({
        code: 'PROTECTED_ROLE',
        message: 'Super admin accounts cannot be suspended here.',
      });
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        cityId: dto.cityId,
        status: dto.status,
      },
      include: { profile: true, city: true },
    });
    return stripHash(updated as unknown as Record<string, unknown>);
  }

  // ------------------------------------------------------- suspend / reactivate

  private async setStatus(id: string, status: 'SUSPENDED' | 'ACTIVE', reason?: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, status: true, roles: { select: { role: { select: { name: true } } } } },
    });
    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found.' });
    }
    if (user.roles.some((r) => r.role.name === ROLES.SUPER_ADMIN)) {
      throw new ForbiddenException({
        code: 'PROTECTED_ROLE',
        message: 'Super admin accounts cannot be suspended or reactivated here.',
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.update({ where: { id }, data: { status } });
      if (status === 'SUSPENDED') {
        // Suspended users lose API access immediately: kill all sessions.
        await tx.session.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      return u;
    });

    return { ...stripHash(updated as unknown as Record<string, unknown>), reason: reason ?? null };
  }

  suspendUser(id: string, reason: string) {
    return this.setStatus(id, 'SUSPENDED', reason);
  }

  reactivateUser(id: string) {
    return this.setStatus(id, 'ACTIVE');
  }

  // ------------------------------------------------------------------- roles

  /**
   * Replaces the user's full role set. Admin-only. Audited by the controller's
   * @Audit decorator. Guards against removing one's own SUPER_ADMIN role.
   */
  async assignRoles(id: string, dto: AssignRolesDto, actorId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        roles: { select: { role: { select: { name: true } } } },
      },
    });
    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found.' });
    }

    const roles = await this.prisma.role.findMany({
      where: { name: { in: dto.roles } },
      select: { id: true, name: true },
    });
    const found = new Set(roles.map((r) => r.name));
    const missing = dto.roles.filter((name) => !found.has(name));
    if (missing.length > 0) {
      throw new BadRequestException({
        code: 'ROLE_NOT_FOUND',
        message: `Unknown roles: ${missing.join(', ')}`,
      });
    }

    const hadSuperAdmin = user.roles.some((r) => r.role.name === ROLES.SUPER_ADMIN);
    const keepsSuperAdmin = roles.some((r) => r.name === ROLES.SUPER_ADMIN);
    if (id === actorId && hadSuperAdmin && !keepsSuperAdmin) {
      throw new ForbiddenException({
        code: 'SELF_DEMOTE_BLOCKED',
        message: 'You cannot remove your own super-admin role.',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.createMany({
        data: roles.map((r) => ({ userId: id, roleId: r.id })),
      });
    });

    return this.getUser(id);
  }
}
