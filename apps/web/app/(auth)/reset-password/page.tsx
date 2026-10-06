'use client';
import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button, Input, Card, useToast } from '@bachatly/ui';
import { passwordSchema } from '@bachatly/validation';
import { api, ApiError } from '@/lib/api';

/**
 * Reset password. NOTE: the backend DTO exists but the endpoint is not
 * implemented yet — on 404 we show an honest "not available" state instead
 * of faking success.
 */
function ResetPasswordPageInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const token = params.get('token') || '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const pwParsed = passwordSchema.safeParse(pw);
    if (!pwParsed.success) errs.pw = pwParsed.error.issues[0]?.message || 'Invalid password.';
    if (pw !== pw2) errs.pw2 = 'Passwords do not match.';
    if (!token) errs.token = 'This reset link is missing its token.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    try {
      await api('/auth/reset-password', { method: 'POST', auth: false, body: { token, password: pw } });
      toast('Password reset successfully. Please log in.');
      router.replace('/login');
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setUnavailable(true);
      } else {
        toast(err instanceof ApiError ? err.message : 'Could not reach the server.', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-6 md:p-8">
      <h1 className="text-2xl font-extrabold text-ink">Set a new password</h1>
      {unavailable ? (
        <div className="mt-4 text-sm text-slate-600">
          <p>
            Password reset isn&apos;t available on this server yet. Please contact our support
            team and we&apos;ll help you recover your account.
          </p>
          <div className="mt-4 flex gap-2">
            <Link href="/contact" className="flex-1">
              <Button fullWidth>Contact Support</Button>
            </Link>
            <Link href="/login" className="flex-1">
              <Button variant="outline" fullWidth>
                Back to login
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          {errors.token && (
            <p className="rounded-xl bg-red-50 p-3 text-sm text-error" role="alert">
              {errors.token} <Link href="/forgot-password" className="font-semibold underline">Request a new link</Link>.
            </p>
          )}
          <Input label="New password" type="password" value={pw} onChange={(e) => setPw(e.target.value)} error={errors.pw} hint="Minimum 8 characters, with a letter and a number." autoComplete="new-password" />
          <Input label="Confirm password" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} error={errors.pw2} autoComplete="new-password" />
          <Button type="submit" fullWidth loading={loading}>
            Reset Password
          </Button>
        </form>
      )}
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <React.Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Loading…</div>}>
      <ResetPasswordPageInner />
    </React.Suspense>
  );
}
