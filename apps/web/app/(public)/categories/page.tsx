'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, SkeletonCard, Breadcrumbs, EmptyState, Badge } from '@bachatly/ui';
import { withSeedFallback } from '@/lib/api';
import { fetchCategories, type ApiCategory } from '@/lib/catalog';
import { SEED_CATEGORIES } from '@/lib/seed';
import type { Category } from '@bachatly/ui';

function toUi(c: ApiCategory): Category {
  return {
    id: c.id, name: c.name, slug: c.slug, icon: c.icon || '🗂️', image: c.image,
    order: c.sortOrder ?? 0, active: c.isActive !== false,
    subcategories: (c.subcategories || []).map((s) => ({ id: s.id, name: s.name, slug: s.slug, categoryId: c.id })),
  };
}

export default function CategoriesPage() {
  const [cats, setCats] = useState<Category[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await fetchCategories();
        if (alive) setCats(list.map(toUi));
      } catch {
        if (alive) {
          const seed = await withSeedFallback(async () => { throw new Error('seed'); }, SEED_CATEGORIES, 'categories');
          setCats(seed);
        }
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Categories' }]} />
      <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-ink">All Categories</h1>
      <p className="mt-1 text-sm text-slate-500">Browse deals by what you love.</p>
      {!cats ? (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">{Array.from({ length: 10 }).map((_, i) => <SkeletonCard key={i} />)}</div>
      ) : cats.length === 0 ? (
        <div className="mt-6"><EmptyState icon="🗂️" title="No categories yet" description="New categories are added as partners join." /></div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {cats.filter((c) => c.active).map((c) => (
            <Link key={c.id} href={`/category/${c.slug}`}>
              <Card className="group h-full p-5 text-center transition hover:-translate-y-1 hover:shadow-pop">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-3xl transition group-hover:scale-110" aria-hidden>{c.icon}</div>
                <p className="mt-3 font-bold text-ink">{c.name}</p>
                <p className="text-xs text-slate-500">{c.subcategories?.length || 0} subcategories</p>
                {(c.subcategories?.length || 0) > 0 && (
                  <div className="mt-2 flex flex-wrap justify-center gap-1">
                    {c.subcategories!.slice(0, 3).map((s) => (
                      <Badge key={s.id} tone="neutral">{s.name}</Badge>
                    ))}
                  </div>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
