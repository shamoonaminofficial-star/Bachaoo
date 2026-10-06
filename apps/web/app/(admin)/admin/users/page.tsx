'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { Card, Badge, Button, DataTable, Modal, ConfirmModal, Select, Input, Pagination, statusTone, useToast, EmptyState, ErrorState, Skeleton } from '@bachatly/ui';
import { ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { adminListUsers, adminSuspendUser, adminReactivateUser, type AdminUserRow } from '@/lib/admin';

const fullName = (r: AdminUserRow) => r.name ?? (`${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || '—');
const cityName = (r: AdminUserRow) => (typeof r.city === 'string' ? r.city : r.city?.name) ?? '—';
const rowStatus = (r: AdminUserRow) => (r.suspended === true || r.status === 'suspended' || r.status === 'SUSPENDED' ? 'suspended' : 'active');

export default function AdminUsersPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<AdminUserRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState(false);
  const [view, setView] = useState<AdminUserRow | null>(null);
  const [suspend, setSuspend] = useState<AdminUserRow | null>(null);

  const load = useCallback(() => {
    setError(false);
    adminListUsers({ q: q || undefined, status: status || undefined, page: pageNum, pageSize: 12 })
      .then((res) => { setRows(res.items); setTotal(res.total); })
      .catch(() => { setRows(null); setError(true); });
  }, [q, status, pageNum]);
  useEffect(load, [load]);

  const doSuspend = async (reason: string) => {
    if (!suspend) return;
    try {
      await adminSuspendUser(suspend.id, reason);
      toast('User suspended (logged to audit).');
      setSuspend(null); load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Suspend failed.', 'error');
    }
  };
  const reactivate = async (r: AdminUserRow) => {
    try { await adminReactivateUser(r.id); toast('User reactivated (logged to audit).'); load(); }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Reactivation failed.', 'error'); }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-ink">Users</h1>
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-52 flex-1"><Input label="Search" placeholder="Name, email, phone…" value={q} onChange={(e) => { setQ(e.target.value); setPageNum(1); }} /></div>
        <div className="w-44"><Select label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPageNum(1); }} options={[{ value: '', label: 'All' }, { value: 'ACTIVE', label: 'Active' }, { value: 'SUSPENDED', label: 'Suspended' }]} /></div>
      </Card>
      <Card className="p-4">
        {error ? <ErrorState title="Could not load users" onRetry={load} />
          : !rows ? <Skeleton className="h-56" />
          : rows.length === 0 ? <EmptyState title="No users found" description="Try a different search." />
          : (<>
              <DataTable<AdminUserRow> rows={rows} searchable={[]} exportName="users" onRowClick={setView}
                columns={[
                  { key: 'name', header: 'Name', sortable: true, render: (r) => fullName(r) },
                  { key: 'email', header: 'Email', sortable: true },
                  { key: 'phone', header: 'Phone', render: (r) => r.phone ?? '—' },
                  { key: 'city', header: 'City', render: (r) => cityName(r) },
                  { key: 'membership', header: 'Membership', render: (r) => r.membership ?? '—' },
                  { key: 'status', header: 'Status', render: (r) => <Badge tone={statusTone[rowStatus(r)] || 'neutral'}>{rowStatus(r).toUpperCase()}</Badge> },
                  { key: 'joined', header: 'Joined', render: (r) => (r.createdAt || r.joined) ? formatDate(r.createdAt ?? r.joined!) : '—' },
                  { key: 'actions', header: 'Actions', render: (r) => (
                    <span onClick={(e) => e.stopPropagation()} className="flex gap-1.5">
                      {rowStatus(r) === 'active'
                        ? <Button size="sm" variant="outline" onClick={() => setSuspend(r)}>Suspend</Button>
                        : <Button size="sm" onClick={() => reactivate(r)}>Reactivate</Button>}
                    </span>) },
                ]} />
              <div className="mt-3"><Pagination page={pageNum} totalPages={Math.ceil(total / 12)} onChange={setPageNum} /></div>
            </>)}
      </Card>
      <Modal open={!!view} onClose={() => setView(null)} title={view ? fullName(view) : ''} wide
        footer={<Button variant="ghost" onClick={() => setView(null)}>Close</Button>}>
        {view && (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {[['Email', view.email], ['Phone', view.phone ?? '—'], ['City', cityName(view)], ['Membership', view.membership ?? '—'], ['Status', rowStatus(view)], ['Joined', (view.createdAt || view.joined) ? formatDate(view.createdAt ?? view.joined!) : '—']].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">{k}</dt><dd className="font-semibold text-ink">{v}</dd></div>
            ))}
          </dl>
        )}
      </Modal>
      <ConfirmModal open={!!suspend} onClose={() => setSuspend(null)} onConfirm={doSuspend} danger requireReason
        title="Suspend user" action="Suspend user" affected={suspend ? fullName(suspend) : ''} confirmLabel="Suspend user" />
    </div>
  );
}
