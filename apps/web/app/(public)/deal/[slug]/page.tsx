import type { Metadata } from 'next';
import DealDetailClient from './deal-client';
import { SEED_DEALS } from '@/lib/seed';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://bachatly.pk';
const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');

type RawDeal = {
  title?: string; description?: string; slug?: string; discountPercent?: number;
  images?: Array<{ url?: string } | string>; business?: { name?: string; slug?: string };
  memberPrice?: number; originalPrice?: number; endDate?: string; area?: string; city?: string;
};

async function fetchDealRaw(slug: string): Promise<RawDeal | null> {
  try {
    const res = await fetch(`${apiBase}/api/v1/deals/${encodeURIComponent(slug)}`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return (await res.json()) as RawDeal;
  } catch {
    return null;
  }
}

function firstImage(d: RawDeal | null): string | undefined {
  const img = d?.images?.[0];
  if (!img) return undefined;
  return typeof img === 'string' ? img : img.url;
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const raw = await fetchDealRaw(params.slug);
  const seed = SEED_DEALS.find((d) => d.slug === params.slug);
  const title = raw?.title ?? seed?.title ?? 'Deal';
  const description =
    raw?.description ?? seed?.description ?? `Save with this exclusive Bachatly deal${raw?.business?.name ? ` at ${raw.business.name}` : ''}.`;
  const discount = raw?.discountPercent ?? seed?.discountPercent;
  const image = firstImage(raw);
  const url = `${siteUrl}/deal/${params.slug}`;

  return {
    title: discount != null ? `${title} — ${discount}% OFF` : title,
    description: description.slice(0, 160),
    alternates: { canonical: url },
    openGraph: {
      type: 'website', siteName: 'Bachatly', title, description: description.slice(0, 200), url,
      ...(image ? { images: [{ url: image, alt: title }] } : {}),
    },
    twitter: { card: 'summary_large_image', title, description: description.slice(0, 200), ...(image ? { images: [image] } : {}) },
  };
}

/** JSON-LD `Offer` for search engines. Money converted server-side from paisa → PKR. */
function offerJsonLd(deal: RawDeal | null, slug: string) {
  if (!deal) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'Offer',
    name: deal.title,
    description: (deal.description ?? '').slice(0, 500),
    url: `${siteUrl}/deal/${slug}`,
    ...(deal.memberPrice != null ? {
      price: (deal.memberPrice / 100).toFixed(2),
      priceCurrency: 'PKR',
      ...(deal.originalPrice != null ? {
        priceSpecification: { '@type': 'PriceSpecification', price: (deal.originalPrice / 100).toFixed(2), priceCurrency: 'PKR' },
      } : {}),
    } : {}),
    ...(deal.endDate ? { priceValidUntil: deal.endDate } : {}),
    ...(deal.business?.name ? {
      seller: { '@type': 'LocalBusiness', name: deal.business.name },
      ...(deal.area || deal.city ? {
        availableAtOrFrom: {
          '@type': 'Place',
          address: { '@type': 'PostalAddress', addressLocality: deal.city ?? '', addressRegion: deal.area ?? '', addressCountry: 'PK' },
        },
      } : {}),
    } : {}),
  };
}

export default async function DealPage({ params }: { params: { slug: string } }) {
  const raw = await fetchDealRaw(params.slug);
  const jsonLd = offerJsonLd(raw, params.slug);

  return (
    <>
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      )}
      <DealDetailClient slug={params.slug} />
    </>
  );
}
