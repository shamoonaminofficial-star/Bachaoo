/**
 * Typed API client for the Bachatly backend.
 * Base: `${NEXT_PUBLIC_API_URL}/api/v1`.
 *
 * Auth: the access token lives in memory (lib/auth-client.ts) and is sent as
 * `Authorization: Bearer`. On 401 the client performs a single-flight refresh
 * via the Next.js /api/auth/refresh route (which owns the httpOnly refresh
 * cookie) and retries the request once. If refresh fails, the session is
 * cleared and the user is sent to /login.
 */
import type { Paginated } from '@bachatly/ui';
import { getAccessToken, refreshSession, serverLogout } from './auth-client';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');

export class ApiError extends Error {
  status: number;
  code?: string;
  fields?: Record<string, string>;
  constructor(status: number, message: string, code?: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

/** Back-compat read for components that only need a logged-in check. */
export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return getAccessToken();
}

interface ApiOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  auth?: boolean;
  params?: Record<string, string | number | boolean | undefined>;
}

const AUTH_PAGES = ['/login', '/register', '/forgot-password', '/reset-password', '/verify-otp', '/verify-email'];

function redirectToLogin() {
  if (typeof window === 'undefined') return;
  const path = window.location.pathname;
  if (AUTH_PAGES.some((p) => path === p || path.startsWith(p + '/'))) return;
  window.location.href = '/login?next=' + encodeURIComponent(path + window.location.search);
}

async function handleAuthFailure(): Promise<never> {
  await serverLogout();
  redirectToLogin();
  throw new ApiError(401, 'Your session has expired. Please log in again.', 'SESSION_EXPIRED');
}

export async function api<T>(path: string, { body, auth = true, params, ...init }: ApiOptions = {}): Promise<T> {
  const url = new URL(`${API_BASE}/api/v1${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) url.searchParams.set(k, String(v));
    });
  }

  const doFetch = async (retried: boolean): Promise<Response> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const sentToken = auth ? getAccessToken() : null;
    if (sentToken) headers.Authorization = `Bearer ${sentToken}`;
    const res = await fetch(url.toString(), {
      ...init,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 && auth && !retried && typeof window !== 'undefined') {
      const newToken = await refreshSession();
      if (newToken) return doFetch(true);
      // Only bounce to login when a session actually existed. A logged-out
      // visitor hitting a protected endpoint gets a plain 401 for the page
      // to handle (empty state / own login prompt).
      if (sentToken) await handleAuthFailure();
    }
    return res;
  };

  let res: Response;
  try {
    res = await doFetch(false);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.', 'NETWORK_ERROR');
  }

  if (!res.ok) {
    let payload: { message?: string; code?: string; fields?: Record<string, string> } = {};
    try {
      payload = await res.json();
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(
      res.status,
      payload.message || `Request failed (${res.status})`,
      payload.code,
      payload.fields,
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type { Paginated };

/**
 * Tries the live API first; falls back to clearly-marked DEV seed data when
 * the backend is unreachable (local development only). Never ships seed data
 * as production content.
 */
let warned = false;
export async function withSeedFallback<T>(fetcher: () => Promise<T>, seed: T, label = 'data'): Promise<T> {
  try {
    return await fetcher();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) throw e; // auth failures are real — never mask them
    if (!warned) {
      console.warn('[Bachatly] API unreachable — using DEV-ONLY seed data. Do not use in production.');
      warned = true;
    }
    console.warn(`[Bachatly] Falling back to seed ${label}.`);
    return seed;
  }
}

/**
 * Multipart POST helper (no JSON Content-Type — the browser sets the boundary).
 * Used for file uploads: partner applications, logos, receipts.
 */
export async function apiForm<T>(path: string, form: FormData, opts: { auth?: boolean } = {}): Promise<T> {
  const { auth = true } = opts;
  const url = new URL(`${API_BASE}/api/v1${path}`);
  const headers: Record<string, string> = {};
  const sentToken = auth ? getAccessToken() : null;
  if (sentToken) headers.Authorization = `Bearer ${sentToken}`;
  let res: Response;
  try {
    res = await fetch(url.toString(), { method: 'POST', headers, body: form });
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.', 'NETWORK_ERROR');
  }
  if (!res.ok) {
    let payload: { message?: string; code?: string } = {};
    try { payload = await res.json(); } catch { /* non-JSON */ }
    throw new ApiError(res.status, payload.message || `Upload failed (${res.status})`, payload.code);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Client-side file validation shared by all upload forms.
 * Returns an error message, or null when the file is acceptable.
 */
export function validateUploadFile(
  file: File,
  opts: { maxMb?: number; kinds?: Array<'image' | 'pdf'> } = {},
): string | null {
  const { maxMb = 5, kinds = ['image', 'pdf'] } = opts;
  const isImage = file.type.startsWith('image/');
  const isPdf = file.type === 'application/pdf';
  if (kinds.includes('image') && kinds.includes('pdf')) {
    if (!isImage && !isPdf) return 'Only images or PDF files are allowed.';
  } else if (kinds.includes('image') && !isImage) {
    return 'Only image files are allowed.';
  } else if (kinds.includes('pdf') && !isPdf) {
    return 'Only PDF files are allowed.';
  }
  if (file.size > maxMb * 1024 * 1024) return `File must be under ${maxMb} MB.`;
  return null;
}
