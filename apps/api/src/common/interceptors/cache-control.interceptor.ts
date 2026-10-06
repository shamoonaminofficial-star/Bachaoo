import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Phase 13 — HTTP caching policy.
 *
 * - Public GET endpoints (catalog, locations, CMS, reviews…) are cacheable by
 *   browsers/CDNs for 60s: `public, max-age=60, stale-while-revalidate=30`.
 *   Combined with weak ETags (main.ts), clients revalidate with
 *   If-None-Match and get cheap 304s after expiry.
 * - Authenticated GET endpoints serve per-user data: `private, no-store`.
 * - Non-GET responses (mutations, downloads): `no-store`.
 * - /healthz (load-balancer probe): always `no-store`.
 *
 * Server-side Redis caching (dashboards, deal lists) is independent of this;
 * this only governs client/proxy behavior.
 */
@Injectable()
export class CacheControlInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const url: string = req.originalUrl || req.url || '';

    if (req.method === 'GET' && !url.includes('/healthz')) {
      const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      res.setHeader(
        'Cache-Control',
        isPublic ? 'public, max-age=60, stale-while-revalidate=30' : 'private, no-store',
      );
    } else {
      res.setHeader('Cache-Control', 'no-store');
    }
    return next.handle();
  }
}
