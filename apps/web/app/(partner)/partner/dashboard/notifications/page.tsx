'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton, useToast } from '@bachatly/ui';
import { timeAgo } from '@/lib/format';
import { fetchInbox, markInboxRead, type InboxNotification } from '@/lib/dashboard';

/**
 * Partner notifications — tries the real inbox; the notifications backend is a
 * stub as of Phase 8, so this shows an honest empty state rather than seed
 * notifications.
 */
export default function PartnerNotificationsPage() {
  const { toast } = useToast();
  const [list, setList] = useState<InboxNotification[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      setList(await fetchInbox(1, 50));
    } catch {
      setError(true);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const markRead = async (id: string) => {
    try {
      await markInboxRead(id);
      setList((l) => (l ?? []).map((n) => (n.id === id ? { ...n, read: true } : n)));
    } catch { toast('Could not mark as read.', 'error'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-ink">Notifications</h1>
      </div>
      {error && !list ? (
        <ErrorState title="Couldn't load notifications" message="Something went wrong." onRetry={load} />
      ) : !list ? (
        <Skeleton className="h-40 !rounded-2xl" />
      ) : list.length === 0 ? (
        <EmptyState icon="🔔" title="No notifications yet"
          description="Deal approvals, redemption summaries and settlement updates will land here." />
      ) : (
        <Card className="divide-y divide-slate-100">
          {list.map((n) => (
            <div key={n.id} className={`flex items-start justify-between gap-3 p-4 ${n.isRead ? '' : 'bg-brand-50/50'}`}>
              <div className="min-w-0">
                <p className="font-medium text-ink">{n.title} {!n.isRead && <Badge tone="info">NEW</Badge>}</p>
                {n.body && <p className="text-sm text-slate-500">{n.body}</p>}
                <p className="mt-1 text-xs text-slate-400">{timeAgo(n.createdAt ?? '')}</p>
              </div>
              {!n.isRead && <Button size="sm" variant="outline" onClick={() => markRead(n.id)}>Mark read</Button>}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
