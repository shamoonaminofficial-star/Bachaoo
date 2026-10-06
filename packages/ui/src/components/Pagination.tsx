'use client';
import React from 'react';

export function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  const nums = Array.from({ length: totalPages }, (_, i) => i + 1).filter((n) => n === 1 || n === totalPages || Math.abs(n - page) <= 1);
  return (
    <nav className="flex items-center justify-center gap-1.5" aria-label="Pagination">
      <button disabled={page <= 1} onClick={() => onChange(page - 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium disabled:opacity-40 hover:bg-slate-50" aria-label="Previous page">‹</button>
      {nums.map((n, i) => (
        <React.Fragment key={n}>
          {i > 0 && nums[i - 1] !== n - 1 && <span className="text-slate-400">…</span>}
          <button onClick={() => onChange(n)} aria-current={n === page ? 'page' : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${n === page ? 'bg-brand-600 text-white' : 'border border-slate-200 hover:bg-slate-50'}`}>{n}</button>
        </React.Fragment>
      ))}
      <button disabled={page >= totalPages} onClick={() => onChange(page + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium disabled:opacity-40 hover:bg-slate-50" aria-label="Next page">›</button>
    </nav>
  );
}
