'use client';
import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { Deal, DealBadge } from '../types';
import { Badge } from './Badge';
import { Card } from './Card';
import { useToast } from './Toast';

const badgeTone: Record<DealBadge, 'brand' | 'accent' | 'info' | 'success' | 'warning' | 'error'> = {
  'EXCLUSIVE': 'brand', 'MEMBERS ONLY': 'info', 'TRENDING': 'accent', 'NEW': 'success', 'LIMITED TIME': 'error', 'POPULAR': 'warning',
};

export function DealCard({ deal, onFavorite }: { deal: Deal; onFavorite?: (id: string, fav: boolean) => void }) {
  const { toast } = useToast();
  const [fav, setFav] = React.useState(false);
  const toggleFav = (e: React.MouseEvent) => {
    e.preventDefault();
    const next = !fav; setFav(next);
    onFavorite?.(deal.id, next);
    toast(next ? 'Deal saved successfully.' : 'Removed from saved deals.', next ? 'success' : 'info');
  };
  return (
    <Card className="group relative overflow-hidden transition-all hover:-translate-y-1 hover:shadow-pop">
      <Link href={`/deal/${deal.slug}`} className="block" aria-label={`${deal.title} — ${deal.discountPercent}% off at ${deal.business.name}`}>
        <div className="relative h-44 overflow-hidden bg-gradient-to-br from-brand-50 to-slate-100">
          {deal.image ? (
            <Image src={deal.image} alt={deal.title} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw" className="object-cover transition group-hover:scale-105" />
          ) : (
            <div className="flex h-full items-center justify-center text-5xl" aria-hidden>🎟️</div>
          )}
          <div className="absolute left-3 top-3 flex flex-col gap-1.5">
            <span className="rounded-lg bg-error px-2.5 py-1 text-sm font-extrabold text-white shadow">{deal.discountPercent}% OFF</span>
            {deal.badges.slice(0, 2).map((b) => <Badge key={b} tone={badgeTone[b]}>{b}</Badge>)}
          </div>
          {deal.memberOnly && (
            <span className="absolute bottom-3 left-3 rounded-lg bg-ink/90 px-2 py-1 text-[11px] font-bold text-accent">👑 MEMBER DEAL</span>
          )}
        </div>
        <div className="p-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700" aria-hidden>
              {deal.business.name[0]}
            </span>
            <p className="truncate text-xs font-medium text-slate-500">
              {deal.business.name} {deal.business.verified && <span className="text-brand-600" title="Verified business">✓</span>}
            </p>
          </div>
          <h3 className="mt-2 line-clamp-2 font-bold text-ink group-hover:text-brand-700">{deal.title}</h3>
          <p className="mt-1 line-clamp-1 text-sm text-slate-500">{deal.shortDescription}</p>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
            <span>📍 {deal.area}, {deal.city}{deal.distanceKm !== undefined ? ` · ${deal.distanceKm} km` : ''}</span>
            <span className="font-medium text-error">Ends {new Date(deal.expiresAt).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}</span>
          </div>
        </div>
      </Link>
      <button onClick={toggleFav} aria-label={fav ? 'Remove from saved' : 'Save deal'} aria-pressed={fav}
        className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-lg shadow transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600">
        <span aria-hidden className={fav ? 'text-error' : 'text-slate-400'}>{fav ? '♥' : '♡'}</span>
      </button>
    </Card>
  );
}
