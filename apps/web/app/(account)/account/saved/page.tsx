'use client';
import React, { useEffect, useState } from 'react';
import { DealCard, BusinessCard, SkeletonCard, EmptyState, Tabs, Button, useToast } from '@bachatly/ui';
import { ApiError } from '@/lib/api';
import { fetchFavorites, removeFavorite, mapDeal, type ApiFavorite, type ApiBusiness } from '@/lib/catalog';
import type { Deal, Business } from '@bachatly/ui';

export default function SavedPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<'deals' | 'businesses'>('deals');
  const [favorites, setFavorites] = useState<ApiFavorite[] | null>(null);
  const [error, setError] = useState(false);

  const load = async () => {
    setError(false);
    try {
      setFavorites(await fetchFavorites());
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { setFavorites([]); return; }
      setFavorites(null); setError(true);
    }
  };
  useEffect(() => { load(); }, []);

  const unfavorite = async (fav: ApiFavorite) => {
    try {
      await removeFavorite(fav.id);
      setFavorites((fs) => (fs || []).filter((f) => f.id !== fav.id));
      toast('Removed from saved items.', 'info');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not remove.', 'error');
    }
  };

  const dealFavs = (favorites || []).filter((f) => f.targetType === 'deal');
  const bizFavs = (favorites || []).filter((f) => f.targetType === 'business');

  const dealCards: { fav: ApiFavorite; deal: Deal }[] = dealFavs
    .filter((f) => f.deal)
    .map((f) => ({ fav: f, deal: mapDeal(f.deal!) as unknown as Deal }));
  const bizCards: { fav: ApiFavorite; biz: Business }[] = bizFavs
    .filter((f) => f.business)
    .map((f) => ({ fav: f, biz: f.business as unknown as Business }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-ink">Saved</h1>
      <Tabs tabs={[
        { id: 'deals', label: `Deals (${dealCards.length})` },
        { id: 'businesses', label: `Businesses (${bizCards.length})` },
      ]} active={tab} onChange={(id) => setTab(id as typeof tab)} />

      {error && <EmptyState icon="⚠️" title="Could not load saved items" actionLabel="Retry" onAction={load} />}

      {tab === 'deals' && !error && (favorites === null ? (
        <div className="grid gap-4 sm:grid-cols-2">{[0, 1].map((i) => <SkeletonCard key={i} />)}</div>
      ) : dealCards.length === 0 ? (
        <EmptyState icon="♡" title="No saved deals" description="Tap the heart on any deal to save it here."
          actionLabel="Explore Deals" onAction={() => (window.location.href = '/deals')} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {dealCards.map(({ fav, deal }) => (
            <div key={fav.id} className="relative">
              <DealCard deal={deal} />
              <Button size="sm" variant="ghost" className="absolute right-3 top-3 !bg-white/90 shadow"
                onClick={() => unfavorite(fav)} aria-label="Remove from saved">✕</Button>
            </div>
          ))}
        </div>
      ))}

      {tab === 'businesses' && !error && (favorites === null ? (
        <div className="grid gap-4 sm:grid-cols-2">{[0, 1].map((i) => <SkeletonCard key={i} />)}</div>
      ) : bizCards.length === 0 ? (
        <EmptyState icon="🏪" title="No saved businesses"
          actionLabel="Browse Businesses" onAction={() => (window.location.href = '/businesses')} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {bizCards.map(({ fav, biz }) => (
            <div key={fav.id} className="relative">
              <BusinessCard business={biz} />
              <Button size="sm" variant="ghost" className="absolute right-3 top-3 !bg-white/90 shadow"
                onClick={() => unfavorite(fav)} aria-label="Remove from saved">✕</Button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
