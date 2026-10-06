'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  Button, Card, Badge, Breadcrumbs, Rating, Tabs, Skeleton, Accordion,
  EmptyState, ShareButtons, useToast, ErrorState,
} from '@bachatly/ui';
import { withSeedFallback, ApiError } from '@/lib/api';
import { fetchDeal, addFavorite, removeFavorite, paisaToPkr, type ApiDealDetail } from '@/lib/catalog';
import { RedeemQrModal } from '@/components/RedeemQrModal';
import ReviewSection from '@/components/ReviewSection';
import { SEED_DEALS } from '@/lib/seed';
import { formatPKR, formatDate, daysUntil } from '@/lib/format';
import { useAuth } from '@/lib/auth';

export default function DealDetailPage({ slug }: { slug: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [deal, setDeal] = useState<ApiDealDetail | null | undefined>(undefined);
  const [tab, setTab] = useState('about');
  const [saved, setSaved] = useState(false);
  const [favoriteId, setFavoriteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://bachatly.pk';

  useEffect(() => {
    withSeedFallback(
      () => fetchDeal(slug),
      { ...(SEED_DEALS.find((d) => d.slug === slug) ?? SEED_DEALS[0]), computed: { eligible: true, reasons: [] } } as unknown as ApiDealDetail,
      'deal',
    ).then(setDeal).catch(() => setDeal(null));
  }, [slug]);

  if (deal === undefined) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-6">
        <Skeleton className="h-72 w-full !rounded-2xl" />
        <Skeleton className="mt-4 h-8 w-2/3" /><Skeleton className="mt-2 h-4 w-1/3" />
      </div>
    );
  }
  if (deal === null) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <EmptyState icon="🎟️" title="Deal not found" description="This deal may have expired or been removed."
          actionLabel="Explore All Deals" onAction={() => router.push('/deals')} />
      </div>
    );
  }

  const d = daysUntil(deal.expiresAt);
  const youSavePkr = paisaToPkr(deal.computed?.youSavePaisa ?? deal.youSavePaisa);
  const hasActiveMembership = (user as Record<string, unknown> | null)?.membership !== null
    && (user as { membership?: { status?: string } } | null)?.membership?.status === 'ACTIVE';

  const redeem = () => {
    if (!isAuthenticated) { router.push(`/login?next=/deal/${deal.slug}`); return; }
    if (deal.requiresMembership && !hasActiveMembership) {
      toast('This deal needs an active membership. Pick a plan to unlock it.', 'warning');
      router.push(`/membership?next=/deal/${deal.slug}`);
      return;
    }
    // Eligibility + short-lived signed QR token handled inside the modal (Phase 6).
    setQrOpen(true);
  };

  const toggleSave = async () => {
    if (!isAuthenticated) { router.push(`/login?next=/deal/${deal.slug}`); return; }
    setSaving(true);
    try {
      if (saved && favoriteId) {
        await removeFavorite(favoriteId);
        setSaved(false); setFavoriteId(null);
        toast('Removed from saved deals.', 'info');
      } else {
        const fav = await addFavorite('deal', deal.id);
        setSaved(true); setFavoriteId(fav.id);
        toast('Deal saved successfully.');
      }
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not save this deal.', 'error');
    } finally { setSaving(false); }
  };

  const directionsUrl = deal.business
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${deal.business.name} ${deal.area} ${deal.city}`)}`
    : 'https://www.google.com/maps';

  const branch = deal.branches?.[0];
  const mapQuery = branch?.latitude && branch?.longitude
    ? `${branch.latitude},${branch.longitude}`
    : `${deal.business?.name ?? ''} ${deal.area} ${deal.city}`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 lg:px-6">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Deals', href: '/deals' }, { label: deal.title }]} />

      <div className="mt-4 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {/* Gallery */}
          <div className="grid gap-3">
            <div className="relative h-64 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-50 to-slate-100 md:h-80">
              {deal.images?.[0] ? (
                <Image src={deal.images[0]} alt={deal.title} fill priority sizes="(max-width: 1024px) 100vw, 66vw" className="object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-7xl" aria-hidden>🎟️</div>
              )}
              <span className="absolute left-4 top-4 rounded-xl bg-error px-3 py-1.5 text-lg font-extrabold text-white shadow">{deal.discountPercent}% OFF</span>
              <div className="absolute left-4 top-16 flex flex-wrap gap-1.5">{deal.badges.slice(0, 3).map((b) => <Badge key={b} tone="accent">{b}</Badge>)}</div>
              {deal.requiresMembership && <span className="absolute right-4 top-4 rounded-xl bg-ink/80 px-3 py-1.5 text-xs font-bold text-white">👑 MEMBERS ONLY</span>}
            </div>
            {deal.images && deal.images.length > 1 && (
              <div className="grid grid-cols-4 gap-3">
                {deal.images.slice(1, 5).map((src, i) => (
                  <div key={i} className="relative h-20 overflow-hidden rounded-xl bg-slate-100">
                    <Image src={src} alt={`${deal.title} photo ${i + 2}`} fill sizes="25vw" className="object-cover" />
                  </div>
                ))}
              </div>
            )}
          </div>

          <Tabs tabs={[
            { id: 'about', label: 'About' },
            { id: 'terms', label: 'Terms' },
            { id: 'locations', label: `Locations (${deal.branches?.length ?? 0})` },
            { id: 'reviews', label: 'Reviews' },
          ]} active={tab} onChange={setTab} />

          <div className="py-5">
            {tab === 'about' && (
              <div className="space-y-4 text-sm text-slate-600">
                <p>{deal.description}</p>
                <div className="grid grid-cols-2 gap-3">
                  <Card className="p-3"><p className="text-xs text-slate-500">Valid from</p><p className="font-semibold text-ink">{formatDate(deal.startDate)}</p></Card>
                  <Card className="p-3"><p className="text-xs text-slate-500">Expires</p><p className="font-semibold text-ink">{formatDate(deal.endDate)} {d >= 0 && <span className="text-error">({d}d left)</span>}</p></Card>
                  <Card className="p-3"><p className="text-xs text-slate-500">Per-member limit</p><p className="font-semibold text-ink">{deal.perUserLimit}×</p></Card>
                  <Card className="p-3"><p className="text-xs text-slate-500">Deal type</p><p className="font-semibold text-ink">{deal.dealType?.replace(/_/g, ' ') || '—'}</p></Card>
                </div>
                {deal.computed && !deal.computed.eligible && deal.computed.reasons.length > 0 && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <p className="font-semibold text-amber-800">Before you redeem</p>
                    <ul className="mt-1 list-disc pl-5 text-sm text-amber-700">{deal.computed.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
                  </div>
                )}
                <div className="overflow-hidden rounded-2xl border border-slate-100">
                  <iframe
                    title={`Map — ${deal.business?.name}`}
                    src={`https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed`}
                    className="h-64 w-full border-0" loading="lazy" />
                </div>
              </div>
            )}
            {tab === 'terms' && (
              <Accordion
                items={deal.terms.map((t, i) => ({ id: `t${i}`, title: `Term ${i + 1}`, content: t }))}
              />
            )}
            {tab === 'locations' && (
              <div className="space-y-3">
                {(!deal.branches || deal.branches.length === 0) && <EmptyState icon="📍" title="No branches listed" />}
                {deal.branches?.map((b) => (
                  <Card key={b.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-ink">{b.name}</p>
                        <p className="mt-1 text-sm text-slate-500">📍 {b.address}{b.area ? `, ${b.area}` : ''}</p>
                        {b.phone && <p className="text-sm text-slate-500">📞 {b.phone}</p>}
                      </div>
                      {!b.isActive && <Badge tone="neutral">Closed</Badge>}
                    </div>
                    {b.openingHours && (
                      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500 sm:grid-cols-4">
                        {Object.entries(b.openingHours).map(([day, hrs]) => (
                          <p key={day}><span className="font-semibold capitalize text-slate-600">{day}:</span> {hrs[0]}–{hrs[1]}</p>
                        ))}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
            {tab === 'reviews' && (
              deal.business?.id
                ? <ReviewSection businessId={deal.business.id} dealId={deal.id} />
                : <EmptyState icon="⭐" title="No reviews yet" description="Be the first to review after redeeming this deal." />
            )}
          </div>
        </div>

        {/* Sticky action card */}
        <div>
          <Card className="sticky top-24 p-5">
            <div className="flex items-center gap-2">
              <span className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-brand-600 font-extrabold text-white" aria-hidden>
                {deal.business?.logo ? <Image src={deal.business.logo} alt="" fill sizes="40px" className="object-cover" /> : (deal.business?.name?.[0] ?? 'B')}
              </span>
              <div>
                <Link href={`/business/${deal.business?.slug}`} className="font-bold text-ink hover:text-brand-700 hover:underline">
                  {deal.business?.name} <span className="text-brand-600" title="Verified business">✓</span>
                </Link>
                <p className="text-xs text-slate-500">📍 {deal.area}, {deal.city}</p>
              </div>
            </div>
            <h1 className="mt-4 text-2xl font-extrabold text-ink">{deal.title}</h1>
            <div className="mt-2 flex items-center gap-2"><Rating value={deal.rating} /><span className="text-xs text-slate-500">{deal.rating} rating</span></div>
            {deal.originalPrice && deal.memberPrice && (
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-brand-700">{formatPKR(deal.memberPrice)}</span>
                <span className="text-sm text-slate-400 line-through">{formatPKR(deal.originalPrice)}</span>
              </div>
            )}
            {youSavePkr !== undefined && youSavePkr > 0 && (
              <p className="mt-2 inline-block rounded-lg bg-green-50 px-2.5 py-1 text-sm font-bold text-success">You Save {formatPKR(youSavePkr)}</p>
            )}
            <div className="mt-4 space-y-2">
              <Button fullWidth size="lg" onClick={redeem} loading={authLoading}>🎟️ Redeem Offer</Button>
              {(!isAuthenticated || (deal.requiresMembership && !hasActiveMembership)) && (
                <Button fullWidth variant="accent" onClick={() => router.push(`/membership?next=/deal/${deal.slug}`)}>👑 Get Membership</Button>
              )}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={toggleSave} loading={saving}>
                  {saved ? '♥ Saved' : '♡ Save Deal'}
                </Button>
                <a href={directionsUrl} target="_blank" rel="noreferrer" className="flex-1">
                  <Button variant="outline" className="w-full">🧭 Directions</Button>
                </a>
              </div>
            </div>
            <div className="mt-4 border-t border-slate-100 pt-4">
              <ShareButtons url={`${siteUrl}/deal/${deal.slug}`} text={deal.title} />
            </div>
          </Card>
        </div>
      </div>

      <RedeemQrModal
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        deal={{
          id: deal.id,
          slug: deal.slug,
          title: deal.title,
          businessName: deal.business?.name,
          branches: (deal.branches ?? []).map((b) => ({ id: b.id, name: b.name, isActive: b.isActive })),
        }}
      />
    </div>
  );
}
