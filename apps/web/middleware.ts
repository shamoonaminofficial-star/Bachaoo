/**
 * Edge route protection for Bachatly.
 *
 * - Public routes pass through untouched.
 * - /account/*            → requires a valid JWT (any authenticated user).
 * - /partner/dashboard/*  → requires a valid JWT + a business role.
 * - /admin/*              → requires a valid JWT + an admin role.
 *
 * The JWT is verified with `jose` (signature + expiry) against JWT_SECRET —
 * the same secret the NestJS API signs with. If the access token expired but
 * the httpOnly refresh cookie is present, the middleware attempts one silent
 * refresh via /api/auth/refresh before redirecting to login.
 *
 * Roles come from the verified JWT `roles` claim when the backend includes it,
 * otherwise from the httpOnly `bachatly_roles` cookie set server-side at
 * login (see app/api/auth/_session.ts). Cookie values are only trusted
 * because they are httpOnly and set by our own server routes — never by the
 * client.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const PARTNER_ROLES = ['BUSINESS_OWNER', 'BUSINESS_MANAGER', 'CASHIER', 'SCANNER'];
const ADMIN_ROLES = [
  'SUPER_ADMIN',
  'ADMINISTRATOR',
  'ADMIN',
  'SUPPORT_AGENT',
  'CONTENT_MANAGER',
  'FINANCE_MANAGER',
  'MARKETING_MANAGER',
];

function jwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production.');
  }
  // Mirrors the backend dev fallback ('dev-secret-change-me'). Dev only.
  return new TextEncoder().encode(secret || 'dev-secret-change-me');
}

async function verifyAccessToken(token: string | undefined): Promise<Record<string, unknown> | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, jwtSecret(), { algorithms: ['HS256'] });
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

function rolesFrom(payload: Record<string, unknown> | null, req: NextRequest): string[] {
  if (payload && Array.isArray(payload.roles)) {
    return (payload.roles as unknown[]).filter((r): r is string => typeof r === 'string');
  }
  const cookie = req.cookies.get('bachatly_roles')?.value;
  if (cookie) {
    try {
      const parsed: unknown = JSON.parse(decodeURIComponent(cookie));
      if (Array.isArray(parsed)) return parsed.filter((r): r is string => typeof r === 'string');
    } catch {
      /* malformed cookie — treat as no roles */
    }
  }
  return [];
}

function loginRedirect(req: NextRequest, next: string) {
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  url.searchParams.set('next', next);
  return NextResponse.redirect(url);
}

function forbidden(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = '/403';
  url.search = '';
  return NextResponse.redirect(url);
}

/** Try to recover an expired access token via the httpOnly refresh cookie. */
async function trySilentRefresh(req: NextRequest): Promise<Headers | null> {
  try {
    const refreshUrl = new URL('/api/auth/refresh', req.url);
    const res = await fetch(refreshUrl, {
      method: 'POST',
      headers: { cookie: req.headers.get('cookie') ?? '' },
    });
    if (!res.ok) return null;
    // Next 14: getSetCookie() is available on the fetch Headers.
    const setCookies: string[] =
      typeof (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie === 'function'
        ? (res.headers as Headers & { getSetCookie: () => string[] }).getSetCookie()
        : [];
    if (!setCookies.length) return null;
    const headers = new Headers();
    setCookies.forEach((c) => headers.append('set-cookie', c));
    return headers;
  } catch {
    return null;
  }
}

function applyCookies(response: NextResponse, cookies: Headers) {
  cookies.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') response.headers.append('set-cookie', value);
  });
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  let payload = await verifyAccessToken(req.cookies.get('bachatly_at')?.value);
  let refreshedCookies: Headers | null = null;

  if (!payload) {
    // Access token missing/expired — one silent-refresh attempt before login.
    refreshedCookies = await trySilentRefresh(req);
    if (refreshedCookies) {
      const fresh = refreshedCookies
        .getSetCookie?.()
        .find((c: string) => c.startsWith('bachatly_at='));
      const token = fresh?.split(';')[0].slice('bachatly_at='.length);
      payload = await verifyAccessToken(token);
    }
  }

  if (!payload) return loginRedirect(req, pathname);

  const proceed = () => {
    const res = NextResponse.next();
    if (refreshedCookies) applyCookies(res, refreshedCookies);
    return res;
  };

  const roles = rolesFrom(payload, req);

  if (pathname.startsWith('/partner/dashboard')) {
    if (!roles.some((r) => PARTNER_ROLES.includes(r))) return forbidden(req);
    return proceed();
  }
  if (pathname.startsWith('/admin')) {
    if (!roles.some((r) => ADMIN_ROLES.includes(r))) return forbidden(req);
    return proceed();
  }
  // /account/* — any authenticated user.
  return proceed();
}

export const config = {
  matcher: ['/account/:path*', '/partner/dashboard/:path*', '/admin/:path*'],
};
