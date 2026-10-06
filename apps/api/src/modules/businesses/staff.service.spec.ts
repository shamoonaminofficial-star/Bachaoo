import { StaffService } from './staff.service';

/**
 * Phase 8 tests: staff invite/link/remove flows and the last-owner protection.
 * Prisma is fully mocked — no DB required.
 */

function buildService() {
  const prisma: any = {
    business: { findFirst: jest.fn() },
    branch: { findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
    businessStaff: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      upsert: jest.fn(),
    },
    staffInvitation: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    role: { findUnique: jest.fn(async () => ({ id: 'role-cashier' })) },
    userRole: { upsert: jest.fn(async () => ({})) },
  };
  const redis: any = { del: jest.fn(async () => 1) };
  const service = new StaffService(prisma, redis);
  return { service, prisma, redis };
}

const BIZ = 'biz-1';
const INVITER = 'inviter-1';

function seedBusiness(prisma: any) {
  prisma.business.findFirst.mockResolvedValue({ id: BIZ, name: 'Urban Slice' });
}

describe('StaffService.inviteStaff', () => {
  it('links an existing user immediately and grants the platform role', async () => {
    const { service, prisma } = buildService();
    seedBusiness(prisma);
    prisma.user.findUnique.mockResolvedValue({ id: 'user-9', email: 'cashier@x.pk' });
    prisma.businessStaff.findUnique.mockResolvedValue(null);
    prisma.businessStaff.create.mockImplementation(async (a: any) => ({ id: 'staff-1', ...a.data }));

    const result = await service.inviteStaff(INVITER, BIZ, { email: 'cashier@x.pk', role: 'CASHIER' });

    expect(result.status).toBe('LINKED');
    expect(prisma.businessStaff.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'user-9', role: 'CASHIER' }) }),
    );
    expect(prisma.userRole.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_roleId: { userId: 'user-9', roleId: 'role-cashier' } } }),
    );
  });

  it('rejects when the user is already linked (STAFF_ALREADY_LINKED)', async () => {
    const { service, prisma } = buildService();
    seedBusiness(prisma);
    prisma.user.findUnique.mockResolvedValue({ id: 'user-9', email: 'cashier@x.pk' });
    prisma.businessStaff.findUnique.mockResolvedValue({ id: 'staff-1' });

    await expect(service.inviteStaff(INVITER, BIZ, { email: 'cashier@x.pk', role: 'CASHIER' })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'STAFF_ALREADY_LINKED' }),
    });
  });

  it('creates a pending invitation with an accept token for unknown emails', async () => {
    const { service, prisma } = buildService();
    seedBusiness(prisma);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.staffInvitation.findFirst.mockResolvedValue(null);
    prisma.staffInvitation.create.mockImplementation(async (a: any) => ({
      id: 'inv-1',
      ...a.data,
    }));

    const result = await service.inviteStaff(INVITER, BIZ, { email: 'new@x.pk', role: 'SCANNER' });

    expect(result.status).toBe('INVITED');
    expect(result.acceptToken).toEqual(expect.any(String));
    expect(prisma.staffInvitation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: 'new@x.pk', role: 'SCANNER', invitedBy: INVITER }),
      }),
    );
  });

  it('rejects a duplicate pending invitation (INVITATION_PENDING)', async () => {
    const { service, prisma } = buildService();
    seedBusiness(prisma);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.staffInvitation.findFirst.mockResolvedValue({ id: 'inv-1' });

    await expect(service.inviteStaff(INVITER, BIZ, { email: 'new@x.pk', role: 'SCANNER' })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INVITATION_PENDING' }),
    });
  });

  it('rejects invalid emails and roles', async () => {
    const { service } = buildService();
    await expect(service.inviteStaff(INVITER, BIZ, { email: 'not-an-email', role: 'CASHIER' })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INVALID_EMAIL' }),
    });
    await expect(service.inviteStaff(INVITER, BIZ, { email: 'ok@x.pk', role: 'HACKER' as any })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INVALID_STAFF_ROLE' }),
    });
  });
});

