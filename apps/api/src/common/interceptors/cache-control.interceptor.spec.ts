import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { CacheControlInterceptor } from './cache-control.interceptor';

function makeCtx(opts: { method: string; url: string; isPublic: boolean }) {
  const headers: Record<string, string> = {};
  const req = { method: opts.method, originalUrl: opts.url };
  const res = { setHeader: jest.fn((k: string, v: string) => { headers[k] = v; }) };
  const ctx: any = {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    getHandler: () => function handler() {},
    getClass: () => class Cls {},
  };
  return { ctx, headers, res };
}

describe('CacheControlInterceptor (Phase 13)', () => {
  let interceptor: CacheControlInterceptor;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    interceptor = new CacheControlInterceptor(reflector);
  });

  async function run(opts: { method: string; url: string; isPublic: boolean }) {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(opts.isPublic);
    const { ctx, headers, res } = makeCtx(opts);
    await interceptor.intercept(ctx, { handle: () => of('ok') } as any).toPromise();
    return { headers, res };
  }

  it('marks public GET endpoints as cacheable for 60s', async () => {
    const { headers } = await run({ method: 'GET', url: '/api/v1/deals', isPublic: true });
    expect(headers['Cache-Control']).toBe('public, max-age=60, stale-while-revalidate=30');
  });

  it('marks authenticated GET endpoints as no-store', async () => {
    const { headers } = await run({ method: 'GET', url: '/api/v1/users/me/dashboard', isPublic: false });
    expect(headers['Cache-Control']).toBe('private, no-store');
  });

  it('never caches the health probe', async () => {
    const { headers } = await run({ method: 'GET', url: '/api/v1/healthz', isPublic: true });
    expect(headers['Cache-Control']).toBe('no-store');
  });

  it('marks mutations as no-store', async () => {
    const { headers } = await run({ method: 'POST', url: '/api/v1/redemptions/confirm', isPublic: false });
    expect(headers['Cache-Control']).toBe('no-store');
  });
});
