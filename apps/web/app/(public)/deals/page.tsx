'use client';
import React, { useCallback, useEffect, useState } from 'react';
import {
  DealCard, SearchBar, BottomSheet, SkeletonCard, EmptyState, Pagination,
  Breadcrumbs, Select, Button, Badge, useToast,
} from '@bachatly/ui';
import { withSeedFallback } from '@/lib/api';
import { fetchDeals, fetchCategories, fetchCities, type ApiDeal, type ApiCategory, type ApiCity, type Page } from '@/lib/catalog';
import { SEED_DEALS } from '@/lib/seed';

const SORTS = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'nearby', label: 'Nearby' },
  { value: 'newest', label: 'Newest' },
  { value: 'discount', label: 'Highest Discount' },
  { value: 'popular', label: 'Most Popular' },
  { value: 'ending', label: 'Ending Soon' },
];
const DEAL_TYPES = [
  { value: '', label: 'All deal types' },
  { value: 'percent_off', label: 'Percent off' },
  { value: 'flat_off', label: 'Flat amount off' },
  { value: 'bogo', label: 'Buy 1 Get 1' },
  { value: 'freebie', label: 'Freebie' },
];
const PER_PAGE = 12;

export default function DealsPage() {
  const { toast } = useToast();
  const [data, setData] = useState<Page<ApiDeal> | null>(null);
  const [error, setError] = useState(false);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [cityId, setCityId] = useState('');
  const [minDiscount, setMinDiscount] = useState(0);
  const [dealType, setDealType] = useState('');
  const [memberOnly, setMemberOnly] = useState(false);
  const [ratingMin, setRatingMin] = useState(0);
  const [sort, setSort] = useState('recommended');
  const [page, setPage] = useState(1);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [cities, setCities] = useState<ApiCity[]>([]);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    fetchCategories().then(setCategories).catch(() => {});
    fetchCities().then(setCities).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(q); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await withSeedFallback(
        () => fetchDeals({
          q: debouncedQ || undefined,
          categoryId: categoryId || undefined,
          cityId: cityId || undefined,
          minDiscount: minDiscount || undefined,
          dealType: dealType || undefined,
          ratingMin: ratingMin || undefined,
          membershipRequired: memberOnly || undefined,
          sort,
          lat: sort === 'nearby' ? coords?.lat : undefined,
          lng: sort === 'nearby' ? coords?.lng : undefined,
          page, pageSize: PER_PAGE,
        }),
        { items: SEED_DEALS as unknown as ApiDeal[], page: 1, pageSize: PER_PAGE, total: SEED_DEALS.length, totalPages: 1 },
        'deals',
      );
      setData(res);
    } catch {
      setData(null); setError(true);
    }
  }, [debouncedQ, categoryId, cityId, minDiscount, dealType, memberOnly, ratingMin, sort, coords, page]);

  useEffect(() => { load(); }, [load]);

  const requestLocation = () => {
    if (!('geolocation' in navigator)) { toast('Geolocation is not supported on this device.', 'error'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setSort('nearby'); setPage(1);
        toast('Location enabled — showing nearest deals first.');
      },
      () => { setLocating(false); toast('Location permission denied. You can still browse all deals.', 'warning'); },
      { timeout: 10000 },
    );
  };

  const clearFilters = () => {
    setQ(''); setDebouncedQ(''); setCategoryId(''); setCityId(''); setMinDiscount(0);
    setDealType(''); setMemberOnly(false); setRatingMin(0); setSort('recommended'); setPage(1);
  };
  const hasFilters = !!(q || categoryId || cityId || minDiscount || dealType || memberOnly || ratingMin);

  const filters = (
    <div className="space-y-5">
      <Select label="Category" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}
        options={[{ value: '', label: 'All categories' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]} />
      <Select label="City" value={cityId} onChange={(e) => { setCityId(e.target.value); setPage(1); }}
        options={[{ value: '', label: 'All cities' }, ...cities.map((c) => ({ value: c.id, label: c.name }))]} />
      <Select label="Deal type" value={dealType} onChange={(e) => { setDealType(e.target.value); setPage(1); }} options={DEAL_TYPES} />
      <div>
        <p className="mb-1.5 text-sm font-semibold text-ink">Minimum discount: {minDiscount}%</p>
        <input type="range" min={0} max={50} step={5} value={minDiscount}
          onChange={(e) => { setMinDiscount(Number(e.target.value)); setPage(1); }}
          className="w-full accent-[#0B6B4F]" aria-label="Minimum discount" />
      </div>
      <div>
        <p className="mb-1.5 text-sm font-semibold text-ink">Minimum rating: {ratingMin === 0 ? 'Any' : `${ratingMin}+ ★`}</p>
        <input type="range" min={0} max={5} step={1} value={ratingMin}
          onChange={(e) => { setRatingMin(Number(e.target.value)); setPage(1); }}
          className="w-full accent-[#0B6B4F]" aria-label="Minimum rating" />
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
        <input type="checkbox" checked={memberOnly} onChange={(e) => { setMemberOnly(e.target.checked); setPage(1); }} className="h-4 w-4 accent-[#0B6B4F]" />
        Members-only deals
      </label>
      {hasFilters && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button>}
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Deals' }]} />
      <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">Explore Deals</h1>
        <div className="flex flex-1 gap-2 md:justify-end">
          <div className="w-full md:max-w-sm"><SearchBar value={q} onChange={setQ} placeholder="Search deals…" /></div>
          <Button variant="outline" className="md:hidden" onClick={() => setSheetOpen(true)}>Filters</Button>
        </div>
      </div>

      <div className="mt-6 flex gap-6">
        <aside className="hidden w-64 shrink-0 md:block">
          <div className="sticky top-24 rounded-2xl border border-slate-100 bg-white p-5 shadow-card">
            <h2 className="mb-4 font-bold text-ink">Filters</h2>{filters}
          </div>
        </aside>
        <div className="flex-1">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-sm text-slate-500">
              {data === null && !error ? 'Loading…' : error ? '' : `${(data?.total ?? 0)} deal${data?.total === 1 ? '' : 's'}`}
              {coords && sort === 'nearby' && <Badge tone="success" className="ml-2">📍 Near you</Badge>}
            </p>
            <div className="flex items-center gap-2">
              {sort !== 'nearby' && (
                <Button size="sm" variant="outline" onClick={requestLocation} loading={locating}>📍 Nearby</Button>
              )}
              <div className="w-44">
                <Select aria-label="Sort deals" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} options={SORTS} />
              </div>
            </div>
          </div>
          {error ? (
            <EmptyState icon="⚠️" title="Could not load deals" description="Check your connection and try again." actionLabel="Retry" onAction={load} />
          ) : data === null ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}</div>
          ) : data.items.length === 0 ? (
            <EmptyState icon="📍" title="No deals found in this area."
              description="Try a different search, a larger area, or clearing your filters."
              actionLabel="Explore All Deals" onAction={clearFilters} />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{data.items.map((d) => <DealCard key={d.id} deal={d} />)}</div>
              <div className="mt-6">
                <Pagination page={data.page} totalPages={data.totalPages} onChange={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
              </div>
            </>
          )}
        </div>
      </div>

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Filters">
        {filters}
        <Button fullWidth className="mt-5" onClick={() => setSheetOpen(false)}>
          Show {data ? `${data.total} deals` : 'deals'}
        </Button>
      </BottomSheet>
    </div>
  );
}
