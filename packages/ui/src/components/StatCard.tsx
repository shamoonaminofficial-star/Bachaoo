import React from 'react';
import { Card } from './Card';

export function StatCard({ label, value, icon, delta, deltaUp, sub }: {
  label: string; value: string; icon?: string; delta?: string; deltaUp?: boolean; sub?: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-extrabold text-ink">{value}</p>
          {delta && <p className={`mt-1 text-xs font-semibold ${deltaUp ? 'text-success' : 'text-error'}`}>{deltaUp ? '▲' : '▼'} {delta}</p>}
          {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
        </div>
        {icon && <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-2xl" aria-hidden>{icon}</div>}
      </div>
    </Card>
  );
}
