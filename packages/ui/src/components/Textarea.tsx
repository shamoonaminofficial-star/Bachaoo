'use client';
import React from 'react';

export function Textarea({ label, error, id, className = '', ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; error?: string }) {
  const textareaId = id || `textarea-${label?.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div className="w-full">
      {label && <label htmlFor={textareaId} className="mb-1.5 block text-sm font-semibold text-ink">{label}</label>}
      <textarea id={textareaId} {...rest} aria-invalid={!!error} className={`w-full rounded-xl border bg-white px-4 py-2.5 text-sm outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-100 ${error ? 'border-error' : 'border-slate-300'} ${className}`} />
      {error && <p className="mt-1 text-xs text-error" role="alert">{error}</p>}
    </div>
  );
}
