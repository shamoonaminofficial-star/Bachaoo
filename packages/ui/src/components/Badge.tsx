import React from 'react';

export type BadgeTone = 'success' | 'warning' | 'warn' | 'error' | 'info' | 'neutral' | 'brand' | 'accent';

const tones: Record<BadgeTone, string> = {
  success: 'bg-green-50 text-green-700 border-green-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  warn: 'bg-amber-50 text-amber-700 border-amber-200',
  error: 'bg-red-50 text-red-700 border-red-200',
  info: 'bg-blue-50 text-blue-700 border-blue-200',
  neutral: 'bg-slate-100 text-slate-600 border-slate-200',
  brand: 'bg-brand-50 text-brand-700 border-brand-200',
  accent: 'bg-accent-soft text-amber-800 border-amber-200',
};

/** Status badge: never color-only — always carries text and optional icon. */
export function Badge({ tone = 'neutral', icon, children, className = '' }: { tone?: BadgeTone; icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tones[tone]} ${className}`}>
      {icon}
      {children}
    </span>
  );
}

export const statusTone: Record<string, BadgeTone> = {
  active: 'success', approved: 'success', available: 'success', paid: 'success', resolved: 'success', published: 'success',
  pending: 'warning', submitted: 'warning', awaiting: 'warning', in_progress: 'warning', scheduled: 'warning',
  pending_approval: 'warning', changes_requested: 'info',
  expired: 'neutral', cancelled: 'neutral', closed: 'neutral', rejected: 'error', failed: 'error', suspended: 'error',
  draft: 'neutral', paused: 'warning', new: 'info', trending: 'accent', popular: 'accent', exclusive: 'brand',
};
