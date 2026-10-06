'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { Button, Input, Card, useToast } from '@bachatly/ui';
import { api, ApiError } from '@/lib/api';

/**
 * Forgot password. NOTE: the backend DTO exists but the endpoint is not
 * implemented yet — if the API 404s we show an honest "not available" state
 * with a support link instead of faking success.
 */
export default function ForgotPasswordPage() {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await api('/auth/forgot-password', { method: 'POST', auth: false, body: { email: email.trim() } });
      setSent(true);
      toast('Reset link sent if the account exists.');
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // Endpoint not implemented on the backend yet — be honest about it.
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
      <h1 className="text-2xl font-extrabold text-ink">Forgot password?</h1>
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
      ) : sent ? (
        <div className="mt-4 text-sm text-slate-600">
          <p>
            We&apos;ve sent a password reset link to <strong>{email}</strong> (if the account
            exists). It expires in 30 minutes.
          </p>
          <Link href="/login" className="mt-4 inline-block font-semibold text-brand-700 hover:underline">
            Back to login
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          <p className="text-sm text-slate-500">Enter your account email and we&apos;ll send you a reset link.</p>
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={error} placeholder="you@example.com" autoComplete="email" />
          <Button type="submit" fullWidth loading={loading}>
            Send Reset Link
          </Button>
          <p className="text-center text-sm">
            <Link href="/login" className="font-semibold text-brand-700 hover:underline">
              Back to login
            </Link>
          </p>
        </form>
      )}
    </Card>
  );
}
