'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { Card, Button, Badge, Input, Textarea, Modal, ConfirmModal, SkeletonCard, EmptyState, ErrorState, Select, useToast } from '@bachatly/ui';
import { ApiError } from '@/lib/api';
import { adminListPlans, adminCreatePlan, adminUpdatePlan, adminTogglePlan, adminDeletePlan, type ApiPlan, type PlanForm } from '@/lib/memberships';
import { formatPKR } from '@/lib/format';

const EMPTY: PlanForm = {
  name: '', description: '', regularPriceRs: 0, salePriceRs: 0, durationDays: 365,
  benefits: [], rewardMultiplierBps: 20000, cashbackPercent: 5, isFeatured: false, isActive: true,
};

export default function AdminPlansPage() {
  const { toast } = useToast();
  const [plans, setPlans] = useState<ApiPlan[] | null>(null);
  const [error, setError] = useState(false);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<ApiPlan | null>(null);
  const [form, setForm] = useState<PlanForm>(EMPTY);
  const [benefitsText, setBenefitsText] = useState('');
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState<ApiPlan | null>(null);

  const load = useCallback(() => {
    setError(false);
    adminListPlans().then(setPlans).catch(() => { setPlans(null); setError(true); });
  }, []);
  useEffect(load, []);

  const set = (k: keyof PlanForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const v = e.target.value;
    setForm((f) => ({ ...f, [k]: ['regularPriceRs', 'salePriceRs', 'durationDays', 'rewardMultiplierBps', 'cashbackPercent'].includes(k) ? Number(v) || 0 : v }));
  };

  const openCreate = () => { setEditing(null); setForm(EMPTY); setBenefitsText(''); setModal(true); };
  const openEdit = (p: ApiPlan) => {
    setEditing(p);
    setForm({
      name: p.name, slug: p.slug, description: p.description,
      regularPriceRs: p.regularPrice, salePriceRs: p.salePrice, durationDays: p.durationDays,
      benefits: p.benefits, rewardMultiplierBps: p.rewardMultiplierBps, cashbackPercent: p.cashbackPercent,
      isFeatured: p.isFeatured, isActive: p.isActive,
    });
    setBenefitsText(p.benefits.join('\n'));
    setModal(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.salePriceRs || form.salePriceRs <= 0) { toast('Name and a valid sale price are required.', 'error'); return; }
    if (form.durationDays <= 0) { toast('Duration must be at least 1 day.', 'error'); return; }
    setSaving(true);
    try {
      const payload: PlanForm = { ...form, name: form.name.trim(), benefits: benefitsText.split('\n').map((b) => b.trim()).filter(Boolean) };
      if (editing) { await adminUpdatePlan(editing.id, payload); toast('Plan updated.'); }
      else { await adminCreatePlan(payload); toast('Plan created.'); }
      setModal(false); load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not save the plan.', 'error');
    } finally { setSaving(false); }
  };

  const toggle = async (p: ApiPlan) => {
    try { await adminTogglePlan(p.id, !p.isActive); toast(p.isActive ? 'Plan deactivated.' : 'Plan activated.'); load(); }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Could not change plan status.', 'error'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-ink">Membership Plans</h1>
        <Button onClick={openCreate}>+ New Plan</Button>
      </div>

      {!plans && !error && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}</div>}
      {error && <ErrorState title="Could not load plans" onRetry={load} />}
      {plans && plans.length === 0 && <EmptyState icon="🎫" title="No plans yet" description="Create your first membership plan." actionLabel="New Plan" onAction={openCreate} />}
      {plans && plans.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((p) => (
            <Card key={p.id} className="p-5">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-extrabold text-ink">{p.name}</h2>
                <div className="flex gap-1.5">
                  {p.isFeatured && <Badge tone="brand">Featured</Badge>}
                  <Badge tone={p.isActive ? 'success' : 'neutral'}>{p.isActive ? 'ACTIVE' : 'INACTIVE'}</Badge>
                </div>
              </div>
              <p className="mt-1 text-sm text-slate-500">{p.description}</p>
              <p className="mt-2 text-xl font-extrabold text-brand-700">
                {formatPKR(p.salePrice)}
                {p.regularPrice > p.salePrice && <span className="ml-2 text-sm font-normal text-slate-400 line-through">{formatPKR(p.regularPrice)}</span>}
              </p>
              <p className="text-xs text-slate-500">{p.durationDays} days · {p.cashbackPercent}% cashback · {(p.rewardMultiplierBps / 10000).toFixed(1)}× points</p>
              {p.benefits.length > 0 && (
                <ul className="mt-2 space-y-1">{p.benefits.slice(0, 3).map((b, i) => <li key={i} className="text-xs text-slate-500">✓ {b}</li>)}</ul>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => openEdit(p)}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => toggle(p)}>{p.isActive ? 'Deactivate' : 'Activate'}</Button>
                <Button size="sm" variant="ghost" onClick={() => setDel(p)}>Delete</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit plan' : 'New plan'} wide
        footer={<><Button variant="ghost" onClick={() => setModal(false)}>Cancel</Button><Button onClick={save} loading={saving}>Save</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Plan name *" value={form.name} onChange={set('name')} />
          <Input label="Slug (auto if empty)" value={form.slug || ''} onChange={set('slug')} />
          <div className="sm:col-span-2"><Textarea label="Description" rows={2} value={form.description} onChange={set('description')} /></div>
          <Input label="Regular price (Rs.)" type="number" min={0} value={String(form.regularPriceRs)} onChange={set('regularPriceRs')} />
          <Input label="Sale price (Rs.) *" type="number" min={0} value={String(form.salePriceRs)} onChange={set('salePriceRs')} />
          <Input label="Duration (days)" type="number" min={1} value={String(form.durationDays)} onChange={set('durationDays')} />
          <Input label="Cashback %" type="number" min={0} max={100} value={String(form.cashbackPercent)} onChange={set('cashbackPercent')} />
          <Input label="Reward multiplier (bps, 10000 = 1×)" type="number" min={0} value={String(form.rewardMultiplierBps)} onChange={set('rewardMultiplierBps')} />
          <div className="sm:col-span-2"><Textarea label="Benefits (one per line)" rows={4} value={benefitsText} onChange={(e) => setBenefitsText(e.target.value)} /></div>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={form.isFeatured} onChange={(e) => setForm((f) => ({ ...f, isFeatured: e.target.checked }))} className="h-4 w-4 accent-brand-600" />
            Featured plan
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} className="h-4 w-4 accent-brand-600" />
            Active
          </label>
        </div>
      </Modal>

      <ConfirmModal open={!!del} onClose={() => setDel(null)} danger confirmLabel="Delete plan" requireReason
        onConfirm={async () => {
          try { await adminDeletePlan(del!.id); toast('Plan deleted.'); load(); }
          catch (e) { toast(e instanceof ApiError ? e.message : 'Could not delete the plan.', 'error'); }
          setDel(null);
        }}
        title="Delete plan" action="Delete membership plan" affected={del?.name}
        description="Plans with active members cannot be deleted — deactivate the plan instead." />
    </div>
  );
}
