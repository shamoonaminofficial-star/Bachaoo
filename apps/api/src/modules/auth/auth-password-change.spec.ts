import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

/**
 * Phase 7 tests: POST /auth/password/change.
 * Prisma/Jwt/Redis/Dispatch are mocked; the bcrypt helpers are REAL
 * (hashPassword/comparePassword) so the crypto round-trip is exercised.
 */
import { hashPassword } from '../../common/utils/password';

function buildService() {
  const prisma = {
    user: { findUnique: jest.fn(), update: jest.fn(async () => ({})) },
    session: { updateMany: jest.fn(async () => ({ count: 1 })) },
    auditLog: { create: jest.fn(async () => ({})) },
  } as any;
  const jwt = {} as any;
  const redis = { get: jest.fn(), set: jest.fn(), del: jest.fn() } as any;
  const dispatch = {} as any;
  const service = new AuthService(prisma, jwt, redis, dispatch);
  return { service, prisma };
}

const META = { ip: '127.0.0.1', userAgent: 'jest' };

describe('AuthService.changePassword', () => {
  it('rejects a wrong current password', async () => {
    const { service, prisma } = buildService();
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', passwordHash: await hashPassword('Oldpass1') });
    await expect(
      service.changePassword('u1', { currentPassword: 'Wrongpass9', newPassword: 'Newpass12' }, META),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'INVALID_CURRENT_PASSWORD' }) });
    expect(UnauthorizedException).toBeDefined();
  });

  it('rejects a new password identical to the current one', async () => {
    const { service, prisma } = buildService();
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', passwordHash: await hashPassword('Samepass1') });
    await expect(
      service.changePassword('u1', { currentPassword: 'Samepass1', newPassword: 'Samepass1' }, META),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'PASSWORD_UNCHANGED' }) });
    expect(BadRequestException).toBeDefined();
  });

  it('rejects a weak new password before touching the DB', async () => {
    const { service, prisma } = buildService();
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', passwordHash: await hashPassword('Oldpass12') });
    await expect(
      service.changePassword('u1', { currentPassword: 'Oldpass12', newPassword: 'short' }, META),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'WEAK_PASSWORD' }) });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('happy path: updates hash, revokes all sessions, audits', async () => {
    const { service, prisma } = buildService();
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', passwordHash: await hashPassword('Oldpass12') });
    const res = await service.changePassword(
      'u1',
      { currentPassword: 'Oldpass12', newPassword: 'Brandnew34' },
      META,
    );
    expect(res).toEqual({ changed: true, sessionsRevoked: true });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' } }),
    );
    const newHash = prisma.user.update.mock.calls[0][0].data.passwordHash;
    expect(newHash).not.toBe('Brandnew34'); // never stored raw
    expect(prisma.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', revokedAt: null } }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'auth.password_change' }) }),
    );
  });
});

describe('AuthService.listSessions', () => {
  it('returns only live, non-revoked sessions with lastSeen', async () => {
    const { service, prisma } = buildService();
    const now = new Date();
    prisma.session.findMany = jest.fn().mockResolvedValue([
      { id: 's1', ip: '1.2.3.4', userAgent: 'Chrome', createdAt: now, expiresAt: new Date(now.getTime() + 86400000), rotatedAt: null },
    ]);
    const sessions = await service.listSessions('u1');
    expect(sessions).toEqual([
      { id: 's1', ip: '1.2.3.4', userAgent: 'Chrome', createdAt: now, expiresAt: expect.any(Date), lastSeen: now },
    ]);
    expect(prisma.session.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ revokedAt: null }) }),
    );
  });
});
