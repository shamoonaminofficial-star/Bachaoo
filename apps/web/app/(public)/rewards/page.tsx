'use client';
import React, { useEffect, useState } from 'react';
import { Button, Card, Badge, SkeletonCard, EmptyState, Breadcrumbs, useToast } from '@bachatly/ui';
import { api, withSeedFallback, getToken } from '@/lib/api';
import { SEED_VOUCHERS } from '@/lib/seed';
import { formatPKR } from '@/lib/format';

interface RewardItem { id: string; title: string; business: string; points: number; kind: string; }

const SEED_REWARDS: RewardItem[] = [
  { id: 'rw1', title: 'Rs. 500 Grocery Voucher', business: 'FreshMart Daily', points: 500, kind: 'Voucher' },
  { id: 'rw2', title: 'Free Large Pizza', business: 'Urban Slice', points: 1200, kind: 'Voucher' },
  { id: 'rw3', title: 'Free Dessert Voucher', business: 'Bean Theory Café', points: 300, kind: 'Voucher' },
  { id: 'rw4', title: 'Rs. 1,000 Fashion Coupon', business: 'ThreadLine Studio', points: 1000, kind: 'Coupon' },
];

export default function RewardsMarketplacePage() {
  const { toast } = useToast();
  const [items, setItems] = useState<RewardItem[] | null>(null);
  const [balance] = useState(1250);

  useEffect(() => {
    withSeedFallback(() => api<RewardItem[]>('/rewards/marketplace'), SEED_REWARDS, 'rewards').then(setItems);
  }, []);

  const redeem = (r: RewardItem) => {
    if (!getToken()) { window.location.href = '/login?next=/rewards'; return; }
    if (balance < r.points) { toast(`You need ${r.points - balance} more points for this reward.`, 'warning'); return; }
    toast(`Redeemed "${r.title}"! Check My Vouchers.`);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Rewards' }]} />
      <div className="mt-4 flex flex-col gap-4 rounded-3xl bg-gradient-to-r from-brand-700 to-brand-600 p-6 text-white md:flex-row md:items-center md:p-8">
        <div className="flex-1">
          <h1 className="text-3xl font-extrabold">Rewards Marketplace</h1>
          <p className="mt-1 text-brand-100">Exchange your points for vouchers, coupons and perks.</p>
        </div>
        <Card className="p-4 text-center"><p className="text-xs font-semibold uppercase text-slate-500">Your points</p><p className="text-3xl font-extrabold text-brand-700">⭐ {balance.toLocaleString()}</p></Card>
      </div>
      <h2 className="mt-8 text-xl font-extrabold text-ink">How to earn points</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[['Membership purchase', 'Up to 500 pts'], ['Every redemption', '1–3× points'], ['Referrals', '250 pts each'], ['Promotions', 'Bonus drops']].map(([t, d]) => (
          <Card key={t} className="p-4"><p className="font-bold text-ink">{t}</p><p className="text-sm text-slate-500">{d}</p></Card>
        ))}
      </div>
      <h2 className="mt-8 text-xl font-extrabold text-ink">Exchange points</h2>
      {!items ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>
      ) : items.length === 0 ? (
        <div className="mt-4"><EmptyState icon="🎁" title="No rewards available" /></div>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((r) => (
            <Card key={r.id} className="flex flex-col p-5">
              <Badge tone="accent">{r.kind}</Badge>
              <h3 className="mt-2 font-bold text-ink">{r.title}</h3>
              <p className="text-sm text-slate-500">{r.business}</p>
              <p className="mt-3 text-lg font-extrabold text-brand-700">⭐ {r.points.toLocaleString()} pts</p>
              <Button className="mt-3" variant={balance >= r.points ? 'primary' : 'outline'} onClick={() => redeem(r)}>Redeem</Button>
            </Card>
          ))}
        </div>
      )}
      <p className="mt-6 text-xs text-slate-400">Points balances and the rewards catalogue are illustrative in this demo build; the live API is the source of truth.</p>
    </div>
  );
}
