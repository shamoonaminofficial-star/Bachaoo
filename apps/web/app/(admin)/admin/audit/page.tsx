'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { Card, Badge, DataTable, Input, EmptyState, ErrorState, Skeleton } from '@bachatly/ui';
import { formatDateTime } from '@/lib/format';
import { fetchAuditLogs, type AuditRow } from '@/lib/admin';

const atOf = (r: AuditRow) => r.createdAt ?? r.at ?? '';

export default function AuditPage() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [notLive, setNotLive] = useState(false);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState('');

  const load = useCallback(() => {
    setFailed(false);
    fetchAuditLogs({ q: q || undefined, page: 1, pageSize: 50 })
      .then((res) => {
        if (res === null) { setNotLive(true); setRows(null); }
        else { setRows(res.items); setNotLive(false); }
      })
      .catch(() => { setFailed(true); setRows(null); });
  }, [q]);
  useEffect(load, [load]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold text-ink">Audit Logs</h1>
        <p className="text-sm text-slate-500">Immutable record of sensitive actions: actor, role, action, entity, old/new values, IP, user agent, timestamp.</p>
      </div>
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-52 flex-1"><Input label="Search" placeholder="Actor, action, entity…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <p className="pb-2 text-xs text-slate-400">Sensitive admin actions are audited automatically.</p>
      </Card>
      <Card className="p-4">
        {notLive ? (
          <EmptyState title="Audit log viewer is not live yet" description="GET /admin/audit-logs is not deployed yet. The backend writes audit rows for every sensitive action (redemptions, payments, role changes, suspensions); this viewer will read them once the endpoint lands." icon="📋" />
        ) : failed ? (
          <ErrorState title="Could not load audit logs" onRetry={load} />
        ) : !rows ? (
          <Skeleton className="h-56" />
        ) : rows.length === 0 ? (
          <EmptyState title="No audit entries" description="No sensitive actions recorded yet." icon="📋" />
        ) : (
          <DataTable<AuditRow> rows={rows} searchable={['actor', 'action', 'entity']} exportName="audit-log"
            columns={[
              { key: 'at', header: 'Timestamp', sortable: true, render: (r) => atOf(r) ? formatDateTime(atOf(r)) : '—' },
              { key: 'actor', header: 'Actor', sortable: true, render: (r) => r.actor ?? r.actorId ?? '—' },
              { key: 'role', header: 'Role', render: (r) => r.role ?? r.actorRole ?? '—' },
              { key: 'action', header: 'Action', render: (r) => <Badge tone="brand">{r.action}</Badge> },
              { key: 'entity', header: 'Entity', render: (r) => r.entity ? `${r.entity}${r.entityId ? ` #${r.entityId.slice(0, 8)}` : ''}` : '—' },
              { key: 'detail', header: 'Detail', render: (r) => <span className="line-clamp-1 max-w-xs">{r.detail ?? ''}</span> },
              { key: 'ip', header: 'IP', render: (r) => r.ip ?? '—' },
            ]} />
        )}
      </Card>
    </div>
  );
}
