import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

// ---------------------------------------------------------------------------
// Phase 8 — business staff management.
//
// - Invite by email: if a Bachatly user already has that email, the link is
//   created immediately (active) and the matching platform role is granted.
//   Otherwise a pending StaffInvitation with a secret accept-token is created;
//   the invitee accepts it from their own signed-in account.
// - Owner links (StaffRole OWNER) are protected: the last remaining owner of a
//   business can never be removed or demoted — 409 CANNOT_REMOVE_LAST_OWNER.
// - Every write is audited by the controller's @Audit decorator.
// ---------------------------------------------------------------------------

export type StaffRoleInput = 'OWNER' | 'MANAGER' | 'CASHIER' | 'SCANNER';

const INVITABLE_ROLES: StaffRoleInput[] = ['OWNER', 'MANAGER', 'CASHIER', 'SCANNER'];

/** StaffRole -> seeded platform role name for route guards. */
const STAFF_ROLE_TO_PLATFORM_ROLE: Record<StaffRoleInput, string> = {
  OWNER: 'BUSINESS_OWNER',
  MANAGER: 'BUSINESS_MANAGER',
  CASHIER: 'CASHIER',
  SCANNER: 'SCANNER',
};

const INVITATION_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Phase 8: staffCount lives on the partner dashboard — bust it on change. */
  private async bumpPartnerCache(businessId: string) {
    try {
      await this.redis.del(`partner-dashboard:${businessId}`);
    } catch {
      /* best effort — TTL is the net */
    }
  }

  // ------------------------------------------------------------------ list

  async listStaff(businessId: string) {
    const links = await this.prisma.businessStaff.findMany({
      where: { businessId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        branch: { select: { id: true, name: true } },
      },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });
    return links.map((l) => ({
      staffId: l.id,
      user: l.user,
      role: l.role,
      branch: l.branch ? { id: l.branch.id, name: l.branch.name } : null,
      isActive: l.isActive,
      createdAt: l.createdAt,
    }));
  }

  // ------------------------------------------------------------------ invite

  async inviteStaff(
    invitedByUserId: string,
    businessId: string,
    dto: { email: string; role: StaffRoleInput; branchId?: string },
  ) {
    const email = dto.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      throw new BadRequestException({ code: 'INVALID_EMAIL', message: 'A valid email is required.' });
    }
    if (!INVITABLE_ROLES.includes(dto.role)) {
      throw new BadRequestException({ code: 'INVALID_STAFF_ROLE', message: 'Invalid staff role.' });
    }
    const business = await this.prisma.business.findFirst({
      where: { id: businessId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!business) throw new NotFoundException({ code: 'BUSINESS_NOT_FOUND', message: 'Business not found.' });

    if (dto.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: dto.branchId, businessId, deletedAt: null },
        select: { id: true },
      });
      if (!branch) throw new BadRequestException({ code: 'BRANCH_NOT_FOUND', message: 'Branch does not belong to this business.' });
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });
    if (existingUser) {
      const existing = await this.prisma.businessStaff.findUnique({
        where: { businessId_userId: { businessId, userId: existingUser.id } },
      });
      if (existing) {
        throw new ConflictException({ code: 'STAFF_ALREADY_LINKED', message: 'This user is already staff of this business.' });
      }
      const link = await this.prisma.businessStaff.create({
        data: {
          businessId,
          userId: existingUser.id,
          role: dto.role,
          branchId: dto.branchId ?? null,
        },
      });
      await this.grantPlatformRole(existingUser.id, dto.role);
      await this.bumpPartnerCache(businessId);
      return {
        status: 'LINKED' as const,
        staffId: link.id,
        role: link.role,
        message: 'User was already registered — linked as staff immediately.',
      };
    }

    const pending = await this.prisma.staffInvitation.findFirst({
      where: { businessId, email, status: 'PENDING', expiresAt: { gt: new Date() } },
    });
    if (pending) {
      throw new ConflictException({
        code: 'INVITATION_PENDING',
        message: 'A pending invitation already exists for this email.',
      });
    }

    const invitation = await this.prisma.staffInvitation.create({
      data: {
        businessId,
        invitedBy: invitedByUserId,
        email,
        role: dto.role,
        branchId: dto.branchId ?? null,
        token: randomBytes(32).toString('hex'),
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      },
    });
    return {
      status: 'INVITED' as const,
      invitationId: invitation.id,
      expiresAt: invitation.expiresAt,
      // Returned once so the owner can forward the invite link to the
      // invitee (email delivery hook lands in Phase 11 notifications).
      acceptToken: invitation.token,
    };
  }

  // ------------------------------------------------------------------ accept

  async acceptInvitation(userId: string, token: string) {
    const invitation = await this.prisma.staffInvitation.findUnique({ where: { token } });
    if (!invitation) throw new NotFoundException({ code: 'INVITATION_NOT_FOUND', message: 'Invitation not found.' });
    if (invitation.status !== 'PENDING') {
      throw new GoneException({ code: 'INVITATION_USED', message: 'This invitation is no longer valid.' });
    }
    if (invitation.expiresAt.getTime() < Date.now()) {
      await this.prisma.staffInvitation.update({ where: { id: invitation.id }, data: { status: 'EXPIRED' } });
      throw new GoneException({ code: 'INVITATION_EXPIRED', message: 'This invitation has expired.' });
    }
    const me = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!me || (me.email ?? '').trim().toLowerCase() !== invitation.email.toLowerCase()) {
      throw new ForbiddenException({
        code: 'INVITATION_EMAIL_MISMATCH',
        message: 'This invitation was sent to a different email address.',
      });
    }

    const link = await this.prisma.businessStaff.upsert({
      where: { businessId_userId: { businessId: invitation.businessId, userId } },
      create: {
        businessId: invitation.businessId,
        userId,
        role: invitation.role as StaffRoleInput,
        branchId: invitation.branchId,
      },
      update: { isActive: true, role: invitation.role as StaffRoleInput, branchId: invitation.branchId },
    });
    await this.grantPlatformRole(userId, invitation.role as StaffRoleInput);
    await this.prisma.staffInvitation.update({ where: { id: invitation.id }, data: { status: 'ACCEPTED' } });
    await this.bumpPartnerCache(invitation.businessId);

    return { staffId: link.id, businessId: invitation.businessId, role: link.role };
  }

  // ------------------------------------------------------------ role change

  async updateStaffRole(businessId: string, staffId: string, dto: { role: StaffRoleInput }) {
    if (!INVITABLE_ROLES.includes(dto.role)) {
      throw new BadRequestException({ code: 'INVALID_STAFF_ROLE', message: 'Invalid staff role.' });
    }
    const link = await this.prisma.businessStaff.findFirst({ where: { id: staffId, businessId } });
    if (!link) throw new NotFoundException({ code: 'STAFF_NOT_FOUND', message: 'Staff member not found.' });
    if (link.role === 'OWNER' && dto.role !== 'OWNER') {
      await this.assertNotLastOwner(businessId, link.userId);
    }
    const updated = await this.prisma.businessStaff.update({
      where: { id: staffId },
      data: { role: dto.role },
    });
    await this.bumpPartnerCache(businessId);
    return { staffId: updated.id, role: updated.role };
  }

  // ------------------------------------------------------------------ remove

  async removeStaff(businessId: string, staffId: string) {
    const link = await this.prisma.businessStaff.findFirst({ where: { id: staffId, businessId } });
    if (!link) throw new NotFoundException({ code: 'STAFF_NOT_FOUND', message: 'Staff member not found.' });
    if (link.role === 'OWNER') {
      await this.assertNotLastOwner(businessId, link.userId);
    }
    await this.prisma.businessStaff.delete({ where: { id: staffId } });
    await this.bumpPartnerCache(businessId);
    return { removed: true, staffId };
  }

  // ------------------------------------------------------------------ guards

  /**
   * Throws 409 CANNOT_REMOVE_LAST_OWNER when the target is the business's last
   * remaining owner. Owners live in three places: the legacy ownerUserId,
   * BusinessOwner links, and BusinessStaff links with role OWNER.
   */
  private async assertNotLastOwner(businessId: string, excludeUserId: string) {
    const business = await this.prisma.business.findFirst({
      where: { id: businessId, deletedAt: null },
      select: {
        ownerUserId: true,
        owners: { select: { userId: true } },
        staff: { where: { isActive: true, role: 'OWNER' }, select: { userId: true } },
      },
    });
    if (!business) return;
    const owners = new Set<string>();
    if (business.ownerUserId) owners.add(business.ownerUserId);
    for (const o of business.owners) owners.add(o.userId);
    for (const s of business.staff) owners.add(s.userId);
    owners.delete(excludeUserId);
    if (owners.size === 0) {
      throw new ConflictException({
        code: 'CANNOT_REMOVE_LAST_OWNER',
        message: 'The last remaining owner cannot be removed or demoted. Assign another owner first.',
      });
    }
  }

  private async grantPlatformRole(userId: string, staffRole: StaffRoleInput) {
    const roleName = STAFF_ROLE_TO_PLATFORM_ROLE[staffRole];
    const role = await this.prisma.role.findUnique({ where: { name: roleName }, select: { id: true } });
    if (!role) return; // seeded roles missing in dev — staff link still works for scoping
    await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId: role.id } },
      create: { userId, roleId: role.id },
      update: {},
    });
  }
}
