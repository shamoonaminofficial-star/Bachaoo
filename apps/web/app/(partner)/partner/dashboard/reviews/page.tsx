'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { Card, EmptyState, ErrorState, Skeleton, Rating, Badge } from '@bachatly/ui';
import { api, ApiError } from '@/lib/api';
import { unwrapItems } from '@/lib/catalog';
import { timeAgo } from '@/lib/format';
import { usePartnerBusiness } from '../layout';

interface PartnerReview {
  id: string; author?: string; rating: number; text?: string; body?: string;
  createdAt: string; dealTitle?: string; reply?: string | null;
}

/**
 * Reviews page — tries the real endpoint; the reviews backend is a stub as of
 * Phase 8, so this degrades to an honest "not live yet" card instead of fake
 * reviews. Partner replies will be wired when the backend reply endpoint lands.
 */
export default function PartnerReviewsPage() {
  const { business, loading: bizLoading } = usePartnerBusiness();
  const [reviews, setReviews] = useState<PartnerReview[] | null>(null);
  const [error, setError] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(async () => {
    if (!business?.id) return;
    setError(false);
    try {
      const raw = await api<unknown>(`/reviews/business/${business.id}`, { params: { pageSize: 50 } });
      setReviews(unwrapItems<PartnerReview>(raw));
    } catch (e) {
      const code = (e as ApiError)?.status;
      if (code === 404 || code === 501) { setUnavailable(true); return; }
      console.warn('[partner reviews]', e);
      setError(true);
    }
  }, [business]);
  useEffect(() => { if (!bizLoading) load(); }, [bizLoading, load]);

  const avg = reviews && reviews.length
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : '—';

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-ink">Reviews</h1>
      {unavailable ? (
        <EmptyState icon="⭐" title="Reviews not live yet"
          description="Customer reviews are launching soon. Once live, you'll see every review here and be able to reply publicly." />
      ) : error && !reviews ? (
        <ErrorState title="Couldn't load reviews" message="Something went wrong." onRetry={load} />
      ) : !reviews ? (
        <Skeleton className="h-40 !rounded-2xl" />
      ) : reviews.length === 0 ? (
        <EmptyState icon="⭐" title="No reviews yet" description="Once customers review your business, they'll appear here." />
      ) : (
        <>
          <Card className="flex items-center gap-4 p-5">
            <p className="text-4xl font-extrabold text-ink">{avg}</p>
            <div>
              <Rating value={Number(avg) || 0} size="md" />
              <p className="text-sm text-slate-500">{reviews.length} review{reviews.length > 1 ? 's' : ''}</p>
            </div>
          </Card>
          {reviews.map((r) => (
            <Card key={r.id} className="p-5">
              <div className="flex items-center justify-between">
                <p className="font-bold text-ink">{r.author ?? 'Customer'}</p>
                <Rating value={r.rating} />
              </div>
              {r.dealTitle && <Badge tone="neutral" className="mt-1">{r.dealTitle}</Badge>}
              <p className="mt-2 text-sm text-slate-600">{r.text ?? r.body}</p>
              <p className="mt-1 text-xs text-slate-400">{timeAgo(r.createdAt)}</p>
              {r.reply ? (
                <p className="mt-3 rounded-xl bg-brand-50 p-3 text-sm text-brand-800">Your reply: {r.reply}</p>
              ) : (
                <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-400">Public replies aren't available yet — they launch with the full reviews feature.</p>
              )}
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
