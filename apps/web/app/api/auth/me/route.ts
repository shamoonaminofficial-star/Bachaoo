import { NextRequest, NextResponse } from 'next/server';
import { backendFetch, readCookie, resolveRoles } from '../_session';

/** GET /api/auth/me — returns the current user (proxied), used to hydrate AuthProvider. */
export async function GET(req: NextRequest) {
  const accessToken = readCookie(req.headers.get('cookie'), 'bachatly_at');
  if (!accessToken) {
    return NextResponse.json({ message: 'Not authenticated.', code: 'UNAUTHENTICATED' }, { status: 401 });
  }
  const { res, data } = await backendFetch('/auth/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    return NextResponse.json(
      { message: data?.message || 'Not authenticated.', code: data?.code ?? 'UNAUTHENTICATED' },
      { status: res.status },
    );
  }
  return NextResponse.json({ user: data, roles: resolveRoles(data) });
}
