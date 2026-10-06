'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Card, Input, Select, Button, Avatar, Skeleton, ErrorState, useToast } from '@bachatly/ui';
import { ApiError } from '@/lib/api';
import { fetchCities, type ApiCity } from '@/lib/catalog';
import {
  fetchProfile, updateProfile, uploadAvatar, type ProfileData,
} from '@/lib/dashboard';
import { formatDate } from '@/lib/format';

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'ur', label: 'Urdu (اردو)' },
];

export default function ProfilePage() {
  const { toast } = useToast();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [cities, setCities] = useState<ApiCity[]>([]);
  const [f, setF] = useState({ firstName: '', lastName: '', phone: '', dateOfBirth: '', cityId: '', language: 'en', marketingOptIn: false });
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [error, setError] = useState('');
  const dirtyRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [p, c] = await Promise.all([
        fetchProfile(),
        fetchCities().catch(() => []),
      ]);
      setProfile(p);
      setCities(c);
      setF({
        firstName: String(p.firstName ?? ''),
        lastName: String(p.lastName ?? ''),
        phone: String(p.phone ?? ''),
        dateOfBirth: p.dateOfBirth ? String(p.dateOfBirth).slice(0, 10) : '',
        cityId: String(p.cityId ?? ''),
        language: String(p.language ?? 'en'),
        marketingOptIn: Boolean(p.marketingOptIn),
      });
      setDirty(false); dirtyRef.current = false;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load your profile.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Unsaved-changes guard
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { if (dirtyRef.current) e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const v = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
    setF((prev) => ({ ...prev, [k]: v }));
    setDirty(true); dirtyRef.current = true;
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await updateProfile({
        firstName: f.firstName.trim(),
        lastName: f.lastName.trim(),
        phone: f.phone.trim() || undefined,
        dateOfBirth: f.dateOfBirth || undefined,
        cityId: f.cityId || undefined,
        language: f.language,
        marketingOptIn: f.marketingOptIn,
      });
      setProfile(updated);
      setDirty(false); dirtyRef.current = false;
      toast('Profile updated successfully.');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  const onAvatar = async (file: File) => {
    setAvatarBusy(true);
    try {
      const url = await uploadAvatar(file);
      if (url) {
        setProfile((p) => (p ? { ...p, avatarUrl: url } : p));
        toast('Photo updated.');
      } else {
        toast('Avatar upload is not available yet.');
      }
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not upload the photo.');
    } finally {
      setAvatarBusy(false);
    }
  };

  const completeness = Math.max(0, Math.min(100, Math.round(Number(profile?.profileCompleteness ?? 0))));

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-extrabold text-ink">Profile</h1>

      {error ? (
        <ErrorState title="Couldn't load your profile" description={error} onRetry={load} />
      ) : loading ? (
        <Card className="space-y-4 p-6"><Skeleton className="h-14 w-14 rounded-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></Card>
      ) : (
        <>
          <Card className="p-6">
            <div className="mb-5 flex flex-wrap items-center gap-4">
              <Avatar name={`${f.firstName} ${f.lastName}`.trim() || 'Bachatly user'} src={profile?.avatarUrl ?? undefined} size="lg" />
              <div className="flex-1">
                <p className="font-bold text-ink">{[f.firstName, f.lastName].filter(Boolean).join(' ') || 'Your name'}</p>
                <p className="text-sm text-slate-500">
                  {profile?.referralCode ? `Code ${profile.referralCode}` : ''}
                  {profile?.createdAt ? ` · Member since ${formatDate(String(profile.createdAt))}` : ''}
                </p>
              </div>
              <label className="cursor-pointer rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                {avatarBusy ? 'Uploading…' : 'Change photo'}
                <input type="file" accept="image/*" className="sr-only" disabled={avatarBusy}
                  onChange={(e) => { const file = e.target.files?.[0]; if (file) onAvatar(file); e.target.value = ''; }} />
              </label>
            </div>

            {completeness > 0 && (
              <div className="mb-5 rounded-xl bg-slate-50 p-3">
                <div className="mb-1.5 flex items-center justify-between text-xs font-semibold">
                  <span className="text-slate-600">Profile completeness</span>
                  <span className="text-brand-700">{completeness}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={completeness} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${completeness}%` }} />
                </div>
              </div>
            )}

            <form onSubmit={save} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Input label="First name" value={f.firstName} onChange={set('firstName')} required maxLength={60} />
                <Input label="Last name" value={f.lastName} onChange={set('lastName')} required maxLength={60} />
              </div>
              <Input label="Phone" type="tel" value={f.phone} onChange={set('phone')} placeholder="03XXXXXXXXX" maxLength={15} />
              <Input label="Email" type="email" value={String(profile?.email ?? '')} disabled hint="Contact support to change your email address." />
              <Input label="Date of birth" type="date" value={f.dateOfBirth} onChange={set('dateOfBirth')} />
              {cities.length > 0 ? (
                <Select label="City" value={f.cityId} onChange={set('cityId')}
                  options={[{ value: '', label: 'Select a city' }, ...cities.map((c) => ({ value: c.id, label: c.name }))]} />
              ) : (
                <Input label="City" value={String(profile?.cityName ?? '')} disabled hint="City list is loading — try again shortly." />
              )}
              <Select label="Preferred language" value={f.language} onChange={set('language')} options={LANGUAGES} />
              <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm">
                <input type="checkbox" checked={f.marketingOptIn} onChange={set('marketingOptIn')} className="mt-1 h-4 w-4 accent-brand-600" />
                <span className="text-slate-600"><span className="font-semibold text-ink">Marketing messages</span><br />Deals and offers via SMS/WhatsApp. You can change this anytime.</span>
              </label>
              <div className="flex items-center gap-3">
                <Button type="submit" loading={saving} disabled={!dirty}>Save Changes</Button>
                {dirty && <span className="text-xs font-semibold text-amber-600">You have unsaved changes</span>}
              </div>
            </form>
          </Card>
        </>
      )}
    </div>
  );
}
