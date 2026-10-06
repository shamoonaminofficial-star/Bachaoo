'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { Card, Input, Button, Badge, Skeleton, useToast, ConfirmModal, EmptyState } from '@bachatly/ui';
import { ApiError } from '@/lib/api';
import { changePassword, fetchSessions, logoutAllSessions, type SessionInfo } from '@/lib/dashboard';
import { formatDateTime } from '@/lib/format';

function strength(pw: string): { score: number; label: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ['Very weak', 'Weak', 'Okay', 'Good', 'Strong', 'Very strong'];
  return { score, label: labels[score] };
}

export default function SecurityPage() {
  const { toast } = useToast();
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [changing, setChanging] = useState(false);
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [sessionsReady, setSessionsReady] = useState(false);
  const [confirmLogoutAll, setConfirmLogoutAll] = useState(false);

  const loadSessions = useCallback(async () => {
    const list = await fetchSessions().catch(() => null);
    setSessions(list);
    setSessionsReady(true);
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const changePw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.next.length < 8) { toast('New password must be at least 8 characters.', 'error'); return; }
    if (pw.next !== pw.confirm) { toast('The new passwords do not match.', 'error'); return; }
    setChanging(true);
    try {
      await changePassword(pw.current, pw.next);
      toast('Password changed successfully.');
      setPw({ current: '', next: '', confirm: '' });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not change your password.', 'error');
    } finally {
      setChanging(false);
    }
  };

  const doLogoutAll = async () => {
    try {
      await logoutAllSessions();
      toast('Logged out from all other devices.');
      setConfirmLogoutAll(false);
      loadSessions();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not log out other sessions.', 'error');
    }
  };

  const st = strength(pw.next);

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-extrabold text-ink">Security</h1>

      <Card className="p-6">
        <h2 className="font-bold text-ink">Change password</h2>
        <form onSubmit={changePw} className="mt-4 space-y-3">
          <Input label="Current password" type="password" value={pw.current}
            onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" required />
          <Input label="New password" type="password" value={pw.next}
            onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" required minLength={8} />
          {pw.next && (
            <div aria-live="polite">
              <div className="flex gap-1" aria-hidden>
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className={`h-1.5 flex-1 rounded-full ${i < st.score ? (st.score >= 4 ? 'bg-success' : st.score >= 2 ? 'bg-amber-500' : 'bg-error') : 'bg-slate-200'}`} />
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-500">Strength: <span className="font-semibold text-ink">{st.label}</span> (minimum 8 characters)</p>
            </div>
          )}
          <Input label="Confirm new password" type="password" value={pw.confirm}
            onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" required />
          <Button type="submit" loading={changing}>Update Password</Button>
        </form>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-ink">Active sessions</h2>
          {sessions && sessions.length > 1 && (
            <Button size="sm" variant="outline" onClick={() => setConfirmLogoutAll(true)}>Log out other devices</Button>
          )}
        </div>
        {!sessionsReady ? (
          <div className="mt-3 space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : sessions === null ? (
          <p className="mt-3 text-sm text-slate-500">Session details aren't available right now.</p>
        ) : sessions.length === 0 ? (
          <div className="mt-2"><EmptyState icon="🔒" title="No sessions found" description="Your active logins will appear here." /></div>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p className="font-medium text-ink">
                    {s.device || 'Unknown device'} {s.current && <Badge tone="success">Current</Badge>}
                  </p>
                  <p className="text-xs text-slate-400">
                    {s.ip ? `${s.ip} · ` : ''}{s.createdAt ? `signed in ${formatDateTime(s.createdAt)}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmModal open={confirmLogoutAll} onClose={() => setConfirmLogoutAll(false)}
        onConfirm={() => { doLogoutAll(); }} danger title="Log out other devices" action="Log out other devices"
        affected="All other active logins on other devices will be signed out." confirmLabel="Log out others" />
    </div>
  );
}
