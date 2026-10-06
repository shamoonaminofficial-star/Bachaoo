import React from 'react';

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/80 ${className}`} aria-hidden />;
}

export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-card" aria-label="Loading">
      <Skeleton className="h-40 w-full !rounded-xl" />
      <Skeleton className="mt-3 h-5 w-3/4" />
      <Skeleton className="mt-2 h-4 w-1/2" />
      <div className="mt-3 flex gap-2"><Skeleton className="h-8 w-20" /><Skeleton className="h-8 w-20" /></div>
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white" aria-label="Loading table">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3 border-b border-slate-50 p-4 last:border-0">
          {Array.from({ length: cols }).map((_, c) => <Skeleton key={c} className="h-4 flex-1" />)}
        </div>
      ))}
    </div>
  );
}
