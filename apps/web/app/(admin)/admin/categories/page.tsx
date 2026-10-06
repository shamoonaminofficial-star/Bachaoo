'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { Card, Button, Badge, Input, Modal, ConfirmModal, useToast, Skeleton, EmptyState, ErrorState } from '@bachatly/ui';
import { ApiError } from '@/lib/api';
import {
  adminListCategories, adminCreateCategory, adminUpdateCategory,
  adminToggleCategory, adminDeleteCategory, adminCreateSubcategory, adminDeleteSubcategory,
  type ApiCategory,
} from '@/lib/catalog';

export default function AdminCategoriesPage() {
  const { toast } = useToast();
  const [cats, setCats] = useState<ApiCategory[] | null>(null);
  const [error, setError] = useState(false);
  const [modal, setModal] = useState<null | { mode: 'create' } | { mode: 'edit'; cat: ApiCategory }>(null);
  const [form, setForm] = useState({ name: '', slug: '', icon: '🗂️', image: '', sortOrder: '0' });
  const [del, setDel] = useState<ApiCategory | null>(null);
  const [subs, setSubs] = useState<ApiCategory | null>(null);
  const [newSub, setNewSub] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const list = await adminListCategories();
      setCats([...list].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
    } catch { setCats(null); setError(true); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setForm({ name: '', slug: '', icon: '🗂️', image: '', sortOrder: String((cats?.length || 0) + 1) }); setModal({ mode: 'create' }); };
  const openEdit = (cat: ApiCategory) => {
    setForm({ name: cat.name, slug: cat.slug, icon: cat.icon || '🗂️', image: cat.image || '', sortOrder: String(cat.sortOrder ?? 0) });
    setModal({ mode: 'edit', cat });
  };

  const save = async () => {
    if (!form.name.trim()) { toast('Name is required.', 'error'); return; }
    setSaving(true);
    try {
      const body = { name: form.name.trim(), slug: form.slug.trim() || undefined, icon: form.icon, image: form.image.trim() || undefined, sortOrder: Number(form.sortOrder) || 0 };
      if (modal?.mode === 'create') { await adminCreateCategory(body); toast('Category created.'); }
      else if (modal?.mode === 'edit') { await adminUpdateCategory(modal.cat.id, body); toast('Category updated.'); }
      setModal(null); await load();
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Save failed.', 'error'); }
    finally { setSaving(false); }
  };

  const toggle = async (cat: ApiCategory) => {
    try { await adminToggleCategory(cat.id); toast(cat.isActive ? 'Category disabled.' : 'Category enabled.'); await load(); }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Update failed.', 'error'); }
  };

  const doDelete = async () => {
    if (!del) return;
    try { await adminDeleteCategory(del.id); toast('Category deleted.'); setDel(null); await load(); }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Delete failed.', 'error'); }
  };

  const move = async (cat: ApiCategory, dir: -1 | 1) => {
    if (!cats) return;
    const sorted = [...cats].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const i = sorted.findIndex((c) => c.id === cat.id);
    const j = i + dir;
    if (j < 0 || j >= sorted.length) return;
    try {
      await adminUpdateCategory(cat.id, { sortOrder: sorted[j].sortOrder ?? 0 });
      await adminUpdateCategory(sorted[j].id, { sortOrder: cat.sortOrder ?? 0 });
      await load();
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Reorder failed.', 'error'); }
  };

  const addSub = async () => {
    if (!subs || !newSub.trim()) return;
    try {
      const s = await adminCreateSubcategory(subs.id, { name: newSub.trim() });
      setSubs({ ...subs, subcategories: [...(subs.subcategories || []), s] });
      setCats((cs) => (cs || []).map((c) => (c.id === subs.id ? { ...c, subcategories: [...(c.subcategories || []), s] } : c)));
      setNewSub(''); toast('Subcategory added.');
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Could not add subcategory.', 'error'); }
  };
  const removeSub = async (subId: string) => {
    if (!subs) return;
    try {
      await adminDeleteSubcategory(subs.id, subId);
      setSubs({ ...subs, subcategories: (subs.subcategories || []).filter((s) => s.id !== subId) });
      setCats((cs) => (cs || []).map((c) => (c.id === subs.id ? { ...c, subcategories: (c.subcategories || []).filter((s) => s.id !== subId) } : c)));
      toast('Subcategory removed.');
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Could not remove subcategory.', 'error'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-extrabold text-ink">Categories</h1>
        <p className="text-sm text-slate-500">Manage categories, subcategories, ordering and visibility.</p></div>
        <Button onClick={openCreate}>+ New Category</Button>
      </div>

      {!cats && !error && <Card className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</Card>}
      {error && <ErrorState title="Could not load categories" onRetry={load} />}
      {cats && cats.length === 0 && <EmptyState icon="🗂️" title="No categories" actionLabel="Create category" onAction={openCreate} />}
      {cats && cats.length > 0 && (
        <Card className="divide-y divide-slate-100">
          {cats.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 p-3">
              <span className="text-2xl" aria-hidden>{c.icon || '🗂️'}</span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink">{c.name}</p>
                <p className="text-xs text-slate-400">/{c.slug} · order {c.sortOrder} · {c.subcategories?.length || 0} subcategories · {c.dealCount} deals</p>
              </div>
              <Badge tone={c.isActive ? 'success' : 'neutral'}>{c.isActive ? 'ENABLED' : 'DISABLED'}</Badge>
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="ghost" onClick={() => move(c, -1)} aria-label={`Move ${c.name} up`}>↑</Button>
                <Button size="sm" variant="ghost" onClick={() => move(c, 1)} aria-label={`Move ${c.name} down`}>↓</Button>
                <Button size="sm" variant="outline" onClick={() => setSubs(c)}>Subcategories</Button>
                <Button size="sm" variant="outline" onClick={() => openEdit(c)}>Edit</Button>
                <Button size="sm" variant="outline" onClick={() => toggle(c)}>{c.isActive ? 'Disable' : 'Enable'}</Button>
                <Button size="sm" variant="ghost" onClick={() => setDel(c)}>Delete</Button>
              </div>
            </div>
          ))}
        </Card>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.mode === 'create' ? 'New category' : 'Edit category'}
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button><Button onClick={save} loading={saving}>{modal?.mode === 'create' ? 'Create' : 'Save'}</Button></>}>
        <div className="space-y-3">
          <Input label="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} hint="Leave blank to auto-generate from the name" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Icon (emoji)" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} />
            <Input label="Order" type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
          </div>
          <Input label="Image URL" value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} placeholder="https://…" />
        </div>
      </Modal>

      <Modal open={!!subs} onClose={() => setSubs(null)} title={`Subcategories — ${subs?.name}`}
        footer={<Button variant="ghost" onClick={() => setSubs(null)}>Done</Button>}>
        <div className="space-y-2">
          {(!subs?.subcategories || subs.subcategories.length === 0) && <p className="text-sm text-slate-500">No subcategories yet.</p>}
          {(subs?.subcategories || []).map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
              <span className="text-sm font-medium text-ink">{s.name} <span className="text-xs text-slate-400">/{s.slug}</span></span>
              <Button size="sm" variant="ghost" onClick={() => removeSub(s.id)}>Remove</Button>
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            <Input aria-label="New subcategory name" value={newSub} onChange={(e) => setNewSub(e.target.value)} placeholder="New subcategory…" />
            <Button onClick={addSub}>Add</Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal open={!!del} onClose={() => setDel(null)} danger confirmLabel="Delete category" requireReason
        onConfirm={doDelete}
        title="Delete category" action="Delete category" affected={del?.name} />
    </div>
  );
}
