'use client';
import React from 'react';

export function Rating({ value, count, size = 'sm', interactive, onRate }: {
  value: number; count?: number; size?: 'sm' | 'md'; interactive?: boolean; onRate?: (v: number) => void;
}) {
  const [hover, setHover] = React.useState(0);
  const cls = size === 'sm' ? 'text-sm' : 'text-xl';
  return (
    <span className={`inline-flex items-center gap-0.5 ${cls}`} role={interactive ? 'radiogroup' : 'img'} aria-label={`Rated ${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((s) => (
        <button key={s} type="button" disabled={!interactive} onClick={() => onRate?.(s)}
          onMouseEnter={() => interactive && setHover(s)} onMouseLeave={() => interactive && setHover(0)}
          className={interactive ? 'cursor-pointer' : 'cursor-default'} aria-label={interactive ? `Rate ${s} stars` : undefined}>
          <span className={(hover || value) >= s ? 'text-amber-400' : 'text-slate-300'}>★</span>
        </button>
      ))}
      {count !== undefined && <span className="ml-1 text-xs text-slate-500">({count})</span>}
    </span>
  );
}
