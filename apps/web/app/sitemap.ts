import type { MetadataRoute } from 'next';
import { SEED_DEALS, SEED_BUSINESSES, SEED_CATEGORIES, CITIES } from '@/lib/seed';

const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://bachatly.pk';
const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');

/** Fetch slugs from the public API; returns null on any failure (caller falls back to seeds). */
async function fetchSlugs(path: string): Promise<Array<{ slug?: string; updatedAt?: string }> | null> {
  try {
    const res = await fetch(`${apiBase}/api/v1/${path}`, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const json = await res.json();
    const items = Array.isArray(json) ? json : json?.items ?? json?.data ?? [];
    return Array.isArray(items) ? items : null;
  } catch {
    return null;
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages = ['', '/deals', '/businesses', '/categories', '/membership', '/rewards', '/partner', '/nearby', '/about', '/faqs']
    .map((p) => ({ url: `${base}${p}`, lastModified: new Date(), changeFrequency: 'daily' as const, priority: p === '' ? 1 : 0.8 }));

  const [apiDeals, apiBusinesses, apiCategories] = await Promise.all([
    fetchSlugs('deals?pageSize=500'),
    fetchSlugs('businesses?pageSize=500'),
    fetchSlugs('categories'),
  ]);

  const deals = (apiDeals ?? SEED_DEALS.map((d) => ({ slug: d.slug, updatedAt: undefined as string | undefined })))
    .filter((d) => d.slug)
    .map((d) => ({ url: `${base}/deal/${d.slug}`, lastModified: d.updatedAt ? new Date(d.updatedAt) : new Date(), changeFrequency: 'weekly' as const, priority: 0.7 }));
  const businesses = (apiBusinesses ?? SEED_BUSINESSES.map((b) => ({ slug: b.slug, updatedAt: undefined as string | undefined })))
    .filter((b) => b.slug)
    .map((b) => ({ url: `${base}/business/${b.slug}`, lastModified: b.updatedAt ? new Date(b.updatedAt) : new Date(), changeFrequency: 'weekly' as const, priority: 0.7 }));
  const categories = (apiCategories ?? SEED_CATEGORIES.map((c) => ({ slug: c.slug })))
    .filter((c) => c.slug)
    .map((c) => ({ url: `${base}/category/${c.slug}`, lastModified: new Date(), changeFrequency: 'weekly' as const, priority: 0.6 }));
  const locations = CITIES.map((c) => ({ url: `${base}/deals/${c.toLowerCase()}`, lastModified: new Date(), changeFrequency: 'daily' as const, priority: 0.6 }));

  return [...staticPages, ...deals, ...businesses, ...categories, ...locations];
}
