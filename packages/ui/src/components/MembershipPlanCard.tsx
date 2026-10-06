'use client';
import React from 'react';
import type { MembershipPlan } from '../types';
import { Card } from './Card';
import { Button } from './Button';
import { Badge } from './Badge';

export function formatPKR(n: number) {
  return 'Rs. ' + Math.round(n).toLocaleString('en-PK');
}

export function MembershipPlanCard({ plan, onSelect, ctaLabel = 'Get Membership' }: {
  plan: MembershipPlan; onSelect?: (plan: MembershipPlan) => void; ctaLabel?: string;
}) {
  const discount = plan.regularPrice > plan.salePrice ? Math.round((1 - plan.salePrice / plan.regularPrice) * 100) : 0;
  return (
    <Card className={`relative flex flex-col p-6 transition hover:-translate-y-1 hover:shadow-pop ${plan.featured ? 'border-2 border-brand-600' : ''}`}>
      {plan.featured && <div className="absolute -top-3 left-1/2 -translate-x-1/2"><Badge tone="brand">★ MOST POPULAR</Badge></div>}
      <h3 className="text-xl font-extrabold text-ink">{plan.name}</h3>
      <p className="mt-1 text-sm text-slate-500">{plan.description}</p>
      <div className="mt-4 flex items-end gap-2">
        <span className="text-3xl font-extrabold text-brand-700">{formatPKR(plan.salePrice)}</span>
        {discount > 0 && <>
          <span className="text-sm text-slate-400 line-through">{formatPKR(plan.regularPrice)}</span>
          <Badge tone="success">Save {discount}%</Badge>
        </>}
      </div>
      <p className="mt-1 text-xs text-slate-500">{plan.durationMonths} months · {plan.cashbackPercent}% cashback · {plan.rewardMultiplier}× reward points</p>
      <ul className="mt-4 flex-1 space-y-2">
        {plan.benefits.map((b) => (
          <li key={b} className="flex items-start gap-2 text-sm text-slate-600">
            <span className="mt-0.5 text-success" aria-hidden>✓</span>{b}
          </li>
        ))}
      </ul>
      <Button className="mt-6" variant={plan.featured ? 'primary' : 'outline'} fullWidth onClick={() => onSelect?.(plan)}>{ctaLabel}</Button>
    </Card>
  );
}
