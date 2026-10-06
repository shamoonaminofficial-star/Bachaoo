'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, EmptyState, ErrorState, Modal, Skeleton } from '@bachatly/ui';
import { ApiError } from '@/lib/api';
import { fetchPartnerSettlements, type SettlementRow } from '@/lib/finance';
import { paisaToPkr } from '@/lib/catalog';
import { formatPKR, formatDate } from '@/lib/format';
import { usePartnerBusiness } from '../layout';

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

/**
 * Partner settlements — net payouts per period (gross minus commission).
 * Wired to GET /settlements/business/:id; if that's not deployed yet the
 * page degrades honestly with no invented amounts.
 */
export default function PartnerSettlementsPage() {
  const { business, loading: bizLoading } = usePartnerBusiness();
  const [rows, setRows] = useState<SettlementRow[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<SettlementRow | null>(null);

  const load = useCallback(async () => {
    if (!business?.id) return;
    setError('');
    try {
      const data = await fetchPartnerSettlements(business.id);
      if (data === null) { setUnavailable(true); return; }
      setRows(data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load settlements.');
    }
  }, [business]);

  useEffect(() => { if (!bizLoading) load(); }, [bizLoading, load]);

  const periodLabel = (r: SettlementRow) =>
    r.period ?? (r.periodFrom && r.periodTo ? `${formatDate(r.periodFrom)} → ${formatDate(r.periodTo)}` : r.id.slice(0, 8));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-ink">Settlements</h1>

      {unavailable ? (
        <Card className="p-4">
          <EmptyState icon="💰" title="Settlements not live yet"
            description="Payout settlements are computed from your validated redemptions minus the agreed commission. This section goes live with the settlements backend — no amounts are shown until real data exists." />
        </Card>
      ) : error ? (
        <ErrorState title="Couldn't load settlements" description={error} onRetry={load} />
      ) : !rows ? (
        <Skeleton className="h-40 !rounded-2xl" />
      ) : rows.length === 0 ? (
        <Card className="p-4">
          <EmptyState icon="💰" title="No settlements yet"
            description="Once a settlement batch is processed, each period will appear here with gross, commission and net payable." />
        </Card>
      ) : (
        <>
          {rows.map((r) => (
            <Card key={r.id} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold text-ink">{periodLabel(r)}</p>
                <div className="flex items-center gap-2">
                  <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                  <Button size="sm" variant="outline" onClick={() => setReceipt(r)}>Receipt</Button>
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                <div className="rounded-xl bg-slate-50 px-4 py-3">
                  <dt className="text-xs text-slate-500">Gross</dt>
                  <dd className="mt-0.5 font-bold text-ink">{formatPKR(pkr(gross(r)))}</dd>
                </div>
                <div className="rounded-xl bg-slate-50 px-4 py-3">
                  <dt className="text-xs text-slate-500">Commission</dt>
                  <dd className="mt-0.5 font-bold text-error">−{formatPKR(pkr(commission(r)))}</dd>
                </div>
                <div className="rounded-xl bg-slate-50 px-4 py-3">
                  <dt className="text-xs text-slate-500">Net payable</dt>
                  <dd className="mt-0.5 font-bold text-success">{formatPKR(pkr(net(r)))}</dd>
                </div>
              </dl>
              {r.paidAt && <p className="mt-2 text-xs text-slate-400">Paid on {formatDate(r.paidAt)}</p>}
            </Card>
          ))}
          <p className="text-xs text-slate-400">Dispute a settlement from Support within 7 days of payment.</p>
        </>
      )}

      <Modal open={!!receipt} onClose={() => setReceipt(null)} title="Settlement receipt"
        footer={<Button variant="outline" onClick={() => setReceipt(null)}>Close</Button>}>
        {receipt && (
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Period</dt><dd className="font-semibold">{periodLabel(receipt)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Gross</dt><dd>{formatPKR(pkr(gross(receipt)))}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Commission</dt><dd className="text-error">−{formatPKR(pkr(commission(receipt)))}</dd></div>
            <div className="flex justify-between border-t border-slate-100 pt-2"><dt className="font-bold">Net payable</dt><dd className="font-bold text-success">{formatPKR(pkr(net(receipt)))}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Status</dt><dd><Badge tone={statusTone(receipt.status)}>{receipt.status}</Badge></dd></div>
            {receipt.payoutReference && <div className="flex justify-between"><dt className="text-slate-500">Payout reference</dt><dd className="font-mono text-xs">{receipt.payoutReference}</dd></div>}
            {receipt.paidAt && <div className="flex justify-between"><dt className="text-slate-500">Paid at</dt><dd>{formatDate(receipt.paidAt)}</dd></div>}
          </dl>
        )}
      </Modal>
    </div>
  );
}
