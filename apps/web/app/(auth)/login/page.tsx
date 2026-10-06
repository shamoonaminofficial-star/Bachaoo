'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Input, Card, useToast } from '@bachatly/ui';
import { loginSchema } from '@bachatly/validation';
import { useAuth, dashboardForRoles, SessionError } from '@/lib/auth';

function LoginPageInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const next = params.get('next') || '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = loginSchema.safeParse({ emailOrPhone: emailOrPhone.trim(), password });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.issues.forEach((i) => {
        errs[String(i.path[0])] = i.message;
      });
      setErrors(errs);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const { roles } = await login(parsed.data);
      toast('Welcome back!');
      const dest = next.startsWith('/') && !next.startsWith('//') ? next : dashboardForRoles(roles);
      router.replace(dest);
    } catch (err) {
      if (err instanceof SessionError) {
        if (err.code === 'INVALID_CREDENTIALS') {
          setErrors({ password: 'Invalid email/phone or password.' });
        } else if (err.code === 'ACCOUNT_SUSPENDED' || err.code === 'ACCOUNT_INACTIVE') {
          toast(err.message + ' Please contact support.', 'error');
        } else {
          toast(err.message, 'error');
        }
      } else {
        toast('Could not reach the server. Please try again.', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-6 md:p-8">
      <h1 className="text-2xl font-extrabold text-ink">Welcome back</h1>
      <p className="mt-1 text-sm text-slate-500">Log in to access your deals, vouchers and savings.</p>
      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <Input
          label="Email or phone"
          value={emailOrPhone}
          onChange={(e) => setEmailOrPhone(e.target.value)}
          error={errors.emailOrPhone}
          placeholder="you@example.com or 0300 1234567"
          autoComplete="username"
        />
        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          autoComplete="current-password"
        />
        <div className="text-right">
          <Link href="/forgot-password" className="text-sm font-semibold text-brand-700 hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" fullWidth size="lg" loading={loading || authLoading}>
          Log In
        </Button>
      </form>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={() => toast('Google sign-in is coming soon.', 'info')}>
          🔵 Google
        </Button>
        <Button variant="outline" onClick={() => toast('Apple sign-in is coming soon.', 'info')}>
          🍎 Apple
        </Button>
      </div>
      <p className="mt-6 text-center text-sm text-slate-500">
        New to Bachatly?{' '}
        <Link href={`/register${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold text-brand-700 hover:underline">
          Create an account
        </Link>
      </p>
      {isAuthenticated && (
        <p className="mt-3 text-center text-xs text-slate-400">You are already logged in.</p>
      )}
    </Card>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Loading…</div>}>
      <LoginPageInner />
    </React.Suspense>
  );
}
