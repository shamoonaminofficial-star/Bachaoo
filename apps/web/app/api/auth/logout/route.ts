import { NextRequest, NextResponse } from 'next/server';
import { backendFetch, clearAuthCookies, readCookie } from '../_session';

/** POST /api/auth/logout — revokes the refresh session server-side, clears cookies. */
export async function POST(req: NextRequest) {
  const refreshToken = readCookie(req.headers.get('cookie'), 'bachatly_rt');
  const accessToken = readCookie(req.headers.get('cookie'), 'bachatly_at');
  if (refreshToken) {
    try {
      await backendFetch('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
    } catch {
      /* best effort — cookies are cleared regardless */
    }
  }
  const response = NextResponse.json({ ok: true });
  clearAuthCookies(response);
  return response;
}
