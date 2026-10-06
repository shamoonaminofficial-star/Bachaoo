'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, StatCard, Skeleton, Badge, EmptyState, ErrorState } from '@bachatly/ui';
import { formatPKR, timeAgo } from '@/lib/format';
import { fetchAdminOverview, fetchAdminActivity, fetchHealth, type AdminOverview, type ActivityItem, type HealthStatus } from '@/lib/admin';

const QUEUES: { label: string; href: string; icon: string; get: (o: AdminOverview) => number }[] = [
  { label: 'Business applications', href: '/admin/applications', icon: '📝', get: (o) => o.queues.pendingBusinesses },
  { label: 'Deal approvals', href: '/admin/deals', icon: '✅', get: (o) => o.queues.pendingDeals },
  { label: 'Payment verifications', href: '/admin/payments', icon: '💳', get: (o) => o.queues.pendingPayments },
  { label: 'Review moderation', href: '/admin/reviews', icon: '⭐', get: (o) => o.queues.pendingReviews },
  { label: 'Support tickets', href: '/admin/support', icon: '💬', get: (o) => o.queues.openSupportTickets },
];

export default function AdminDashboardPage() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [activity, setActivity] = useState<ActivityItem[] | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    Promise.all([fetchAdminOverview(), fetchAdminActivity(), fetchHealth()])
      .then(([o, a, h]) => {
        setOverview(o); setActivity(a); setHealth(h);
        if (o === null) setFailed(true);
      })
      .catch(() => setFailed(true));
  }, []);

  if (failed && !overview) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-extrabold text-ink">Dashboard</h1>
        <ErrorState title="Overview is not live yet" description="The GET /admin/overview endpoint is not deployed yet. This dashboard will populate automatically once the backend Phase 9 overview API lands." onRetry={() => window.location.reload()} />
      </div>
    );
  }

  const o = overview;
  const cards: [string, string, string][] = o ? [
    ['Total Users', o.users.total.toLocaleString(), '👥'],
    ['New Users (30d)', o.users.newThisMonth.toLocaleString(), '🆕'],
    ['Active Memberships', o.memberships.active.toLocaleString(), '👑'],
    ['Expiring This Week', String(o.memberships.expiringThisWeek), '⏳'],
    ['Total Businesses', o.businesses.total.toLocaleString(), '🏪'],
    ['Pending Businesses', String(o.businesses.pending), '📝'],
    ['Live Deals', o.deals.live.toLocaleString(), '🎟️'],
    ['Pending Deals', String(o.deals.pendingApproval), '✅'],
    ['Redemptions Today', o.activity.redemptionsToday.toLocaleString(), '🧾'],
    ['Redemptions (30d)', o.activity.redemptionsThisMonth.toLocaleString(), '📈'],
    ['Savings Given (total)', formatPKR(o.activity.savingsGivenTotal), '💰'],
    ['Membership Revenue (30d)', formatPKR(o.revenue.membershipRevenueThisMonth), '💳'],
    ['Pending Commissions', formatPKR(o.revenue.pendingCommissions), '📉'],
    ['Settled (30d)', formatPKR(o.revenue.settledThisMonth), '💰'],
  ] : [];

  const allOk = health ? health.db.ok && health.redis.ok : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-ink">Dashboard</h1>
        {health && (
          <Badge tone={allOk ? 'success' : 'error'}>{allOk ? '● All systems operational' : '● System issue — see Health'}</Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {!o ? Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-24 !rounded-2xl" />)
          : cards.map(([l, v, icon]) => <StatCard key={l} label={l} value={v} icon={icon} />)}
      </div>

      {o && (
        <Card className="p-5">
          <h2 className="font-bold text-ink">Moderation queues</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {QUEUES.map((q) => {
              const n = q.get(o);
              return (
                <Link key={q.href} href={q.href} className="rounded-2xl border border-slate-200 p-4 transition hover:border-brand-600 hover:bg-brand-50/40">
                  <div className="flex items-center justify-between">
                    <span className="text-2xl" aria-hidden>{q.icon}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-sm font-extrabold ${n > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'}`}>{n}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-ink">{q.label}</p>
                </Link>
              );
            })}
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-bold text-ink">Recent activity</h2>
          <div className="mt-4">
            {!activity ? <Skeleton className="h-40" /> : activity.length === 0 ? (
              <EmptyState title="No activity yet" description="Platform activity will appear here." />
            ) : (
              <ul className="space-y-2.5">
                {activity.slice(0, 12).map((a, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm">
                    <span className="min-w-0"><span className="font-semibold text-ink">{a.label}</span>{a.actor && <span className="text-slate-500"> — {a.actor}</span>}</span>
                    <span className="shrink-0 text-xs text-slate-400">{timeAgo(a.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-ink">System health</h2>
            <Link href="/admin/health" className="text-sm font-semibold text-brand-700 hover:underline">Details →</Link>
          </div>
          <div className="mt-4">
            {!health ? <Skeleton className="h-24" /> : (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Database</p><p className="font-bold text-ink">{health.db.ok ? `OK (${health.db.latencyMs}ms)` : 'DOWN'}</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Redis</p><p className="font-bold text-ink">{health.redis.ok ? 'OK' : 'DOWN'}</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Storage</p><p className="font-bold text-ink">{health.storage.backend}</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Environment</p><p className="font-bold text-ink">{health.env}</p></div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
