import { ConflictException } from '@nestjs/common';
import { BusinessesService } from './businesses.service';
import { ROLES } from '../../common/constants';

const APP = {
  id: 'app-1',
  businessName: 'Test Foods',
  ownerName: 'Ali Raza',
  email: 'owner@testfoods.pk',
  phone: '03001234567',
  categoryId: 'cat-1',
  cityId: 'city-1',
  description: 'A test restaurant application.',
  status: 'SUBMITTED',
};

function buildService() {
  const tx: Record<string, any> = {
    user: { findFirst: jest.fn(async () => null), create: jest.fn(async (a: any) => ({ id: 'user-1', ...a.data })) },
    role: { findUnique: jest.fn(async () => ({ id: 'role-1' })) },
    userRole: { upsert: jest.fn(async () => ({})) },
    business: {
      findUnique: jest.fn(async () => null),
      create: jest.fn(async (a: any) => ({ id: 'biz-1', ...a.data })),
    },
    businessOwner: { create: jest.fn(async () => ({})) },
    businessApplication: { update: jest.fn(async (a: any) => ({ ...APP, ...a.data })) },
  };
  const prisma = {
    businessApplication: {
      findUnique: jest.fn(async () => ({ ...APP, category: {}, city: {}, area: null })),
    },
    business: { findUnique: jest.fn(async () => null), findFirst: jest.fn(), count: jest.fn(async () => 0) },
    deal: { groupBy: jest.fn(async () => []), updateMany: jest.fn(async () => ({ count: 0 })) },
    category: { findFirst: jest.fn(async () => ({ id: 'cat-1' })) },
    city: { findUnique: jest.fn(async () => ({ id: 'city-1' })) },
    $transaction: jest.fn(async (cb: any) => cb(tx)),
  };
  const storage = { upload: jest.fn(async () => ({ url: 'https://cdn/x.jpg', key: 'k' })), delete: jest.fn() };
  const redis = { del: jest.fn(async () => 1), get: jest.fn(async () => null) };
  const partnerDashboard = { getDashboard: jest.fn(async () => ({})), invalidatePartnerDashboard: jest.fn(async () => null) };
  const service = new BusinessesService(prisma as any, storage as any, partnerDashboard as any, redis as any);
  return { service, prisma, tx };
}

describe('BusinessesService.approveApplication', () => {
  it('creates owner user, business and owner link in one transaction', async () => {
    const { service, tx } = buildService();
    const result = await service.approveApplication('admin-1', 'app-1');

    expect(tx.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: APP.email, passwordHash: null }) }),
    );
    expect(tx.userRole.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_roleId: { userId: 'user-1', roleId: 'role-1' } },
      }),
    );
    expect(tx.business.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: APP.businessName,
          isVerified: true,
          applicationStatus: 'APPROVED',
        }),
      }),
    );
    expect(tx.businessOwner.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { businessId: 'biz-1', userId: 'user-1', role: 'OWNER' } }),
    );
    expect(tx.businessApplication.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'app-1' },
        data: expect.objectContaining({ status: 'APPROVED', reviewedById: 'admin-1', createdBusinessId: 'biz-1' }),
      }),
    );
    expect(result.businessSlug).toBe('test-foods');
    expect(ROLES.BUSINESS_OWNER).toBe('BUSINESS_OWNER');
  });

  it('reuses an existing user when the email is already registered', async () => {
    const { service, tx } = buildService();
    (tx.user.findFirst as jest.Mock).mockResolvedValue({ id: 'existing-user', email: APP.email });
    await service.approveApplication('admin-1', 'app-1');
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.businessOwner.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'existing-user' }) }),
    );
  });

  it('rejects an already-approved application with 409', async () => {
    const { service, prisma } = buildService();
    (prisma.businessApplication.findUnique as jest.Mock).mockResolvedValue({
      ...APP,
      status: 'APPROVED',
      category: {},
      city: {},
      area: null,
    });
    await expect(service.approveApplication('admin-1', 'app-1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('generates a unique slug when the base slug is taken', async () => {
    const { service, tx } = buildService();
    (tx.business.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: 'other' })
      .mockResolvedValueOnce(null);
    const result = await service.approveApplication('admin-1', 'app-1');
    expect(result.businessSlug).toBe('test-foods-2');
  });
});

describe('BusinessesService.rejectApplication', () => {
  it('requires a reason', async () => {
    const { service } = buildService();
    await expect(service.rejectApplication('admin-1', 'app-1', {})).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'REASON_REQUIRED' }),
    });
  });
});
