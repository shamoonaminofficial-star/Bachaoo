'use client';
import React from 'react';

export function Select({ label, error, options, id, className = '', ...rest }: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string; error?: string; options: { value: string; label: string }[] }) {
  const selectId = id || `select-${label?.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div className="w-full">
      {label && <label htmlFor={selectId} className="mb-1.5 block text-sm font-semibold text-ink">{label}</label>}
      <select id={selectId} {...rest} className={`w-full rounded-xl border bg-white px-4 py-2.5 text-sm outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-100 ${error ? 'border-error' : 'border-slate-300'} ${className}`}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error && <p className="mt-1 text-xs text-error" role="alert">{error}</p>}
    </div>
  );
}
