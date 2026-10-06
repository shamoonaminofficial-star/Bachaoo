'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart, Card, EmptyState, ErrorState, Input, Skeleton } from '@bachatly/ui';
import { formatPKR } from '@/lib/format';
import {
  fetchPartnerAnalytics, pkr, type PartnerAnalytics,
} from '@/lib/partner';
import { usePartnerBusiness } from '../layout';

const RANGES = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

function dayLabel(day: string): string {
  const d = new Date(day);
  return d.toLocaleDateString('en-PK', { day: 'numeric', month: 'short' });
}

function HourlyHeat({ data }: { data: Array<{ hour: number; value: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const cells = Array.from({ length: 24 }, (_, h) => data.find((d) => d.hour === h)?.value ?? 0);
  return (
    <div className="grid grid-cols-12 gap-1">
      {cells.map((v, h) => (
        <div key={h} title={`${h}:00 — ${v} redemptions`}
          className="flex h-9 items-center justify-center rounded-lg text-[10px] font-semibold"
          style={{ backgroundColor: `rgba(11,107,79,${0.08 + (0.85 * v) / max})`, color: v / max > 0.5 ? '#fff' : '#0B6B4F' }}>
          {h}
        </div>
      ))}
    </div>
  );
}

export default function PartnerAnalyticsPage() {
  const { business, loading: bizLoading } = usePartnerBusiness();
  const [data, setData] = useState<PartnerAnalytics | null>(null);
  const [error, setError] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [range, setRange] = useState('7');
  const [custom, setCustom] = useState({ from: '', to: '' });

  const load = useCallback(async () => {
    if (!business?.id) return;
    setError(false); setUnavailable(false);
    try {
      const to = new Date();
      const days = custom.from && custom.to ? null : Number(range);
      const from = days ? new Date(Date.now() - (days - 1) * 86400000) : new Date(custom.from);
      const toIso = days ? to.toISOString().slice(0, 10) : custom.to;
      const res = await fetchPartnerAnalytics(business.id, from.toISOString().slice(0, 10), toIso);
      if (!res) { setUnavailable(true); return; }
      setData(res);
    } catch {
      setError(true);
    }
  }, [business, range, custom]);

  useEffect(() => { if (!bizLoading) load(); }, [bizLoading, load]);

  const totals = useMemo(() => ({
    redemptions: (data?.redemptionsByDay ?? []).reduce((s, d) => s + d.value, 0),
    savings: (data?.savingsByDay ?? []).reduce((s, d) => s + d.value, 0),
    views: (data?.viewsByDay ?? []).reduce((s, d) => s + d.value, 0),
  }), [data]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-ink">Analytics</h1>
        <div className="flex flex-wrap items-center gap-2">
          {RANGES.map((r) => (
            <button key={r.value} onClick={() => { setRange(r.value); setCustom({ from: '', to: '' }); }}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${range === r.value && !custom.from ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
              {r.label}
            </button>
          ))}
          <Input type="date" aria-label="From date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="!w-auto" />
          <Input type="date" aria-label="To date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="!w-auto" />
        </div>
      </div>

      {unavailable ? (
        <EmptyState icon="📈" title="Analytics not live yet"
          description="The partner analytics API isn't deployed yet — charts will appear here once it is." />
      ) : error && !data ? (
        <ErrorState title="Couldn't load analytics" message="Something went wrong." onRetry={load} />
      ) : !data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-56 !rounded-2xl" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-4"><p className="text-xs text-slate-500">Redemptions</p><p className="text-2xl font-extrabold text-ink">{totals.redemptions.toLocaleString()}</p></Card>
            <Card className="p-4"><p className="text-xs text-slate-500">Savings given</p><p className="text-2xl font-extrabold text-ink">{formatPKR(pkr(totals.savings))}</p></Card>
            <Card className="p-4"><p className="text-xs text-slate-500">Views</p><p className="text-2xl font-extrabold text-ink">{totals.views.toLocaleString()}</p></Card>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <h2 className="font-bold text-ink">Redemptions by day</h2>
              <div className="mt-3">
                {data.redemptionsByDay.length ? <BarChart data={data.redemptionsByDay.map((d) => ({ label: dayLabel(d.day), value: d.value }))} /> : <EmptyDayState />}
              </div>
            </Card>
            <Card className="p-5">
              <h2 className="font-bold text-ink">Savings given by day</h2>
              <div className="mt-3">
                {data.savingsByDay.length ? <BarChart data={data.savingsByDay.map((d) => ({ label: dayLabel(d.day), value: pkr(d.value) }))} /> : <EmptyDayState />}
              </div>
            </Card>
            <Card className="p-5">
              <h2 className="font-bold text-ink">Views by day</h2>
              <div className="mt-3">
                {data.viewsByDay.length ? <BarChart data={data.viewsByDay.map((d) => ({ label: dayLabel(d.day), value: d.value }))} /> : <EmptyDayState />}
              </div>
            </Card>
            <Card className="p-5">
              <h2 className="font-bold text-ink">Top branches</h2>
              <div className="mt-3 space-y-2.5">
                {data.topBranches.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">No branch data in this range.</p> : (
                  data.topBranches.map((t, i) => (
                    <div key={t.id} className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 font-bold text-brand-700">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">{t.name}</p>
                        <p className="text-xs text-slate-500">{t.redemptions} redemptions · {formatPKR(pkr(t.savingsGiven))} savings</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
          <Card className="p-5">
            <h2 className="font-bold text-ink">Busiest hours</h2>
            <p className="mb-3 text-xs text-slate-500">Redemptions by hour of day — darker means busier.</p>
            {data.hourlyHeat.length ? <HourlyHeat data={data.hourlyHeat} /> : <p className="py-8 text-center text-sm text-slate-400">No hourly data in this range.</p>}
          </Card>
        </>
      )}
    </div>
  );
}

function EmptyDayState() {
  return <p className="py-10 text-center text-sm text-slate-400">No data in this range.</p>;
}
