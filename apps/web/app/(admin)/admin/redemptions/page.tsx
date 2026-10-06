'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { Card, Badge, DataTable, TableSkeleton, Select, Drawer, Button, ErrorState } from '@bachatly/ui';
import { withSeedFallback, ApiError } from '@/lib/api';
import {
  adminListRedemptions, formatPaisa, type Page, type ApiRedemptionItem,
} from '@/lib/catalog';
import { SEED_REDEMPTIONS } from '@/lib/seed';
import { formatDateTime } from '@/lib/format';

interface Row extends Record<string, unknown> {
  id: string; receipt: string; customer: string; business: string; branch: string;
  deal: string; bill: string; discount: string; saved: string; status: string;
  at: string; raw: ApiRedemptionItem;
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'FLAGGED', label: 'Flagged' },
  { value: 'REFUNDED', label: 'Refunded' },
];

/** DEV-ONLY seed rows (marked) used only when the API is unreachable. */
function seedRows(): Row[] {
  return SEED_REDEMPTIONS.map((r, i) => ({
    id: r.id,
    receipt: r.receiptNo,
    customer: ['Ahmed Raza', 'Sara Khan', 'Bilal Malik'][i % 3],
    business: r.businessName,
    branch: ['DHA Phase 5', 'Gulberg III', 'Model Town'][i % 3],
    deal: r.dealTitle,
    bill: r.billAmount ? `Rs. ${r.billAmount.toLocaleString('en-PK')}` : '—',
    discount: `Rs. ${r.discountAmount.toLocaleString('en-PK')}`,
    saved: `Rs. ${r.savedAmount.toLocaleString('en-PK')}`,
    status: i === 1 ? 'FLAGGED' : 'COMPLETED',
    at: r.createdAt,
    raw: {
      id: r.id, createdAt: r.createdAt, receiptNo: r.receiptNo,
      bill: r.billAmount * 100, discount: r.discountAmount * 100, paid: r.paidAmount * 100,
      saving: r.savedAmount * 100, cashback: r.cashbackEarned * 100, points: r.pointsEarned,
      deal: { title: r.dealTitle }, business: { name: r.businessName },
      branch: { name: ['DHA Phase 5', 'Gulberg III', 'Model Town'][i % 3] },
      status: i === 1 ? 'FLAGGED' : 'COMPLETED',
      customer: { name: ['Ahmed Raza', 'Sara Khan', 'Bilal Malik'][i % 3] },
    },
  }));
}

function toRow(r: ApiRedemptionItem): Row {
  return {
    id: r.id,
    receipt: r.receiptNo ?? r.id.slice(0, 12).toUpperCase(),
    customer: r.customer?.name ?? r.customer?.firstName ?? '—',
    business: r.business?.name ?? '—',
    branch: r.branch?.name ?? '—',
    deal: r.deal?.title ?? '—',
    bill: formatPaisa(r.bill),
    discount: formatPaisa(r.discount),
    saved: formatPaisa(r.saving),
    status: (r.status ?? 'COMPLETED').toUpperCase(),
    at: r.createdAt,
    raw: r,
  };
}

const statusTone = (s: string): 'success' | 'error' | 'neutral' | 'warning' =>
  s === 'COMPLETED' ? 'success' : s === 'FLAGGED' ? 'error' : s === 'REFUNDED' ? 'warning' : 'neutral';

export default function AdminRedemptionsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [status, setStatus] = useState('all');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Row | null>(null);

  const load = useCallback(async (s: string) => {
    setError('');
    try {
      const pg = await withSeedFallback(
        () => adminListRedemptions({ status: s === 'all' ? undefined : s, pageSize: 50 }),
        (() => {
          const seed = seedRows();
          return { items: seed, page: 1, pageSize: 50, total: seed.length, totalPages: 1 };
        })() as unknown as Page<ApiRedemptionItem>,
        'admin redemptions',
      );
      // Seed fallback arrives as pre-mapped Rows; live data arrives as ApiRedemptionItem.
      const items = pg.items as unknown as Array<ApiRedemptionItem | Row>;
      setRows(items.map((it) => ('raw' in it ? (it as Row) : toRow(it as ApiRedemptionItem))));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load redemptions.');
      setRows([]);
    }
  }, []);

  useEffect(() => { load(status); }, [load, status]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-ink">Redemptions</h1>
        <div className="w-56">
          <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} options={STATUS_OPTIONS} />
        </div>
      </div>

      {error && <ErrorState title="Couldn't load redemptions" description={error} onRetry={() => load(status)} />}

      <Card className="p-4">
        {!rows ? <TableSkeleton rows={6} cols={8} /> : (
          <DataTable<Row> rows={rows} searchable={['receipt', 'customer', 'business', 'deal']} exportName="redemptions"
            onRowClick={setSelected}
            columns={[
              { key: 'receipt', header: 'Receipt', sortable: true },
              { key: 'customer', header: 'Customer', sortable: true },
              { key: 'business', header: 'Business', sortable: true },
              { key: 'deal', header: 'Deal' },
              { key: 'bill', header: 'Bill' },
              { key: 'discount', header: 'Discount', render: (r) => <span className="font-semibold text-success">−{r.discount}</span> },
              { key: 'saved', header: 'Saved', render: (r) => <strong>{r.saved}</strong> },
              { key: 'status', header: 'Status', render: (r) => <Badge tone={statusTone(r.status)}>{r.status === 'FLAGGED' ? '🚩 FLAGGED' : r.status}</Badge> },
              { key: 'at', header: 'Date/Time', sortable: true, render: (r) => formatDateTime(r.at) },
            ]} />
        )}
      </Card>

      <Drawer open={!!selected} onClose={() => setSelected(null)} title="Redemption receipt">
        {selected && (
          <div className="space-y-2 text-sm">
            <dl className="space-y-2">
              {([
                ['Receipt', selected.receipt],
                ['Status', selected.status],
                ['Customer', selected.customer],
                ['Business', selected.business],
                ['Branch', selected.branch],
                ['Deal', selected.deal],
                ['Date / time', formatDateTime(selected.at)],
                ['Bill amount', formatPaisa(selected.raw.bill)],
                ['Discount', '−' + formatPaisa(selected.raw.discount)],
                ['Customer paid', formatPaisa(selected.raw.paid)],
                ['Customer saved', formatPaisa(selected.raw.saving)],
                ['Cashback earned', formatPaisa(selected.raw.cashback ?? 0)],
                ['Points earned', `${selected.raw.points ?? 0} pts`],
              ] as Array<[string, string]>).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-slate-50 pb-2">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="text-right font-semibold text-ink">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="pt-1 text-xs text-slate-400">
              Server-computed snapshot stored at redemption time. Flagged redemptions are held for fraud review.
            </p>
            <Button variant="ghost" fullWidth onClick={() => setSelected(null)}>Close</Button>
          </div>
        )}
      </Drawer>
    </div>
  );
}
