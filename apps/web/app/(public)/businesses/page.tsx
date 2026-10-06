'use client';
import React, { useCallback, useEffect, useState } from 'react';
import {
  BusinessCard, SearchBar, SkeletonCard, EmptyState, ErrorState, Breadcrumbs,
  Select, Button, BottomSheet, Pagination, Badge,
} from '@bachatly/ui';
import { withSeedFallback } from '@/lib/api';
import { fetchBusinesses, fetchCategories, fetchCities, type ApiBusiness, type Page } from '@/lib/catalog';
import { SEED_BUSINESSES, SEED_CATEGORIES, CITIES } from '@/lib/seed';
import type { Business } from '@bachatly/ui';

function toUi(b: ApiBusiness): Business {
  return {
    id: b.id, name: b.name, slug: b.slug, logo: b.logo, cover: b.cover,
    category: b.category.name, rating: b.ratingAvg, reviewsCount: b.ratingCount,
    city: b.city, area: b.area || '', address: b.address || '', phone: b.phone,
    verified: b.isVerified, activeOffers: b.activeDealCount,
    memberDiscount: b.minDiscountPercent ? `Up to ${b.minDiscountPercent}% off` : undefined,
    distanceKm: b.distanceKm,
  };
}

const SORTS = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'rating', label: 'Highest Rated' },
  { value: 'deals', label: 'Most Offers' },
  { value: 'name', label: 'Name A–Z' },
];

export default function BusinessesPage() {
  const [page, setPage] = useState<Page<Business> | null>(null);
  const [error, setError] = useState(false);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [cityId, setCityId] = useState('');
  const [ratingMin, setRatingMin] = useState('');
  const [hasDeals, setHasDeals] = useState(false);
  const [sort, setSort] = useState('recommended');
  const [pageNum, setPageNum] = useState(1);
  const [sheet, setSheet] = useState(false);
  const [cats, setCats] = useState<{ id: string; name: string }[]>([]);
  const [cities, setCities] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => { const t = setTimeout(() => setDebouncedQ(q), 350); return () => clearTimeout(t); }, [q]);

  useEffect(() => {
    fetchCategories().then((c) => setCats(c.map((x) => ({ id: x.id, name: x.name })))).catch(() => setCats(SEED_CATEGORIES.map((x) => ({ id: x.id, name: x.name }))));
    fetchCities().then((c) => setCities(c.map((x) => ({ id: x.id, name: x.name })))).catch(() => setCities(CITIES.map((name) => ({ id: name, name }))));
  }, []);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await fetchBusinesses({
        q: debouncedQ || undefined, categoryId: categoryId || undefined,
        cityId: cityId || undefined, ratingMin: ratingMin ? Number(ratingMin) : undefined,
        hasDeals: hasDeals || undefined, sort, page: pageNum, pageSize: 12,
      });
      setPage({ ...res, items: res.items.map(toUi) });
    } catch {
      const seed = await withSeedFallback(async () => { throw new Error('seed'); }, SEED_BUSINESSES, 'businesses');
      const filtered = seed.filter((b) =>
        (!debouncedQ || (b.name + b.area + b.city).toLowerCase().includes(debouncedQ.toLowerCase())) &&
        (!hasDeals || b.activeOffers > 0));
      setPage({ items: filtered, page: 1, pageSize: 12, total: filtered.length, totalPages: 1 });
    }
  }, [debouncedQ, categoryId, cityId, ratingMin, hasDeals, sort, pageNum]);

  useEffect(() => { load(); }, [load]);

  const clearAll = () => { setQ(''); setCategoryId(''); setCityId(''); setRatingMin(''); setHasDeals(false); setSort('recommended'); setPageNum(1); };
  const activeFilters = [categoryId, cityId, ratingMin, hasDeals ? 'deals' : ''].filter(Boolean).length;

  const filters = (
    <div className="space-y-3">
      <Select aria-label="Category" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPageNum(1); }}
        options={[{ value: '', label: 'All categories' }, ...cats.map((c) => ({ value: c.id, label: c.name }))]} />
      <Select aria-label="City" value={cityId} onChange={(e) => { setCityId(e.target.value); setPageNum(1); }}
        options={[{ value: '', label: 'All cities' }, ...cities.map((c) => ({ value: c.id, label: c.name }))]} />
      <Select aria-label="Minimum rating" value={ratingMin} onChange={(e) => { setRatingMin(e.target.value); setPageNum(1); }}
        options={[{ value: '', label: 'Any rating' }, { value: '4.5', label: '4.5★ & up' }, { value: '4', label: '4.0★ & up' }, { value: '3', label: '3.0★ & up' }]} />
      <Select aria-label="Sort" value={sort} onChange={(e) => { setSort(e.target.value); setPageNum(1); }}
        options={SORTS} />
      <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <input type="checkbox" checked={hasDeals} onChange={(e) => { setHasDeals(e.target.checked); setPageNum(1); }} className="h-4 w-4 accent-[#0B6B4F]" />
        Has active offers
      </label>
      {activeFilters > 0 && <Button size="sm" variant="ghost" onClick={clearAll}>Clear all filters</Button>}
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Businesses' }]} />
      <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-ink">Business Directory</h1>
      <p className="mt-1 text-sm text-slate-500">{page ? `${page.total} partner businesses` : 'Find verified Bachatly partners near you.'}</p>

      <div className="mt-4 flex gap-3">
        <div className="flex-1"><SearchBar value={q} onChange={(v) => { setQ(v); setPageNum(1); }} placeholder="Search businesses…" /></div>
        <Button variant="outline" className="md:hidden" onClick={() => setSheet(true)}>
          🔍 Filters {activeFilters > 0 && <Badge tone="brand">{activeFilters}</Badge>}
        </Button>
      </div>

      <div className="mt-4 hidden gap-6 md:flex">
        <aside className="w-64 shrink-0"><div className="sticky top-20 rounded-2xl border border-slate-100 bg-white p-4 shadow-card">{filters}</div></aside>
        <div className="min-w-0 flex-1">
          {!page ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}</div>
          ) : error ? (
            <ErrorState title="Could not load businesses" onRetry={load} />
          ) : page.items.length === 0 ? (
            <EmptyState icon="🏪" title="No businesses found" description="Try a different search or clear your filters." actionLabel="Clear filters" onAction={clearAll} />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{page.items.map((b) => <BusinessCard key={b.id} business={b} />)}</div>
              <div className="mt-6"><Pagination page={page.page} totalPages={page.totalPages} onChange={setPageNum} /></div>
            </>
          )}
        </div>
      </div>

      <div className="mt-4 md:hidden">
        {!page ? (
          <div className="grid gap-4 sm:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>
        ) : page.items.length === 0 ? (
          <EmptyState icon="🏪" title="No businesses found" description="Try a different search or clear your filters." actionLabel="Clear filters" onAction={clearAll} />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">{page.items.map((b) => <BusinessCard key={b.id} business={b} />)}</div>
            <div className="mt-6"><Pagination page={page.page} totalPages={page.totalPages} onChange={setPageNum} /></div>
          </>
        )}
      </div>

      <BottomSheet open={sheet} onClose={() => setSheet(false)} title="Filters">
        {filters}
        <Button fullWidth className="mt-4" onClick={() => setSheet(false)}>Show results</Button>
      </BottomSheet>
    </div>
  );
}
