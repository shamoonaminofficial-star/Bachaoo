'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Card, Badge, Accordion, SkeletonCard, Breadcrumbs, useToast, Stepper, EmptyState } from '@bachatly/ui';
import { ApiError, withSeedFallback, getToken } from '@/lib/api';
import { fetchPlans, fetchMyMembership, type ApiPlan, type MyMembership } from '@/lib/memberships';
import { SEED_PLANS } from '@/lib/seed';
import { formatPKR } from '@/lib/format';
import type { MembershipPlan } from '@bachatly/ui';

function seedToApiPlan(p: MembershipPlan): ApiPlan {
  return {
    id: p.id, slug: p.id, name: p.name, description: p.description,
    regularPrice: p.regularPrice, salePrice: p.salePrice,
    regularPricePaisa: Math.round(p.regularPrice * 100), salePricePaisa: Math.round(p.salePrice * 100),
    durationDays: Math.round(p.durationMonths * 30),
    benefits: p.benefits,
    rewardMultiplierBps: Math.round(p.rewardMultiplier * 10000),
    cashbackPercent: p.cashbackPercent,
    isFeatured: p.featured, isActive: p.active,
  };
}

function PlanCard({ plan, onSelect }: { plan: ApiPlan; onSelect: (p: ApiPlan) => void }) {
  const months = Math.round(plan.durationDays / 30);
  return (
    <Card className={`relative p-6 ${plan.isFeatured ? 'ring-2 ring-brand-600 shadow-pop' : ''}`}>
      {plan.isFeatured && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-4 py-1 text-xs font-extrabold uppercase tracking-wide text-white">Most Popular</span>
      )}
      <h3 className="text-lg font-extrabold text-ink">{plan.name}</h3>
      <p className="mt-1 text-sm text-slate-500">{plan.description}</p>
      <p className="mt-3 text-3xl font-extrabold text-brand-700">
        {formatPKR(plan.salePrice)}
        {plan.regularPrice > plan.salePrice && (
          <span className="ml-2 text-base font-normal text-slate-400 line-through">{formatPKR(plan.regularPrice)}</span>
        )}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        {months} month{months > 1 ? 's' : ''} ({plan.durationDays} days) · {plan.cashbackPercent}% cashback · {(plan.rewardMultiplierBps / 10000).toFixed(plan.rewardMultiplierBps % 10000 === 0 ? 0 : 1)}× points
      </p>
      <ul className="mt-4 space-y-2">
        {plan.benefits.map((b, i) => (
          <li key={i} className="flex gap-2 text-sm text-slate-600"><span className="text-success" aria-hidden>✓</span>{b}</li>
        ))}
      </ul>
      <Button className="mt-5 w-full" variant={plan.isFeatured ? 'primary' : 'outline'} onClick={() => onSelect(plan)}>
        Get {plan.name}
      </Button>
    </Card>
  );
}

export default function MembershipPage() {
  const { toast } = useToast();
  const [plans, setPlans] = useState<ApiPlan[] | null>(null);
  const [mine, setMine] = useState<MyMembership | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    withSeedFallback(
      () => fetchPlans(),
      SEED_PLANS.filter((p) => p.active).map(seedToApiPlan),
      'plans',
    ).then(setPlans).catch(() => setError(true));
    // Active-membership state — guests get null (401 is expected, not an error).
    fetchMyMembership().then(setMine).catch(() => setMine(null));
  }, []);

  const choose = (plan: ApiPlan) => {
    if (!getToken()) { window.location.href = `/login?next=${encodeURIComponent(`/membership/checkout/${plan.id}`)}`; return; }
    window.location.href = `/membership/checkout/${plan.id}`;
  };

  const active = mine && mine.status === 'active';

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Membership' }]} />
      <div className="mt-4 rounded-3xl bg-ink p-8 text-center text-white md:p-12">
        <p className="text-sm font-bold uppercase tracking-widest text-accent">Bachatly Membership</p>
        <h1 className="mx-auto mt-3 max-w-2xl text-3xl font-extrabold md:text-5xl">One membership. Savings everywhere you go.</h1>
        <p className="mx-auto mt-4 max-w-xl text-slate-300">Unlock exclusive member-only deals, earn reward points and cashback, and track every rupee you save — across hundreds of partner businesses in Pakistan.</p>
        <div className="mt-6"><Stepper steps={['Choose plan', 'Pay securely', 'Start saving']} current={0} /></div>
      </div>

      {active && (
        <Card className="mt-6 border-success/40 bg-success/5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-extrabold text-ink">You are a {mine.plan.name} member <Badge tone="success">Active</Badge></p>
              <p className="mt-1 text-sm text-slate-500">
                Valid until {new Date(mine.endDate).toLocaleDateString('en-PK', { day: 'numeric', month: 'long', year: 'numeric' })}
                {mine.daysRemaining > 0 && ` · ${mine.daysRemaining} days remaining`}
              </p>
            </div>
            <Link href="/account/membership"><Button variant="outline">Manage Membership</Button></Link>
          </div>
        </Card>
      )}

      <h2 className="mt-10 text-2xl font-extrabold text-ink">Choose your plan</h2>
      {!plans && !error ? (
        <div className="mt-5 grid gap-5 md:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}</div>
      ) : error || !plans?.length ? (
        <EmptyState icon="🎫" title="Plans unavailable right now" description="Please try again in a moment." />
      ) : (
        <div className="mt-5 grid gap-5 md:grid-cols-3">
          {plans.filter((p) => p.isActive).map((p) => <PlanCard key={p.id} plan={p} onSelect={choose} />)}
        </div>
      )}

      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {[
          { t: 'Member-only deals', d: 'Unlock EXCLUSIVE and MEMBERS ONLY badge deals hidden from guests.', i: '🔒' },
          { t: 'Rewards & cashback', d: 'Earn points on every redemption and cashback straight to your wallet.', i: '🎁' },
          { t: 'Savings tracking', d: 'See exactly how much you have saved — by month, year and category.', i: '📊' },
        ].map((b) => (
          <Card key={b.t} className="p-5"><span className="text-3xl" aria-hidden>{b.i}</span><h3 className="mt-2 font-bold text-ink">{b.t}</h3><p className="mt-1 text-sm text-slate-500">{b.d}</p></Card>
        ))}
      </div>

      <h2 className="mt-12 text-2xl font-extrabold text-ink">Frequently asked questions</h2>
      <div className="mt-4 max-w-3xl">
        <Accordion items={[
          { title: 'How do I use my membership at a business?', content: 'Open your digital membership card in the app, tap Redeem on the deal, and show the QR code to the cashier. They scan it, enter your bill, and your discount is applied instantly.' },
          { title: 'Where can I use my membership?', content: 'At all participating Bachatly partner businesses across Pakistan. Look for the member badge on deals, or filter the directory by member discounts.' },
          { title: 'Can I cancel or get a refund?', content: 'Memberships can be cancelled from your account. Refunds follow our Refund Policy — see the footer link for details.' },
          { title: 'How do reward points work?', content: 'You earn points on membership purchase, redemptions and referrals. Points can be exchanged for vouchers and perks in the Rewards marketplace.' },
        ]} />
      </div>
      {!active && (
        <div className="mt-10 text-center">
          <Button size="lg" onClick={() => { window.scrollTo({ top: 0, behavior: 'smooth' }); toast('Pick a plan above to get started.', 'info'); }}>Become a Member</Button>
        </div>
      )}
    </div>
  );
}
