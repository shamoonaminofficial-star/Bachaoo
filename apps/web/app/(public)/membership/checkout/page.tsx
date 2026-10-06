'use client';
import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { SkeletonCard } from '@bachatly/ui';

function RedirectInner() {
  const params = useSearchParams();
  useEffect(() => {
    const plan = params.get('plan');
    window.location.replace(plan ? `/membership/checkout/${plan}` : '/membership');
  }, [params]);
  return null;
}

/** Legacy query-param route (?plan=ID) — forwards to /membership/checkout/[planId]. */
export default function CheckoutRedirect() {
  return (
    <Suspense>
      <div className="mx-auto max-w-3xl px-4 py-6"><SkeletonCard /></div>
      <RedirectInner />
    </Suspense>
  );
}
