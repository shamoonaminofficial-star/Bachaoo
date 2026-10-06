'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { Card, Rating, Button, Textarea, Input, EmptyState, Skeleton, ErrorState, useToast } from '@bachatly/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { timeAgo } from '@/lib/format';
import {
  fetchBusinessReviews, createReview,
  type ReviewItem, type ReviewAggregate,
} from '@/lib/engagement';

/**
 * Reviews block (Phase 11) — rating summary + list + write-a-review.
 * Used on /business/[slug] and /deal/[slug]. Write is gated server-side:
 * the API returns NO_REDEMPTION when the user hasn't visited yet.
 */
export default function ReviewSection({ businessId, dealId }: { businessId: string; dealId?: string }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [aggregate, setAggregate] = useState<ReviewAggregate | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetchBusinessReviews(businessId);
      if (res) {
        setItems(res.items);
        setAggregate(res.aggregate);
      } else {
        setItems(null); // reviews API not live yet
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load reviews.');
    } finally {
      setReady(true);
    }
  }, [businessId]);

  useEffect(() => { load(); }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) { toast('Please write a few words about your visit.', 'error'); return; }
    setSending(true);
    try {
      await createReview({ businessId, dealId, rating, title: title.trim() || undefined, body: body.trim() });
      toast('Thanks — your review is live.');
      setFormOpen(false); setTitle(''); setBody(''); setRating(5);
      load();
    } catch (e) {
      if (e instanceof ApiError && (e as any).code === 'NO_REDEMPTION') {
        setDenied(true);
        toast('Reviews unlock after your first visit — redeem a deal here first.', 'warning');
      } else {
        toast(e instanceof ApiError ? e.message : "Couldn't submit your review.", 'error');
      }
    } finally {
      setSending(false);
    }
  };

  if (!ready) return <Skeleton className="h-40 w-full !rounded-2xl" />;
  if (error) return <ErrorState title="Couldn't load reviews" description={error} onRetry={load} />;
  if (items === null) {
    return <EmptyState icon="⭐" title="Reviews are on the way" description="The reviews service isn't live yet — check back soon." />;
  }

  const dist = aggregate?.distribution ?? {};
  const maxDist = Math.max(1, ...[1, 2, 3, 4, 5].map((s) => dist[String(s)] ?? 0));

  return (
    <div className="space-y-4">
      {aggregate && aggregate.count > 0 && (
        <Card className="p-5">
          <div className="flex flex-wrap items-center gap-6">
            <div className="text-center">
              <p className="text-4xl font-extrabold text-ink">{aggregate.average.toFixed(1)}</p>
              <Rating value={aggregate.average} />
              <p className="mt-1 text-xs text-slate-500">{aggregate.count} review{aggregate.count === 1 ? '' : 's'}</p>
            </div>
            <div className="min-w-48 flex-1 space-y-1.5">
              {[5, 4, 3, 2, 1].map((s) => (
                <div key={s} className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="w-6 font-semibold">{s}★</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-amber-400" style={{ width: `${((dist[String(s)] ?? 0) / maxDist) * 100}%` }} />
                  </div>
                  <span className="w-8 text-right">{dist[String(s)] ?? 0}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {!formOpen ? (
        <div>
          {user ? (
            <Button variant="outline" onClick={() => setFormOpen(true)}>✍️ Write a review</Button>
          ) : (
            <p className="text-sm text-slate-500"><a href="/login" className="font-semibold text-brand-700 hover:underline">Log in</a> to write a review after your visit.</p>
          )}
        </div>
      ) : (
        <Card className="p-5">
          <h3 className="font-bold text-ink">Your review</h3>
          <form onSubmit={submit} className="mt-3 space-y-3">
            <div>
              <span className="mb-1 block text-sm font-medium text-slate-600">Rating</span>
              <Rating value={rating} interactive onRate={setRating} size="md" />
            </div>
            <Input label="Headline (optional)" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Sum it up in a few words" />
            <Textarea label="Your experience" value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={1000} placeholder="What did you try? How was the service?" required />
            {denied && <p className="text-sm text-amber-600">Reviews unlock after your first visit — redeem a deal here first.</p>}
            <div className="flex gap-2">
              <Button type="submit" loading={sending}>Submit review</Button>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {items.length === 0 ? (
        <EmptyState icon="⭐" title="No reviews yet" description="Be the first to review after your visit." />
      ) : (
        <div className="space-y-3">
          {items.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-center justify-between gap-2">
                <Rating value={r.rating} />
                {r.createdAt && <span className="text-xs text-slate-400">{timeAgo(r.createdAt)}</span>}
              </div>
              {r.title && <p className="mt-1 font-bold text-ink">{r.title}</p>}
              {r.body && <p className="mt-1 text-sm text-slate-600">{r.body}</p>}
              {r.authorName && <p className="mt-2 text-xs text-slate-400">— {r.authorName}</p>}
              {r.reply && (
                <div className="mt-3 rounded-xl bg-brand-50 p-3">
                  <p className="text-xs font-bold text-brand-700">Response from the business</p>
                  <p className="mt-1 text-sm text-slate-600">{r.reply.body}</p>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
