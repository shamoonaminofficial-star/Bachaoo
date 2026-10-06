'use client';
import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { DealCard, SkeletonCard, EmptyState, Breadcrumbs, Button } from '@bachatly/ui';
import { api, withSeedFallback } from '@/lib/api';
import { fetchCategory, type ApiCategory } from '@/lib/catalog';
import { SEED_CATEGORIES, SEED_DEALS } from '@/lib/seed';
import type { Deal } from '@bachatly/ui';

export default function CategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const [cat, setCat] = useState<ApiCategory | null | undefined>(undefined);
  const [deals, setDeals] = useState<Deal[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const c = await fetchCategory(slug);
        if (alive) setCat(c);
      } catch {
        const seed = SEED_CATEGORIES.find((x) => x.slug === slug);
        if (alive) setCat(seed ? {
          id: seed.id, name: seed.name, slug: seed.slug, icon: seed.icon,
          dealCount: 0, isActive: seed.active, sortOrder: seed.order,
          subcategories: (seed.subcategories || []).map((s) => ({ id: s.id, name: s.name, slug: s.slug })),
        } : null);
      }
      try {
        const d = await api<Deal[]>(`/categories/${slug}/deals`, { auth: false });
        if (alive) setDeals(Array.isArray(d) ? d : []);
      } catch {
        if (alive) {
          const seedDeals = await withSeedFallback(async () => { throw new Error('seed'); }, SEED_DEALS, 'category deals');
          setDeals(seedDeals);
        }
      }
    })();
    return () => { alive = false; };
  }, [slug]);

  if (cat === undefined) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>
      </div>
    );
  }
  if (cat === null) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 lg:px-6">
        <EmptyState icon="🗂️" title="Category not found" actionLabel="All Categories" onAction={() => (window.location.href = '/categories')} />
      </div>
    );
  }

  const visible = deals;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Categories', href: '/categories' }, { label: cat.name }]} />
      <h1 className="mt-3 flex items-center gap-3 text-3xl font-extrabold tracking-tight text-ink">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-2xl" aria-hidden>{cat.icon || '🗂️'}</span>
        {cat.name}
      </h1>
      <p className="mt-1 text-sm text-slate-500">{cat.dealCount > 0 ? `${cat.dealCount} live deals` : 'Partner deals in this category'}</p>

      {(cat.subcategories?.length || 0) > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="Subcategories">
          {cat.subcategories!.map((s) => (
            <Link key={s.id} href={`/deals?category=${cat.slug}&subcategory=${s.slug}`}
              className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200">
              {s.name}
            </Link>
          ))}
        </div>
      )}

      {!visible ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>
      ) : visible.length === 0 ? (
        <div className="mt-6"><EmptyState icon="🎟️" title={`No deals in ${cat.name} yet`} description="Check back soon — new partner offers are added daily." actionLabel="Explore All Deals" onAction={() => (window.location.href = '/deals')} /></div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{visible.map((d) => <DealCard key={d.id} deal={d} />)}</div>
          <div className="mt-6 text-center">
            <Link href={`/deals?category=${cat.slug}`}><Button variant="outline">View all {cat.name} deals</Button></Link>
          </div>
        </>
      )}
    </div>
  );
}