describe('StaffService.acceptInvitation', () => {
  const invitation = {
    id: 'inv-1',
    businessId: BIZ,
    email: 'new@x.pk',
    role: 'SCANNER',
    branchId: null,
    status: 'PENDING',
    expiresAt: new Date(Date.now() + 3600_000),
  };

  it('accepts when the signed-in user email matches', async () => {
    const { service, prisma } = buildService();
    prisma.staffInvitation.findUnique.mockResolvedValue(invitation);
    prisma.user.findUnique.mockResolvedValue({ email: 'new@x.pk' });
    prisma.businessStaff.upsert.mockResolvedValue({ id: 'staff-9', role: 'SCANNER' });

    const result = await service.acceptInvitation('user-2', 'tok-abc');

    expect(result.businessId).toBe(BIZ);
    expect(prisma.staffInvitation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'ACCEPTED' } }),
    );
    expect(prisma.userRole.upsert).toHaveBeenCalled();
  });

  it('rejects when the signed-in user email does not match (INVITATION_EMAIL_MISMATCH)', async () => {
    const { service, prisma } = buildService();
    prisma.staffInvitation.findUnique.mockResolvedValue(invitation);
    prisma.user.findUnique.mockResolvedValue({ email: 'someone-else@x.pk' });

    await expect(service.acceptInvitation('user-3', 'tok-abc')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INVITATION_EMAIL_MISMATCH' }),
    });
  });

  it('marks expired invitations EXPIRED (INVITATION_EXPIRED)', async () => {
    const { service, prisma } = buildService();
    prisma.staffInvitation.findUnique.mockResolvedValue({
      ...invitation,
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(service.acceptInvitation('user-2', 'tok-abc')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INVITATION_EXPIRED' }),
    });
    expect(prisma.staffInvitation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'EXPIRED' } }),
    );
  });
});

describe('StaffService.removeStaff / updateStaffRole — last-owner protection', () => {
  function seedSoloOwner(prisma: any, ownerUserId = 'owner-1') {
    // Only one owner: the target himself, no ownerUserId, no BusinessOwner rows.
    prisma.business.findFirst.mockResolvedValue({
      ownerUserId: null,
      owners: [],
      staff: [{ userId: ownerUserId }],
    });
  }

  function seedTwoOwners(prisma: any) {
    prisma.business.findFirst.mockResolvedValue({
      ownerUserId: 'admin-owner',
      owners: [],
      staff: [{ userId: 'owner-1' }],
    });
  }

  it('blocks removing the last owner (CANNOT_REMOVE_LAST_OWNER)', async () => {
    const { service, prisma } = buildService();
    prisma.businessStaff.findFirst.mockResolvedValue({ id: 'staff-1', userId: 'owner-1', role: 'OWNER', businessId: BIZ });
    seedSoloOwner(prisma);

    await expect(service.removeStaff(BIZ, 'staff-1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CANNOT_REMOVE_LAST_OWNER' }),
    });
    expect(prisma.businessStaff.delete).not.toHaveBeenCalled();
  });

  it('blocks demoting the last owner (CANNOT_REMOVE_LAST_OWNER)', async () => {
    const { service, prisma } = buildService();
    prisma.businessStaff.findFirst.mockResolvedValue({ id: 'staff-1', userId: 'owner-1', role: 'OWNER', businessId: BIZ });
    seedSoloOwner(prisma);

    await expect(service.updateStaffRole(BIZ, 'staff-1', { role: 'MANAGER' })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CANNOT_REMOVE_LAST_OWNER' }),
    });
  });

  it('allows removal when another owner exists', async () => {
    const { service, prisma } = buildService();
    prisma.businessStaff.findFirst.mockResolvedValue({ id: 'staff-1', userId: 'owner-1', role: 'OWNER', businessId: BIZ });
    seedTwoOwners(prisma);
    prisma.businessStaff.delete.mockResolvedValue({});

    const result = await service.removeStaff(BIZ, 'staff-1');

    expect(result.removed).toBe(true);
    expect(prisma.businessStaff.delete).toHaveBeenCalledWith({ where: { id: 'staff-1' } });
  });

  it('allows removing a non-owner staff member', async () => {
    const { service, prisma } = buildService();
    prisma.businessStaff.findFirst.mockResolvedValue({ id: 'staff-2', userId: 'cashier-1', role: 'CASHIER', businessId: BIZ });
    prisma.businessStaff.delete.mockResolvedValue({});

    const result = await service.removeStaff(BIZ, 'staff-2');

    expect(result.removed).toBe(true);
  });
});
