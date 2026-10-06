'use client';
/**
 * AuthGuard — client-side gate for dashboard layouts.
 *
 * - Shows a skeleton while the session resolves (never a blank screen).
 * - Redirects unauthenticated users to /login?next=<path>.
 * - When `roles` is given, users without a matching role are sent to /403.
 * (Edge middleware enforces the same rules; this is defense-in-depth plus
 * loading UX.)
 */
import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Skeleton } from '@bachatly/ui';
import { useAuth } from '@/lib/auth';

function GuardSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-8" aria-busy="true" aria-label="Loading">
      <div className="mx-auto max-w-7xl">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="mt-4 h-64 rounded-2xl" />
      </div>
    </div>
  );
}

export default function AuthGuard({
  children,
  roles,
}: {
  children: React.ReactNode;
  roles?: string[];
}) {
  const { user, roles: userRoles, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const roleOk = !roles || roles.some((r) => userRoles.includes(r));

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    } else if (!roleOk) {
      router.replace('/403');
    }
  }, [isLoading, user, roleOk, router, pathname]);

  if (isLoading || !user || !roleOk) return <GuardSkeleton />;
  return <>{children}</>;
}
