import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

function buildService(overrides: {
  session?: Record<string, jest.Mock>;
  jwtVerify?: jest.Mock;
} = {}) {
  const session = {
    findFirst: jest.fn(),
    update: jest.fn(async () => ({})),
    create: jest.fn(async () => ({})),
    updateMany: jest.fn(async () => ({ count: 0 })),
    ...overrides.session,
  };
  const prisma = {
    session,
    auditLog: { create: jest.fn(async () => ({})) },
    user: { findFirst: jest.fn() },
  };
  const jwt = {
    verify: overrides.jwtVerify ?? jest.fn(() => ({ sub: 'user-1', type: 'refresh' })),
    sign: jest
      .fn()
      .mockReturnValueOnce('new-access-token')
      .mockReturnValueOnce('new-refresh-token')
      .mockReturnValue('token'),
  };
  const redis = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    incrWithExpire: jest.fn(),
  };
  const dispatch = { sendOtp: jest.fn() };
  const service = new AuthService(prisma as any, jwt as any, redis as any, dispatch as any);
  return { service, prisma, jwt, redis };
}

const ACTIVE_SESSION = {
  id: 'session-1',
  userId: 'user-1',
  revokedAt: null,
  expiresAt: new Date(Date.now() + 3600_000),
  user: { id: 'user-1', email: 'user@example.com', status: 'ACTIVE' },
};

describe('AuthService.refresh — rotation & reuse detection', () => {
  it('rotates a valid session: revokes the old one and issues a fresh pair', async () => {
    const { service, prisma } = buildService({
      session: { findFirst: jest.fn(async () => ({ ...ACTIVE_SESSION })) },
    });

    const result = await service.refresh('old-refresh-token', {});

    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { revokedAt: expect.any(Date), rotatedAt: expect.any(Date) },
    });
    expect(prisma.session.create).toHaveBeenCalled();
    expect(result.accessToken).toBe('new-access-token');
    expect(result.refreshToken).toBe('new-refresh-token');
  });

  it('rejects an expired/invalid JWT with INVALID_REFRESH_TOKEN', async () => {
    const { service } = buildService({
      jwtVerify: jest.fn(() => {
        throw new Error('jwt expired');
      }),
    });
    await expect(service.refresh('expired-token', {})).rejects.toMatchObject({
      response: { code: 'INVALID_REFRESH_TOKEN' },
    });
  });

  it('detects token reuse: revokes ALL sessions and reports REFRESH_TOKEN_REUSED', async () => {
    const reused = {
      ...ACTIVE_SESSION,
      revokedAt: new Date(Date.now() - 10 * 60_000), // rotated 10 min ago
      rotatedAt: new Date(Date.now() - 10 * 60_000),
    };
    const { service, prisma } = buildService({
      session: { findFirst: jest.fn(async () => reused) },
    });

    await expect(service.refresh('stolen-refresh-token', {})).rejects.toMatchObject({
      response: { code: 'REFRESH_TOKEN_REUSED' },
    });
    // Theft protection: every session for the user is revoked.
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'auth.refresh_token_reuse' }),
      }),
    );
  });

  it('treats reuse as theft when the JWT is valid but no session row exists', async () => {
    const { service, prisma } = buildService({
      session: { findFirst: jest.fn(async () => null) },
    });

    await expect(service.refresh('forged-but-valid-jwt', {})).rejects.toMatchObject({
      response: { code: 'REFRESH_TOKEN_REUSED' },
    });
    expect(prisma.session.updateMany).toHaveBeenCalled();
  });

  it('tolerates concurrent refresh inside the grace window', async () => {
    const recentlyRotated = {
      ...ACTIVE_SESSION,
      revokedAt: new Date(Date.now() - 30_000),
      rotatedAt: new Date(Date.now() - 30_000),
    };
    const newest = { ...ACTIVE_SESSION, id: 'session-2' };
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(recentlyRotated) // lookup by token hash
      .mockResolvedValueOnce(newest); // newest live session for grace path
    const { service, prisma } = buildService({ session: { findFirst } });

    const result = await service.refresh('just-rotated-token', {});
    expect(result.accessToken).toBe('new-access-token');
    // The newest live session was rotated instead of nuking everything.
    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: 'session-2' },
      data: { revokedAt: expect.any(Date), rotatedAt: expect.any(Date) },
    });
    expect(prisma.session.updateMany).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException (not a generic error) on reuse', async () => {
    const { service } = buildService({
      session: { findFirst: jest.fn(async () => null) },
    });
    await expect(service.refresh('x', {})).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
