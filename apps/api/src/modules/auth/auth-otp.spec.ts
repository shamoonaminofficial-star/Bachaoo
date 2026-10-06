import * as crypto from 'crypto';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AuthService } from './auth.service';

const sha256Hex = (v: string) => crypto.createHash('sha256').update(v, 'utf8').digest('hex');
const otpKey = (channel: string, identifier: string) =>
  `otp:${channel}:${sha256Hex(identifier).slice(0, 32)}`;

function buildService() {
  const store = new Map<string, string>();
  const counters = new Map<string, number>();
  const redis = {
    get: jest.fn(async (k: string) => store.get(k) ?? null),
    set: jest.fn(async (k: string, v: string) => {
      store.set(k, v);
      return 'OK' as const;
    }),
    del: jest.fn(async (k: string) => {
      store.delete(k);
      return 1;
    }),
    incrWithExpire: jest.fn(async (k: string) => {
      const n = (counters.get(k) ?? 0) + 1;
      counters.set(k, n);
      return n;
    }),
  };
  const prisma = {
    user: { findFirst: jest.fn(async () => null), update: jest.fn(async () => ({})) },
    session: { create: jest.fn(async () => ({})) },
  };
  const jwt = { verify: jest.fn(), sign: jest.fn(() => 'token') };
  const dispatch = { sendOtp: jest.fn(async () => ({ ok: true, channel: 'sms' })) };
  const service = new AuthService(prisma as any, jwt as any, redis as any, dispatch as any);
  return { service, redis, store, dispatch };
}

describe('AuthService OTP — rate limiting (Redis-backed)', () => {
  it('allows up to 3 OTP requests per hour per identifier', async () => {
    const { service } = buildService();
    const dto = { identifier: '03001234567', channel: 'sms' as const };
    for (let i = 0; i < 3; i++) {
      const res = await service.requestOtp(dto);
      expect(res.sent).toBe(true);
      expect(res.expiresIn).toBe(300);
    }
  });

  it('rejects the 4th request within the hour with OTP_RATE_LIMITED', async () => {
    const { service } = buildService();
    const dto = { identifier: '03001234567', channel: 'sms' as const };
    await service.requestOtp(dto);
    await service.requestOtp(dto);
    await service.requestOtp(dto);
    await expect(service.requestOtp(dto)).rejects.toMatchObject({
      response: { code: 'OTP_RATE_LIMITED' },
    });
  });

  it('throws ForbiddenException (not a generic error) when rate limited', async () => {
    const { service } = buildService();
    const dto = { identifier: '03001234567', channel: 'whatsapp' as const };
    for (let i = 0; i < 3; i++) await service.requestOtp(dto);
    await expect(service.requestOtp(dto)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('tracks rate limits separately per channel', async () => {
    const { service } = buildService();
    const phone = '03001234567';
    for (let i = 0; i < 3; i++) {
      await service.requestOtp({ identifier: phone, channel: 'sms' });
    }
    // whatsapp has its own counter — still allowed.
    const res = await service.requestOtp({ identifier: phone, channel: 'whatsapp' });
    expect(res.sent).toBe(true);
  });

  it('rejects a non-Pakistani phone for the sms channel', async () => {
    const { service } = buildService();
    await expect(
      service.requestOtp({ identifier: 'not-a-phone', channel: 'sms' }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_IDENTIFIER' } });
  });

  it('rejects a non-email identifier for the email channel', async () => {
    const { service } = buildService();
    await expect(
      service.requestOtp({ identifier: '03001234567', channel: 'email' }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_IDENTIFIER' } });
  });

  it('stores only the hash of the OTP (never the raw code)', async () => {
    const { service, store } = buildService();
    const res = await service.requestOtp({ identifier: '03001234567', channel: 'sms' });
    const stored = store.get(otpKey('sms', '03001234567'));
    expect(stored).toBeDefined();
    // The devCode is only echoed outside production; Redis must hold the hash.
    expect(stored).toBe(sha256Hex(res.devCode as string));
    expect(stored).not.toBe(res.devCode);
  });
});

describe('AuthService OTP — verification', () => {
  it('verifies a correct code and consumes it (single-use)', async () => {
    const { service, store } = buildService();
    store.set(otpKey('sms', '03001234567'), sha256Hex('123456'));
    const res = await service.verifyOtp({ identifier: '03001234567', code: '123456' }, {});
    expect(res.verified).toBe(true);
    expect(store.has(otpKey('sms', '03001234567'))).toBe(false);
  });

  it('rejects a wrong code with OTP_INVALID', async () => {
    const { service, store } = buildService();
    store.set(otpKey('sms', '03001234567'), sha256Hex('123456'));
    await expect(
      service.verifyOtp({ identifier: '03001234567', code: '000000' }, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.verifyOtp({ identifier: '03001234567', code: '000000' }, {}),
    ).rejects.toMatchObject({ response: { code: 'OTP_INVALID' } });
  });

  it('rejects verification when no code was issued with OTP_EXPIRED', async () => {
    const { service } = buildService();
    await expect(
      service.verifyOtp({ identifier: '03009999999', code: '123456' }, {}),
    ).rejects.toMatchObject({ response: { code: 'OTP_EXPIRED' } });
  });
});
