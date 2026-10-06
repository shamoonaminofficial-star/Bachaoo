'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { Card, Badge, Button, DataTable, ConfirmModal, Modal, Input, Select, Pagination, useToast, EmptyState, ErrorState } from '@bachatly/ui';
import { ApiError } from '@/lib/api';
import {
  adminListBusinesses, adminCreateBusiness, adminBusinessAction,
  fetchCategories, fetchCities, type ApiBusiness, type Page,
} from '@/lib/catalog';
import { adminBatchBusinesses } from '@/lib/admin';
import { SEED_CATEGORIES, CITIES } from '@/lib/seed';

type Row = ApiBusiness & { id: string };

export default function AdminBusinessesPage() {
  const { toast } = useToast();
  const [data, setData] = useState<Page<Row> | null>(null);
  const [error, setError] = useState(false);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [cityId, setCityId] = useState('');
  const [status, setStatus] = useState<'active' | 'suspended' | 'all'>('all');
  const [pageNum, setPageNum] = useState(1);
  const [action, setAction] = useState<{ row: Row; kind: 'verify' | 'suspend' | 'reactivate' } | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', categoryId: '', cityId: '', area: '', address: '', phone: '', ownerEmail: '' });
  const [saving, setSaving] = useState(false);
  const [cats, setCats] = useState<{ id: string; name: string }[]>([]);
  const [cities, setCities] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batching, setBatching] = useState(false);

  useEffect(() => {
    fetchCategories().then((c) => setCats(c.map((x) => ({ id: x.id, name: x.name })))).catch(() => setCats(SEED_CATEGORIES.map((x) => ({ id: x.id, name: x.name }))));
    fetchCities().then((c) => setCities(c.map((x) => ({ id: x.id, name: x.name })))).catch(() => setCities(CITIES.map((name) => ({ id: name, name }))));
  }, []);

  useEffect(() => { const t = setTimeout(() => { setDebouncedQ(q); setPageNum(1); }, 350); return () => clearTimeout(t); }, [q]);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await adminListBusinesses({ q: debouncedQ || undefined, cityId: cityId || undefined, status, page: pageNum, pageSize: 10, sort: 'name' });
      setData(res as Page<Row>);
    } catch { setData(null); setError(true); }
  }, [debouncedQ, cityId, status, pageNum]);
  useEffect(() => { load(); }, [load]);

  const apply = async (reason: string) => {
    if (!action) return;
    try {
      await adminBusinessAction(action.row.id, action.kind, reason);
      toast(action.kind === 'verify' ? 'Business verified.' : action.kind === 'suspend' ? 'Business suspended.' : 'Business reactivated.');
      setAction(null); await load();
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Action failed.', 'error'); }
  };

  const batch = async (action: 'verify' | 'suspend' | 'reactivate', reason?: string) => {
    const ids = [...selected];
    if (!ids.length) return;
    setBatching(true);
    try {
      const res = await adminBatchBusinesses(ids, action, reason);
      const ok = res.results.filter((r) => r.ok).length;
      const failed = res.results.filter((r) => !r.ok);
      toast(`${ok} business${ok === 1 ? '' : 'es'} ${action}d.` + (failed.length ? ` ${failed.length} failed.` : ''));
      failed.forEach((f) => toast(`${f.id.slice(0, 8)}: ${f.error ?? 'failed'}`, 'error'));
      setSelected(new Set()); await load();
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Batch action failed.', 'error'); }
    finally { setBatching(false); }
  };

  const toggleSelect = (id: string) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const create = async () => {
    if (!form.name.trim() || !form.categoryId || !form.cityId) { toast('Name, category and city are required.', 'error'); return; }
    setSaving(true);
    try {
      await adminCreateBusiness({ ...form, name: form.name.trim() });
      toast('Business created.'); setCreating(false);
      setForm({ name: '', categoryId: '', cityId: '', area: '', address: '', phone: '', ownerEmail: '' });
      await load();
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Create failed.', 'error'); }
    finally { setSaving(false); }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-extrabold text-ink">Businesses</h1>
        <p className="text-sm text-slate-500">{data ? `${data.total} businesses` : 'Verify, suspend and manage partner businesses.'}</p></div>
        <Button onClick={() => setCreating(true)}>+ Create Business</Button>
      </div>

      <Card className="p-4">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row">
          <Input aria-label="Search businesses" placeholder="Search name, email…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="w-full sm:w-56">
            <Select aria-label="Filter by city" value={cityId} onChange={(e) => { setCityId(e.target.value); setPageNum(1); }}
              options={[{ value: '', label: 'All cities' }, ...cities.map((c) => ({ value: c.id, label: c.name }))]} />
          </div>
          <div className="w-full sm:w-44">
            <Select aria-label="Filter by status" value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPageNum(1); }}
              options={[{ value: 'all', label: 'All statuses' }, { value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }]} />
          </div>
        </div>
        {!data && !error && <p className="p-4 text-sm text-slate-500">Loading…</p>}
        {error && <ErrorState title="Could not load businesses" onRetry={load} />}
        {data && data.items.length === 0 && <EmptyState icon="🏪" title="No businesses found" />}
        {data && data.items.length > 0 && (
          <>
            {selected.size > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl bg-brand-50 p-3">
                <span className="text-sm font-semibold text-brand-800">{selected.size} selected</span>
                <Button size="sm" disabled={batching} onClick={() => batch('verify')}>Verify</Button>
                <Button size="sm" variant="outline" disabled={batching} onClick={() => batch('reactivate')}>Reactivate</Button>
                <Button size="sm" variant="danger" disabled={batching} onClick={() => batch('suspend')}>Suspend</Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
              </div>
            )}
            <DataTable<Row> rows={data.items} searchable={['name', 'city']} exportName="businesses"
              columns={[
                { key: 'select', header: '', render: (r) => (
                  <input type="checkbox" checked={selected.has(r.id)} onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleSelect(r.id)} aria-label={`Select ${r.name}`} className="h-4 w-4 accent-[#0B6B4F]" />) },
                { key: 'name', header: 'Business', sortable: true, render: (r) => <span>{r.name} {r.isVerified && <Badge tone="success">✓</Badge>}</span> },
                { key: 'category', header: 'Category', render: (r) => r.category.name },
                { key: 'city', header: 'City', sortable: true },
                { key: 'deals', header: 'Deals', render: (r) => String(r.activeDealCount) },
                { key: 'rating', header: 'Rating', render: (r) => `${r.ratingAvg.toFixed(1)} (${r.ratingCount})` },
                { key: 'actions', header: 'Actions', render: (r) => (
                  <span onClick={(e) => e.stopPropagation()} className="flex gap-1.5">
                    {!r.isVerified && <Button size="sm" onClick={() => setAction({ row: r, kind: 'verify' })}>Verify</Button>}
                    <Button size="sm" variant="outline" onClick={() => setAction({ row: r, kind: 'suspend' })}>Suspend</Button>
                    <Button size="sm" variant="ghost" onClick={() => setAction({ row: r, kind: 'reactivate' })}>Reactivate</Button>
                  </span>) },
              ]} />
            <div className="mt-4"><Pagination page={data.page} totalPages={data.totalPages} onChange={setPageNum} /></div>
          </>
        )}
      </Card>

      <Modal open={creating} onClose={() => setCreating(false)} title="Create business"
        footer={<><Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button><Button onClick={create} loading={saving}>Create</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Business name *" value={form.name} onChange={set('name')} />
          <Input label="Owner email" type="email" value={form.ownerEmail} onChange={set('ownerEmail')} hint="Links an existing user as owner" />
          <Select label="Category *" value={form.categoryId} onChange={set('categoryId')}
            options={[{ value: '', label: 'Select…' }, ...cats.map((c) => ({ value: c.id, label: c.name }))]} />
          <Select label="City *" value={form.cityId} onChange={set('cityId')}
            options={[{ value: '', label: 'Select…' }, ...cities.map((c) => ({ value: c.id, label: c.name }))]} />
          <Input label="Area" value={form.area} onChange={set('area')} />
          <Input label="Phone" value={form.phone} onChange={set('phone')} />
          <div className="sm:col-span-2"><Input label="Address" value={form.address} onChange={set('address')} /></div>
        </div>
      </Modal>

      <ConfirmModal open={!!action} onClose={() => setAction(null)} onConfirm={apply}
        danger={action?.kind === 'suspend'} requireReason={action?.kind !== 'verify'}
        title={action?.kind === 'verify' ? 'Verify business' : action?.kind === 'suspend' ? 'Suspend business' : 'Reactivate business'}
        action={action?.kind === 'verify' ? 'Verify business' : action?.kind === 'suspend' ? 'Suspend business' : 'Reactivate business'}
        affected={action?.row.name}
        confirmLabel={action?.kind === 'verify' ? 'Verify' : action?.kind === 'suspend' ? 'Suspend' : 'Reactivate'} />
    </div>
  );
}
