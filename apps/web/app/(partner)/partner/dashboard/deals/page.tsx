'use client';
import React, { useEffect, useState } from 'react';
import {
  Card, Button, Badge, Input, Textarea, Select, Modal, ConfirmModal, DataTable,
  statusTone, useToast, Tabs, EmptyState, FileUpload,
} from '@bachatly/ui';
import { ApiError, validateUploadFile } from '@/lib/api';
import {
  partnerMyDeals, partnerCreateDeal, partnerUpdateDeal, partnerDealAction, partnerDeleteDeal,
  partnerListBranches, fetchCategories, toBackendDealType, fromBackendDealType,
  type ApiPartnerDeal, type ApiCategory, type ApiBranch,
} from '@/lib/catalog';
import { formatDate } from '@/lib/format';

const DEAL_TYPES = [
  { value: 'percent_off', label: 'Percent off' },
  { value: 'flat_off', label: 'Flat amount off' },
  { value: 'bogo', label: 'Buy 1 Get 1' },
  { value: 'freebie', label: 'Freebie' },
];
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const STATUS_TABS: { id: string; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Drafts' },
  { id: 'pending_approval', label: 'Pending approval' },
  { id: 'approved', label: 'Approved' },
  { id: 'published', label: 'Published' },
  { id: 'paused', label: 'Paused' },
  { id: 'rejected', label: 'Rejected' },
];

const EMPTY_FORM = {
  title: '', shortDescription: '', description: '', categoryId: '', subcategoryId: '',
  dealType: 'percent_off', discountPercent: '20', maxDiscountAmount: '',
  originalPrice: '', dealPrice: '', requiresMembership: true,
  branchIds: [] as string[], startDate: '', endDate: '',
  daysAvailable: [] as string[], usageLimit: '', perUserLimit: '2', terms: '',
};

