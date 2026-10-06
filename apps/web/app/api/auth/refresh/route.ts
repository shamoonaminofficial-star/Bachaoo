import { NextRequest, NextResponse } from 'next/server';
import { backendFetch, fetchRoles, setAuthCookies, clearAuthCookies, readCookie, ACCESS_MAX_AGE } from '../_session';

/**
 * POST /api/auth/refresh — rotates the session using the httpOnly refresh
 * cookie. Called by the client on 401 (single-flight) and by the silent
 * refresh timer; also used by middleware to recover expired access tokens.
 */
export async function POST(req: NextRequest) {
  const refreshToken = readCookie(req.headers.get('cookie'), 'bachatly_rt');
  if (!refreshToken) {
    return NextResponse.json({ message: 'No refresh token.', code: 'NO_REFRESH_TOKEN' }, { status: 401 });
  }
  const { res, data } = await backendFetch('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok || !data?.accessToken) {
    const response = NextResponse.json(
      { message: data?.message || 'Session expired. Please log in again.', code: data?.code ?? 'REFRESH_FAILED' },
      { status: 401 },
    );
    clearAuthCookies(response);
    return response;
  }
  const roles = await fetchRoles(data.accessToken, data.user);
  const response = NextResponse.json({
    accessToken: data.accessToken,
    roles,
    expiresIn: ACCESS_MAX_AGE,
  });
  setAuthCookies(response, data.accessToken, data.refreshToken, roles);
  return response;
}
