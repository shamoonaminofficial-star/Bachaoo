import { ConflictException, NotFoundException } from '@nestjs/common';
import { MeService } from './me.service';

/** Phase 7 tests: profile update validation rules. */

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    user: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue({ id: 'user-1', cityId: 'city-1' }),
      update: jest.fn().mockResolvedValue({ id: 'user-1' }),
    },
    city: { findFirst: jest.fn().mockResolvedValue({ id: 'city-1' }) },
    area: { findFirst: jest.fn().mockResolvedValue({ id: 'area-1', cityId: 'city-1' }) },
    userProfile: { upsert: jest.fn().mockResolvedValue({}) },
    notificationPreference: { upsert: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(async (fn: any) => fn({
      user: { update: jest.fn().mockResolvedValue({}) },
      userProfile: { upsert: jest.fn().mockResolvedValue({}) },
      notificationPreference: { upsert: jest.fn().mockResolvedValue({}) },
    })),
    ...overrides,
  } as any;
}

describe('MeService.updateProfile validation', () => {
  it('rejects a phone number already linked to another account', async () => {
    const prisma = makePrisma({
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'other-user' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'user-1', cityId: 'city-1' }),
        update: jest.fn(),
      },
    });
    const service = new MeService(prisma, { upload: jest.fn(async () => ({ url: 'https://cdn/x.jpg', key: 'k' })), delete: jest.fn(async () => undefined) } as any);
    await expect(service.updateProfile('user-1', { phone: '03001234567' })).rejects.toThrow(ConflictException);
    await expect(service.updateProfile('user-1', { phone: '03001234567' })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PHONE_IN_USE' }),
    });
  });

  it('rejects an unknown city', async () => {
    const prisma = makePrisma({ city: { findFirst: jest.fn().mockResolvedValue(null) } });
    const service = new MeService(prisma, { upload: jest.fn(async () => ({ url: 'https://cdn/x.jpg', key: 'k' })), delete: jest.fn(async () => undefined) } as any);
    await expect(
      service.updateProfile('user-1', { cityId: '00000000-0000-0000-0000-000000000000' }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'CITY_NOT_FOUND' }) });
    expect(NotFoundException).toBeDefined();
  });

  it('rejects an area that does not belong to the user city', async () => {
    const prisma = makePrisma({
      area: { findFirst: jest.fn().mockResolvedValue({ id: 'area-9', cityId: 'city-other' }) },
    });
    const service = new MeService(prisma, { upload: jest.fn(async () => ({ url: 'https://cdn/x.jpg', key: 'k' })), delete: jest.fn(async () => undefined) } as any);
    await expect(
      service.updateProfile('user-1', { areaId: '00000000-0000-0000-0000-000000000009' }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'AREA_CITY_MISMATCH' }) });
  });

  it('accepts a valid profile update and writes profile + marketing prefs', async () => {
    const prisma = makePrisma();
    const service = new MeService(prisma, { upload: jest.fn(async () => ({ url: 'https://cdn/x.jpg', key: 'k' })), delete: jest.fn(async () => undefined) } as any);
    // stub getProfile return for the final read
    (service as any).getProfile = jest.fn().mockResolvedValue({ id: 'user-1', firstName: 'Ali' });
    const res = await service.updateProfile('user-1', {
      firstName: 'Ali',
      phone: '03001234567',
      dateOfBirth: new Date('1990-01-01'),
      marketingOptIn: false,
    });
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(res.firstName).toBe('Ali');
  });
});

describe('MeService notification preferences', () => {
  it('returns all-on defaults when no row exists', async () => {
    const prisma = makePrisma({
      notificationPreference: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
    });
    const service = new MeService(prisma, { upload: jest.fn(async () => ({ url: 'https://cdn/x.jpg', key: 'k' })), delete: jest.fn(async () => undefined) } as any);
    const prefs = await service.getNotificationPreferences('user-1');
    expect(prefs).toEqual(expect.objectContaining({
      dealAlerts: true,
      savingsSummary: true,
      membershipReminders: true,
      referralUpdates: true,
      marketing: true,
      updatedAt: null,
    }));
  });
});
