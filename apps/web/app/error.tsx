'use client';
import { useEffect } from 'react';
import { Button } from '@bachatly/ui';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100 text-3xl" aria-hidden>⚠️</div>
      <h1 className="mt-4 text-2xl font-bold text-ink">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-slate-500">We hit an unexpected error. Your data is safe — please try again.</p>
      <div className="mt-6 flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" onClick={() => (window.location.href = '/')}>Back to Home</Button>
      </div>
    </div>
  );
}
