'use client';
import React, { useState } from 'react';
import { Card, Button, Select, useToast } from '@bachatly/ui';
import { api } from '@/lib/api';

/**
 * Partner settings. If the settings API isn't deployed yet, this says so
 * honestly instead of pretending the save worked.
 */
export default function PartnerSettingsPage() {
  const { toast } = useToast();
  const [prefs, setPrefs] = useState({ notifications: 'all', settlementCycle: 'biweekly', autoApproveStaff: false });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await api('/partner/settings', { method: 'PATCH', body: prefs });
      toast('Settings saved.');
    } catch {
      toast("Couldn't save settings — the settings API isn't live yet.", 'error');
    } finally {
      setSaving(false);
    }
  };
  const toggle = (k: 'notifications' | 'settlementCycle') => (e: React.ChangeEvent<HTMLSelectElement>) => setPrefs((p) => ({ ...p, [k]: e.target.value }));
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-extrabold text-ink">Settings</h1>
      <Card className="space-y-4 p-6">
        <Select label="Notification preferences" value={prefs.notifications} onChange={toggle('notifications')}
          options={[{ value: 'all', label: 'All notifications' }, { value: 'important', label: 'Important only' }, { value: 'none', label: 'None' }]} />
        <Select label="Settlement cycle" value={prefs.settlementCycle} onChange={toggle('settlementCycle')}
          options={[{ value: 'weekly', label: 'Weekly' }, { value: 'biweekly', label: 'Bi-weekly' }, { value: 'monthly', label: 'Monthly' }]} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={prefs.autoApproveStaff} onChange={(e) => setPrefs({ ...prefs, autoApproveStaff: e.target.checked })} className="h-4 w-4 accent-[#0B6B4F]" /> Auto-approve cashier-level staff invites</label>
        <Button onClick={save} loading={saving}>Save Settings</Button>
      </Card>
    </div>
  );
}
