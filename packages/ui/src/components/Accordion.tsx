'use client';
import React from 'react';

export function Accordion({ items }: { items: { title: string; content: React.ReactNode }[] }) {
  const [open, setOpen] = React.useState<number | null>(0);
  return (
    <div className="divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-white">
      {items.map((it, i) => (
        <div key={i}>
          <button onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}
            className="flex w-full items-center justify-between px-5 py-4 text-left font-semibold text-ink hover:bg-slate-50">
            {it.title}
            <span className={`text-slate-400 transition-transform ${open === i ? 'rotate-180' : ''}`}>▾</span>
          </button>
          {open === i && <div className="px-5 pb-5 text-sm text-slate-600">{it.content}</div>}
        </div>
      ))}
    </div>
  );
}
