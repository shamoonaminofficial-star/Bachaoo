'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import {
  fetchNotifications, fetchUnreadCount, markAllNotificationsRead, markNotificationRead,
  NOTIF_TYPE_ICONS, type NotificationItem,
} from '@/lib/engagement';
import { timeAgo } from '@/lib/format';

/**
 * Global notification bell (Phase 11). Shows only when signed in.
 * Polls /notifications/unread-count every 60s and refreshes on window focus.
 */
export default function NotificationBell() {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [marking, setMarking] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);

  const refreshCount = useCallback(() => {
    if (!user) return;
    fetchUnreadCount().then((n) => { if (n !== null) setUnread(n); }).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user) { setUnread(0); setItems(null); return; }
    refreshCount();
    const timer = setInterval(refreshCount, 60_000);
    const onFocus = () => refreshCount();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [user, refreshCount]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); bellRef.current?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open ]);

  const openDropdown = useCallback(async () => {
    setOpen((o) => !o);
    setOpen((o) => !o);
    if (!open) {
      const page = await fetchNotifications(1, 8).catch(() => null);
      if (page) setItems(page.items);
    }
  }, [open]);

  const openOne = async (n: NotificationItem) => {
    if (!n.read) {
      try { await markNotificationRead(n.id); } catch { /* best effort */ }
      setItems((prev) => prev?.map((i) => (i.id === n.id ? { ...i, read: true } : i)) ?? null);
      setUnread((u) => Math.max(0, u - 1));
    }
    setOpen(false);
  };

  const markAll = async () => {
    setMarking(true);
    try { await markAllNotificationsRead(); } catch { /* best effort */ }
    setItems((prev) => prev?.map((i) => ({ ...i, read: true })) ?? null);
    setUnread(0);
    setMarking(false);
  };

  if (!user) return null;

  return (
    <div className="relative">
      <button
        ref={bellRef}
        onClick={openDropdown}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}
        className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100"
      >
        <span className="text-lg" aria-hidden>🔔</span>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div aria-hidden className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-pop">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <p className="font-bold text-ink">Notifications</p>
              {unread > 0 && (
                <button onClick={markAll} disabled={marking} className="text-xs font-semibold text-brand-700 hover:underline disabled:opacity-50">
                  {marking ? 'Marking…' : 'Mark all read'}
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {items === null ? (
                <p className="px-4 py-6 text-center text-sm text-slate-400">Loading…</p>
              ) : items.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-400">You're all caught up. 🎉</p>
              ) : (
                items.map((n) => (
                  <button key={n.id} onClick={() => openOne(n)}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 ${n.read ? '' : 'bg-brand-50/50'}`}>
                    <span className="text-xl" aria-hidden>{NOTIF_TYPE_ICONS[n.type ?? ''] ?? '🔔'}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{n.title}</span>
                      {n.body && <span className="block truncate text-xs text-slate-500">{n.body}</span>}
                      {n.createdAt && <span className="text-[11px] text-slate-400">{timeAgo(n.createdAt)}</span>}
                    </span>
                    {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-hidden />}
                  </button>
                ))
              )}
            </div>
            <Link href="/account/notifications" onClick={() => setOpen(false)}
              className="block border-t border-slate-100 px-4 py-3 text-center text-sm font-semibold text-brand-700 hover:bg-slate-50">
              View all notifications
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
