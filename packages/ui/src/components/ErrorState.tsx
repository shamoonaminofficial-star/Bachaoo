'use client';
import React from 'react';
import { Button } from './Button';

export function ErrorState({ title = 'Something went wrong', description, message, onRetry }: {
  title?: string; description?: string; message?: string; onRetry?: () => void | Promise<void>;
}) {
  const text = description ?? message ?? 'We could not load this right now. Please try again.';
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-red-100 bg-red-50/50 px-6 py-14 text-center" role="alert">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100 text-3xl" aria-hidden>⚠️</div>
      <h3 className="mt-4 text-lg font-bold text-ink">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{text}</p>
      {onRetry && <Button className="mt-5" variant="outline" onClick={onRetry}>Try again</Button>}
    </div>
  );
}
