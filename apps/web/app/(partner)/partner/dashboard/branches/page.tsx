'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { Card, Button, Badge, Input, Modal, ConfirmModal, Select, statusTone, useToast, Skeleton, EmptyState, ErrorState } from '@bachatly/ui';
import { ApiError } from '@/lib/api';
import {
  partnerListBranches, partnerCreateBranch, partnerUpdateBranch, partnerDeleteBranch,
  fetchCities, type ApiBranch,
} from '@/lib/catalog';
import { CITIES } from '@/lib/seed';

const DAYS: Array<[string, string]> = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']];

type HoursForm = Record<string, { open: boolean; from: string; to: string }>;
const emptyHours = (): HoursForm => Object.fromEntries(DAYS.map(([k]) => [k, { open: true, from: '10:00', to: '22:00' }]));
function hoursToForm(h?: Record<string, [string, string]>): HoursForm {
  const f = emptyHours();
  if (h) DAYS.forEach(([k]) => { if (h[k]) f[k] = { open: true, from: h[k][0], to: h[k][1] }; });
  return f;
}
function formToHours(f: HoursForm): Record<string, [string, string]> {
  const out: Record<string, [string, string]> = {};
  DAYS.forEach(([k]) => { if (f[k].open) out[k] = [f[k].from, f[k].to]; });
  return out;
}
function hoursLabel(h?: Record<string, [string, string]>): string {
  if (!h) return 'Not set';
  const days = DAYS.filter(([k]) => h[k]);
  if (!days.length) return 'Closed all week';
  const first = h[days[0][0]];
  const same = days.every(([k]) => h[k][0] === first[0] && h[k][1] === first[1]);
  return same ? `Daily ${first[0]}–${first[1]}` : days.map(([k, label]) => `${label.slice(0, 3)} ${h[k][0]}–${h[k][1]}`).join(' · ');
}

interface BranchForm {
  name: string; manager: string; phone: string; cityId: string; area: string;
  address: string; latitude: string; longitude: string; mapsLink: string; hours: HoursForm;
}
const emptyForm = (): BranchForm => ({
  name: '', manager: '', phone: '', cityId: '', area: '', address: '',
  latitude: '', longitude: '', mapsLink: '', hours: emptyHours(),
});

