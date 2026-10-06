'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Button, Card, Badge, Breadcrumbs, Rating, Tabs, Skeleton, EmptyState, ShareButtons, useToast } from '@bachatly/ui';
import { withSeedFallback } from '@/lib/api';
import { fetchBusiness, type ApiBusinessDetail } from '@/lib/catalog';
import { SEED_BUSINESSES, SEED_DEALS, SEED_REVIEWS } from '@/lib/seed';
import ReviewSection from '@/components/ReviewSection';

const DAYS: Array<[string, string]> = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']];

function formatHours(hours?: Record<string, [string, string]>): string {
  if (!hours) return 'Hours not listed';
  const parts = DAYS.map(([k, label]) => hours[k] ? `${label} ${hours[k][0]}–${hours[k][1]}` : null).filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Hours not listed';
}

export default function BusinessProfilePage({ slug }: { slug: string }) {
  const { toast } = useToast();
  const [biz, setBiz] = useState<ApiBusinessDetail | null | undefined>(undefined);
  const [tab, setTab] = useState('deals');
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://bachatly.pk';

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const b = await fetchBusiness(slug);
        if (alive) setBiz(b);
      } catch {
        const seed = SEED_BUSINESSES.find((x) => x.slug === slug);
        if (!alive) return;
        if (!seed) { setBiz(null); return; }
        const seedDeals = await withSeedFallback(async () => { throw new Error('seed'); }, SEED_DEALS, 'deals');
        setBiz({
          id: seed.id, slug: seed.slug, name: seed.name, description: (seed as { description?: string }).description ?? '',
          logo: seed.logo, cover: seed.cover,
          category: { id: seed.category, name: seed.category, slug: seed.category.toLowerCase().replace(/\s+/g, '-') },
          ratingAvg: seed.rating, ratingCount: seed.reviewsCount,
          city: seed.city, area: seed.area, address: seed.address, phone: seed.phone,
          isVerified: seed.verified, activeDealCount: seed.activeOffers,
          branches: [{ id: 'sb1', name: 'Main branch', address: seed.address, city: seed.city, area: seed.area, phone: seed.phone, isActive: true }],
          deals: seedDeals.filter((d) => d.business.id === seed.id).map((d) => ({
            id: d.id, slug: d.slug, title: d.title, discountPercent: d.discountPercent,
            memberPrice: d.memberPrice, originalPrice: d.originalPrice, expiresAt: d.expiresAt,
          })),
          reviews: SEED_REVIEWS.map((r) => ({ id: r.id, author: r.author, rating: r.rating, text: r.text, createdAt: '' })),
          reviewsSummary: { avg: seed.rating, count: seed.reviewsCount },
        });
      }
    })();
    return () => { alive = false; };
  }, [slug]);

  if (biz === undefined) return <div className="mx-auto max-w-6xl px-4 py-6"><Skeleton className="h-56 w-full !rounded-2xl" /><Skeleton className="mt-4 h-8 w-1/2" /></div>;
  if (biz === null) return <div className="mx-auto max-w-6xl px-4 py-10"><EmptyState icon="🏪" title="Business not found" actionLabel="Browse Businesses" onAction={() => (window.location.href = '/businesses')} /></div>;

  const mapsUrl = (b: ApiBusinessDetail) => {
    const br = b.branches[0];
    if (br?.latitude && br?.longitude) return `https://www.google.com/maps/search/?api=1&query=${br.latitude},${br.longitude}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${b.name} ${b.address || ''} ${b.city}`)}`;
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 lg:px-6">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Businesses', href: '/businesses' }, { label: biz.name }]} />
      <div className="relative mt-4 h-48 overflow-hidden rounded-2xl bg-brand-50 md:h-64">
        {biz.cover
          ? <Image src={biz.cover} alt={`${biz.name} cover photo`} fill priority sizes="(max-width: 1024px) 100vw, 1024px" className="object-cover" />
          : <div className="flex h-full items-center justify-center text-6xl" aria-hidden>🏪</div>}
      </div>
      <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-start">
        <span className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-brand-600 text-3xl font-extrabold text-white shadow-card" aria-hidden>
          {biz.logo ? <Image src={biz.logo} alt="" fill sizes="80px" className="object-cover" /> : biz.name[0]}
        </span>
        <div className="flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-3xl font-extrabold text-ink">{biz.name} {biz.isVerified && <Badge tone="success">✓ Verified</Badge>}</h1>
          <p className="mt-1 text-sm text-slate-500">{biz.category.name} · 📍 {biz.area ? `${biz.area}, ` : ''}{biz.city}</p>
          <div className="mt-2 flex items-center gap-2">
            <Rating value={biz.reviewsSummary.avg} />
            <span className="text-sm text-slate-500">{biz.reviewsSummary.avg.toFixed(1)} ({biz.reviewsSummary.count} reviews)</span>
          </div>
          {typeof biz.minDiscountPercent === 'number' && (
            <p className="mt-1 text-sm font-semibold text-brand-700">Members save up to {biz.minDiscountPercent}% here</p>
          )}
        </div>
        <div className="flex gap-2">
          <a href={mapsUrl(biz)} target="_blank" rel="noopener noreferrer"><Button variant="outline">🧭 Directions</Button></a>
          <Button variant="outline" onClick={() => { navigator.clipboard?.writeText(`${siteUrl}/business/${biz.slug}`); toast('Business link copied.'); }}>🔗 Share</Button>
        </div>
      </div>

      <div className="mt-6">
        <Tabs tabs={[
          { id: 'deals', label: `Deals (${biz.deals.length})` },
          { id: 'about', label: 'About' },
          { id: 'locations', label: `Locations (${biz.branches.length})` },
          { id: 'reviews', label: `Reviews (${biz.reviewsSummary.count})` },
          { id: 'photos', label: 'Photos' },
        ]} active={tab} onChange={setTab} />
        <div className="py-5">
          {tab === 'deals' && (biz.deals.length === 0
            ? <EmptyState icon="🎟️" title="No active deals" description="This business has no live offers right now." />
            : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {biz.deals.map((d) => (
                  <Link key={d.id} href={`/deal/${d.slug}`}>
                    <Card className="group h-full p-5 transition hover:-translate-y-1 hover:shadow-pop">
                      <div className="flex items-start justify-between gap-2">
                        <span className="rounded-xl bg-brand-600 px-2.5 py-1 text-sm font-extrabold text-white">{d.discountPercent}% OFF</span>
                        {d.memberPrice != null && <span className="text-sm font-bold text-ink">Rs. {(d.memberPrice / 100).toLocaleString()}</span>}
                      </div>
                      <h3 className="mt-3 font-bold text-ink group-hover:text-brand-700">{d.title}</h3>
                      <p className="mt-1 text-xs text-slate-500">Valid till {new Date(d.expiresAt).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                      <span className="mt-3 inline-block text-sm font-semibold text-brand-700">View Deal →</span>
                    </Card>
                  </Link>
                ))}
              </div>)}
          {tab === 'about' && (
            <Card className="p-5 text-sm text-slate-600">
              <p>{biz.description || `${biz.name} is a Bachatly partner in ${biz.category.name}, serving customers in ${biz.city}.`}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <p>📞 <strong>Phone:</strong> {biz.phone || '—'}</p>
                {biz.website && <p>🌐 <strong>Website:</strong> <a className="text-brand-700 underline" href={biz.website} target="_blank" rel="noreferrer">{biz.website}</a></p>}
                {biz.instagram && <p>📸 <strong>Instagram:</strong> {biz.instagram}</p>}
                {biz.facebook && <p>👍 <strong>Facebook:</strong> {biz.facebook}</p>}
              </div>
            </Card>
          )}
          {tab === 'locations' && (
            <div className="grid gap-4 md:grid-cols-2">
              {biz.branches.map((br) => (
                <Card key={br.id} className="p-5">
                  <div className="flex items-start justify-between">
                    <h3 className="font-bold text-ink">{br.name}</h3>
                    <Badge tone={br.isActive ? 'success' : 'neutral'}>{br.isActive ? 'OPEN' : 'CLOSED'}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">📍 {br.address}{br.area ? `, ${br.area}` : ''}{br.city ? `, ${br.city}` : ''}</p>
                  {br.phone && <p className="mt-1 text-sm text-slate-500">📞 {br.phone}</p>}
                  <p className="mt-1 text-sm text-slate-500">🕒 {formatHours(br.openingHours)}</p>
                  {(br.latitude && br.longitude) ? (
                    <a className="mt-2 inline-block text-sm font-semibold text-brand-700"
                      href={`https://www.google.com/maps/search/?api=1&query=${br.latitude},${br.longitude}`}
                      target="_blank" rel="noopener noreferrer">View on map →</a>
                  ) : <p className="mt-2 text-xs text-slate-400">Map link available after the business adds coordinates.</p>}
                </Card>
              ))}
            </div>
          )}
          {tab === 'reviews' && (
            <ReviewSection businessId={biz.id} />
          )}
          {tab === 'photos' && (
            biz.cover || biz.logo
              ? <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {[biz.cover, biz.logo].filter(Boolean).map((src, i) => (
                    <div key={i} className="relative h-36 overflow-hidden rounded-2xl">
                      <Image src={src!} alt={`${biz.name} photo ${i + 1}`} fill sizes="(max-width: 768px) 50vw, 25vw" className="object-cover" />
                    </div>
                  ))}
                </div>
              : <EmptyState icon="📸" title="No photos yet" description="Photos from the business and customers will appear here." />
          )}
        </div>
      </div>
      <ShareButtons url={`${siteUrl}/business/${biz.slug}`} text={biz.name} />
    </div>
  );
}
