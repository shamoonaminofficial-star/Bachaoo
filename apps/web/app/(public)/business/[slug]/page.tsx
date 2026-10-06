import type { Metadata } from 'next';
import BusinessProfileClient from './business-client';
import { SEED_BUSINESSES } from '@/lib/seed';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://bachatly.pk';
const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');

type RawBusiness = {
  name?: string; description?: string; slug?: string; logo?: string; cover?: string;
  category?: { name?: string }; city?: string; area?: string; address?: string; phone?: string;
  ratingAvg?: number; ratingCount?: number; isVerified?: boolean; minDiscountPercent?: number;
  branches?: Array<{ name?: string; address?: string; city?: string; area?: string; latitude?: number; longitude?: number }>;
};

async function fetchBusinessRaw(slug: string): Promise<RawBusiness | null> {
  try {
    const res = await fetch(`${apiBase}/api/v1/businesses/${encodeURIComponent(slug)}`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return (await res.json()) as RawBusiness;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const raw = await fetchBusinessRaw(params.slug);
  const seed = SEED_BUSINESSES.find((b) => b.slug === params.slug);
  const name = raw?.name ?? seed?.name ?? 'Business';
  const city = raw?.city ?? seed?.city ?? '';
  const description = (raw?.description ?? `${name} — exclusive member deals on Bachatly.`).slice(0, 160);
  const url = `${siteUrl}/business/${params.slug}`;
  const image = raw?.cover ?? raw?.logo;

  return {
    title: `${name} — Deals & Discounts${city ? ` in ${city}` : ''}`,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website', siteName: 'Bachatly',
      title: `${name} — Member Deals`, description, url,
      ...(image ? { images: [{ url: image, alt: name }] } : {}),
    },
    twitter: { card: 'summary_large_image', title: `${name} on Bachatly`, description },
  };
}

/** JSON-LD `LocalBusiness` for search engines. */
function localBusinessJsonLd(biz: RawBusiness | null, slug: string) {
  if (!biz) return null;
  const branch = biz.branches?.[0];
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: biz.name,
    description: (biz.description ?? '').slice(0, 500),
    url: `${siteUrl}/business/${slug}`,
    ...(biz.logo ? { logo: biz.logo } : {}),
    ...(biz.phone ? { telephone: biz.phone } : {}),
    ...(biz.address || biz.city ? {
      address: {
        '@type': 'PostalAddress',
        streetAddress: biz.address ?? '',
        addressLocality: biz.city ?? '',
        addressRegion: biz.area ?? '',
        addressCountry: 'PK',
      },
    } : {}),
    ...(branch?.latitude && branch?.longitude ? {
      geo: { '@type': 'GeoCoordinates', latitude: branch.latitude, longitude: branch.longitude },
    } : {}),
    ...(typeof biz.ratingAvg === 'number' ? {
      aggregateRating: { '@type': 'AggregateRating', ratingValue: biz.ratingAvg, reviewCount: biz.ratingCount ?? 0 },
    } : {}),
  };
}

export default async function BusinessPage({ params }: { params: { slug: string } }) {
  const raw = await fetchBusinessRaw(params.slug);
  const jsonLd = localBusinessJsonLd(raw, params.slug);

  return (
    <>
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      )}
      <BusinessProfileClient slug={params.slug} />
    </>
  );
}
