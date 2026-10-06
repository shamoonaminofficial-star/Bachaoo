'use client';
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { DealCard, BusinessCard, SkeletonCard, EmptyState, Breadcrumbs, Tabs, type Business } from '@bachatly/ui';
import { withSeedFallback } from '@/lib/api';
import { globalSearch, mapDeal, fetchCategories, type ApiDeal, type ApiBusiness, type ApiCategory } from '@/lib/catalog';

/** API business → UI card shape (BusinessCard consumes the UI Business type). */
function toCardBusiness(b: ApiBusiness): Business {
  return {
    id: b.id, name: b.name, slug: b.slug, logo: b.logo, cover: b.cover,
    category: b.category.name, rating: b.ratingAvg, reviewsCount: b.ratingCount,
    city: b.city, area: b.area ?? '', address: b.address ?? '',
    verified: b.isVerified, activeOffers: b.activeDealCount, distanceKm: b.distanceKm,
  };
}

interface SearchPageResults { deals: ApiDeal[]; businesses: Business[]; categories: ApiCategory[]; }
import { SEED_DEALS, SEED_BUSINESSES, SEED_CATEGORIES } from '@/lib/seed';
import HeaderSearch from '@/components/HeaderSearch';

function SearchPageInner() {
  const params = useSearchParams();
  const initial = params.get('q') || '';
  const [tab, setTab] = useState('all');
  const [results, setResults] = useState<SearchPageResults | null>(null);
  const [error, setError] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [categories, setCategories] = useState<ApiCategory[]>(SEED_CATEGORIES as unknown as ApiCategory[]);

  useEffect(() => {
    fetchCategories().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    if (!initial.trim()) { setResults({ deals: [], businesses: [], categories: [] }); return; }
    setResults(null); setError(false);
    const needle = initial.toLowerCase();
    withSeedFallback(
      () => globalSearch(initial).then((r) => ({ ...r, businesses: r.businesses.map(toCardBusiness) })),
      {
        deals: SEED_DEALS.filter((d) => (d.title + d.shortDescription).toLowerCase().includes(needle)).map((d) => mapDeal(d as unknown as Record<string, unknown>)),
        businesses: SEED_BUSINESSES.filter((b) => b.name.toLowerCase().includes(needle)),
        categories: (SEED_CATEGORIES as unknown as ApiCategory[]).filter((c) => c.name.toLowerCase().includes(needle)),
      },
      'search',
    ).then(setResults).catch(() => setError(true));
    try {
      const r = (JSON.parse(localStorage.getItem('bachatly_recent_searches') || '[]') as string[]).filter((x: string) => x !== initial);
      const next = [initial, ...r].slice(0, 6);
      localStorage.setItem('bachatly_recent_searches', JSON.stringify(next));
      setRecent(next);
    } catch { /* ignore */ }
  }, [initial]);

  useEffect(() => {
    try { setRecent(JSON.parse(localStorage.getItem('bachatly_recent_searches') || '[]')); } catch { /* ignore */ }
  }, []);

  const deals = results?.deals ?? [];
  const bizHits = results?.businesses ?? [];
  const catHits = results?.categories?.length
    ? results.categories
    : categories.filter((c) => c.name.toLowerCase().includes(initial.toLowerCase()));

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Search' }]} />
      <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-ink">
        {initial ? <>Results for <span className="text-brand-700">“{initial}”</span></> : 'Search'}
      </h1>
      <div className="mt-4 max-w-2xl"><HeaderSearch placeholder="Search deals, businesses, categories…" /></div>

      {recent.length > 0 && !initial && (
        <div className="mt-4"><p className="text-xs font-semibold uppercase text-slate-500">Recent searches</p>
          <div className="mt-2 flex flex-wrap gap-2">{recent.map((r) => (
            <Link key={r} href={`/search?q=${encodeURIComponent(r)}`} className="rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-200">🕘 {r}</Link>
          ))}</div></div>
      )}

      {initial && (
        <>
          <div className="mt-6">
            <Tabs tabs={[
              { id: 'all', label: `All (${deals.length + bizHits.length + catHits.length})` },
              { id: 'deals', label: `Deals (${deals.length})` },
              { id: 'businesses', label: `Businesses (${bizHits.length})` },
              { id: 'categories', label: `Categories (${catHits.length})` },
            ]} active={tab} onChange={setTab} />
          </div>
          {error ? (
            <div className="mt-6"><EmptyState icon="⚠️" title="Search failed" description="Check your connection and try again." actionLabel="Retry" onAction={() => window.location.reload()} /></div>
          ) : results === null ? (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>
          ) : deals.length === 0 && bizHits.length === 0 && catHits.length === 0 ? (
            <div className="mt-6"><EmptyState icon="🔍" title={`No results for "${initial}"`} description="Try a different keyword or browse categories." actionLabel="Explore All Deals" onAction={() => (window.location.href = '/deals')} /></div>
          ) : (
            <div className="mt-6 space-y-8">
              {(tab === 'all' || tab === 'categories') && catHits.length > 0 && (
                <section><h2 className="mb-3 font-bold text-ink">Categories</h2>
                  <div className="flex flex-wrap gap-2">{catHits.map((c) => (
                    <Link key={c.id} href={`/category/${c.slug}`} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:border-brand-500">{c.name}</Link>
                  ))}</div></section>
              )}
              {(tab === 'all' || tab === 'deals') && deals.length > 0 && (
                <section><h2 className="mb-3 font-bold text-ink">Deals</h2>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{deals.map((d) => <DealCard key={d.id} deal={d} />)}</div></section>
              )}
              {(tab === 'all' || tab === 'businesses') && bizHits.length > 0 && (
                <section><h2 className="mb-3 font-bold text-ink">Businesses</h2>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{bizHits.map((b) => <BusinessCard key={b.id} business={b} />)}</div></section>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <React.Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Loading…</div>}>
      <SearchPageInner />
    </React.Suspense>
  );
}
