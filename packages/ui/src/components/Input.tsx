'use client';
import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Input({ label, error, hint, id, className = '', ...rest }: InputProps) {
  const inputId = id || `input-${label?.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div className="w-full">
      {label && <label htmlFor={inputId} className="mb-1.5 block text-sm font-semibold text-ink">{label}</label>}
      <input
        id={inputId}
        {...rest}
        aria-invalid={!!error}
        className={`w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-ink placeholder:text-slate-400 outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-100 ${error ? 'border-error' : 'border-slate-300'} ${className}`}
      />
      {error ? <p className="mt-1 text-xs text-error" role="alert">{error}</p> : hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
