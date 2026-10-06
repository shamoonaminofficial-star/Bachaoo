'use client';
import React, { useState } from 'react';
import { Breadcrumbs, Card, Input, Textarea, Button, useToast } from '@bachatly/ui';
import { createTicket } from '@/lib/engagement';
import { ApiError } from '@/lib/api';
import CmsContent from '@/components/CmsContent';

const CHANNELS = [
  ['📧', 'Email', 'support@bachatly.pk'],
  ['📞', 'Phone', '+92 48 372 0000'],
  ['💬', 'WhatsApp', '+92 300 000 0000'],
] as const;

export default function ContactPage() {
  const { toast } = useToast();
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const subject = String(data.get('subject') ?? '').trim();
    const message = `From: ${String(data.get('name') ?? '').trim()} <${String(data.get('email') ?? '').trim()}>\n\n${String(data.get('message') ?? '').trim()}`;
    if (!subject || !String(data.get('message') ?? '').trim()) { toast('Please complete the form.', 'error'); return; }
    setSending(true);
    try {
      await createTicket({ subject: `[Contact] ${subject}`, category: 'Other', message });
      setSent(true);
      toast('Message sent successfully.');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not send your message — please email us directly.', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 lg:px-6">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Contact' }]} />
      <CmsContent slug="contact" fallback={(
        <>
          <h1 className="mt-3 text-3xl font-extrabold text-ink">Contact Us</h1>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {CHANNELS.map(([i, t, v]) => (
              <Card key={t} className="p-5 text-center"><span className="text-3xl" aria-hidden>{i}</span><p className="mt-2 font-bold text-ink">{t}</p><p className="text-sm text-slate-500">{v}</p></Card>
            ))}
          </div>
          {sent ? (
            <Card className="mt-6 p-8 text-center"><span className="text-5xl" aria-hidden>✅</span><h2 className="mt-3 text-xl font-bold text-ink">Message sent!</h2><p className="mt-1 text-sm text-slate-500">Our team will get back to you within 24 hours.</p></Card>
          ) : (
            <form className="mt-6 space-y-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-card" onSubmit={submit}>
              <div className="grid gap-4 sm:grid-cols-2"><Input label="Name *" name="name" required /><Input label="Email *" name="email" type="email" required /></div>
              <Input label="Subject *" name="subject" required />
              <Textarea label="Message *" name="message" rows={4} required />
              <Button type="submit" loading={sending}>Send Message</Button>
            </form>
          )}
        </>
      )} />
    </div>
  );
}
