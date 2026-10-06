'use client';
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { SkeletonCard, EmptyState, ErrorState, Breadcrumbs, Button, Badge, Card, useToast } from '@bachatly/ui';
import { withSeedFallback } from '@/lib/api';
import { fetchNearbyBranches, type ApiBranch } from '@/lib/catalog';
import { SEED_BUSINESSES } from '@/lib/seed';

const DISTANCES = [1, 3, 5, 10, 25, 50];

function seedBranches(): ApiBranch[] {
  return SEED_BUSINESSES.filter((b) => b.distanceKm != null).map((b) => ({
    id: `seed-${b.id}`, name: 'Main branch', address: b.address, city: b.city, area: b.area,
    phone: b.phone, isActive: true, distanceKm: b.distanceKm,
    business: { id: b.id, name: b.name, slug: b.slug },
  }));
}

export default function NearbyPage() {
  const { toast } = useToast();
  const [branches, setBranches] = useState<ApiBranch[] | null>(null);
  const [error, setError] = useState(false);
  const [maxDist, setMaxDist] = useState(5);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async (lat: number, lng: number, radiusKm: number) => {
    setError(false);
    try {
      const list = await fetchNearbyBranches(lat, lng, radiusKm);
      setBranches(list);
    } catch {
      const seed = await withSeedFallback(async () => { throw new Error('seed'); }, seedBranches(), 'nearby branches');
      setBranches(seed.filter((b) => (b.distanceKm ?? 99) <= radiusKm));
    }
  }, []);

  const enable = () => {
    if (!('geolocation' in navigator)) { toast('Geolocation is not supported on this device.', 'error'); return; }
    setLocating(true); setDenied(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setCoords({ lat: latitude, lng: longitude });
        setLocating(false);
        toast('Showing branches near you.');
        load(latitude, longitude, maxDist);
      },
      (err) => {
        setLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setDenied(true);
          toast('Location permission denied. You can still browse all deals.', 'warning');
        } else {
          toast('Could not get your location. Try again.', 'error');
        }
      },
      { timeout: 10000, maximumAge: 60000 },
    );
  };

  // Seed preview (approximate distances) until the user enables location.
  useEffect(() => {
    if (coords) return;
    let alive = true;
    (async () => {
      const seed = await withSeedFallback(async () => { throw new Error('seed'); }, seedBranches(), 'nearby branches');
      if (alive) setBranches(seed.filter((b) => (b.distanceKm ?? 99) <= maxDist));
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (coords) load(coords.lat, coords.lng, maxDist);
    else setBranches((prev) => prev); // radius change pre-location just refilters below
  }, [maxDist, coords, load]);

  const filtered = (branches || []).filter((b) => (b.distanceKm ?? 99) <= maxDist)
    .sort((a, b) => (a.distanceKm ?? 99) - (b.distanceKm ?? 99));

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Nearby' }]} />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">Nearby Branches</h1>
        {coords ? <Badge tone="success">📍 Location on</Badge> : (
          <Button size="sm" onClick={enable} loading={locating}>📍 Enable location</Button>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-500">Location permission is optional and only used when you enable it.</p>

      {denied && (
        <Card className="mt-4 border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">📍 Location access was denied</p>
          <p className="mt-1 text-sm text-amber-800">
            Enable location in your browser settings to see live distances. You can still browse every deal without it.
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={enable}>Try again</Button>
            <Link href="/deals"><Button size="sm" variant="outline">Browse all deals</Button></Link>
          </div>
        </Card>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Distance">
          {DISTANCES.map((d) => (
            <button key={d} onClick={() => setMaxDist(d)} aria-pressed={maxDist === d}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${maxDist === d ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{d} KM</button>
          ))}
        </div>
        <div className="ml-auto flex rounded-xl bg-slate-100 p-1" role="group" aria-label="View">
          {(['list', 'map'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} aria-pressed={view === v} className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${view === v ? 'bg-white shadow text-ink' : 'text-slate-500'}`}>{v}</button>
          ))}
        </div>
      </div>

      {!branches ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}</div>
      ) : error ? (
        <div className="mt-6"><ErrorState title="Could not load nearby branches" onRetry={() => { if (coords) void load(coords.lat, coords.lng, maxDist); }} /></div>
      ) : filtered.length === 0 ? (
        <div className="mt-6"><EmptyState icon="📍" title="No branches found in this area." description={`Nothing within ${maxDist} KM right now.`} actionLabel="Explore All Deals" onAction={() => (window.location.href = '/deals')} /></div>
      ) : view === 'list' ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((b) => (
            <Link key={b.id} href={b.business ? `/business/${b.business.slug}` : '/businesses'}>
              <Card className="group h-full p-5 transition hover:-translate-y-1 hover:shadow-pop">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-ink group-hover:text-brand-700">{b.business?.name || 'Partner branch'}</h3>
                  {b.distanceKm != null && <Badge tone="brand">{b.distanceKm < 1 ? `${Math.round(b.distanceKm * 1000)} m` : `${b.distanceKm.toFixed(1)} km`}</Badge>}
                </div>
                <p className="mt-1 text-sm font-medium text-slate-600">{b.name}</p>
                <p className="mt-1 text-sm text-slate-500">📍 {b.address}{b.area ? `, ${b.area}` : ''}</p>
                {b.phone && <p className="mt-1 text-sm text-slate-500">📞 {b.phone}</p>}
                <span className="mt-3 inline-block text-sm font-semibold text-brand-700">View business →</span>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-6 flex h-96 flex-col items-center justify-center rounded-2xl bg-slate-100 text-center" role="img" aria-label="Nearby branches map">
          <p className="text-4xl" aria-hidden>🗺️</p>
          <p className="mt-2 text-sm font-semibold text-slate-600">Map view</p>
          <p className="mt-1 max-w-sm text-xs text-slate-500">
            {coords
              ? `${filtered.length} branches within ${maxDist} KM of your location. Interactive map renders once a Google Maps API key is configured.`
              : 'Enable location to see branches plotted around you. Interactive map renders once a Google Maps API key is configured.'}
          </p>
          <div className="mt-3 space-y-1">
            {filtered.slice(0, 5).map((b) => (
              <p key={b.id} className="text-xs text-slate-500">📍 {b.business?.name} — {b.name}{b.distanceKm != null ? ` (${b.distanceKm.toFixed(1)} km)` : ''}</p>
            ))}
          </div>
        </div>
      )}
      {!coords && branches && branches.length > 0 && (
        <p className="mt-4 text-xs text-slate-400">* Distances are approximate preview data. Enable location for live distances.</p>
      )}
    </div>
  );
}
