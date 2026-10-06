'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge, Button, Card, EmptyState, ErrorState, Input, Modal,
  Pagination, Select, Skeleton, StatCard, Textarea, useToast,
} from '@bachatly/ui';
import { ApiError } from '@/lib/api';
import { adminListBusinesses } from '@/lib/catalog';
import {
  cancelSettlement, fetchSettlements, markSettlementPaid, runSettlement,
  type SettlementRow,
} from '@/lib/finance';
import { paisaToPkr } from '@/lib/catalog';
import { formatDate, formatPKR } from '@/lib/format';

const STATUSES = [
  { value: '', label: 'All statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PENDING', label: 'Pending payout' },
  { value: 'PAID', label: 'Paid' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const PAYOUT_METHODS = [
  { value: 'BANK', label: 'Bank transfer' },
  { value: 'JAZZCASH', label: 'JazzCash' },
  { value: 'EASYPAISA', label: 'Easypaisa' },
  { value: 'CASH', label: 'Cash' },
];

function statusTone(s: string): 'success' | 'warning' | 'error' | 'info' | 'neutral' {
  switch ((s ?? '').toUpperCase()) {
    case 'PAID': return 'success';
    case 'PENDING': return 'warning';
    case 'CANCELLED': return 'error';
    case 'DRAFT': return 'info';
    default: return 'neutral';
  }
}

const gross = (r: SettlementRow) => r.grossPaisa ?? r.gross ?? 0;
const commission = (r: SettlementRow) => r.commissionPaisa ?? r.commission ?? 0;
const net = (r: SettlementRow) => r.netPaisa ?? r.net ?? 0;
const pkr = (p: number) => paisaToPkr(p) ?? 0;

export default function AdminSettlementsPage() {
  const { toast } = useToast();
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 12;

  const [items, setItems] = useState<SettlementRow[]>([]);
  const [total, setTotal] = useState(0);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Run settlement form
  const [businesses, setBusinesses] = useState<Array<{ id: string; name: string }>>([]);
  const [runBiz, setRunBiz] = useState('');
  const [runFrom, setRunFrom] = useState('');
  const [runTo, setRunTo] = useState('');
  const [running, setRunning] = useState(false);

  // Modals
  const [receipt, setReceipt] = useState<SettlementRow | null>(null);
  const [paying, setPaying] = useState<SettlementRow | null>(null);
  const [reference, setReference] = useState('');
  const [method, setMethod] = useState('BANK');
  const [payBusy, setPayBusy] = useState(false);
  const [cancelling, setCancelling] = useState<SettlementRow | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelBusy, setCancelBusy] = useState(false);

  const load = useCallback(async () => {
    setError(''); setLoading(true);
    try {
      const res = await fetchSettlements({
        status: status || undefined, from: from || undefined, to: to || undefined, page, pageSize,
      });
      if (res === null) { setUnavailable(true); return; }
      setItems(res.items); setTotal(res.total);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load settlements.');
    } finally {
      setLoading(false);
    }
  }, [status, from, to, page]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    adminListBusinesses({ pageSize: 100 }).then(
      (p) => setBusinesses(p.items.map((b) => ({ id: b.id, name: b.name }))),
    ).catch(() => { /* business selector is optional */ });
  }, []);

  const totals = useMemo(() => ({
    gross: items.reduce((s, r) => s + gross(r), 0),
    commission: items.reduce((s, r) => s + commission(r), 0),
    net: items.reduce((s, r) => s + net(r), 0),
  }), [items]);

  const doRun = async () => {
    if (!runFrom || !runTo) { toast('Choose a settlement period.', 'error'); return; }
    setRunning(true);
    try {
      const s = await runSettlement({ businessId: runBiz || undefined, from: runFrom, to: runTo });
      toast(`Settlement ${s.id.slice(0, 8)}… generated.`, 'success');
      setRunBiz(''); setRunFrom(''); setRunTo('');
      load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not run settlement.', 'error');
    } finally {
      setRunning(false);
    }
  };

  const doMarkPaid = async () => {
    if (!paying) return;
    if (!reference.trim()) { toast('A payout reference is required.', 'error'); return; }
    setPayBusy(true);
    try {
      await markSettlementPaid(paying.id, { payoutReference: reference.trim(), method });
      toast('Settlement marked as paid.', 'success');
      setPaying(null); setReference(''); setMethod('BANK');
      load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not mark as paid.', 'error');
    } finally {
      setPayBusy(false);
    }
  };

  const doCancel = async () => {
    if (!cancelling) return;
    if (!cancelReason.trim()) { toast('A cancellation reason is required.', 'error'); return; }
    setCancelBusy(true);
    try {
      await cancelSettlement(cancelling.id, { reason: cancelReason.trim() });
      toast('Settlement cancelled.', 'success');
      setCancelling(null); setCancelReason('');
      load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not cancel.', 'error');
    } finally {
      setCancelBusy(false);
    }
  };

  const periodLabel = (r: SettlementRow) =>
    r.period ?? (r.periodFrom && r.periodTo ? `${formatDate(r.periodFrom)} → ${formatDate(r.periodTo)}` : r.id.slice(0, 8));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-ink">Settlements</h1>

      {unavailable ? (
        <Card className="p-4">
          <EmptyState title="Settlements are not live yet" icon="💰"
            description="The /settlements endpoints are not deployed yet. Settlement batches, mark-paid and payouts will render here automatically once the backend lands." />
        </Card>
      ) : (
        <>
          <Card className="p-5">
            <h2 className="mb-3 font-bold text-ink">Run settlement batch</h2>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-52 flex-1">
                <Select label="Business (optional — all if blank)" value={runBiz}
                  onChange={(e) => setRunBiz(e.target.value)}
                  options={[{ value: '', label: 'All businesses' }, ...businesses.map((b) => ({ value: b.id, label: b.name }))]} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Period from</label>
                <input type="date" value={runFrom} onChange={(e) => setRunFrom(e.target.value)}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Period to</label>
                <input type="date" value={runTo} onChange={(e) => setRunTo(e.target.value)}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <Button disabled={running} onClick={doRun}>{running ? 'Running…' : 'Run settlement'}</Button>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Generates settlement batches from validated redemptions in the period, minus commission. Gross/commission math is computed server-side.
            </p>
          </Card>

          <Card className="flex flex-wrap items-end gap-3 p-5">
            <div className="w-44">
              <Select label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} options={STATUSES} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">From</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">To</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <Button onClick={() => { setPage(1); load(); }}>Apply</Button>
          </Card>

          {error ? (
            <ErrorState title="Couldn't load settlements" description={error} onRetry={load} />
          ) : loading ? (
            <Skeleton className="h-48 !rounded-2xl" />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                <StatCard label="Gross (shown)" value={formatPKR(pkr(totals.gross))} icon="💰" />
                <StatCard label="Commission (shown)" value={formatPKR(pkr(totals.commission))} icon="📉" />
                <StatCard label="Net payable (shown)" value={formatPKR(pkr(totals.net))} icon="🏦" />
              </div>

              {items.length === 0 ? (
                <Card className="p-4">
                  <EmptyState title="No settlements" icon="💰" description="No settlement batches match these filters. Run a batch above." />
                </Card>
              ) : (
                <Card className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[820px] text-left text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                          <th className="px-4 py-3">Period</th>
                          <th className="px-4 py-3">Business</th>
                          <th className="px-4 py-3">Gross</th>
                          <th className="px-4 py-3">Commission</th>
                          <th className="px-4 py-3">Net</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((r) => (
                          <tr key={r.id} className="border-t border-slate-100">
                            <td className="px-4 py-3 font-semibold text-ink">{periodLabel(r)}</td>
                            <td className="px-4 py-3 text-slate-600">{r.businessName ?? '—'}</td>
                            <td className="px-4 py-3">{formatPKR(pkr(gross(r)))}</td>
                            <td className="px-4 py-3 text-error">{formatPKR(pkr(commission(r)))}</td>
                            <td className="px-4 py-3 font-bold text-success">{formatPKR(pkr(net(r)))}</td>
                            <td className="px-4 py-3"><Badge tone={statusTone(r.status)}>{r.status}</Badge></td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex justify-end gap-1.5">
                                <Button size="sm" variant="outline" onClick={() => setReceipt(r)}>Receipt</Button>
                                {(r.status === 'PENDING' || r.status === 'DRAFT') && (
                                  <>
                                    <Button size="sm" onClick={() => setPaying(r)}>Mark paid</Button>
                                    <Button size="sm" variant="outline" onClick={() => setCancelling(r)}>Cancel</Button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-center border-t border-slate-100 p-3">
                    <Pagination page={page} totalPages={Math.max(1, Math.ceil(total / pageSize))} onChange={setPage} />
                  </div>
                </Card>
              )}
            </>
          )}
        </>
      )}

      {/* Receipt */}
      <Modal open={!!receipt} onClose={() => setReceipt(null)} title="Settlement receipt"
        footer={<Button variant="outline" onClick={() => setReceipt(null)}>Close</Button>}>
        {receipt && (
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Batch</dt><dd className="font-mono text-xs">{receipt.id}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Period</dt><dd className="font-semibold">{periodLabel(receipt)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Business</dt><dd className="font-semibold">{receipt.businessName ?? '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Gross</dt><dd>{formatPKR(pkr(gross(receipt)))}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Commission</dt><dd className="text-error">−{formatPKR(pkr(commission(receipt)))}</dd></div>
            <div className="flex justify-between border-t border-slate-100 pt-2"><dt className="font-bold">Net payable</dt><dd className="font-bold text-success">{formatPKR(pkr(net(receipt)))}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Status</dt><dd><Badge tone={statusTone(receipt.status)}>{receipt.status}</Badge></dd></div>
            {receipt.payoutReference && <div className="flex justify-between"><dt className="text-slate-500">Payout reference</dt><dd className="font-mono text-xs">{receipt.payoutReference}</dd></div>}
            {receipt.payoutMethod && <div className="flex justify-between"><dt className="text-slate-500">Method</dt><dd>{receipt.payoutMethod}</dd></div>}
            {receipt.paidAt && <div className="flex justify-between"><dt className="text-slate-500">Paid at</dt><dd>{formatDate(receipt.paidAt)}</dd></div>}
          </dl>
        )}
      </Modal>

      {/* Mark paid */}
      <Modal open={!!paying} onClose={() => setPaying(null)} title="Mark settlement as paid"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPaying(null)}>Cancel</Button>
            <Button disabled={payBusy} onClick={doMarkPaid}>{payBusy ? 'Saving…' : 'Confirm payment'}</Button>
          </div>
        }>
        {paying && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Confirm payout of <strong className="text-ink">{formatPKR(pkr(net(paying)))}</strong> to{' '}
              <strong className="text-ink">{paying.businessName ?? 'the business'}</strong>.
            </p>
            <div className="w-52">
              <Select label="Payout method" value={method} onChange={(e) => setMethod(e.target.value)} options={PAYOUT_METHODS} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Payout reference (required)</label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. bank ref, JazzCash TRX id" />
            </div>
          </div>
        )}
      </Modal>

      {/* Cancel */}
      <Modal open={!!cancelling} onClose={() => setCancelling(null)} title="Cancel settlement"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCancelling(null)}>Keep</Button>
            <Button variant="danger" disabled={cancelBusy} onClick={doCancel}>{cancelBusy ? 'Cancelling…' : 'Cancel settlement'}</Button>
          </div>
        }>
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Cancelling a settlement is audited. The reason is required.</p>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Reason (required)</label>
            <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={3}
              placeholder="Why is this settlement being cancelled?" />
          </div>
        </div>
      </Modal>
    </div>
  );
}
