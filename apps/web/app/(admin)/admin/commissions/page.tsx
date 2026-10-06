'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge, Button, Card, EmptyState, ErrorState, Modal,
  Pagination, Select, Skeleton, StatCard, Textarea, useToast,
} from '@bachatly/ui';
import { ApiError } from '@/lib/api';
import {
  adjustCommission, fetchCommissions, type CommissionRow,
} from '@/lib/finance';
import { paisaToPkr } from '@/lib/catalog';
import { formatDate, formatPKR } from '@/lib/format';

const STATUSES = [
  { value: '', label: 'All statuses' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'SETTLED', label: 'Settled' },
  { value: 'ADJUSTED', label: 'Adjusted' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

function statusTone(s: string): 'success' | 'warning' | 'error' | 'info' | 'neutral' {
  switch ((s ?? '').toUpperCase()) {
    case 'SETTLED': return 'success';
    case 'PENDING': return 'warning';
    case 'ADJUSTED': return 'info';
    case 'CANCELLED': return 'error';
    default: return 'neutral';
  }
}

export default function AdminCommissionsPage() {
  const { toast } = useToast();
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const [items, setItems] = useState<CommissionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const [adjusting, setAdjusting] = useState<CommissionRow | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(''); setLoading(true);
    try {
      const res = await fetchCommissions({
        status: status || undefined, from: from || undefined, to: to || undefined,
        businessId: q.trim() || undefined, page, pageSize,
      });
      if (res === null) { setUnavailable(true); return; }
      setItems(res.items); setTotal(res.total);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load commissions.');
    } finally {
      setLoading(false);
    }
  }, [status, from, to, q, page]);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    const pkr = (p?: number) => paisaToPkr(p ?? 0) ?? 0;
    return {
      commission: items.reduce((s, r) => s + (r.commissionPaisa ?? 0), 0),
      paid: items.reduce((s, r) => s + (r.paidPaisa ?? 0), 0),
    };
  }, [items]);

  const doAdjust = async () => {
    if (!adjusting) return;
    if (!reason.trim()) { toast('A reason is required for adjustments.', 'error'); return; }
    setSaving(true);
    try {
      await adjustCommission(adjusting.id, {
        amountPaisa: amount.trim() === '' ? undefined : Math.round(Number(amount) * 100),
        reason: reason.trim(),
      });
      toast('Commission adjusted.', 'success');
      setAdjusting(null); setAmount(''); setReason('');
      load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Adjustment failed.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const pkr = (p?: number) => paisaToPkr(p ?? 0) ?? 0;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-ink">Commissions</h1>

      <Card className="flex flex-wrap items-end gap-3 p-5">
        <div className="w-44">
          <Select label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            options={STATUSES} />
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
        <div className="min-w-52 flex-1">
          <label className="mb-1 block text-xs font-semibold text-slate-600">Business (id or name)</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search business…"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <Button onClick={() => { setPage(1); load(); }}>Apply</Button>
      </Card>

      {unavailable ? (
        <Card className="p-4">
          <EmptyState title="Commissions are not live yet" icon="📉"
            description="The GET /commissions endpoint is not deployed yet. The commission ledger will render here automatically once the backend lands." />
        </Card>
      ) : error ? (
        <ErrorState title="Couldn't load commissions" description={error} onRetry={load} />
      ) : loading ? (
        <Skeleton className="h-48 !rounded-2xl" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatCard label="Total records" value={total.toLocaleString()} icon="🧾" />
            <StatCard label="Commission (shown)" value={formatPKR(pkr(totals.commission))} icon="📉" />
            <StatCard label="Paid base (shown)" value={formatPKR(pkr(totals.paid))} icon="💰" />
          </div>

          {items.length === 0 ? (
            <Card className="p-4">
              <EmptyState title="No commissions" icon="📉" description="No commission records match these filters." />
            </Card>
          ) : (
            <Card className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3">Business</th>
                      <th className="px-4 py-3">Paid</th>
                      <th className="px-4 py-3">Commission</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((r) => (
                      <tr key={r.id} className="border-t border-slate-100">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-ink">{r.businessName}</p>
                          {r.redemptionId && <p className="text-xs text-slate-400">redemption {r.redemptionId.slice(0, 8)}…</p>}
                        </td>
                        <td className="px-4 py-3 font-semibold">{formatPKR(pkr(r.paidPaisa))}</td>
                        <td className="px-4 py-3 font-bold text-error">{formatPKR(pkr(r.commissionPaisa))}</td>
                        <td className="px-4 py-3"><Badge tone={statusTone(r.status)}>{r.status}</Badge></td>
                        <td className="px-4 py-3 text-slate-500">{r.createdAt ? formatDate(r.createdAt) : '—'}</td>
                        <td className="px-4 py-3 text-right">
                          <Button size="sm" variant="outline" onClick={() => setAdjusting(r)}>Adjust</Button>
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

      <Modal open={!!adjusting} onClose={() => setAdjusting(null)} title="Adjust commission"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAdjusting(null)}>Cancel</Button>
            <Button disabled={saving} onClick={doAdjust}>{saving ? 'Saving…' : 'Apply adjustment'}</Button>
          </div>
        }>
        {adjusting && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Adjusting the commission for <strong className="text-ink">{adjusting.businessName}</strong>
              {' '}({formatPKR(pkr(adjusting.commissionPaisa))}). Adjustments are audited — the reason is required.
            </p>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                New commission (Rs.) — leave blank to keep the rule-computed value and log a correction
              </label>
              <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 250" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Reason (required)</label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this commission being adjusted?" rows={3} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
