'use client';
import React from 'react';

export function FileUpload({ label, accept = 'image/*', onSelect, hint }: {
  label: string; accept?: string; onSelect: (f: File) => void; hint?: string;
}) {
  const [name, setName] = React.useState('');
  return (
    <div>
      <span className="mb-1.5 block text-sm font-semibold text-ink">{label}</span>
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500 transition hover:border-brand-500 hover:bg-brand-50">
        <span aria-hidden>📎</span>
        <span>{name || 'Choose a file…'}</span>
        <input type="file" accept={accept} className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setName(f.name); onSelect(f); } }} />
      </label>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