export default function PartnerDealsPage() {
  const { toast } = useToast();
  const [deals, setDeals] = useState<ApiPartnerDeal[] | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState('all');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<ApiPartnerDeal | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [images, setImages] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ deal: ApiPartnerDeal; action: 'pause' | 'delete' } | null>(null);
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [branches, setBranches] = useState<ApiBranch[]>([]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));

  const load = async () => {
    setError(false);
    try { setDeals(await partnerMyDeals()); }
    catch { setDeals(null); setError(true); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    fetchCategories().then(setCategories).catch(() => {});
    partnerListBranches().then(setBranches).catch(() => {});
  }, []);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setImages([]); setModal(true); };
  const openEdit = (d: ApiPartnerDeal) => {
    setEditing(d);
    setForm({
      ...EMPTY_FORM,
      title: d.title, shortDescription: d.shortDescription, description: d.description || '',
      categoryId: '', dealType: fromBackendDealType(d.dealType), discountPercent: String(d.discountPercent),
      originalPrice: d.originalPrice ? String(d.originalPrice) : '',
      dealPrice: d.memberPrice ? String(d.memberPrice) : '',
      requiresMembership: d.requiresMembership,
      startDate: '', endDate: '', perUserLimit: String(d.perUserLimit || 2), terms: (d.terms || []).join('\n'),
    });
    setImages([]); setModal(true);
  };

  const toggleBranch = (id: string) =>
    setForm((f) => ({ ...f, branchIds: f.branchIds.includes(id) ? f.branchIds.filter((b) => b !== id) : [...f.branchIds, id] }));
  const toggleDay = (day: string) =>
    setForm((f) => ({ ...f, daysAvailable: f.daysAvailable.includes(day) ? f.daysAvailable.filter((d) => d !== day) : [...f.daysAvailable, day] }));

  const onImage = (file: File) => {
    const err = validateUploadFile(file, { maxMb: 3, kinds: ['image'] });
    if (err) { toast(err, 'error'); return; }
    setImages((prev) => [...prev, file].slice(0, 5));
  };

  const save = async () => {
    if (!form.title.trim()) { toast('Title is required.', 'error'); return; }
    if (!form.categoryId) { toast('Category is required.', 'error'); return; }
    const discount = Number(form.discountPercent);
    if (!discount || discount < 1 || discount > 100) { toast('Discount must be between 1 and 100%.', 'error'); return; }
    setSaving(true);
    try {
      if (editing) {
        await partnerUpdateDeal(editing.id, {
          title: form.title.trim(), shortDescription: form.shortDescription, description: form.description,
          categoryId: form.categoryId, subcategoryId: form.subcategoryId || undefined,
          dealType: toBackendDealType(form.dealType), discountPercent: discount,
          maxDiscountAmount: form.maxDiscountAmount ? Number(form.maxDiscountAmount) * 100 : undefined,
          originalPrice: form.originalPrice ? Number(form.originalPrice) * 100 : undefined,
          dealPrice: form.dealPrice ? Number(form.dealPrice) * 100 : undefined,
          requiresMembership: form.requiresMembership,
          branchIds: form.branchIds.length ? form.branchIds : undefined,
          startDate: form.startDate || undefined, endDate: form.endDate || undefined,
          daysAvailable: form.daysAvailable.length ? form.daysAvailable : undefined,
          usageLimit: form.usageLimit ? Number(form.usageLimit) : undefined,
          perUserLimit: form.perUserLimit ? Number(form.perUserLimit) : undefined,
          terms: form.terms.trim() || undefined,
        });
        toast('Deal updated.');
      } else {
        // Backend: JSON create, then a separate multipart image upload.
        const body: Record<string, unknown> = {
          title: form.title.trim(),
          shortDescription: form.shortDescription,
          description: form.description || undefined,
          categoryId: form.categoryId,
          subcategoryId: form.subcategoryId || undefined,
          dealType: toBackendDealType(form.dealType),
          discountPercent: discount,
          maxDiscountAmount: form.maxDiscountAmount ? Number(form.maxDiscountAmount) * 100 : undefined,
          originalPrice: form.originalPrice ? Number(form.originalPrice) * 100 : undefined,
          dealPrice: form.dealPrice ? Number(form.dealPrice) * 100 : undefined,
          requiresMembership: form.requiresMembership,
          branchIds: form.branchIds.length ? form.branchIds : undefined,
          startDate: form.startDate || undefined,
          endDate: form.endDate || undefined,
          daysAvailable: form.daysAvailable.length ? form.daysAvailable : undefined,
          usageLimit: form.usageLimit ? Number(form.usageLimit) : undefined,
          perUserLimit: form.perUserLimit ? Number(form.perUserLimit) : undefined,
          terms: form.terms.trim() || undefined,
        };
        await partnerCreateDeal(body, images);
        toast('Deal created as draft.');
      }
      setModal(false); load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not save the deal.', 'error');
    } finally { setSaving(false); }
  };

  const runAction = async (d: ApiPartnerDeal, action: 'duplicate' | 'submit' | 'pause' | 'resume' | 'publish') => {
    try {
      await partnerDealAction(d.id, action);
      toast({ duplicate: 'Deal duplicated as draft.', submit: 'Deal submitted for approval.', pause: 'Deal paused.', resume: 'Deal resumed.', publish: 'Deal published — it is now live.' }[action]);
      load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Action failed.', 'error');
    }
  };

  const doDelete = async () => {
    if (!confirmAction) return;
    try {
      await partnerDeleteDeal(confirmAction.deal.id);
      toast('Deal deleted.', 'info');
      load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not delete.', 'error');
    } finally { setConfirmAction(null); }
  };

  const visible = (deals || []).filter((d) => tab === 'all' || d.status === tab);
  const activeCategory = categories.find((c) => c.id === form.categoryId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-ink">Deals</h1>
        <Button onClick={openCreate}>+ Create Deal</Button>
      </div>

      <Tabs tabs={STATUS_TABS.map((t) => ({
        id: t.id,
        label: t.id === 'all' ? `All (${deals?.length ?? 0})` : `${t.label} (${deals?.filter((d) => d.status === t.id).length ?? 0})`,
      }))} active={tab} onChange={setTab} />

      <Card className="p-4">
        {error ? (
          <EmptyState icon="⚠️" title="Could not load deals" actionLabel="Retry" onAction={load} />
        ) : !deals ? (
          <p className="p-4 text-sm text-slate-500">Loading…</p>
        ) : visible.length === 0 ? (
          <EmptyState icon="🎟️" title={tab === 'all' ? 'No deals yet' : `No ${tab.replace('_', ' ')} deals`}
            description={tab === 'all' ? 'Create your first deal to start attracting members.' : ''}
            actionLabel={tab === 'all' ? '+ Create Deal' : undefined} onAction={tab === 'all' ? openCreate : undefined} />
        ) : (
          <DataTable<ApiPartnerDeal> rows={visible} searchable={['title', 'status']} exportName="partner-deals"
            columns={[
              { key: 'title', header: 'Title', sortable: true, render: (r) => <span className="font-medium text-ink">{r.title}</span> },
              { key: 'discountPercent', header: 'Discount', sortable: true, render: (r) => `${r.discountPercent}%` },
              { key: 'status', header: 'Status', sortable: true, render: (r) => <Badge tone={statusTone[r.status] || 'neutral'}>{r.status.replace(/_/g, ' ').toUpperCase()}</Badge> },
              { key: 'endsAt', header: 'Expires', render: (r) => (r.expiresAt ? formatDate(r.expiresAt) : '—') },
              { key: 'redemptions', header: 'Redemptions', sortable: true, render: (r) => r.redemptions ?? 0 },
              {
                key: 'actions', header: 'Actions', render: (r) => (
                  <div className="flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="outline" onClick={() => openEdit(r)}>Edit</Button>
                    {r.status === 'draft' && <Button size="sm" onClick={() => runAction(r, 'submit')}>Submit</Button>}
                    {r.status === 'approved' && <Button size="sm" onClick={() => runAction(r, 'publish')}>Publish</Button>}
                    {r.status === 'published' && <Button size="sm" variant="ghost" onClick={() => setConfirmAction({ deal: r, action: 'pause' })}>Pause</Button>}
                    {r.status === 'paused' && <Button size="sm" onClick={() => runAction(r, 'resume')}>Resume</Button>}
                    <Button size="sm" variant="ghost" onClick={() => runAction(r, 'duplicate')}>Duplicate</Button>
                    {(r.status === 'draft' || r.status === 'rejected') && (
                      <Button size="sm" variant="ghost" className="!text-error" onClick={() => setConfirmAction({ deal: r, action: 'delete' })}>Delete</Button>
                    )}
                  </div>),
              },
            ]} />
        )}
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit deal' : 'Create deal'} wide
        footer={<><Button variant="ghost" onClick={() => setModal(false)}>Cancel</Button><Button onClick={save} loading={saving}>{editing ? 'Save changes' : 'Create Draft'}</Button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Input label="Title *" value={form.title} onChange={set('title')} placeholder="e.g. 20% Off Premium Pizza" /></div>
          <div className="sm:col-span-2"><Input label="Short description" value={form.shortDescription} onChange={set('shortDescription')} placeholder="One line shown on the deal card" /></div>
          <div className="sm:col-span-2"><Textarea label="Full description" rows={3} value={form.description} onChange={set('description')} /></div>
          <Select label="Category *" value={form.categoryId} onChange={set('categoryId')}
            options={[{ value: '', label: 'Select…' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]} />
          <Select label="Subcategory" value={form.subcategoryId} onChange={set('subcategoryId')}
            options={[{ value: '', label: 'None' }, ...(activeCategory?.subcategories || []).map((s) => ({ value: s.id, label: s.name }))]} />
          <Select label="Deal type" value={form.dealType} onChange={set('dealType')} options={DEAL_TYPES} />
          <Input label="Discount % *" type="number" min={1} max={100} value={form.discountPercent} onChange={set('discountPercent')} />
          <Input label="Original price (Rs.)" type="number" min={0} value={form.originalPrice} onChange={set('originalPrice')} />
          <Input label="Deal price (Rs.)" type="number" min={0} value={form.dealPrice} onChange={set('dealPrice')} />
          <Input label="Max discount cap (Rs.)" type="number" min={0} value={form.maxDiscountAmount} onChange={set('maxDiscountAmount')} />
          <Input label="Start date" type="date" value={form.startDate} onChange={set('startDate')} />
          <Input label="End date" type="date" value={form.endDate} onChange={set('endDate')} />
          <Input label="Per-user limit" type="number" min={1} value={form.perUserLimit} onChange={set('perUserLimit')} />
          <Input label="Total usage limit" type="number" min={0} value={form.usageLimit} onChange={set('usageLimit')} placeholder="Leave empty for unlimited" />
          <div className="sm:col-span-2">
            <p className="mb-1.5 text-sm font-semibold text-ink">Branches <span className="font-normal text-slate-500">(empty = all branches)</span></p>
            <div className="flex flex-wrap gap-2">
              {branches.map((b) => (
                <button key={b.id} type="button" onClick={() => toggleBranch(b.id)} aria-pressed={form.branchIds.includes(b.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${form.branchIds.includes(b.id) ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  {b.name}
                </button>
              ))}
              {branches.length === 0 && <p className="text-xs text-slate-500">No branches yet — add them under Branches first.</p>}
            </div>
          </div>
          <div className="sm:col-span-2">
            <p className="mb-1.5 text-sm font-semibold text-ink">Days available <span className="font-normal text-slate-500">(empty = all days)</span></p>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((day) => (
                <button key={day} type="button" onClick={() => toggleDay(day)} aria-pressed={form.daysAvailable.includes(day)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition ${form.daysAvailable.includes(day) ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  {day}
                </button>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2">
            <p className="mb-1.5 text-sm font-semibold text-ink">Images (up to 5)</p>
            <FileUpload label="Add image" accept="image/*" onSelect={onImage} hint="PNG/JPG, max 3 MB each — pick one at a time, up to 5" />
            {images.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {images.map((f, i) => (
                  <span key={i} className="flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs">
                    {f.name}
                    <button type="button" aria-label="Remove image" onClick={() => setImages((imgs) => imgs.filter((_, x) => x !== i))} className="text-slate-500 hover:text-error">✕</button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="sm:col-span-2"><Textarea label="Terms & conditions (one per line)" rows={3} value={form.terms} onChange={set('terms')} /></div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={form.requiresMembership} onChange={set('requiresMembership')} className="h-4 w-4 accent-[#0B6B4F]" />
            Requires active membership
          </label>
        </div>
      </Modal>

      <ConfirmModal open={!!confirmAction} onClose={() => setConfirmAction(null)}
        confirmLabel={confirmAction?.action === 'pause' ? 'Pause deal' : 'Delete deal'}
        onConfirm={() => {
          if (!confirmAction) return;
          if (confirmAction.action === 'pause') { runAction(confirmAction.deal, 'pause'); setConfirmAction(null); }
          else doDelete();
        }}
        title={confirmAction?.action === 'pause' ? 'Pause deal' : 'Delete deal'}
        action={confirmAction?.action === 'pause' ? 'Pause deal' : 'Delete deal'}
        affected={confirmAction?.deal.title}
        description={confirmAction?.action === 'delete' ? 'This only works for drafts or rejected deals. Published deals must be paused first.' : undefined} />
    </div>
  );
}
