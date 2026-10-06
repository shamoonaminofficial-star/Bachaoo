'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { Card, Badge, Button, DataTable, Modal, Input, Select, ConfirmModal, Pagination, SkeletonCard, ErrorState, EmptyState, statusTone, useToast } from '@bachatly/ui';
import { ApiError } from '@/lib/api';
import {
  adminListMemberships, adminAssignMembership, adminExtendMembership, adminCancelMembership,
  fetchPlans, type AdminMembershipRow, type ApiPlan,
} from '@/lib/memberships';
import { formatDate } from '@/lib/format';

export default function AdminMembershipsPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<AdminMembershipRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(false);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [plans, setPlans] = useState<ApiPlan[]>([]);
  const [assign, setAssign] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [form, setForm] = useState({ email: '', planId: '', days: '365', reason: '' });
  const [action, setAction] = useState<{ row: AdminMembershipRow; kind: 'extend' | 'cancel' } | null>(null);
  const [extendDays, setExtendDays] = useState('30');
  const [acting, setActing] = useState(false);

  useEffect(() => { const t = setTimeout(() => { setDebouncedQ(q); setPage(1); }, 350); return () => clearTimeout(t); }, [q]);

  const load = useCallback(() => {
    setError(false);
    adminListMemberships({ q: debouncedQ || undefined, status: status || undefined, page, pageSize: 12 })
      .then((res) => { setRows(res.items); setTotal(res.total); })
      .catch(() => { setRows(null); setError(true); });
  }, [debouncedQ, status, page]);
  useEffect(load, [load]);

  useEffect(() => { fetchPlans().then(setPlans).catch(() => setPlans([])); }, []);

  const doAssign = async () => {
    if (!/^\S+@\S+\.\S+$/.test(form.email)) { toast('Enter a valid user email.', 'error'); return; }
    if (!form.planId) { toast('Choose a plan.', 'error'); return; }
    setAssigning(true);
    try {
      await adminAssignMembership({ userEmail: form.email.trim(), planId: form.planId, days: Number(form.days) || undefined, reason: form.reason.trim() || undefined });
      toast('Membership assigned manually (logged to audit).');
      setAssign(false); setForm({ email: '', planId: '', days: '365', reason: '' }); load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not assign membership.', 'error');
    } finally { setAssigning(false); }
  };

  const doAction = async (reason: string) => {
    if (!action) return;
    const { row, kind } = action;
    setActing(true);
    try {
      if (kind === 'extend') await adminExtendMembership(row.id, { days: Number(extendDays) || 30, reason });
      else await adminCancelMembership(row.id, { reason });
      toast(kind === 'extend' ? 'Membership extended (logged to audit).' : 'Membership cancelled (logged to audit).');
      setAction(null); load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Action failed.', 'error');
    } finally { setActing(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-ink">Memberships</h1>
        <Button onClick={() => setAssign(true)}>+ Assign Manually</Button>
      </div>

      <Card className="p-4">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row">
          <Input aria-label="Search memberships" placeholder="Search holder, email, number…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="w-full sm:w-52">
            <Select aria-label="Filter by status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              options={[
                { value: '', label: 'All statuses' },
                { value: 'active', label: 'Active' },
                { value: 'expired', label: 'Expired' },
                { value: 'cancelled', label: 'Cancelled' },
                { value: 'pending', label: 'Pending' },
              ]} />
          </div>
        </div>
        {!rows && !error && <SkeletonCard />}
        {error && <ErrorState title="Could not load memberships" onRetry={load} />}
        {rows && rows.length === 0 && <EmptyState icon="🎫" title="No memberships found" description="Try a different search or assign one manually." />}
        {rows && rows.length > 0 && (
          <>
            <DataTable<AdminMembershipRow> rows={rows} exportName="memberships"
              columns={[
                { key: 'holder', header: 'Holder', sortable: true, render: (r) => (<span><span className="block font-medium text-ink">{r.holder || '—'}</span><span className="block text-xs text-slate-400">{r.email}</span></span>) },
                { key: 'number', header: 'Number' },
                { key: 'plan', header: 'Plan', sortable: true },
                { key: 'status', header: 'Status', render: (r) => <Badge tone={statusTone[r.status] || 'neutral'}>{r.status.toUpperCase()}</Badge> },
                { key: 'endDate', header: 'Expires', sortable: true, render: (r) => (r.endDate ? formatDate(r.endDate) : '—') },
                {
                  key: 'actions', header: 'Actions', render: (r) => (
                    <span onClick={(e) => e.stopPropagation()} className="flex gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => { setExtendDays('30'); setAction({ row: r, kind: 'extend' }); }}>Extend</Button>
                      {r.status === 'active' && <Button size="sm" variant="ghost" onClick={() => setAction({ row: r, kind: 'cancel' })}>Cancel</Button>}
                    </span>),
                },
              ]} />
            <div className="mt-3"><Pagination page={page} totalPages={Math.max(1, Math.ceil(total / 12))} onChange={setPage} /></div>
          </>
        )}
      </Card>

      <Modal open={assign} onClose={() => setAssign(false)} title="Assign membership manually"
        footer={<><Button variant="ghost" onClick={() => setAssign(false)}>Cancel</Button><Button onClick={doAssign} loading={assigning}>Assign</Button></>}>
        <div className="space-y-3">
          <Input label="User email *" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Select label="Plan *" value={form.planId} onChange={(e) => setForm({ ...form, planId: e.target.value })}
            options={[{ value: '', label: 'Choose a plan…' }, ...plans.filter((p) => p.isActive).map((p) => ({ value: p.id, label: `${p.name} — ${p.durationDays} days` }))]} />
          <Input label="Duration (days)" type="number" min={1} value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} />
          <Input label="Reason (audit log)" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Promotional giveaway" />
          <p className="text-xs text-slate-400">Manual assignments are recorded in the audit log with your admin account.</p>
        </div>
      </Modal>

      <ConfirmModal open={!!action} onClose={() => setAction(null)} danger={action?.kind === 'cancel'}
        confirmLabel={acting ? 'Saving…' : action?.kind === 'extend' ? 'Extend membership' : 'Cancel membership'}
        requireReason onConfirm={doAction}
        title={action?.kind === 'extend' ? 'Extend membership' : 'Cancel membership'}
        action={action?.kind === 'extend' ? 'Extend membership' : 'Cancel membership'}
        affected={`${action?.row.holder || action?.row.email} (${action?.row.number || action?.row.id})`}
        description="This change is recorded in the audit log.">
        {action?.kind === 'extend' && (
          <div className="mb-3">
            <Input label="Extend by (days)" type="number" min={1} value={extendDays} onChange={(e) => setExtendDays(e.target.value)} />
          </div>
        )}
      </ConfirmModal>
    </div>
  );
}
