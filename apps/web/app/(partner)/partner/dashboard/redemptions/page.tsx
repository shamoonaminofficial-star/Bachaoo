'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { Button, Card, EmptyState, ErrorState, Input, Modal, Select, Skeleton } from '@bachatly/ui';
import { formatDateTime, formatPKR } from '@/lib/format';
import {
  fetchPartnerRedemptions, pkr, type PartnerRedemption,
} from '@/lib/partner';
import { partnerMyDeals } from '@/lib/catalog';
import { usePartnerBusiness } from '../layout';

const EMPTY = '—';

export default function PartnerRedemptionsPage() {
  const { business, loading: bizLoading } = usePartnerBusiness();
  const [items, setItems] = useState<PartnerRedemption[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  const [dealId, setDealId] = useState('');
  const [q, setQ] = useState('');
  const [qInput, setQInput] = useState('');
  const [deals, setDeals] = useState<{ id: string; title: string }[]>([]);
  const [receipt, setReceipt] = useState<PartnerRedemption | null>(null);
  const pageSize = 20;

  const load = useCallback(async () => {
    if (!business?.id) return;
    setError('');
    try {
      const res = await fetchPartnerRedemptions(business.id, {
        dealId: dealId || undefined, q: q || undefined, page, pageSize,
      });
      if (!res) { setUnavailable(true); return; }
      setItems(res.items); setTotal(res.total);
    } catch (e) {
      console.warn('[partner redemptions]', e);
      setError('Could not load redemptions.');
    }
  }, [business, dealId, q, page]);

  useEffect(() => { if (!bizLoading) load(); }, [bizLoading, load]);
  useEffect(() => {
    partnerMyDeals().then((ds) => setDeals(ds.map((d) => ({ id: d.id, title: d.title })))).catch(() => {});
  }, []);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold text-ink">Redemptions</h1>

      <Card className="flex flex-wrap gap-3 p-4">
        <Select
          aria-label="Filter by deal" value={dealId}
          onChange={(e) => { setDealId(e.target.value); setPage(1); }}
          options={[{ value: '', label: 'All deals' }, ...deals.map((d) => ({ value: d.id, label: d.title }))]}
          className="!w-auto min-w-48"
        />
        <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); setQ(qInput); setPage(1); }}>
          <Input placeholder="Search deal or customer…" value={qInput} onChange={(e) => setQInput(e.target.value)} aria-label="Search redemptions" />
          <Button type="submit" variant="outline">Search</Button>
        </form>
      </Card>

      {unavailable ? (
        <EmptyState icon="🧾" title="Redemption ledger not live yet"
          description="The partner redemption API isn't deployed yet — this ledger will appear here once it is. Customer redemptions already work via the QR scanner." />
      ) : error && !items ? (
        <ErrorState title="Couldn't load redemptions" description={error} onRetry={load} />
      ) : !items ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon="🧾" title="No redemptions found" description="Adjust filters, or scan your first customer QR." />
      ) : (
        <>
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[800px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-400">
                  <th className="px-4 py-3">Date</th><th className="px-4 py-3">Deal</th>
                  <th className="px-4 py-3">Customer</th><th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3 text-right">Bill</th><th className="px-4 py-3 text-right">Discount</th>
                  <th className="px-4 py-3 text-right">Paid</th><th className="px-4 py-3 text-right">Saved</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatDateTime(r.createdAt)}</td>
                    <td className="max-w-48 truncate px-4 py-3 font-medium text-ink">{r.dealTitle ?? EMPTY}</td>
                    <td className="px-4 py-3 text-slate-600">{r.customerFirstName ?? EMPTY}</td>
                    <td className="px-4 py-3 text-slate-600">{r.branchName ?? EMPTY}</td>
                    <td className="px-4 py-3 text-right">{formatPKR(pkr(r.bill))}</td>
                    <td className="px-4 py-3 text-right text-success">−{formatPKR(pkr(r.discount))}</td>
                    <td className="px-4 py-3 text-right font-semibold text-ink">{formatPKR(pkr(r.paid))}</td>
                    <td className="px-4 py-3 text-right font-semibold text-brand-700">{formatPKR(pkr(r.saving))}</td>
                    <td className="px-4 py-3"><Button size="sm" variant="outline" onClick={() => setReceipt(r)}>Receipt</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          {total > pageSize && (
            <div className="flex items-center justify-between text-sm text-slate-500">
              <span>Page {page} of {Math.ceil(total / pageSize)} · {total} total</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</Button>
                <Button size="sm" variant="outline" disabled={page >= Math.ceil(total / pageSize)} onClick={() => setPage((p) => p + 1)}>Next →</Button>
              </div>
            </div>
          )}
        </>
      )}

      {receipt && (
        <Modal open onClose={() => setReceipt(null)} title="Redemption receipt">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {[
              ['Deal', receipt.dealTitle ?? EMPTY],
              ['Branch', receipt.branchName ?? EMPTY],
              ['Customer', receipt.customerFirstName ?? EMPTY],
              ['Date', formatDateTime(receipt.createdAt)],
              ['Bill', formatPKR(pkr(receipt.bill))],
              ['Discount', `−${formatPKR(pkr(receipt.discount))}`],
              ['Paid', formatPKR(pkr(receipt.paid))],
              ['Customer saved', formatPKR(pkr(receipt.saving))],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-slate-50 px-4 py-3">
                <dt className="text-xs text-slate-500">{k}</dt>
                <dd className="mt-0.5 font-bold text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-slate-400">Redemption ID: <code className="break-all">{receipt.id}</code></p>
          <Button className="mt-4" fullWidth onClick={() => setReceipt(null)}>Close</Button>
        </Modal>
      )}
    </div>
  );
}
