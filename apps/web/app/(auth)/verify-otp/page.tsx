'use client';
import React, { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, Input, useToast } from '@bachatly/ui';
import { otpVerifySchema, pakistanPhoneRegex } from '@bachatly/validation';
import { api, ApiError } from '@/lib/api';

function VerifyOtpPageInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const [phone, setPhone] = useState(params.get('phone') || '');
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const next = params.get('next') || '/account';

  const setDigit = (i: number, v: string) => {
    const d = v.replace(/\D/g, '').slice(-1);
    setDigits((prev) => {
      const n = [...prev];
      n[i] = d;
      return n;
    });
    if (d && i < 5) refs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus();
  };

  const resend = async () => {
    if (!pakistanPhoneRegex.test(phone.trim())) {
      toast('Enter your registered phone number first.', 'error');
      return;
    }
    setResending(true);
    try {
      await api('/auth/otp/request', { method: 'POST', auth: false, body: { phone: phone.trim() } });
      toast('A new code was sent via SMS.');
      setCooldown(60);
      const t = setInterval(() => {
        setCooldown((c) => {
          if (c <= 1) {
            clearInterval(t);
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not send the code. Try again.', 'error');
    } finally {
      setResending(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = digits.join('');
    const parsed = otpVerifySchema.safeParse({ phone: phone.trim(), code });
    if (!parsed.success) {
      toast(parsed.error.issues[0]?.message || 'Enter the 6-digit code.', 'error');
      return;
    }
    setLoading(true);
    try {
      await api('/auth/otp/verify', { method: 'POST', auth: false, body: parsed.data });
      toast('Phone number verified!');
      router.replace(next.startsWith('/') ? next : '/account');
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'OTP_INVALID' || err.code === 'OTP_EXPIRED')) {
        toast(err.message, 'error');
      } else {
        toast(err instanceof ApiError ? err.message : 'Verification failed. Try again.', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-6 md:p-8">
      <h1 className="text-2xl font-extrabold text-ink">Verify your phone</h1>
      <p className="mt-1 text-sm text-slate-500">
        Enter the 6-digit code we sent via SMS. <span className="text-xs">(Max 5 requests per hour)</span>
      </p>
      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <Input
          label="Phone number"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="0300 1234567"
          autoComplete="tel"
        />
        <div>
          <div className="flex justify-center gap-2" role="group" aria-label="One-time code">
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                value={d}
                onChange={(e) => setDigit(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                inputMode="numeric"
                maxLength={1}
                aria-label={`Digit ${i + 1}`}
                className="h-12 w-12 rounded-xl border border-slate-300 text-center text-xl font-bold outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
              />
            ))}
          </div>
        </div>
        <Button type="submit" fullWidth loading={loading}>
          Verify
        </Button>
        <button
          type="button"
          onClick={resend}
          disabled={resending || cooldown > 0}
          className="w-full text-sm font-semibold text-brand-700 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
        >
          {cooldown > 0 ? `Resend code in ${cooldown}s` : resending ? 'Sending…' : 'Resend code'}
        </button>
        <p className="text-center text-sm text-slate-500">
          <Link href="/login" className="font-semibold text-brand-700 hover:underline">
            Back to login
          </Link>
        </p>
      </form>
    </Card>
  );
}

export default function VerifyOtpPage() {
  return (
    <React.Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Loading…</div>}>
      <VerifyOtpPageInner />
    </React.Suspense>
  );
}
