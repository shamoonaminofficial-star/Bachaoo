'use client';
import React, { useEffect, useState } from 'react';
import { Card, Button, Input, Tabs, useToast, EmptyState, Skeleton } from '@bachatly/ui';
import { ApiError } from '@/lib/api';
import { adminFetchSettings, adminSaveSettings } from '@/lib/admin';

const SECTIONS = ['General', 'Membership', 'Rewards', 'Referral', 'Cashback', 'Commission', 'Payments', 'Email', 'Notifications', 'SEO'];

const FIELDS: Record<string, [string, string, string][]> = {
  General: [['platformName', 'Platform name', 'text'], ['currency', 'Currency', 'text'], ['timezone', 'Timezone', 'text'], ['country', 'Country', 'text'], ['defaultCity', 'Default city', 'text'], ['contactEmail', 'Contact email', 'email'], ['phone', 'Phone', 'text'], ['whatsapp', 'WhatsApp', 'text'], ['primaryColor', 'Primary color', 'color'], ['accentColor', 'Accent color', 'color']],
  Membership: [['membershipTrialDays', 'Trial days', 'number'], ['membershipGraceDays', 'Grace period (days)', 'number']],
  Rewards: [['rewardPointsPer100', 'Points per Rs. 100 redeemed', 'number'], ['rewardExpiryMonths', 'Points expiry (months)', 'number']],
  Referral: [['referralReward', 'Referrer reward (Rs.)', 'number'], ['referralFriendReward', 'Friend reward (Rs.)', 'number']],
  Cashback: [['cashbackDefault', 'Default cashback %', 'number'], ['cashbackApproval', 'Auto-approve below (Rs.)', 'number']],
  Commission: [['commissionDefault', 'Default commission %', 'number']],
  Payments: [['gateway', 'Primary gateway', 'text'], ['bankName', 'Bank name (manual)', 'text'], ['bankTitle', 'Account title', 'text'], ['bankIban', 'IBAN', 'text']],
  Email: [['smtpHost', 'SMTP host', 'text'], ['smtpPort', 'SMTP port', 'number'], ['smtpUser', 'SMTP user', 'text']],
  Notifications: [['pushEnabled', 'Browser push enabled', 'text'], ['smsProvider', 'SMS provider', 'text']],
  SEO: [['seoTitle', 'Default SEO title', 'text'], ['seoDescription', 'Default meta description', 'text']],
};

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const [section, setSection] = useState('General');
  const [form, setForm] = useState<Record<string, string>>({
    platformName: 'Bachatly', currency: 'PKR', timezone: 'Asia/Karachi', country: 'Pakistan', defaultCity: 'Sargodha',
    contactEmail: 'support@bachatly.pk', phone: '+92 48 372 0000', whatsapp: '+92 300 000 0000',
    primaryColor: '#0B6B4F', accentColor: '#FFB020',
    rewardPointsPer100: '4', referralReward: '250', cashbackDefault: '5', commissionDefault: '10',
    seoTitle: 'Bachatly — Save More. Live More.', seoDescription: 'Exclusive deals, discounts, vouchers and rewards from businesses around you.',
  });
  const [live, setLive] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminFetchSettings()
      .then((res) => {
        if (res === null) { setLive(false); return; }
        setLive(true);
        const flat: Record<string, string> = {};
        Object.entries(res).forEach(([k, v]) => { flat[k] = String(v ?? ''); });
        setForm((f) => ({ ...f, ...flat }));
      })
      .catch(() => setLive(false));
  }, []);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setSaving(true);
    try {
      await adminSaveSettings(form);
      toast(`${section} settings saved (logged to audit).`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Save failed — settings API is not live yet.', 'error');
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-ink">Settings</h1>
      <Tabs tabs={SECTIONS.map((s) => ({ id: s, label: s }))} active={section} onChange={setSection} />
      {live === null ? <Skeleton className="h-56" /> : (
        <>
          {live === false && (
            <EmptyState title="Settings API is not live yet" description="There is no settings backend module yet, so nothing here persists. The form below documents the planned settings schema; saves will be retried automatically once GET/PUT /admin/settings lands." icon="⚙️" />
          )}
          <Card className="p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              {(FIELDS[section] || []).map(([key, label, type]) => (
                <Input key={key} label={label} type={type} value={form[key] || ''} onChange={set(key)} disabled={live === false} />
              ))}
            </div>
            {section === 'General' && <p className="mt-3 text-xs text-slate-500">Logo / favicon uploads use S3-compatible storage in production. Theme colors propagate from <code className="rounded bg-slate-100 px-1">packages/ui/src/theme.ts</code>.</p>}
            {section === 'Payments' && <p className="mt-3 text-xs text-amber-700">⚠️ Gateway secrets are stored as server-side environment variables — never in the frontend.</p>}
            <Button className="mt-5" onClick={save} disabled={saving || live === false}>{saving ? 'Saving…' : `Save ${section} Settings`}</Button>
          </Card>
        </>
      )}
    </div>
  );
}