export default function BranchesPage() {
  const { toast } = useToast();
  const [branches, setBranches] = useState<ApiBranch[] | null>(null);
  const [error, setError] = useState(false);
  const [modal, setModal] = useState<null | { mode: 'create' } | { mode: 'edit'; branch: ApiBranch }>(null);
  const [form, setForm] = useState<BranchForm>(emptyForm());
  const [cities, setCities] = useState<{ id: string; name: string }[]>([]);
  const [del, setDel] = useState<ApiBranch | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try { setBranches(await partnerListBranches()); }
    catch { setBranches(null); setError(true); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetchCities().then((c) => setCities(c.map((x) => ({ id: x.id, name: x.name })))).catch(() => setCities(CITIES.map((name) => ({ id: name, name }))));
  }, []);

  const openCreate = () => { setForm(emptyForm()); setModal({ mode: 'create' }); };
  const openEdit = (branch: ApiBranch) => {
    setForm({
      name: branch.name, manager: branch.manager || '', phone: branch.phone || '',
      cityId: '', area: branch.area || '', address: branch.address,
      latitude: branch.latitude != null ? String(branch.latitude) : '',
      longitude: branch.longitude != null ? String(branch.longitude) : '',
      mapsLink: '', hours: hoursToForm(branch.openingHours),
    });
    setModal({ mode: 'edit', branch });
  };

  const set = (k: 'name' | 'manager' | 'phone' | 'cityId' | 'area' | 'address' | 'latitude' | 'longitude' | 'mapsLink') =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const v = e.target.value;
      setForm((f) => ({ ...f, [k]: v }));
    };
  const setHour = (day: string, k: 'open' | 'from' | 'to', v: string | boolean) =>
    setForm((f) => ({ ...f, hours: { ...f.hours, [day]: { ...f.hours[day], [k]: v } } }));

  const save = async () => {
    if (!form.name.trim() || !form.address.trim()) { toast('Branch name and address are required.', 'error'); return; }
    const lat = form.latitude.trim() ? Number(form.latitude) : undefined;
    const lng = form.longitude.trim() ? Number(form.longitude) : undefined;
    if ((lat != null && Number.isNaN(lat)) || (lng != null && Number.isNaN(lng))) { toast('Coordinates must be valid numbers.', 'error'); return; }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(), manager: form.manager.trim() || undefined, phone: form.phone.trim() || undefined,
        cityId: form.cityId || undefined, area: form.area.trim() || undefined, address: form.address.trim(),
        latitude: lat, longitude: lng, mapsLink: form.mapsLink.trim() || undefined,
        openingHours: formToHours(form.hours),
      };
      if (modal?.mode === 'create') { await partnerCreateBranch(body); toast('Branch added.'); }
      else if (modal?.mode === 'edit') { await partnerUpdateBranch(modal.branch.id, body); toast('Branch updated.'); }
      setModal(null); await load();
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Save failed.', 'error'); }
    finally { setSaving(false); }
  };

  const doDelete = async () => {
    if (!del) return;
    try { await partnerDeleteBranch(del.id); toast('Branch removed.'); setDel(null); await load(); }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Could not remove branch.', 'error'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-extrabold text-ink">Branches</h1>
        <p className="text-sm text-slate-500">Deals can target all branches or selected ones.</p></div>
        <Button onClick={openCreate}>+ Add Branch</Button>
      </div>

      {!branches && !error && <div className="grid gap-4 md:grid-cols-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-40 w-full !rounded-2xl" />)}</div>}
      {error && <ErrorState title="Could not load branches" onRetry={load} />}
      {branches && branches.length === 0 && <EmptyState icon="🏬" title="No branches yet" description="Add your first branch to start publishing deals." actionLabel="Add Branch" onAction={openCreate} />}
      {branches && branches.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {branches.map((b) => (
            <Card key={b.id} className="p-5">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-bold text-ink">{b.name}</h2>
                <Badge tone={statusTone[b.isActive ? 'active' : 'cancelled'] || 'neutral'}>{b.isActive ? 'ACTIVE' : 'INACTIVE'}</Badge>
              </div>
              <p className="mt-1 text-sm text-slate-500">📍 {b.address}{b.area ? `, ${b.area}` : ''}{b.city ? `, ${b.city}` : ''}</p>
              <p className="mt-1 text-sm text-slate-500">👤 {b.manager || '—'} · 📞 {b.phone || '—'}</p>
              <p className="mt-1 text-sm text-slate-500">🕒 {hoursLabel(b.openingHours)}</p>
              {(b.latitude != null && b.longitude != null) && (
                <a className="mt-1 inline-block text-xs font-semibold text-brand-700"
                  href={`https://www.google.com/maps/search/?api=1&query=${b.latitude},${b.longitude}`}
                  target="_blank" rel="noopener noreferrer">📍 View on map</a>
              )}
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => openEdit(b)}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => setDel(b)}>Remove</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.mode === 'create' ? 'Add branch' : 'Edit branch'} wide
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button><Button onClick={save} loading={saving}>{modal?.mode === 'create' ? 'Add Branch' : 'Save'}</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Branch name *" value={form.name} onChange={set('name')} />
          <Input label="Manager" value={form.manager} onChange={set('manager')} />
          <Input label="Phone" value={form.phone} onChange={set('phone')} />
          <Select label="City" value={form.cityId} onChange={set('cityId')}
            options={[{ value: '', label: 'Select…' }, ...cities.map((c) => ({ value: c.id, label: c.name }))]} />
          <Input label="Area" value={form.area} onChange={set('area')} />
          <div className="sm:col-span-2"><Input label="Address *" value={form.address} onChange={set('address')} /></div>
          <Input label="Latitude" value={form.latitude} onChange={set('latitude')} placeholder="32.0875" hint="For distance + map display" />
          <Input label="Longitude" value={form.longitude} onChange={set('longitude')} placeholder="72.6748" />
          <div className="sm:col-span-2"><Input label="Google Maps link" value={form.mapsLink} onChange={set('mapsLink')} placeholder="https://maps.google.com/…" /></div>
        </div>
        <div className="mt-4">
          <p className="mb-2 text-sm font-semibold text-ink">Opening hours</p>
          <div className="space-y-1.5">
            {DAYS.map(([k, label]) => (
              <div key={k} className="flex items-center gap-2 text-sm">
                <label className="flex w-28 items-center gap-2 font-medium text-slate-700">
                  <input type="checkbox" checked={form.hours[k].open} onChange={(e) => setHour(k, 'open', e.target.checked)} className="h-4 w-4 accent-[#0B6B4F]" />
                  {label}
                </label>
                {form.hours[k].open ? (
                  <>
                    <Input aria-label={`${label} opens`} type="time" value={form.hours[k].from} onChange={(e) => setHour(k, 'from', e.target.value)} className="w-32" />
                    <span className="text-slate-400">–</span>
                    <Input aria-label={`${label} closes`} type="time" value={form.hours[k].to} onChange={(e) => setHour(k, 'to', e.target.value)} className="w-32" />
                  </>
                ) : <span className="text-xs text-slate-400">Closed</span>}
              </div>
            ))}
          </div>
        </div>
      </Modal>

      <ConfirmModal open={!!del} onClose={() => setDel(null)} danger confirmLabel="Remove branch"
        onConfirm={doDelete} title="Remove branch" action="Remove branch" affected={del?.name} />
    </div>
  );
}
