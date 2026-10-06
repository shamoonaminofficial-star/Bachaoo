'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { Card, StatCard, BarChart, Donut, Skeleton, EmptyState, ErrorState } from '@bachatly/ui';
import { withSeedFallback, ApiError } from '@/lib/api';
import {
  fetchSavingsSummary, paisaToPkr, formatMonthLabel, type ApiSavingsSummary,
} from '@/lib/catalog';
import { SEED_REDEMPTIONS } from '@/lib/seed';
import { formatPKR } from '@/lib/format';

const CATEGORY_COLORS = ['#0B6B4F', '#FFB020', '#2563EB', '#16A34A', '#7C3AED', '#E11D48', '#0D9488', '#B45309'];

/** DEV-ONLY seed summary (paisa) used only when the API is unreachable. */
function seedSummary(): ApiSavingsSummary {
  const total = SEED_REDEMPTIONS.reduce((s, r) => s + r.savedAmount, 0) * 100;
  const byCat = new Map<string, number>();
  SEED_REDEMPTIONS.forEach((r) => {
    const cat = r.businessName === 'Urban Slice' ? 'Food' : r.businessName === 'FreshMart Daily' ? 'Grocery' : 'Beauty';
    byCat.set(cat, (byCat.get(cat) ?? 0) + r.savedAmount * 100);
  });
  return {
    total,
    thisMonth: total,
    thisYear: total,
    byCategory: [...byCat.entries()].map(([category, t]) => ({ category, total: t })),
    byMonth: [
      { month: 'May', total: 124000 }, { month: 'Jun', total: 189000 },
      { month: 'Jul', total: 142000 }, { month: 'Aug', total: 231000 },
      { month: 'Sep', total: 198000 }, { month: 'Oct', total },
    ],
  };
}

export default function SavingsPage() {
  const [summary, setSummary] = useState<ApiSavingsSummary | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setSummary(await withSeedFallback(() => fetchSavingsSummary(), seedSummary(), 'savings summary'));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load your savings.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error && !summary) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-extrabold text-ink">Savings History</h1>
        <ErrorState title="Couldn't load savings" description={error} onRetry={load} />
      </div>
    );
  }

  const pkr = (paisa: number) => paisaToPkr(paisa) ?? 0;
  const monthly = (summary?.byMonth ?? []).map((m) => ({ label: formatMonthLabel(m.month), value: pkr(m.total) }));
  const byCategory = (summary?.byCategory ?? []).map((c, i) => ({
    label: c.category, value: pkr(c.total), color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
  }));
  const empty = summary && summary.total === 0;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-ink">Savings History</h1>

      {!summary ? (
        <div className="grid grid-cols-3 gap-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 !rounded-2xl" />)}</div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Total Savings" value={formatPKR(pkr(summary.total))} icon="💰" />
          <StatCard label="This Month" value={formatPKR(pkr(summary.thisMonth))} icon="📅" />
          <StatCard label="This Year" value={formatPKR(pkr(summary.thisYear))} icon="📊" />
        </div>
      )}

      {empty ? (
        <EmptyState icon="💰" title="No savings yet" description="Redeem a deal and every rupee you save will show up here."
          actionLabel="Explore Deals" onAction={() => (window.location.href = '/deals')} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <h2 className="font-bold text-ink">Monthly savings</h2>
            <div className="mt-4">
              {!summary ? <Skeleton className="h-40 w-full" /> : monthly.length === 0
                ? <p className="text-sm text-slate-400">No monthly data yet.</p>
                : <BarChart data={monthly} />}
            </div>
          </Card>
          <Card className="p-5">
            <h2 className="font-bold text-ink">Savings by category</h2>
            <div className="mt-4">
              {!summary ? <Skeleton className="h-40 w-full" /> : byCategory.length === 0
                ? <p className="text-sm text-slate-400">No category data yet.</p>
                : (
                  <>
                    <Donut segments={byCategory} />
                    <ul className="mt-4 grid grid-cols-2 gap-2 text-sm">
                      {byCategory.map((s) => (
                        <li key={s.label} className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-sm" style={{ background: s.color }} aria-hidden />
                          <span className="text-slate-600">{s.label}</span>
                          <strong className="ml-auto text-ink">{formatPKR(s.value)}</strong>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
            </div>
          </Card>
        </div>
      )}
      <p className="text-xs text-slate-400">
        Every redemption records the bill, discount %, discount amount, amount paid and saving —
        the authoritative figures are computed server-side at redemption time.
      </p>
    </div>
  );
}
