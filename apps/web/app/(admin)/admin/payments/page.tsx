'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { Card, Badge, Button, DataTable, Modal, Drawer, Tabs, Select, Input, Pagination, SkeletonCard, ErrorState, EmptyState, Textarea, statusTone, useToast } from '@bachatly/ui';
import { ApiError } from '@/lib/api';
import { adminListPayments, adminVerifyPayment, type ApiPayment } from '@/lib/memberships';
import { formatPKR, formatDateTime } from '@/lib/format';

export default function AdminPaymentsPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<ApiPayment[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState('all');
  const [gateway, setGateway] = useState('');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [page, setPage] = useState(1);
  const [verify, setVerify] = useState<ApiPayment | null>(null);
  const [detail, setDetail] = useState<ApiPayment | null>(null);
  const [reason, setReason] = useState('');
  const [deciding, setDeciding] = useState(false);

  useEffect(() => { const t = setTimeout(() => { setDebouncedQ(q); setPage(1); }, 350); return () => clearTimeout(t); }, [q]);

  const load = useCallback(() => {
    setError(false);
    const status = tab === 'all' ? undefined : tab === 'manual' ? 'pending' : tab;
    adminListPayments({
      status, gateway: gateway || undefined, q: debouncedQ || undefined, page, pageSize: 12,
    }).then((res) => {
      let items = res.items;
      if (tab === 'manual') items = items.filter((p) => p.gateway === 'manual' || p.gateway === 'bank_transfer');
      setRows(items); setTotal(res.total);
    }).catch(() => { setRows(null); setError(true); });
  }, [tab, gateway, debouncedQ, page]);
  useEffect(load, [load]);

  const decide = async (ok: boolean) => {
    if (!verify) return;
    if (!ok && !reason.trim()) { toast('A reason is required to reject a payment.', 'error'); return; }
    setDeciding(true);
    try {
      await adminVerifyPayment(verify.id, ok, reason.trim() || undefined);
      toast(ok ? 'Payment approved — membership activated (logged to audit).' : 'Payment rejected.');
      setVerify(null); setReason(''); load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Verification failed.', 'error');
    } finally { setDeciding(false); }
  };

  const isManualPending = (r: ApiPayment) => r.status === 'pending' && (r.gateway === 'manual' || r.gateway === 'bank_transfer');

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-ink">Payments</h1>
      <Tabs tabs={[
        { id: 'all', label: 'All' },
        { id: 'pending', label: 'Pending' },
        { id: 'paid', label: 'Paid' },
        { id: 'manual', label: 'Manual / Bank Transfer' },
        { id: 'failed', label: 'Failed' },
        { id: 'refunded', label: 'Refunded' },
      ]} active={tab} onChange={(t) => { setTab(t); setPage(1); }} />

      <Card className="p-4">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row">
          <Input aria-label="Search payments" placeholder="Search user, email, payment ID…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="w-full sm:w-52">
            <Select aria-label="Filter by gateway" value={gateway} onChange={(e) => { setGateway(e.target.value); setPage(1); }}
              options={[
                { value: '', label: 'All gateways' },
                { value: 'manual', label: 'Manual / Bank Transfer' },
                { value: 'jazzcash', label: 'JazzCash' },
                { value: 'easypaisa', label: 'Easypaisa' },
                { value: 'card', label: 'Card' },
                { value: 'stripe', label: 'Stripe' },
              ]} />
          </div>
        </div>

        {!rows && !error && <SkeletonCard />}
        {error && <ErrorState title="Could not load payments" onRetry={load} />}
        {rows && rows.length === 0 && <EmptyState icon="💳" title="No payments found" description="Payments appear here once customers check out." />}
        {rows && rows.length > 0 && (
          <>
            <DataTable<ApiPayment> rows={rows} exportName="payments"
              columns={[
                { key: 'id', header: 'Payment ID', render: (r) => <span className="font-mono text-xs">{r.id.slice(0, 8)}…</span> },
                { key: 'user', header: 'User', sortable: true, render: (r) => (<span><span className="block font-medium text-ink">{r.user?.name || '—'}</span><span className="block text-xs text-slate-400">{r.user?.email || ''}</span></span>) },
                { key: 'item', header: 'Item', render: (r) => r.item || 'Membership' },
                { key: 'amount', header: 'Amount', sortable: true, render: (r) => formatPKR(r.amount) },
                { key: 'gateway', header: 'Gateway', render: (r) => r.gateway.replace('_', ' ').toUpperCase() },
                { key: 'status', header: 'Status', render: (r) => <Badge tone={statusTone[r.status] || 'neutral'}>{r.status.toUpperCase()}</Badge> },
                { key: 'createdAt', header: 'Date', sortable: true, render: (r) => (r.createdAt ? formatDateTime(r.createdAt) : '—') },
                {
                  key: 'actions', header: 'Actions', render: (r) => (
                    <span onClick={(e) => e.stopPropagation()} className="flex gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => setDetail(r)}>View</Button>
                      {isManualPending(r) && <Button size="sm" onClick={() => { setReason(''); setVerify(r); }}>Verify</Button>}
                    </span>),
                },
              ]} />
            <div className="mt-3"><Pagination page={page} totalPages={Math.max(1, Math.ceil(total / 12))} onChange={setPage} /></div>
          </>
        )}
      </Card>

      {/* Manual verification modal */}
      <Modal open={!!verify} onClose={() => setVerify(null)} title="Verify bank transfer"
        footer={<>
          <Button variant="ghost" onClick={() => setVerify(null)}>Close</Button>
          <Button variant="danger" onClick={() => decide(false)} loading={deciding}>Reject</Button>
          <Button onClick={() => decide(true)} loading={deciding}>Approve & Activate</Button>
        </>}>
        {verify && (
          <div className="space-y-3 text-sm">
            <dl className="grid grid-cols-2 gap-3">
              {[['User', verify.user?.name || '—'], ['Email', verify.user?.email || '—'], ['Item', verify.item || 'Membership'], ['Amount', formatPKR(verify.amount)], ['Gateway', verify.gateway.toUpperCase()], ['Date', verify.createdAt ? formatDateTime(verify.createdAt) : '—']].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">{k}</dt><dd className="font-semibold text-ink">{v}</dd></div>
              ))}
            </dl>
            {verify.receiptUrl ? (
              <a href={verify.receiptUrl} target="_blank" rel="noreferrer" className="block rounded-xl bg-slate-100 p-4 text-center text-sm font-semibold text-brand-700 hover:underline">
                📎 Open uploaded receipt
              </a>
            ) : (
              <div className="rounded-xl bg-slate-100 p-4 text-center text-sm text-slate-500">No receipt attached.</div>
            )}
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Reason (required to reject, optional to approve)</label>
              <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Amount mismatch in bank statement…" />
            </div>
            <p className="text-xs text-amber-700">⚠️ Verify the transfer in your bank statement before approving. Approval activates the membership and is audit-logged.</p>
          </div>
        )}
      </Modal>

      {/* Payment detail drawer */}
      <Drawer open={!!detail} onClose={() => setDetail(null)} title="Payment detail">
        {detail && (
          <div className="space-y-3 text-sm">
            <dl className="grid grid-cols-2 gap-3">
              {[['Payment ID', detail.id], ['Status', detail.status.toUpperCase()], ['Amount', formatPKR(detail.amount)], ['Gateway', detail.gateway.toUpperCase()], ['Gateway Txn ID', detail.gatewayTransactionId || '—'], ['User', detail.user?.name || '—'], ['Email', detail.user?.email || '—'], ['Item', detail.item || 'Membership'], ['Created', detail.createdAt ? formatDateTime(detail.createdAt) : '—'], ['Verified at', detail.verifiedAt ? formatDateTime(detail.verifiedAt) : '—'], ['Verified by', detail.verifiedBy || '—']].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">{k}</dt><dd className="font-semibold text-ink">{v}</dd></div>
              ))}
            </dl>
            {detail.rejectReason && (
              <div className="rounded-xl bg-error/5 p-3"><p className="text-xs text-slate-500">Reject reason</p><p className="font-semibold text-ink">{detail.rejectReason}</p></div>
            )}
            {isManualPending(detail) && (
              <Button onClick={() => { setDetail(null); setReason(''); setVerify(detail); }}>Verify Payment</Button>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
