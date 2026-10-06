import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLES } from '../../common/constants';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { SyncPermissionsDto } from './dto/sync-permissions.dto';

/**
 * Role & permission administration. The 11 seeded roles / 20 permissions are
 * canonical (see packages/database/prisma/seed.ts); this module lets platform
 * admins extend them. The SUPER_ADMIN role is protected: its permission set
 * cannot be edited and it cannot be deleted.
 */
@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  private roleWithPermissions(id: string) {
    return this.prisma.role.findUnique({
      where: { id },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    });
  }

  async listRoles() {
    const roles = await this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    });
    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      userCount: r._count.users,
      permissions: r.permissions.map((rp) => rp.permission.key),
      protected: r.name === ROLES.SUPER_ADMIN,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async getRole(id: string) {
    const role = await this.roleWithPermissions(id);
    if (!role) {
      throw new NotFoundException({ code: 'ROLE_NOT_FOUND', message: 'Role not found.' });
    }
    return role;
  }

  async createRole(dto: CreateRoleDto) {
    const name = dto.name.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
      throw new BadRequestException({
        code: 'INVALID_ROLE_NAME',
        message: 'Role name must be UPPER_SNAKE_CASE.',
      });
    }
    const existing = await this.prisma.role.findUnique({ where: { name } });
    if (existing) {
      throw new ConflictException({ code: 'ROLE_EXISTS', message: 'Role already exists.' });
    }
    return this.prisma.role.create({ data: { name, description: dto.description } });
  }

  async updateRole(id: string, dto: UpdateRoleDto) {
    const role = await this.getRole(id);
    return this.prisma.role.update({
      where: { id: role.id },
      data: { description: dto.description },
    });
  }

  async deleteRole(id: string) {
    const role = await this.roleWithPermissions(id);
    if (!role) {
      throw new NotFoundException({ code: 'ROLE_NOT_FOUND', message: 'Role not found.' });
    }
    if (role.name === ROLES.SUPER_ADMIN) {
      throw new ForbiddenException({
        code: 'PROTECTED_ROLE',
        message: 'The super-admin role cannot be deleted.',
      });
    }
    if (role._count.users > 0) {
      throw new ConflictException({
        code: 'ROLE_IN_USE',
        message: `Role is assigned to ${role._count.users} user(s). Reassign them first.`,
      });
    }
    await this.prisma.role.delete({ where: { id } });
    return { deleted: true };
  }

  async listPermissions() {
    return this.prisma.permission.findMany({ orderBy: [{ group: 'asc' }, { key: 'asc' }] });
  }

  async syncPermissions(id: string, dto: SyncPermissionsDto) {
    const role = await this.getRole(id);
    if (role.name === ROLES.SUPER_ADMIN) {
      throw new ForbiddenException({
        code: 'PROTECTED_ROLE',
        message: 'The super-admin permission set cannot be modified.',
      });
    }

    const permissions = await this.prisma.permission.findMany({
      where: { key: { in: dto.permissions } },
      select: { id: true, key: true },
    });
    const found = new Set(permissions.map((p) => p.key));
    const missing = dto.permissions.filter((key) => !found.has(key));
    if (missing.length > 0) {
      throw new BadRequestException({
        code: 'PERMISSION_NOT_FOUND',
        message: `Unknown permissions: ${missing.join(', ')}`,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      if (permissions.length > 0) {
        await tx.rolePermission.createMany({
          data: permissions.map((p) => ({ roleId: id, permissionId: p.id })),
        });
      }
    });

    return this.getRole(id);
  }
}
