'use client';
import React, { useEffect, useState } from 'react';
import { Card, Badge, Button, DataTable, Modal, Tabs, EmptyState, ErrorState, Skeleton, statusTone, useToast } from '@bachatly/ui';
import { ApiError, api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { adminListTickets, type SupportTicketRow } from '@/lib/admin';

const TABS = [
  { id: 'all', label: 'All' }, { id: 'open', label: 'Open' }, { id: 'in_progress', label: 'In Progress' },
  { id: 'waiting_customer', label: 'Waiting' }, { id: 'resolved', label: 'Resolved' },
];

export default function AdminSupportPage() {
  const { toast } = useToast();
  const [data, setData] = useState<{ items: SupportTicketRow[]; total: number } | null>(null);
  const [notLive, setNotLive] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState('all');
  const [view, setView] = useState<SupportTicketRow | null>(null);
  const [reply, setReply] = useState('');

  useEffect(() => {
    adminListTickets({ status: tab === 'all' ? undefined : tab, page: 1, pageSize: 20 })
      .then((res) => {
        if (res === null) { setNotLive(true); setData(null); }
        else { setData(res); setNotLive(false); }
      })
      .catch(() => { setFailed(true); setData(null); });
  }, [tab]);

  const send = async () => {
    if (!view || !reply.trim()) { toast('Write a reply first.', 'error'); return; }
    try {
      await api(`/support/tickets/${view.id}/messages`, { method: 'POST', body: { message: reply.trim() } });
      toast('Reply sent.');
      setReply(''); setView(null);
    } catch (e) {
      toast(e instanceof ApiError && (e.status === 501 || e.status === 404) ? 'Ticket messaging is not live yet on the backend.' : 'Reply failed.', 'error');
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-ink">Support Tickets</h1>
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      <Card className="p-4">
        {notLive ? (
          <EmptyState title="Support desk is not live yet" description="The support module is still a backend stub. Ticket queues, thread replies, and resolution will appear here once GET /support/tickets lands." icon="💬" />
        ) : failed ? (
          <ErrorState title="Could not load tickets" onRetry={() => window.location.reload()} />
        ) : !data ? (
          <Skeleton className="h-48" />
        ) : data.items.length === 0 ? (
          <EmptyState title="No tickets" description="All caught up." icon="✅" />
        ) : (
          <DataTable<SupportTicketRow> rows={data.items} searchable={['subject', 'userEmail']} exportName="tickets" onRowClick={setView}
            columns={[
              { key: 'subject', header: 'Subject', sortable: true },
              { key: 'userEmail', header: 'Reporter', render: (r) => r.userEmail ?? r.userId ?? '—' },
              { key: 'category', header: 'Category', render: (r) => r.category ?? '—' },
              { key: 'status', header: 'Status', render: (r) => <Badge tone={statusTone[r.status] || 'neutral'}>{r.status.replace('_', ' ').toUpperCase()}</Badge> },
              { key: 'at', header: 'Opened', render: (r) => (r.createdAt || r.at) ? timeAgo(r.createdAt ?? r.at!) : '—' },
            ]} />
        )}
      </Card>
      <Modal open={!!view} onClose={() => setView(null)} title={view?.subject || ''} wide
        footer={<div className="flex w-full gap-2">
          <input placeholder="Write a reply…" value={reply} onChange={(e) => setReply(e.target.value)} className="flex-1 rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none focus:border-brand-600" />
          <Button onClick={send}>Send</Button>
        </div>}>
        {view && <p className="text-sm text-slate-600">{view.message || 'Conversation thread loads here once ticket messaging lands on the backend.'}</p>}
      </Modal>
    </div>
  );
}
