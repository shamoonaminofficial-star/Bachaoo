'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { Card, Badge, Button, TableSkeleton, EmptyState, Skeleton, ErrorState, useToast } from '@bachatly/ui';
import { ApiError } from '@/lib/api';
import {
  fetchNotificationPreferences, updateNotificationPreferences,
  NOTIF_PREF_DEFS, type NotificationPrefs,
} from '@/lib/dashboard';
import {
  fetchNotifications, markNotificationRead, markAllNotificationsRead,
  NOTIF_TYPE_ICONS, type NotificationItem,
} from '@/lib/engagement';
import { timeAgo } from '@/lib/format';

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? 'bg-brand-600' : 'bg-slate-300'}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

export default function NotificationsPage() {
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [prefsReady, setPrefsReady] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [inboxLive, setInboxLive] = useState<boolean | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [error, setError] = useState('');
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const [p, page] = await Promise.all([
        fetchNotificationPreferences().catch(() => null),
        fetchNotifications(1, 30).catch(() => null),
      ]);
      setPrefs(p);
      if (page) {
        setItems(page.items);
        setUnread(page.unread);
        setInboxLive(true);
      } else {
        setInboxLive(false); // inbox API not live yet — honest state below
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load notifications.');
    } finally {
      setPrefsReady(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setPref = async (key: string, value: boolean) => {
    if (!prefs) return;
    const next = { ...prefs, [key]: value };
    setPrefs(next); // optimistic
    try {
      await updateNotificationPreferences(next);
    } catch (e) {
      setPrefs(prefs); // roll back
      toast(e instanceof ApiError ? e.message : 'Could not save preference.', 'error');
    }
  };

  const openOne = async (n: NotificationItem) => {
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      try { await markNotificationRead(n.id); } catch { /* cosmetic */ }
    }
  };

  const markAll = async () => {
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      setItems((prev) => prev.map((x) => ({ ...x, read: true })));
      setUnread(0);
      toast('All notifications marked as read.');
    } catch {
      toast('Could not mark all as read.', 'error');
    } finally {
      setMarkingAll(false);
    }
  };

  const visible = filter === 'unread' ? items.filter((i) => !i.read) : items;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold text-ink">Notifications</h1>

      <Card className="p-6">
        <h2 className="font-bold text-ink">Preferences</h2>
        <p className="text-sm text-slate-500">Choose what you'd like to be notified about.</p>
        {!prefsReady ? (
          <div className="mt-4 space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : prefs === null ? (
          <p className="mt-4 text-sm text-slate-500">Notification preferences aren't available yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {NOTIF_PREF_DEFS.map((d) => (
              <li key={d.key} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="font-medium text-ink">{d.label}</p>
                  <p className="text-sm text-slate-500">{d.hint}</p>
                </div>
                <Toggle on={Boolean(prefs[d.key])} onChange={(v) => setPref(d.key, v)} label={d.label} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold text-ink">
            Inbox {unread > 0 && <Badge tone="info">{unread} unread</Badge>}
          </h2>
          <div className="flex items-center gap-2">
            <div className="flex rounded-xl bg-slate-100 p-1 text-sm">
              {(['all', 'unread'] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`rounded-lg px-3 py-1 font-semibold ${filter === f ? 'bg-white shadow text-ink' : 'text-slate-500'}`}>
                  {f === 'all' ? 'All' : 'Unread'}
                </button>
              ))}
            </div>
            {unread > 0 && (
              <Button variant="outline" size="sm" onClick={markAll} loading={markingAll}>Mark all read</Button>
            )}
          </div>
        </div>
        {error && inboxLive === null ? (
          <ErrorState title="Couldn't load notifications" description={error} onRetry={load} />
        ) : !prefsReady ? (
          <TableSkeleton rows={4} cols={2} />
        ) : inboxLive === false ? (
          <EmptyState icon="🔔" title="Inbox coming soon" description="Deal alerts, receipts and membership updates will appear here once the notifications service is live." />
        ) : visible.length === 0 ? (
          <EmptyState icon="🔔" title={filter === 'unread' ? 'Nothing unread' : 'No notifications yet'} description="Deal alerts, receipts and membership updates will appear here." />
        ) : (
          <Card className="divide-y divide-slate-100">
            {visible.map((n) => (
              <button key={n.id} onClick={() => openOne(n)}
                className={`flex w-full items-start gap-3 p-4 text-left hover:bg-slate-50 ${n.read ? '' : 'bg-brand-50/50'}`}>
                <span className="text-xl" aria-hidden>{NOTIF_TYPE_ICONS[n.type ?? ''] ?? '🔔'}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">{n.title} {!n.read && <Badge tone="info">NEW</Badge>}</p>
                  {n.body && <p className="text-sm text-slate-500">{n.body}</p>}
                  <p className="mt-1 text-xs text-slate-400">{n.createdAt ? timeAgo(n.createdAt) : ''}</p>
                </div>
              </button>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
