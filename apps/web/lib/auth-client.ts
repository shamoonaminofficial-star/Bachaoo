/**
 * Framework-free session helpers (no React): in-memory access token storage
 * plus single-flight silent refresh through the Next.js session routes.
 *
 * The refresh token NEVER touches client JavaScript — it lives in the
 * httpOnly `bachatly_rt` cookie managed by app/api/auth/* routes.
 */

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/**
 * Single-flight refresh: concurrent callers share one /api/auth/refresh
 * request. Resolves to the new access token, or null when refresh failed
 * (session expired / revoked).
 */
export function refreshSession(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async (): Promise<string | null> => {
    try {
      const res = await fetch('/api/auth/refresh', { method: 'POST' });
      if (!res.ok) {
        accessToken = null;
        return null;
      }
      const data = (await res.json()) as { accessToken?: string };
      accessToken = data.accessToken ?? null;
      return accessToken;
    } catch {
      accessToken = null;
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

/** Best-effort server logout (clears httpOnly cookies); never throws. */
export async function serverLogout(): Promise<void> {
  accessToken = null;
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch {
    /* ignore — cookies may already be gone */
  }
}
