'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, DigitalMembershipCard, Badge, Skeleton, EmptyState } from '@bachatly/ui';
import { withSeedFallback, ApiError } from '@/lib/api';
import { fetchMyMembership, type MyMembership } from '@/lib/memberships';
import { fetchRedemptionHistory } from '@/lib/catalog';
import { SEED_REDEMPTIONS } from '@/lib/seed';
import { formatPKR, formatDate } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import type { Redemption } from '@bachatly/ui';

export default function MyQrPage() {
  const { user } = useAuth();
  const [membership, setMembership] = useState<MyMembership | null | undefined>(undefined);
  const [recent, setRecent] = useState<Redemption[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchMyMembership().then(setMembership).catch((e) => {
      setError(e instanceof ApiError ? e.message : 'Could not load your membership.');
      setMembership(null);
    });
    withSeedFallback(
      () => fetchRedemptionHistory(1, 5).then((p) => p.items),
      SEED_REDEMPTIONS,
      'recent redemptions',
    ).then(setRecent).catch(() => setRecent([]));
  }, []);

  const holderName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Member';
  const statusMap: Record<string, 'active' | 'expired' | 'cancelled' | 'pending'> = {
    ACTIVE: 'active', EXPIRED: 'expired', CANCELLED: 'cancelled', PENDING: 'pending',
  };

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-extrabold text-ink">My QR</h1>

      {membership === undefined ? (
        <Skeleton className="h-64 w-full !rounded-3xl" />
      ) : membership ? (
        <DigitalMembershipCard
          membership={{
            id: membership.id,
            number: membership.number || '—',
            planName: membership.plan?.name ?? 'Membership',
            status: statusMap[membership.status?.toUpperCase()] ?? 'pending',
            joinedAt: membership.startDate,
            expiresAt: membership.endDate,
            holderName: membership.holderName || holderName,
          }}
        />
      ) : (
        <Card className="p-5 text-center">
          <p className="font-bold text-ink">No active membership</p>
          <p className="mt-1 text-sm text-slate-500">{error || 'Get a membership to unlock member-only deals.'}</p>
          <Link href="/membership" className="mt-3 inline-block rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white">
            View membership plans
          </Link>
        </Card>
      )}

      <Card className="space-y-2 p-5 text-sm text-slate-600">
        <p className="font-bold text-ink">How it works</p>
        <p>1. Tap <strong>Redeem Offer</strong> on any deal page — a fresh signed QR is generated just for that deal.</p>
        <p>2. Show it to the cashier — they scan it with the partner app and enter your bill.</p>
        <p>3. Your discount is applied and the saving is recorded automatically.</p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Badge tone="success">🔒 Signed token</Badge>
          <Badge tone="warning">⏱️ Expires in ~90s</Badge>
          <Badge tone="info">🚫 Screenshots won't work</Badge>
        </div>
      </Card>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-bold text-ink">Recent redemptions</h2>
          <Link href="/account/history" className="text-sm font-semibold text-brand-700 hover:underline">View all →</Link>
        </div>
        {!recent ? (
          <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-16 w-full !rounded-2xl" />)}</div>
        ) : recent.length === 0 ? (
          <EmptyState icon="🧾" title="No redemptions yet" description="Redeem your first deal to see it here."
            actionLabel="Explore Deals" onAction={() => (window.location.href = '/deals')} />
        ) : (
          <Card className="divide-y divide-slate-100">
            {recent.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-medium text-ink">{r.dealTitle}</p>
                  <p className="text-xs text-slate-500">{r.businessName} · {formatDate(r.createdAt)}</p>
                </div>
                <p className="text-sm font-bold text-success">−{formatPKR(r.savedAmount)}</p>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
