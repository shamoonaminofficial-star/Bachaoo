'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, EmptyState, ErrorState, Skeleton, StatCard } from '@bachatly/ui';
import { formatPKR } from '@/lib/format';
import {
  fetchPartnerRedemptions, pkr, type PartnerRedemption,
} from '@/lib/partner';
import { usePartnerBusiness } from '../layout';

/**
 * Customer insights are derived from the partner's own redemption ledger.
 * Only first names reach the partner API — no PII — so "repeat customers"
 * counts distinct first names with 2+ visits, and we say so plainly.
 */
export default function PartnerCustomersPage() {
  const { business, loading: bizLoading } = usePartnerBusiness();
  const [items, setItems] = useState<PartnerRedemption[] | null>(null);
  const [error, setError] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(async () => {
    if (!business?.id) return;
    setError(false);
    try {
      const res = await fetchPartnerRedemptions(business.id, { pageSize: 100 });
      if (!res) { setUnavailable(true); return; }
      setItems(res.items);
    } catch {
      setError(true);
    }
  }, [business]);
  useEffect(() => { if (!bizLoading) load(); }, [bizLoading, load]);

  const insights = useMemo(() => {
    if (!items) return null;
    const visits = new Map<string, number>();
    let totalBill = 0, totalSaving = 0;
    items.forEach((r) => {
      const key = (r.customerFirstName ?? '—').trim().toLowerCase() || '—';
      visits.set(key, (visits.get(key) ?? 0) + 1);
      totalBill += pkr(r.bill); totalSaving += pkr(r.saving);
    });
    const named = [...visits.entries()].filter(([k]) => k !== '—');
    const repeat = named.filter(([, v]) => v >= 2).length;
    const top = named.sort((a, b) => b[1] - a[1]).slice(0, 10);
    return {
      totalVisits: items.length,
      uniqueCustomers: named.length,
      repeatCustomers: repeat,
      repeatRate: named.length ? Math.round((repeat / named.length) * 100) : 0,
      avgBill: items.length ? Math.round(totalBill / items.length) : 0,
      totalSaving,
      top,
    };
  }, [items]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-ink">Customers</h1>
        <p className="text-sm text-slate-500">Insights from your redemption history. Customer privacy: you only ever see first names.</p>
      </div>

      {unavailable ? (
        <EmptyState icon="👥" title="Customer insights not live yet"
          description="These insights appear once the partner redemption API is deployed." />
      ) : error && !items ? (
        <ErrorState title="Couldn't load customer insights" message="Something went wrong." onRetry={load} />
      ) : !insights ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 !rounded-2xl" />)}</div>
      ) : items!.length === 0 ? (
        <EmptyState icon="👥" title="No customer visits yet" description="Scan your first customer QR to start building insights." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Total visits" value={String(insights.totalVisits)} icon="🧾" />
            <StatCard label="Unique customers" value={String(insights.uniqueCustomers)} icon="👥" />
            <StatCard label="Repeat rate" value={`${insights.repeatRate}%`} icon="🔁" />
            <StatCard label="Avg. bill" value={formatPKR(insights.avgBill)} icon="💰" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <h2 className="font-bold text-ink">Savings given to customers</h2>
              <p className="mt-2 text-3xl font-extrabold text-brand-700">{formatPKR(insights.totalSaving)}</p>
              <p className="mt-1 text-sm text-slate-500">Total discount value your customers saved across {insights.totalVisits} visits.</p>
            </Card>
            <Card className="p-5">
              <h2 className="font-bold text-ink">Most loyal visitors</h2>
              <div className="mt-3 space-y-2">
                {insights.top.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-400">No repeat visits yet.</p>
                ) : insights.top.map(([name, visits]) => (
                  <div key={name} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5">
                    <span className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 font-bold text-brand-700">{name[0].toUpperCase()}</span>
                      <span className="text-sm font-semibold capitalize text-ink">{name}</span>
                    </span>
                    <span className="text-sm text-slate-500">{visits} visit{visits > 1 ? 's' : ''}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-400">Matched by first name only — treat as approximate.</p>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
