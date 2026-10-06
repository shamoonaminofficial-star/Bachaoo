'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart, Badge, Card, Donut, EmptyState, ErrorState, Input, Skeleton, StatCard,
} from '@bachatly/ui';
import { ApiError } from '@/lib/api';
import { fetchAdminAnalytics, type AdminAnalytics } from '@/lib/finance';
import { paisaToPkr } from '@/lib/catalog';
import { formatPKR } from '@/lib/format';

const PRESETS = [
  { id: '7', label: '7d', days: 7 },
  { id: '30', label: '30d', days: 30 },
  { id: '90', label: '90d', days: 90 },
];

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dayLabel(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  return `${m[3]}/${m[2]}`;
}

const CATEGORY_COLORS = ['#0B6B4F', '#FFB020', '#2563EB', '#16A34A', '#7C3AED', '#E11D48', '#0D9488', '#B45309'];

const EmptyChart = () => (
  <p className="py-10 text-center text-sm text-slate-400">No data for this period.</p>
);

export default function AdminAnalyticsPage() {
  const [preset, setPreset] = useState('30');
  const [from, setFrom] = useState(() => iso(new Date(Date.now() - 29 * 86400000)));
  const [to, setTo] = useState(() => iso(new Date()));
  const [data, setData] = useState<AdminAnalytics | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState('');

  const applyPreset = (id: string, days: number) => {
    setPreset(id);
    setTo(iso(new Date()));
    setFrom(iso(new Date(Date.now() - (days - 1) * 86400000)));
  };

  const load = useCallback(async () => {
    setError('');
    try {
      const d = await fetchAdminAnalytics({ from, to });
      if (d === null) { setUnavailable(true); return; }
      setData(d);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load analytics.');
    }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    if (!data) return null;
    const sum = (pts: { value: number }[]) => pts.reduce((s, p) => s + p.value, 0);
    return {
      redemptions: sum(data.redemptionsByDay),
      savings: sum(data.savingsByDay),
      users: sum(data.usersByDay),
      revenue: sum(data.revenueByDay),
    };
  }, [data]);

  const donut = useMemo(() => data?.categoryBreakdown.map((c, i) => ({
    label: c.category, value: c.value, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
  })) ?? [], [data]);

  const pkr = (p: number) => paisaToPkr(p) ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-ink">Platform Analytics</h1>
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" onClick={() => applyPreset(p.id, p.days)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${preset === p.id ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
              {p.label}
            </button>
          ))}
          <Input type="date" aria-label="From" value={from} onChange={(e) => { setPreset('custom'); setFrom(e.target.value); }} className="!w-36" />
          <Input type="date" aria-label="To" value={to} onChange={(e) => { setPreset('custom'); setTo(e.target.value); }} className="!w-36" />
        </div>
      </div>

      {unavailable ? (
        <Card className="p-4">
          <EmptyState title="Platform analytics are not live yet" icon="📈"
            description="The GET /analytics/admin/overview endpoint is not deployed yet. Trend charts, top businesses and category breakdown will render here automatically once the backend lands." />
        </Card>
      ) : error ? (
        <ErrorState title="Couldn't load analytics" description={error} onRetry={load} />
      ) : !data || !totals ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 !rounded-2xl" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Redemptions" value={totals.redemptions.toLocaleString()} icon="🧾" sub={`${from} → ${to}`} />
            <StatCard label="Savings given" value={formatPKR(pkr(totals.savings))} icon="💰" />
            <StatCard label="New users" value={totals.users.toLocaleString()} icon="👥" />
            <StatCard label="Membership revenue" value={formatPKR(pkr(totals.revenue))} icon="💳" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <h2 className="mb-3 font-bold text-ink">Redemptions per day</h2>
              {data.redemptionsByDay.length
                ? <BarChart data={data.redemptionsByDay.map((d) => ({ label: dayLabel(d.day), value: d.value }))} />
                : <EmptyChart />}
            </Card>
            <Card className="p-5">
              <h2 className="mb-3 font-bold text-ink">Savings given per day (Rs.)</h2>
              {data.savingsByDay.length
                ? <BarChart data={data.savingsByDay.map((d) => ({ label: dayLabel(d.day), value: pkr(d.value) }))} />
                : <EmptyChart />}
            </Card>
            <Card className="p-5">
              <h2 className="mb-3 font-bold text-ink">New users per day</h2>
              {data.usersByDay.length
                ? <BarChart data={data.usersByDay.map((d) => ({ label: dayLabel(d.day), value: d.value }))} />
                : <EmptyChart />}
            </Card>
            <Card className="p-5">
              <h2 className="mb-3 font-bold text-ink">Membership revenue per day (Rs.)</h2>
              {data.revenueByDay.length
                ? <BarChart data={data.revenueByDay.map((d) => ({ label: dayLabel(d.day), value: pkr(d.value) }))} />
                : <EmptyChart />}
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <h2 className="mb-3 font-bold text-ink">Redemptions by category</h2>
              {donut.length ? (
                <div className="flex flex-wrap items-center gap-6">
                  <Donut segments={donut} />
                  <ul className="space-y-1 text-sm">
                    {donut.map((s) => (
                      <li key={s.label} className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full" style={{ background: s.color }} />
                        <span className="text-slate-600">{s.label}</span>
                        <span className="font-bold text-ink">{s.value.toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : <EmptyChart />}
            </Card>
            <Card className="p-5">
              <h2 className="mb-3 font-bold text-ink">Top businesses</h2>
              {data.topBusinesses.length ? (
                <ul className="divide-y divide-slate-100">
                  {data.topBusinesses.map((b, i) => (
                    <li key={b.id} className="flex items-center gap-3 py-2.5">
                      <span className="w-6 text-sm font-bold text-slate-400">{i + 1}</span>
                      <p className="flex-1 font-semibold text-ink">{b.name}</p>
                      <Badge tone="brand">{b.redemptions.toLocaleString()} redemptions</Badge>
                      <span className="text-sm font-bold text-success">{formatPKR(pkr(b.savingsGiven))}</span>
                    </li>
                  ))}
                </ul>
              ) : <EmptyChart />}
            </Card>
          </div>

          <Card className="p-5">
            <h2 className="mb-3 font-bold text-ink">Top deals</h2>
            {data.topDeals.length ? (
              <ul className="divide-y divide-slate-100">
                {data.topDeals.map((d, i) => (
                  <li key={d.id} className="flex items-center gap-3 py-2.5">
                    <span className="w-6 text-sm font-bold text-slate-400">{i + 1}</span>
                    <p className="flex-1 font-semibold text-ink">{d.title}</p>
                    <Badge tone="info">{d.redemptions.toLocaleString()} redemptions</Badge>
                    <span className="text-sm font-bold text-success">{formatPKR(pkr(d.savingsGiven))}</span>
                  </li>
                ))}
              </ul>
            ) : <EmptyChart />}
          </Card>
        </>
      )}
    </div>
  );
}
