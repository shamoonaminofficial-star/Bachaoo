'use client';
import React, { useEffect, useState } from 'react';
import { Button, Card, Input, Textarea, Select, FileUpload, Stepper, Breadcrumbs, useToast } from '@bachatly/ui';
import { validateUploadFile, ApiError } from '@/lib/api';
import { fetchCategories, fetchCities, submitApplication } from '@/lib/catalog';
import { SEED_CATEGORIES, CITIES } from '@/lib/seed';

export default function PartnerLandingPage() {
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState<{ id: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    businessName: '', ownerName: '', email: '', phone: '', whatsapp: '',
    categoryId: '', cityId: '', area: '', address: '', mapsLink: '',
    website: '', instagram: '', facebook: '', description: '',
  });
  const [logo, setLogo] = useState<File | null>(null);
  const [docs, setDocs] = useState<File[]>([]);
  const [cats, setCats] = useState<{ id: string; name: string }[]>([]);
  const [cities, setCities] = useState<{ id: string; name: string }[]>([]);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    fetchCategories().then((c) => setCats(c.map((x) => ({ id: x.id, name: x.name })))).catch(() => setCats(SEED_CATEGORIES.map((x) => ({ id: x.id, name: x.name }))));
    fetchCities().then((c) => setCities(c.map((x) => ({ id: x.id, name: x.name })))).catch(() => setCities(CITIES.map((name) => ({ id: name, name }))));
  }, []);

  const pickLogo = (f: File) => {
    const err = validateUploadFile(f, { maxMb: 3, kinds: ['image'] });
    if (err) { toast(err, 'error'); return; }
    setLogo(f); toast('Logo attached.');
  };
  const pickDoc = (f: File) => {
    const err = validateUploadFile(f, { maxMb: 8, kinds: ['image', 'pdf'] });
    if (err) { toast(err, 'error'); return; }
    setDocs((d) => [...d, f]); toast('Document attached.');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.businessName || !form.ownerName || !form.email || !form.phone || !form.categoryId || !form.cityId) {
      toast('Please fill in all required fields.', 'error'); return;
    }
    setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (v) fd.append(k, v); });
      if (logo) fd.append('logo', logo);
      docs.forEach((d) => fd.append('documents[]', d));
      const res = await submitApplication(fd);
      setSubmitted({ id: res.id });
      toast('Application submitted successfully.');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Could not submit. Please try again.';
      toast(msg, 'error');
    } finally { setLoading(false); }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Become a Partner' }]} />
      <div className="mt-4 overflow-hidden rounded-3xl bg-ink text-white">
        <div className="grid items-center gap-8 p-8 md:grid-cols-2 md:p-12">
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-accent">For Businesses</p>
            <h1 className="mt-3 text-3xl font-extrabold md:text-5xl">Grow Your Business With Us</h1>
            <p className="mt-4 text-slate-300">Put your business in front of thousands of ready-to-spend members. Get discovered, fill quiet hours, and track every rupee of promotion-driven revenue.</p>
            <ul className="mt-6 space-y-2 text-sm text-slate-200">
              {[['🎯', 'Customer reach — get discovered by members nearby'], ['📣', 'Marketing exposure across the Bachatly marketplace'], ['🆕', 'New customer acquisition with trackable redemptions'], ['📊', 'Performance analytics: views, redemptions, revenue']].map(([i, t]) => (
                <li key={t} className="flex gap-2"><span aria-hidden>{i}</span>{t}</li>
              ))}
            </ul>
            <Button variant="accent" size="lg" className="mt-6" onClick={() => document.getElementById('apply')?.scrollIntoView({ behavior: 'smooth' })}>Become a Partner</Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[['2,400+', 'Partner businesses'], ['180k+', 'Active members'], ['Rs. 42M', 'Partner revenue driven'], ['4.7★', 'Avg. partner rating']].map(([v, l]) => (
              <Card key={l} className="!bg-white/5 p-5 text-center backdrop-blur"><p className="text-2xl font-extrabold text-accent">{v}</p><p className="mt-1 text-xs text-slate-300">{l}</p></Card>
            ))}
          </div>
        </div>
      </div>

      <div id="apply" className="mx-auto mt-10 max-w-3xl scroll-mt-24">
        <h2 className="text-2xl font-extrabold text-ink">Partner application</h2>
        <p className="mt-1 text-sm text-slate-500">Tell us about your business. Our team reviews every application within 2 business days.</p>
        <div className="mt-4"><Stepper steps={['Application', 'Review', 'Approved', 'Go live']} current={submitted ? 1 : 0} /></div>
        {submitted ? (
          <Card className="mt-6 p-8 text-center">
            <span className="text-5xl" aria-hidden>✅</span>
            <h3 className="mt-3 text-xl font-bold text-ink">Application submitted!</h3>
            <p className="mt-2 text-sm text-slate-500">Status: <strong>Submitted — under review</strong>. We'll email you at {form.email} once reviewed.</p>
            <p className="mt-1 text-xs text-slate-400">Reference ID: {submitted.id}</p>
            <p className="mt-3 text-xs text-slate-400">You can track progress any time — we'll notify you at each stage (under review → approved / more info needed).</p>
          </Card>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-card">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Business Name *" value={form.businessName} onChange={set('businessName')} required />
              <Input label="Owner Name *" value={form.ownerName} onChange={set('ownerName')} required />
              <Input label="Email *" type="email" value={form.email} onChange={set('email')} required />
              <Input label="Phone *" type="tel" value={form.phone} onChange={set('phone')} required />
              <Input label="WhatsApp" type="tel" value={form.whatsapp} onChange={set('whatsapp')} />
              <Select label="Business Category *" value={form.categoryId} onChange={set('categoryId')}
                options={[{ value: '', label: 'Select…' }, ...cats.map((c) => ({ value: c.id, label: c.name }))]} />
              <Select label="City *" value={form.cityId} onChange={set('cityId')}
                options={[{ value: '', label: 'Select…' }, ...cities.map((c) => ({ value: c.id, label: c.name }))]} />
              <Input label="Area" value={form.area} onChange={set('area')} />
            </div>
            <Input label="Complete Address" value={form.address} onChange={set('address')} />
            <Input label="Google Maps location link" value={form.mapsLink} onChange={set('mapsLink')} placeholder="https://maps.google.com/…" hint="Paste your business location link from Google Maps" />
            <div className="grid gap-4 sm:grid-cols-3">
              <Input label="Website" value={form.website} onChange={set('website')} placeholder="https://" />
              <Input label="Instagram" value={form.instagram} onChange={set('instagram')} placeholder="@handle" />
              <Input label="Facebook" value={form.facebook} onChange={set('facebook')} placeholder="Page name or URL" />
            </div>
            <Textarea label="Business Description" rows={3} value={form.description} onChange={set('description')} />
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <FileUpload label="Business Logo" accept="image/*" onSelect={pickLogo} hint="PNG/JPG, max 3 MB" />
                {logo && <p className="mt-1 text-xs text-brand-700">✓ {logo.name}</p>}
              </div>
              <div>
                <FileUpload label="Business Documents" accept=".pdf,image/*" onSelect={pickDoc} hint="NTN, trade license — PDF/image, max 8 MB each" />
                {docs.map((d, i) => <p key={i} className="mt-1 text-xs text-brand-700">✓ {d.name}</p>)}
              </div>
              <FileUpload label="Owner ID" accept=".pdf,image/*" onSelect={pickDoc} hint="CNIC / passport — PDF/image" />
            </div>
            <Button type="submit" size="lg" loading={loading} fullWidth>Submit Application</Button>
            <p className="text-center text-xs text-slate-400">By submitting you agree to the partner terms. We never share your documents.</p>
          </form>
        )}
      </div>
    </div>
  );
}
