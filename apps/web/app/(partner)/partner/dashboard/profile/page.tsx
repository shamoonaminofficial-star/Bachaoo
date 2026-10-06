'use client';
import React, { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { Card, Input, Textarea, Select, Button, FileUpload, useToast, Skeleton, ErrorState, Badge } from '@bachatly/ui';
import { ApiError, validateUploadFile } from '@/lib/api';
import {
  partnerGetProfile, partnerUpdateProfile, partnerUploadProfileImage,
  fetchCategories, type ApiBusinessDetail,
} from '@/lib/catalog';
import { SEED_CATEGORIES } from '@/lib/seed';

export default function PartnerProfilePage() {
  const { toast } = useToast();
  const [biz, setBiz] = useState<ApiBusinessDetail | null>(null);
  const [error, setError] = useState(false);
  const [f, setF] = useState({ name: '', categoryId: '', phone: '', website: '', instagram: '', facebook: '', address: '', description: '' });
  const [cats, setCats] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState<'logo' | 'cover' | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const b = await partnerGetProfile();
      setBiz(b);
      setF({
        name: b.name || '', categoryId: b.category.id || '', phone: b.phone || '',
        website: b.website || '', instagram: b.instagram || '', facebook: b.facebook || '',
        address: b.address || '', description: b.description || '',
      });
    } catch { setBiz(null); setError(true); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetchCategories().then((c) => setCats(c.map((x) => ({ id: x.id, name: x.name })))).catch(() => setCats(SEED_CATEGORIES.map((x) => ({ id: x.id, name: x.name }))));
  }, []);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((v) => ({ ...v, [k]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) { toast('Business name is required.', 'error'); return; }
    setLoading(true);
    try {
      const updated = await partnerUpdateProfile({ ...f, name: f.name.trim() });
      setBiz(updated); toast('Business profile updated.');
    } catch (err) { toast(err instanceof ApiError ? err.message : 'Save failed.', 'error'); }
    finally { setLoading(false); }
  };

  const upload = async (kind: 'logo' | 'cover', file: File) => {
    const err = validateUploadFile(file, { maxMb: 3, kinds: ['image'] });
    if (err) { toast(err, 'error'); return; }
    setUploading(kind);
    try {
      const { url } = await partnerUploadProfileImage(kind, file);
      setBiz((b) => (b ? { ...b, [kind]: url } : b));
      toast(`${kind === 'logo' ? 'Logo' : 'Cover image'} uploaded.`);
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Upload failed.', 'error'); }
    finally { setUploading(null); }
  };

  if (!biz && !error) return <div className="max-w-3xl space-y-3"><Skeleton className="h-10 w-1/3" /><Skeleton className="h-96 w-full !rounded-2xl" /></div>;
  if (error || !biz) return <div className="max-w-3xl"><ErrorState title="Could not load your business profile" onRetry={load} /></div>;

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-extrabold text-ink">Business Profile</h1>
        {biz.isVerified ? <Badge tone="success">✓ Verified</Badge> : <Badge tone="warning">Pending verification</Badge>}
      </div>
      <form onSubmit={save} className="space-y-4">
        <Card className="grid gap-4 p-6 sm:grid-cols-2">
          <Input label="Business name *" value={f.name} onChange={set('name')} required />
          <Select label="Category" value={f.categoryId} onChange={set('categoryId')}
            options={[{ value: '', label: 'Select…' }, ...cats.map((c) => ({ value: c.id, label: c.name }))]} />
          <Input label="Phone" type="tel" value={f.phone} onChange={set('phone')} />
          <Input label="Website" value={f.website} onChange={set('website')} placeholder="https://" />
          <Input label="Instagram" value={f.instagram} onChange={set('instagram')} placeholder="@handle" />
          <Input label="Facebook" value={f.facebook} onChange={set('facebook')} placeholder="Page name or URL" />
          <div className="sm:col-span-2"><Input label="Address" value={f.address} onChange={set('address')} /></div>
          <div className="sm:col-span-2"><Textarea label="Description" rows={3} value={f.description} onChange={set('description')} /></div>
        </Card>
        <Card className="grid gap-4 p-6 sm:grid-cols-2">
          <div>
            <FileUpload label="Logo" accept="image/*" onSelect={(file) => upload('logo', file)} hint={uploading === 'logo' ? 'Uploading…' : 'PNG/JPG, max 3 MB'} />
            {biz.logo && (
              <span className="relative mt-2 block h-16 w-16 overflow-hidden rounded-xl">
                <Image src={biz.logo} alt="Business logo" fill sizes="64px" className="object-cover" />
              </span>
            )}
          </div>
          <div>
            <FileUpload label="Cover image" accept="image/*" onSelect={(file) => upload('cover', file)} hint={uploading === 'cover' ? 'Uploading…' : 'PNG/JPG, max 3 MB'} />
            {biz.cover && (
              <span className="relative mt-2 block h-16 w-full overflow-hidden rounded-xl">
                <Image src={biz.cover} alt="Business cover" fill sizes="50vw" className="object-cover" />
              </span>
            )}
          </div>
        </Card>
        <Button type="submit" loading={loading}>Save Profile</Button>
      </form>
    </div>
  );
}
