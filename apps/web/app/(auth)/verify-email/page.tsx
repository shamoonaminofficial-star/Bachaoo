'use client';
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button, Card, useToast } from '@bachatly/ui';
import { api, ApiError } from '@/lib/api';

function VerifyEmailPageInner() {
  const params = useSearchParams();
  const { toast } = useToast();
  const [status, setStatus] = useState<'pending' | 'done' | 'error'>('pending');
  const token = params.get('token');
  const next = params.get('next') || '/account';

  useEffect(() => {
    if (!token) return;
    let alive = true;
    api('/auth/verify-email', { method: 'POST', auth: false, body: { token } })
      .then(() => {
        if (alive) {
          setStatus('done');
          toast('Email verified!');
        }
      })
      .catch((err) => {
        if (alive) {
          setStatus('error');
          if (err instanceof ApiError) toast(err.message, 'error');
        }
      });
    return () => {
      alive = false;
    };
  }, [token, toast]);

  return (
    <Card className="p-6 text-center md:p-8">
      <span className="text-5xl" aria-hidden>
        ✉️
      </span>
      <h1 className="mt-3 text-2xl font-extrabold text-ink">Verify your email</h1>
      {!token && status === 'pending' && (
        <>
          <p className="mt-2 text-sm text-slate-500">
            Your account is created and ready to use. We&apos;ll send a verification link to
            your email soon — meanwhile you can continue to your dashboard.
          </p>
          <div className="mt-6 flex gap-2">
            <Link href={next.startsWith('/') ? next : '/account'} className="flex-1">
              <Button fullWidth>Continue to Dashboard</Button>
            </Link>
            <Link href="/contact" className="flex-1">
              <Button variant="outline" fullWidth>
                Contact Support
              </Button>
            </Link>
          </div>
        </>
      )}
      {token && status === 'pending' && <p className="mt-2 text-sm text-slate-500">Verifying…</p>}
      {token && status === 'done' && (
        <>
          <p className="mt-2 text-sm text-slate-500">Your email is verified. Welcome aboard!</p>
          <Link href={next.startsWith('/') ? next : '/account'} className="mt-4 inline-block">
            <Button>Go to Dashboard</Button>
          </Link>
        </>
      )}
      {token && status === 'error' && (
        <p className="mt-2 text-sm text-error">
          This link is invalid or expired.{' '}
          <Link href="/contact" className="font-semibold underline">
            Contact support
          </Link>{' '}
          for a new one.
        </p>
      )}
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <React.Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Loading…</div>}>
      <VerifyEmailPageInner />
    </React.Suspense>
  );
}
