/**
 * Shared helpers for the Next.js auth session routes (app/api/auth/*).
 *
 * These routes run server-side. They proxy to the NestJS backend and own the
 * httpOnly cookies, so the refresh token never reaches browser JavaScript.
 */
import { NextResponse } from 'next/server';

const API_BASE = (
  process.env.API_URL_INTERNAL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:4000'
).replace(/\/$/, '');

const ACCESS_MAX_AGE = 15 * 60; // 15 minutes — matches backend ACCESS_TOKEN_TTL
const REFRESH_MAX_AGE = 30 * 24 * 60 * 60; // 30 days — matches backend rotation window

const isProd = process.env.NODE_ENV === 'production';

/**
 * DEV-ONLY role bootstrap: the backend JWT carries no role claims yet and no
 * endpoint returns roles for the current user, so for local development the
 * session route resolves roles for known seed accounts. NEVER runs in
 * production. Remove once the backend includes `roles` in the auth response
 * or JWT payload (see README "Authentication").
 */
function devSeedRoles(email: string | null | undefined): string[] | null {
  if (process.env.NODE_ENV === 'production') return null;
  const e = String(email || '').toLowerCase();
  if (e === 'admin@bachatly.pk') return ['SUPER_ADMIN'];
  if (/^owner@.+\.pk$/.test(e)) return ['BUSINESS_OWNER'];
  return null;
}

/** Resolve role names for the session cookie: backend response wins, dev seed mapping next. */
export function resolveRoles(user: Record<string, unknown> | null | undefined): string[] {
  if (user) {
    const r = (user as { roles?: unknown }).roles;
    if (Array.isArray(r) && r.length) {
      const names = r
        .map((x) => (typeof x === 'string' ? x : (x as { name?: string })?.name))
        .filter((x): x is string => typeof x === 'string' && x.length > 0);
      if (names.length) return names;
    }
  }
  return devSeedRoles((user as { email?: string } | undefined)?.email) ?? ['CUSTOMER'];
}

/**
 * Fetch the authoritative role list for a freshly-issued access token via
 * GET /auth/me (the login/register responses don't embed roles). Falls back
 * to resolveRoles() so auth never hard-fails if /me is briefly unavailable.
 */
export async function fetchRoles(
  accessToken: string,
  user: Record<string, unknown> | null | undefined,
): Promise<string[]> {
  try {
    const { res, data } = await backendFetch('/auth/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok && data) {
      return resolveRoles(data as Record<string, unknown>);
    }
  } catch {
    // fall through to local resolution
  }
  return resolveRoles(user);
}

export function setAuthCookies(
  res: NextResponse,
  accessToken: string,
  refreshToken: string,
  roles: string[],
) {
  const secure = isProd ? '; Secure' : '';
  const base = `Path=/; HttpOnly; SameSite=Lax${secure}`;
  res.headers.append(
    'Set-Cookie',
    `bachatly_at=${accessToken}; ${base}; Max-Age=${ACCESS_MAX_AGE}`,
  );
  // Refresh cookie scoped to the auth routes only — least privilege.
  res.headers.append(
    'Set-Cookie',
    `bachatly_rt=${refreshToken}; Path=/api/auth; HttpOnly; SameSite=Lax${secure}; Max-Age=${REFRESH_MAX_AGE}`,
  );
  res.headers.append(
    'Set-Cookie',
    `bachatly_roles=${encodeURIComponent(JSON.stringify(roles))}; ${base}; Max-Age=${ACCESS_MAX_AGE}`,
  );
}

export function clearAuthCookies(res: NextResponse) {
  const expired = 'Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
  res.headers.append('Set-Cookie', `bachatly_at=; Path=/; HttpOnly; SameSite=Lax; ${expired}`);
  res.headers.append('Set-Cookie', `bachatly_rt=; Path=/api/auth; HttpOnly; SameSite=Lax; ${expired}`);
  res.headers.append('Set-Cookie', `bachatly_roles=; Path=/; HttpOnly; SameSite=Lax; ${expired}`);
}

export function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const part = cookieHeader.split(';').find((c) => c.trim().startsWith(`${name}=`));
  return part ? part.trim().slice(name.length + 1) : null;
}

export async function backendFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

export { ACCESS_MAX_AGE };
