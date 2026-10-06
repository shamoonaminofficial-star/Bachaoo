'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { z } from 'zod';
import { Button, Input, Card, useToast, Skeleton } from '@bachatly/ui';
import { pakistanPhoneRegex, passwordSchema } from '@bachatly/validation';
import { useAuth, SessionError } from '@/lib/auth';
import { fetchCities } from '@/lib/catalog';
import { CITIES } from '@/lib/seed';

const registerFormSchema = z.object({
  firstName: z.string().trim().min(2, 'First name is too short'),
  lastName: z.string().trim().min(2, 'Last name is too short'),
  email: z.string().trim().email('Enter a valid email address'),
  phone: z.string().trim().regex(pakistanPhoneRegex, 'Enter a valid Pakistani mobile number (03XXXXXXXXX)'),
  password: passwordSchema,
  referralCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{4,20}$/, 'Referral code looks invalid')
    .optional()
    .or(z.literal('')),
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: 'You must agree to the Terms & Conditions.' }),
  }),
});

interface CityOption {
  id?: string;
  name: string;
}

/** Normalize +92/92 prefixes to the 03XXXXXXXXX form the API expects. */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/[\s-]/g, '');
  if (/^\+92/.test(digits)) return '0' + digits.slice(3);
  if (/^92/.test(digits) && digits.length === 12) return '0' + digits.slice(2);
  return digits;
}

function RegisterPageInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const { register } = useAuth();
  const [f, setF] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    password: '',
    city: '',
    referralCode: '',
    acceptTerms: false as boolean,
  });
  const [cities, setCities] = useState<CityOption[] | null>(null);
  const [citySearch, setCitySearch] = useState('');
  const [cityOpen, setCityOpen] = useState(false);
  const [cityLoading, setCityLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const next = params.get('next') || '/account';

  const loadCities = async (search: string, initial = false) => {
    if (initial) setCityLoading(true);
    try {
      const list = await fetchCities(search);
      if (list.length) {
        setCities(list.map((c) => ({ id: c.id, name: c.name })));
        if (initial) {
          const def = list.find((c) => c.isDefault) || list[0];
          setF((v) => (v.city ? v : { ...v, city: def.name }));
        }
      } else if (initial) {
        setCities(CITIES.map((name) => ({ name })));
        setF((v) => (v.city ? v : { ...v, city: CITIES[0] }));
      }
    } catch {
      if (initial) {
        setCities(CITIES.map((name) => ({ name })));
        setF((v) => (v.city ? v : { ...v, city: CITIES[0] }));
      }
    } finally {
      if (initial) setCityLoading(false);
    }
  };

  useEffect(() => { loadCities('', true); }, []);
  useEffect(() => {
    if (!cityOpen) return;
    const t = setTimeout(() => loadCities(citySearch.trim()), 300);
    return () => clearTimeout(t);
  }, [citySearch, cityOpen]);

  const set =
    (k: keyof typeof f) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setF((v) => ({
        ...v,
        [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value,
      }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const phone = normalizePhone(f.phone);
    const parsed = registerFormSchema.safeParse({ ...f, phone });
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
      const city = cities?.find((c) => c.name === f.city);
      await register({
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        email: parsed.data.email,
        phone: parsed.data.phone,
        password: parsed.data.password,
        ...(city?.id ? { cityId: city.id } : {}),
        acceptTerms: true,
        ...(parsed.data.referralCode ? { referralCode: parsed.data.referralCode.toUpperCase() } : {}),
      });
      toast('Account created! Please verify your email.');
      router.replace(`/verify-email?phone=${encodeURIComponent(parsed.data.phone)}&next=${encodeURIComponent(next)}`);
    } catch (err) {
      if (err instanceof SessionError && err.fields) setErrors(err.fields);
      else if (err instanceof SessionError && err.code === 'EMAIL_OR_PHONE_TAKEN') {
        setErrors({ email: 'This email or phone number is already registered.' });
      } else if (err instanceof SessionError) toast(err.message, 'error');
      else toast('Could not reach the server. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-6 md:p-8">
      <h1 className="text-2xl font-extrabold text-ink">Create your account</h1>
      <p className="mt-1 text-sm text-slate-500">Start saving in under two minutes.</p>
      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <Input label="First name *" value={f.firstName} onChange={set('firstName')} error={errors.firstName} autoComplete="given-name" />
          <Input label="Last name *" value={f.lastName} onChange={set('lastName')} error={errors.lastName} autoComplete="family-name" />
        </div>
        <Input label="Phone *" type="tel" value={f.phone} onChange={set('phone')} error={errors.phone} placeholder="0300 1234567" autoComplete="tel" />
        <Input label="Email *" type="email" value={f.email} onChange={set('email')} error={errors.email} autoComplete="email" />
        <Input label="Password *" type="password" value={f.password} onChange={set('password')} error={errors.password} hint="Minimum 8 characters, with a letter and a number." autoComplete="new-password" />
        {cityLoading || !cities ? (
          <div aria-label="Loading cities">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="mt-1 h-11 w-full !rounded-xl" />
          </div>
        ) : (
          <div className="relative">
            <label className="mb-1.5 block text-sm font-semibold text-ink" htmlFor="city-search">City</label>
            <input
              id="city-search"
              value={cityOpen ? citySearch : f.city}
              onChange={(e) => { setCitySearch(e.target.value); if (!cityOpen) setCityOpen(true); }}
              onFocus={() => { setCitySearch(''); setCityOpen(true); }}
              onBlur={() => setTimeout(() => setCityOpen(false), 150)}
              placeholder="Search your city…"
              autoComplete="address-level2"
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              role="combobox" aria-expanded={cityOpen} aria-controls="city-listbox" aria-autocomplete="list"
            />
            {cityOpen && (
              <ul id="city-listbox" role="listbox" className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-pop">
                {cities.length === 0 && <li className="px-3.5 py-2 text-sm text-slate-400">No cities found.</li>}
                {cities.map((c) => (
                  <li key={c.name} role="option" aria-selected={c.name === f.city}>
                    <button type="button" className={`w-full px-3.5 py-2 text-left text-sm hover:bg-brand-50 ${c.name === f.city ? 'font-semibold text-brand-700' : 'text-ink'}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { setF((v) => ({ ...v, city: c.name })); setCityOpen(false); }}>
                      {c.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <Input label="Referral code (optional)" value={f.referralCode} onChange={set('referralCode')} error={errors.referralCode} placeholder="e.g. SAVE-AB12CD" hint="Got a code from a friend? Enter it here." autoComplete="off" />
        <label className="flex items-start gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={f.acceptTerms} onChange={set('acceptTerms')} className="mt-1 h-4 w-4 accent-[#0B6B4F]" />
          <span>
            I agree to the <Link href="/terms" className="font-semibold text-brand-700 hover:underline">Terms &amp; Conditions</Link> and{' '}
            <Link href="/privacy" className="font-semibold text-brand-700 hover:underline">Privacy Policy</Link>.
          </span>
        </label>
        {errors.acceptTerms && (
          <p className="text-xs text-error" role="alert">
            {errors.acceptTerms}
          </p>
        )}
        <Button type="submit" fullWidth size="lg" loading={loading}>
          Create Account
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        Already have an account?{' '}
        <Link href={`/login${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`} className="font-semibold text-brand-700 hover:underline">
          Log in
        </Link>
      </p>
    </Card>
  );
}

export default function RegisterPage() {
  return (
    <React.Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Loading…</div>}>
      <RegisterPageInner />
    </React.Suspense>
  );
}
