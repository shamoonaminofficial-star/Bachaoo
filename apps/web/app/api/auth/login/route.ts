import { NextRequest, NextResponse } from 'next/server';
import { backendFetch, fetchRoles, setAuthCookies, ACCESS_MAX_AGE } from '../_session';

/** POST /api/auth/login — proxies to the backend, sets httpOnly session cookies. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { res, data } = await backendFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'x-forwarded-for': req.ip ?? '' },
  });
  if (!res.ok || !data?.accessToken) {
    return NextResponse.json(
      { message: data?.message || 'Login failed.', code: data?.code, fields: data?.fields },
      { status: res.status },
    );
  }
  const roles = await fetchRoles(data.accessToken, data.user);
  const response = NextResponse.json({
    user: data.user,
    accessToken: data.accessToken,
    roles,
    permissions: data.permissions ?? [],
    expiresIn: ACCESS_MAX_AGE,
  });
  setAuthCookies(response, data.accessToken, data.refreshToken, roles);
  return response;
}
