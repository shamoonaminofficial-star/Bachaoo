'use client';
import React from 'react';

export function Tabs({ tabs, active, onChange }: { tabs: { id: string; label: string; badge?: number }[]; active: string; onChange: (id: string) => void }) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (e: React.KeyboardEvent, idx: number) => {
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = (idx + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next !== null) {
      e.preventDefault();
      onChange(tabs[next].id);
      refs.current[next]?.focus();
    }
  };

  return (
    <div className="flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist" aria-label="Sections">
      {tabs.map((t, i) => (
        <button key={t.id} ref={(el) => { refs.current[i] = el; }} role="tab" aria-selected={active === t.id}
          tabIndex={active === t.id ? 0 : -1}
          onClick={() => onChange(t.id)} onKeyDown={(e) => onKeyDown(e, i)}
          className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${active === t.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-ink'}`}>
          {t.label}
          {t.badge !== undefined && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-xs">{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}
