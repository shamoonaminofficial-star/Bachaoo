'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge, BarChart, Button, Card, EmptyState, ErrorState, Skeleton, StatCard } from '@bachatly/ui';
import { formatPKR, timeAgo } from '@/lib/format';
import {
  fetchPartnerDashboard, fetchPartnerAnalytics, pkr, verifiedLabel,
  type PartnerDashboard, type PartnerAnalytics,
} from '@/lib/partner';
import { usePartnerBusiness } from './layout';

const QUICK_ACTIONS = [
  { href: '/partner/dashboard/deals', icon: '🎟️', label: 'New deal', desc: 'Create & submit for approval' },
  { href: '/partner/dashboard/scanner', icon: '📷', label: 'Open scanner', desc: 'Redeem a customer QR' },
  { href: '/partner/dashboard/branches', icon: '🏪', label: 'Add branch', desc: 'Manage locations' },
  { href: '/partner/dashboard/staff', icon: '🧑‍💼', label: 'Invite staff', desc: 'Add team members' },
];

export default function PartnerOverviewPage() {
  const { business, loading: bizLoading } = usePartnerBusiness();
  const [dash, setDash] = useState<PartnerDashboard | null>(null);
  const [analytics, setAnalytics] = useState<PartnerAnalytics | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const d = await fetchPartnerDashboard(business?.id);
      setDash(d);
      const b = business ?? d.business;
      if (b?.id) {
        const to = new Date(); const from = new Date(Date.now() - 6 * 86400000);
        fetchPartnerAnalytics(b.id, from.toISOString().slice(0, 10), to.toISOString().slice(0, 10))
          .then(setAnalytics)
          .catch(() => setAnalytics(null));
      }
    } catch (e) {
      console.warn('[partner overview]', e);
      setError('Dashboard data is unavailable right now. The backend endpoint may not be deployed yet.');
    }
  }, [business]);

  useEffect(() => { load(); }, [load]);

  const weekChart = useMemo(() => {
    if (analytics?.redemptionsByDay?.length) {
      return analytics.redemptionsByDay.map((d) => ({
        label: new Date(d.day).toLocaleDateString('en-PK', { weekday: 'short' }),
        value: d.value,
      }));
    }
    // Fallback: aggregate recent redemptions by day (last 7 days)
    const counts = new Map<string, number>();
    (dash?.recentRedemptions ?? []).forEach((r) => {
      const day = new Date(r.createdAt).toISOString().slice(0, 10);
      counts.set(day, (counts.get(day) ?? 0) + 1);
    });
    const out: Array<{ label: string; value: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      out.push({ label: d.toLocaleDateString('en-PK', { weekday: 'short' }), value: counts.get(key) ?? 0 });
    }
    return out;
  }, [analytics, dash]);

  if (!bizLoading && !business && !dash?.business) {
    return <EmptyState icon="🏢" title="No business linked" description="Link a business to see your partner dashboard." />;
  }
  if (error && !dash) {
    return <ErrorState title="Couldn't load the dashboard" description={error} onRetry={load} />;
  }

  const b = business ?? dash?.business;
  const s = dash?.stats;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">
            {b?.name ? `Welcome back, ${b.name}` : 'Business Overview'}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {b?.verified && <Badge tone="success">✓ Verified</Badge>}
            {b?.status && <Badge tone={b.verified ? 'success' : 'warning'}>{verifiedLabel(b)}</Badge>}
            {s && s.pendingApproval > 0 && <Badge tone="warning">{s.pendingApproval} deal{s.pendingApproval > 1 ? 's' : ''} pending approval</Badge>}
          </div>
        </div>
        <Link href="/partner/dashboard/scanner"><Button variant="accent" size="lg">📷 Scan QR</Button></Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {!s ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 !rounded-2xl" />) : (
          <>
            <StatCard label="Active deals" value={String(s.activeDeals)} icon="🎟️" />
            <StatCard label="Redemptions today" value={String(s.redemptionsToday)} icon="⚡" />
            <StatCard label="Redemptions this month" value={s.redemptionsThisMonth.toLocaleString()} icon="🧾" />
            <StatCard label="Total savings given" value={formatPKR(pkr(s.totalSavingsGiven))} icon="🏷️" />
            <StatCard label="Views this month" value={s.viewsThisMonth.toLocaleString()} icon="👁️" />
            <StatCard label="Branches" value={String(s.totalBranches)} icon="🏪" />
            <StatCard label="Rating" value={s.ratingAverage != null ? s.ratingAverage.toFixed(1) : '—'} icon="⭐" />
            <StatCard label="Staff" value={String(s.staffCount)} icon="🧑‍💼" />
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-bold text-ink">Redemptions — last 7 days</h2>
          <div className="mt-3">
            {weekChart.some((c) => c.value > 0) ? (
              <BarChart data={weekChart} />
            ) : (
              <p className="py-8 text-center text-sm text-slate-400">No redemptions in the last 7 days.</p>
            )}
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="font-bold text-ink">Top deals</h2>
          <div className="mt-3 space-y-2.5">
            {(dash?.topDeals ?? []).length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No redemption data yet — deals will rank here once customers redeem them.</p>
            ) : (
              dash!.topDeals.map((d, i) => (
                <Link key={d.id} href={`/partner/dashboard/deals`}
                  className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 transition hover:bg-slate-100">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 font-bold text-brand-700">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{d.title}</p>
                    <p className="text-xs text-slate-500">{d.redemptions} redemptions · {formatPKR(pkr(d.savingsGiven))} savings given</p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-ink">Recent redemptions</h2>
            <Link href="/partner/dashboard/redemptions" className="text-sm font-semibold text-brand-700 hover:underline">View all →</Link>
          </div>
          <div className="mt-3 space-y-2.5">
            {(dash?.recentRedemptions ?? []).length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No redemptions yet.</p>
            ) : (
              dash!.recentRedemptions.slice(0, 5).map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">{r.dealTitle ?? 'Redemption'}</p>
                    <p className="text-xs text-slate-500">{r.branchName ?? ''} · {timeAgo(r.createdAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-ink">{formatPKR(pkr(r.paid))}</p>
                    <p className="text-xs text-success">−{formatPKR(pkr(r.discount))} saved</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="font-bold text-ink">Quick actions</h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {QUICK_ACTIONS.map((a) => (
              <Link key={a.href} href={a.href}
                className="rounded-2xl border border-slate-100 p-4 transition hover:border-brand-200 hover:bg-brand-50/50">
                <span className="text-2xl" aria-hidden>{a.icon}</span>
                <p className="mt-2 text-sm font-bold text-ink">{a.label}</p>
                <p className="text-xs text-slate-500">{a.desc}</p>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
