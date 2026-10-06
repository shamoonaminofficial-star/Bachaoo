'use client';
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, StatCard, DealCard, Badge, Skeleton, SkeletonCard, BarChart, Button, ErrorState } from '@bachatly/ui';
import { api, withSeedFallback, ApiError } from '@/lib/api';
import { fetchMyMembership, type MyMembership } from '@/lib/memberships';
import {
  fetchSavingsSummary, fetchRedemptionHistory, paisaToPkr, formatMonthLabel,
  type ApiSavingsSummary, type Page,
} from '@/lib/catalog';
import { fetchDashboard, type DashboardData } from '@/lib/dashboard';
import { SEED_DEALS, SEED_REDEMPTIONS } from '@/lib/seed';
import { formatPKR, formatDate, timeAgo } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import type { Deal, Redemption } from '@bachatly/ui';

const ACTIVITY_ICON: Record<string, string> = {
  redemption: '🧾', membership: '👑', cashback: '💸', reward: '⭐', wallet: '👛', voucher: '🎫',
};

export default function AccountOverviewPage() {
  const { user } = useAuth();
  const [dash, setDash] = useState<DashboardData | null>(null);
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [summary, setSummary] = useState<ApiSavingsSummary | null>(null);
  const [history, setHistory] = useState<Page<Redemption> | null>(null);
  const [membership, setMembership] = useState<MyMembership | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      // Prefer the consolidated dashboard endpoint; fall back to the
      // individual Phase 4/5/6 endpoints if it isn't deployed yet.
      const d = await fetchDashboard().catch(() => null);
      setDash(d);
      const [dealsRes, s, h, m] = await Promise.all([
        withSeedFallback(() => api<Deal[]>('/deals/recommended'), SEED_DEALS.slice(0, 4), 'recommended'),
        withSeedFallback(() => fetchSavingsSummary(), {
          total: SEED_REDEMPTIONS.reduce((x, r) => x + r.savedAmount, 0) * 100,
          thisMonth: 0, thisYear: SEED_REDEMPTIONS.reduce((x, r) => x + r.savedAmount, 0) * 100,
          byCategory: [], byMonth: [],
        }, 'savings summary'),
        withSeedFallback(() => fetchRedemptionHistory(1, 5), {
          items: SEED_REDEMPTIONS.slice(0, 5), page: 1, pageSize: 5,
          total: SEED_REDEMPTIONS.length, totalPages: 1,
        } as Page<Redemption>, 'recent redemptions'),
        fetchMyMembership().catch(() => null),
      ]);
      setDeals(d?.recommendedDeals?.length ? (d.recommendedDeals as unknown as Deal[]) : dealsRes);
      setSummary(s); setHistory(h); setMembership(m);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load your dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const firstName = user?.firstName || 'there';
  const stats = dash?.stats;
  const totalSavings = stats ? stats.totalSavings : (summary?.total ?? 0);
  const thisMonth = summary?.thisMonth ?? 0;
  const totalSavingsPkr = (paisaToPkr(totalSavings) ?? 0);
  const thisMonthPkr = (paisaToPkr(thisMonth) ?? 0);
  const monthly = (summary?.byMonth ?? []).map((mm) => ({ label: formatMonthLabel(mm.month), value: paisaToPkr(mm.total) ?? 0 }));
  const memberSince = membership?.startDate ? formatDate(membership.startDate) : null;
  const membershipActive = membership?.status?.toUpperCase() === 'ACTIVE';
  const expiring = membershipActive && membership ? membership.daysRemaining <= 14 : false;
  const redeemCount = stats ? stats.redemptionsCount : (history?.total ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink md:text-3xl">Welcome back, {firstName}! 👋</h1>
          <p className="text-sm text-slate-500">Here's your savings snapshot.</p>
        </div>
        {membership && (
          <Badge tone={membershipActive ? 'brand' : 'neutral'}>
            👑 {membership.plan?.name ?? 'Membership'} · {membershipActive ? `expires ${formatDate(membership.endDate)}` : membership.status.toLowerCase()}
          </Badge>
        )}
      </div>

      {expiring && membership && (
        <Card className="flex flex-wrap items-center gap-3 border-amber-200 bg-amber-50 p-4">
          <span className="text-2xl" aria-hidden>⏰</span>
          <div className="flex-1">
            <p className="font-bold text-ink">Your membership expires in {membership.daysRemaining} days</p>
            <p className="text-sm text-slate-600">Renew now so your QR keeps working without interruption.</p>
          </div>
          <Link href="/account/membership"><Button variant="accent">Renew membership</Button></Link>
        </Card>
      )}

      {error && !loading ? (
        <ErrorState title="Couldn't load your dashboard" description={error} onRetry={load} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {loading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 !rounded-2xl" />) : (
              <>
                <StatCard label="Total Savings" value={formatPKR(totalSavingsPkr)} icon="💰" />
                <StatCard label="Deals Redeemed" value={String(redeemCount)} icon="🎟️" />
                <StatCard label="Saved This Month" value={formatPKR(thisMonthPkr)} icon="📅" />
                <StatCard
                  label="Membership"
                  value={membership?.plan?.name ?? dash?.membership?.planName ?? '—'}
                  icon="👑"
                  sub={memberSince ? `Member since ${memberSince}` : membership === null ? 'No active plan' : ''}
                />
              </>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="p-5 lg:col-span-2">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-ink">Savings this year</h2>
                <Link href="/account/savings" className="text-sm font-semibold text-brand-700 hover:underline">Details →</Link>
              </div>
              <div className="mt-4">
                {loading ? <Skeleton className="h-40 w-full" /> : monthly.length > 0
                  ? <BarChart data={monthly} />
                  : <p className="text-sm text-slate-400">Redeem a deal and your monthly savings will appear here.</p>}
              </div>
            </Card>
            <Card className="p-5">
              <h2 className="font-bold text-ink">Recent activity</h2>
              {loading ? (
                <div className="mt-3 space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : (dash?.recentActivity?.length ?? 0) > 0 ? (
                <ul className="mt-3 space-y-3">
                  {dash!.recentActivity.slice(0, 5).map((a, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span aria-hidden>{ACTIVITY_ICON[a.type] ?? '•'}</span>
                      <div>
                        <p className="font-medium text-ink">{a.label}</p>
                        <p className="text-xs text-slate-500">
                          {a.amount ? `${formatPKR(paisaToPkr(a.amount) ?? 0)} · ` : ''}{timeAgo(a.at)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (history?.items?.length ?? 0) > 0 ? (
                <ul className="mt-3 space-y-3">
                  {history!.items.slice(0, 3).map((r) => (
                    <li key={r.id} className="flex items-start gap-2 text-sm">
                      <span className="text-success" aria-hidden>✓</span>
                      <div><p className="font-medium text-ink">{r.dealTitle}</p>
                      <p className="text-xs text-slate-500">Saved {formatPKR(r.savedAmount)} · {timeAgo(r.createdAt)}</p></div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-slate-400">No activity yet. Your redemptions and rewards will show up here.</p>
              )}
            </Card>
          </div>
        </>
      )}

      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-extrabold text-ink">Recommended for you</h2>
          <Link href="/deals" className="text-sm font-semibold text-brand-700 hover:underline">View all →</Link>
        </div>
        {!deals ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{deals.map((d) => <DealCard key={d.id} deal={d} />)}</div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/account/saved" className="block">
          <Card className="flex items-center gap-3 p-4 transition hover:shadow-card">
            <span className="text-3xl" aria-hidden>♡</span>
            <div><p className="font-bold text-ink">Saved deals</p><p className="text-sm text-slate-500">Your shortlist, ready to redeem.</p></div>
          </Card>
        </Link>
        <Link href="/account/referrals" className="block">
          <Card className="flex items-center gap-3 p-4 transition hover:shadow-card">
            <span className="text-3xl" aria-hidden>🤝</span>
            <div><p className="font-bold text-ink">Invite friends</p><p className="text-sm text-slate-500">Share your code and earn referral rewards.</p></div>
          </Card>
        </Link>
      </div>
    </div>
  );
}
