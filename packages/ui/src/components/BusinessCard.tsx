import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { Business } from '../types';
import { Card } from './Card';
import { Rating } from './Rating';

export function BusinessCard({ business }: { business: Business }) {
  return (
    <Link href={`/business/${business.slug}`}>
      <Card className="group overflow-hidden transition-all hover:-translate-y-1 hover:shadow-pop">
        <div className="relative h-32 bg-gradient-to-br from-brand-50 to-slate-100">
          {business.cover
            ? <Image src={business.cover} alt={`${business.name} cover`} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw" className="object-cover transition group-hover:scale-105" />
            : <div className="flex h-full items-center justify-center text-4xl" aria-hidden>🏪</div>}
          {business.verified && <span className="absolute right-3 top-3 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-bold text-brand-700 shadow" title="Verified business">✓ Verified</span>}
        </div>
        <div className="flex items-start gap-3 p-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-xl font-extrabold text-white" aria-hidden>
            {business.name[0]}
          </span>
          <div className="min-w-0">
            <h3 className="truncate font-bold text-ink group-hover:text-brand-700">{business.name}</h3>
            <p className="text-xs text-slate-500">{business.category} · 📍 {business.area}, {business.city}</p>
            <div className="mt-1 flex items-center gap-2">
              <Rating value={business.rating} />
              <span className="text-xs text-slate-400">({business.reviewsCount})</span>
            </div>
            <p className="mt-1.5 text-xs font-semibold text-brand-700">{business.activeOffers} active offers{business.memberDiscount ? ` · ${business.memberDiscount}` : ''}</p>
          </div>
        </div>
      </Card>
    </Link>
  );
}
