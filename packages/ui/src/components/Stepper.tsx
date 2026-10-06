import React from 'react';

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex items-center" aria-label="Progress">
      {steps.map((s, i) => (
        <li key={s} className={`flex items-center ${i < steps.length - 1 ? 'flex-1' : ''}`}>
          <div className="flex items-center gap-2">
            <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${i < current ? 'bg-brand-600 text-white' : i === current ? 'bg-brand-600 text-white ring-4 ring-brand-100' : 'bg-slate-200 text-slate-500'}`}>
              {i < current ? '✓' : i + 1}
            </span>
            <span className={`hidden sm:block text-sm font-medium ${i <= current ? 'text-ink' : 'text-slate-400'}`}>{s}</span>
          </div>
          {i < steps.length - 1 && <div className={`mx-3 h-0.5 flex-1 ${i < current ? 'bg-brand-600' : 'bg-slate-200'}`} />}
        </li>
      ))}
    </ol>
  );
}
