'use client';
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Button, Card, CardBody, DealCard, BusinessCard, MembershipPlanCard, SearchBar,
  LocationSelector, SkeletonCard, EmptyState, Badge, useToast,
} from '@bachatly/ui';
import { api, withSeedFallback } from '@/lib/api';
import { fetchDeals } from '@/lib/catalog';
import { SEED_CATEGORIES, SEED_DEALS, SEED_BUSINESSES, SEED_PLANS, CITIES } from '@/lib/seed';
import { formatPKR } from '@/lib/format';
import BannerCarousel from '@/components/BannerCarousel';
import type { Deal, Business, Category, MembershipPlan } from '@bachatly/ui';

const DISTANCES = [1, 3, 5, 10, 25, 50];
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://bachatly.pk';

function SectionHead({ title, sub, href, linkLabel }: { title: string; sub?: string; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-5 flex items-end justify-between">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight text-ink md:text-3xl">{title}</h2>
        {sub && <p className="mt-1 text-sm text-slate-500">{sub}</p>}
      </div>
      {href && <Link href={href} className="shrink-0 text-sm font-semibold text-brand-700 hover:underline">{linkLabel || 'View all →'}</Link>}
    </div>
  );
}

export default function HomePage() {
  const { toast } = useToast();
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [nearbyDeals, setNearbyDeals] = useState<Deal[] | null>(null);
  const [businesses, setBusinesses] = useState<Business[] | null>(null);
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [plans, setPlans] = useState<MembershipPlan[] | null>(null);
  const [q, setQ] = useState('');
  const [city, setCity] = useState(CITIES[0]);
  const [maxDist, setMaxDist] = useState(10);
  const [nearbyView, setNearbyView] = useState<'list' | 'map'>('list');
  const [locating, setLocating] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    withSeedFallback(() => fetchDeals({ sort: 'recommended', pageSize: 4 }).then((p) => p.items), SEED_DEALS.slice(0, 4), 'featured deals').then(setDeals);
    withSeedFallback(() => api<Business[]>('/businesses/popular'), SEED_BUSINESSES, 'businesses').then(setBusinesses);
    withSeedFallback(() => api<Category[]>('/categories'), SEED_CATEGORIES, 'categories').then(setCategories);
    withSeedFallback(() => api<MembershipPlan[]>('/membership-plans'), SEED_PLANS, 'plans').then(setPlans);
  }, []);

  const loadNearby = (lat: number, lng: number, radiusKm: number) => {
    setNearbyDeals(null);
    withSeedFallback(
      () => fetchDeals({ sort: 'nearby', lat, lng, radiusKm, pageSize: 4 }).then((p) => p.items),
      SEED_DEALS.filter((d) => (d.distanceKm ?? 99) <= radiusKm).slice(0, 4),
      'nearby deals',
    ).then(setNearbyDeals);
  };

  useEffect(() => {
    if (coords) loadNearby(coords.lat, coords.lng, maxDist);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxDist, coords]);

  const requestLocation = () => {
    if (!('geolocation' in navigator)) { toast('Geolocation is not supported on this device.', 'error'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(c);
        loadNearby(c.lat, c.lng, maxDist);
        toast('Location enabled — showing deals near you.');
      },
      () => { setLocating(false); toast('Location permission denied. You can still browse all deals.', 'warning'); },
      { timeout: 10000 }
    );
  };

  return (
    <div>
      {/* SEO: Organization + WebSite structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@graph': [
              {
                '@type': 'Organization',
                name: 'Bachatly',
                slogan: 'Save More. Live More.',
                url: siteUrl,
                logo: `${siteUrl}/icon.svg`,
                sameAs: [],
              },
              {
                '@type': 'WebSite',
                name: 'Bachatly',
                url: siteUrl,
                potentialAction: {
                  '@type': 'SearchAction',
                  target: { '@type': 'EntryPoint', urlTemplate: `${siteUrl}/search?q={search_term_string}` },
                  'query-input': 'required name=search_term_string',
                },
              },
            ],
          }),
        }}
      />
      {/* ── HERO ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-ink">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-600/30" aria-hidden />
        <div className="absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-accent/10" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-4 py-14 md:py-24 lg:px-6">
          <div className="max-w-2xl">
            <Badge tone="accent">🇵🇰 Pakistan's smart savings club</Badge>
            <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight text-white md:text-6xl">
              Save More.<br />Live More.
            </h1>
            <p className="mt-4 text-lg text-slate-300">Discover exclusive deals, discounts, vouchers and rewards from businesses around you.</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <div className="flex-1"><SearchBar value={q} onChange={setQ} placeholder="What are you looking for?"
                suggestions={['Pizza', 'Salon', 'Grocery', 'Car detailing', 'Fashion']}
                onSubmit={() => q.trim() && (window.location.href = `/search?q=${encodeURIComponent(q)}`)} /></div>
              <div className="flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-2 text-white">
                <LocationSelector cities={CITIES} value={city} onChange={setCity} />
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/deals"><Button size="lg" variant="accent">Explore Deals</Button></Link>
              <Link href="/membership"><Button size="lg" variant="outline" className="!border-white/30 !bg-white/10 !text-white hover:!bg-white/20">Become a Member</Button></Link>
            </div>
            <div className="mt-8 flex gap-6 text-sm text-slate-300">
              <span><strong className="text-white">2,400+</strong> partner businesses</span>
              <span><strong className="text-white">Rs. 18M+</strong> saved by members</span>
              <span><strong className="text-white">6</strong> cities & growing</span>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-16 px-4 py-12 lg:px-6">
        {/* ── ANNOUNCEMENT BANNERS (CMS) ── */}
        <BannerCarousel />

        {/* ── CATEGORIES ── */}
        <section>
          <SectionHead title="Popular Categories" href="/categories" />
          {!categories ? (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">{Array.from({ length: 10 }).map((_, i) => <SkeletonCard key={i} />)}</div>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
              {categories.slice(0, 10).map((c) => (
                <Link key={c.id} href={`/category/${c.slug}`}>
                  <Card className="group p-4 text-center transition hover:-translate-y-1 hover:shadow-pop">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-2xl transition group-hover:scale-110" aria-hidden>{c.icon}</div>
                    <p className="mt-2 text-xs font-semibold text-ink sm:text-sm">{c.name}</p>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* ── FEATURED DEALS ── */}
        <section>
          <SectionHead title="Featured Deals" sub="Hand-picked member exclusives" href="/deals" />
          {!deals ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>
          ) : deals.length === 0 ? (
            <EmptyState icon="🎟️" title="No featured deals right now" actionLabel="Explore All Deals" onAction={() => (window.location.href = '/deals')} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{deals.slice(0, 4).map((d) => <DealCard key={d.id} deal={d} />)}</div>
          )}
        </section>

        {/* ── NEARBY DEALS ── */}
        <section>
          <SectionHead title="Deals Near You" sub="Location is only used when you ask — browsing never requires it." />
          <Card className="p-4 md:p-5">
            <div className="flex flex-wrap items-center gap-2">
              {!coords ? (
                <Button size="sm" onClick={requestLocation} loading={locating}>📍 Use my location</Button>
              ) : (
                <Badge tone="success">📍 Location enabled</Badge>
              )}
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Distance filter">
                {DISTANCES.map((d) => (
                  <button key={d} onClick={() => setMaxDist(d)} aria-pressed={maxDist === d}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${maxDist === d ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    {d} KM
                  </button>
                ))}
              </div>
              <div className="ml-auto flex rounded-xl bg-slate-100 p-1" role="group" aria-label="View mode">
                {(['list', 'map'] as const).map((v) => (
                  <button key={v} onClick={() => setNearbyView(v)} aria-pressed={nearbyView === v}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${nearbyView === v ? 'bg-white shadow text-ink' : 'text-slate-500'}`}>{v} View</button>
                ))}
              </div>
            </div>
            <div className="mt-4">
              {!coords ? (
                <EmptyState icon="📍" title="See deals near you"
                  description="Share your location to discover member deals within walking distance. Browsing never requires it."
                  actionLabel="📍 Use my location" onAction={requestLocation} />
              ) : !nearbyDeals ? (
                <div className="grid gap-4 sm:grid-cols-2">{[0, 1].map((i) => <SkeletonCard key={i} />)}</div>
              ) : nearbyDeals.length === 0 ? (
                <EmptyState icon="📍" title="No deals found in this area." description={`Try a larger distance or explore everything.`} actionLabel="Explore All Deals" onAction={() => (window.location.href = '/deals')} />
              ) : nearbyView === 'list' ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{nearbyDeals.map((d) => <DealCard key={d.id} deal={d} />)}</div>
              ) : (
                <div className="flex h-72 flex-col items-center justify-center rounded-2xl bg-slate-100 text-center" role="img" aria-label="Map of nearby deals">
                  <span className="text-4xl" aria-hidden>🗺️</span>
                  <p className="mt-2 font-semibold text-ink">{nearbyDeals.length} deals within {maxDist} KM</p>
                  <p className="text-xs text-slate-500">Interactive Google Maps view loads here (Maps API key required).</p>
                </div>
              )}
            </div>
          </Card>
        </section>

        {/* ── POPULAR BUSINESSES ── */}
        <section>
          <SectionHead title="Popular Businesses" href="/businesses" />
          {!businesses ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{businesses.slice(0, 4).map((b) => <BusinessCard key={b.id} business={b} />)}</div>
          )}
        </section>

        {/* ── HOW IT WORKS ── */}
        <section className="rounded-3xl bg-brand-50 p-6 md:p-10">
          <h2 className="text-center text-2xl font-extrabold text-ink md:text-3xl">How Bachatly Works</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { n: 1, t: 'Join', d: 'Purchase your membership in under two minutes.', i: '👑' },
              { n: 2, t: 'Discover', d: 'Find participating businesses and exclusive offers near you.', i: '🔍' },
              { n: 3, t: 'Redeem', d: 'Show or scan your digital membership QR at checkout.', i: '📱' },
              { n: 4, t: 'Save', d: 'Enjoy discounts and track your total savings live.', i: '💰' },
            ].map((s) => (
              <Card key={s.n} className="p-5 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-2xl text-white" aria-hidden>{s.i}</div>
                <p className="mt-3 text-xs font-bold uppercase tracking-wide text-brand-600">Step {s.n}</p>
                <h3 className="mt-1 font-extrabold text-ink">{s.t}</h3>
                <p className="mt-1 text-sm text-slate-500">{s.d}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* ── MEMBERSHIP ── */}
        <section>
          <SectionHead title="Membership Plans" sub="One membership. Thousands in savings." href="/membership" linkLabel="Compare plans →" />
          {!plans ? (
            <div className="grid gap-4 md:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}</div>
          ) : (
            <div className="grid gap-5 md:grid-cols-3">
              {plans.map((p) => <MembershipPlanCard key={p.id} plan={p} onSelect={() => (window.location.href = `/membership?plan=${p.id}`)} />)}
            </div>
          )}
        </section>

        {/* ── SAVINGS CALCULATOR ── */}
        <section>
          <SavingsCalculator />
        </section>
      </div>
    </div>
  );
}

function SavingsCalculator() {
  const [vals, setVals] = useState({ restaurant: 8000, shopping: 10000, salon: 3000, auto: 4000, entertainment: 5000, other: 5000 });
  const avgDiscount = 0.15;
  const monthly = useMemo(() => Math.round(Object.values(vals).reduce((a, b) => a + b, 0) * avgDiscount), [vals]);
  const set = (k: keyof typeof vals) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setVals((v) => ({ ...v, [k]: Math.max(0, Number(e.target.value) || 0) }));
  const fields: { key: keyof typeof vals; label: string }[] = [
    { key: 'restaurant', label: 'Restaurants / month' },
    { key: 'shopping', label: 'Shopping / month' },
    { key: 'salon', label: 'Salon & beauty / month' },
    { key: 'auto', label: 'Automotive / month' },
    { key: 'entertainment', label: 'Entertainment / month' },
    { key: 'other', label: 'Other spending / month' },
  ];
  return (
    <Card className="overflow-hidden">
      <div className="grid md:grid-cols-2">
        <CardBody className="!p-6 md:!p-8">
          <h2 className="text-2xl font-extrabold text-ink">Savings Calculator</h2>
          <p className="mt-1 text-sm text-slate-500">Enter your typical monthly spending to see what members like you could save.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {fields.map((f) => (
              <label key={f.key} className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">{f.label} (Rs.)</span>
                <input type="number" min={0} value={vals[f.key]} onChange={set(f.key)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100" />
              </label>
            ))}
          </div>
        </CardBody>
        <div className="flex flex-col justify-center bg-ink p-6 text-white md:p-8">
          <p className="text-xs font-bold uppercase tracking-widest text-accent">Estimate*</p>
          <p className="mt-2 text-sm text-slate-300">Estimated monthly savings</p>
          <p className="text-4xl font-extrabold text-white">{formatPKR(monthly)}</p>
          <p className="mt-3 text-sm text-slate-300">Estimated yearly savings</p>
          <p className="text-2xl font-extrabold text-accent">{formatPKR(monthly * 12)}</p>
          <p className="mt-4 text-[11px] leading-relaxed text-slate-400">*Estimate only, based on a {Math.round(avgDiscount * 100)}% average member discount across partner businesses. Actual savings vary by usage and offers.</p>
          <Link href="/membership" className="mt-4"><Button variant="accent">Become a Member</Button></Link>
        </div>
      </div>
    </Card>
  );
}
