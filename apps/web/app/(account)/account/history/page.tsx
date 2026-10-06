'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { Card, TableSkeleton, EmptyState, Modal, Button, ErrorState } from '@bachatly/ui';
import { withSeedFallback, ApiError } from '@/lib/api';
import { fetchRedemptionHistory, type Page } from '@/lib/catalog';
import { SEED_REDEMPTIONS } from '@/lib/seed';
import { formatPKR, formatDateTime } from '@/lib/format';
import type { Redemption } from '@bachatly/ui';

const PAGE_SIZE = 20;

export default function HistoryPage() {
  const [page, setPage] = useState<Page<Redemption> | null>(null);
  const [items, setItems] = useState<Redemption[]>([]);
  const [receipt, setReceipt] = useState<Redemption | null>(null);
  const [error, setError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (p: number) => {
    if (p > 1) setLoadingMore(true);
    try {
      const pg = await withSeedFallback(
        () => fetchRedemptionHistory(p, PAGE_SIZE),
        {
          items: p === 1 ? SEED_REDEMPTIONS : [],
          page: p, pageSize: PAGE_SIZE,
          total: SEED_REDEMPTIONS.length, totalPages: 1,
        } as Page<Redemption>,
        'redemptions',
      );
      setPage(pg);
      setItems((prev) => (p === 1 ? pg.items : [...prev, ...pg.items]));
      setError('');
    } catch (e) {
      if (p === 1) setError(e instanceof ApiError ? e.message : 'Could not load your redemptions.');
    } finally {
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => { load(1); }, [load]);

  const hasMore = page ? page.page < page.totalPages : false;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-ink">Redemption History</h1>
        {page && page.total > 0 && (
          <p className="text-sm text-slate-500">{page.total} redemption{page.total === 1 ? '' : 's'}</p>
        )}
      </div>

      {error && !page ? (
        <ErrorState title="Couldn't load history" description={error} onRetry={() => load(1)} />
      ) : !page ? (
        <TableSkeleton rows={5} cols={4} />
      ) : items.length === 0 ? (
        <EmptyState icon="🧾" title="No redemptions yet" description="Redeem your first deal to see it here."
          actionLabel="Explore Deals" onAction={() => (window.location.href = '/deals')} />
      ) : (
        <>
          <Card className="divide-y divide-slate-100">
            {items.map((r) => (
              <button key={r.id} onClick={() => setReceipt(r)}
                className="flex w-full items-center justify-between gap-3 p-4 text-left transition hover:bg-slate-50">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{r.dealTitle}</p>
                  <p className="text-xs text-slate-500">{r.businessName} · {formatDateTime(r.createdAt)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-bold text-success">−{formatPKR(r.savedAmount)}</p>
                  <p className="font-mono text-[10px] text-slate-400">{r.receiptNo}</p>
                </div>
              </button>
            ))}
          </Card>
          {hasMore && (
            <div className="text-center">
              <Button variant="outline" loading={loadingMore} onClick={() => load(page!.page + 1)}>
                Load more
              </Button>
            </div>
          )}
        </>
      )}

      <Modal open={!!receipt} onClose={() => setReceipt(null)} title="Redemption receipt"
        footer={<Button variant="ghost" onClick={() => setReceipt(null)}>Close</Button>}>
        {receipt && (
          <dl className="space-y-2 text-sm">
            {([
              ['Receipt', receipt.receiptNo],
              ['Deal', receipt.dealTitle],
              ['Business', receipt.businessName],
              ['Date', formatDateTime(receipt.createdAt)],
              ['Bill amount', formatPKR(receipt.billAmount)],
              [`Discount (${receipt.discountPercent}%)`, '−' + formatPKR(receipt.discountAmount)],
              ['You paid', formatPKR(receipt.paidAmount)],
              ['You saved', formatPKR(receipt.savedAmount)],
              ['Cashback earned', formatPKR(receipt.cashbackEarned)],
              ['Points earned', `${receipt.pointsEarned} pts`],
            ] as Array<[string, string]>).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-slate-50 pb-2">
                <dt className="text-slate-500">{k}</dt>
                <dd className="text-right font-semibold text-ink">{v}</dd>
              </div>
            ))}
            <p className="pt-1 text-xs text-slate-400">Amounts are the server-computed snapshot stored at redemption time.</p>
          </dl>
        )}
      </Modal>
    </div>
  );
}
