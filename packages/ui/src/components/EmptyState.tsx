import React from 'react';
import { Button } from './Button';

export function EmptyState({ icon = '🔍', title, description, actionLabel, onAction }: {
  icon?: string; title: string; description?: string; actionLabel?: string; onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-3xl" aria-hidden>{icon}</div>
      <h3 className="mt-4 text-lg font-bold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {actionLabel && <Button className="mt-5" onClick={onAction}>{actionLabel}</Button>}
    </div>
  );
}
