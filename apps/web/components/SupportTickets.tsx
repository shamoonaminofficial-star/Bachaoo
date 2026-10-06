'use client';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Card, Badge, Button, Input, Textarea, Select, Accordion,
  Skeleton, EmptyState, ErrorState, useToast,
} from '@bachatly/ui';
import { ApiError } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import {
  fetchTickets, createTicket, fetchTicket, sendTicketMessage, fetchFaq,
  SUPPORT_CATEGORIES,
  type SupportTicket, type TicketMessage, type FaqItem,
} from '@/lib/engagement';

const STATUS_TONE: Record<string, 'info' | 'success' | 'warn' | 'error' | 'neutral'> = {
  OPEN: 'info', PENDING: 'warn', ANSWERED: 'info', RESOLVED: 'success', CLOSED: 'neutral',
};

function ThreadView({ ticketId, onBack }: { ticketId: string; onBack: () => void }) {
  const { toast } = useToast();
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const res = await fetchTicket(ticketId).catch(() => null);
    if (res) { setTicket(res.ticket); setMessages(res.messages); }
    setReady(true);
  }, [ticketId]);

  useEffect(() => { load(); }, [load]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    try {
      await sendTicketMessage(ticketId, message.trim());
      setMessage('');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not send your message.', 'error');
    } finally {
      setSending(false);
    }
  };

  if (!ready) return <Skeleton className="h-64 w-full !rounded-2xl" />;
  if (!ticket) return <ErrorState title="Ticket not found" description="This ticket may have been closed or removed." onRetry={load} />;

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm font-semibold text-brand-700 hover:underline">← Back to tickets</button>
      <Card className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="font-bold text-ink">{ticket.subject}</h2>
            {ticket.createdAt && <p className="mt-0.5 text-xs text-slate-400">Opened {timeAgo(ticket.createdAt)}</p>}
          </div>
          {ticket.status && <Badge tone={STATUS_TONE[ticket.status.toUpperCase()] ?? 'neutral'}>{ticket.status}</Badge>}
        </div>
        <div className="mt-4 space-y-3">
          {messages.length === 0 && <p className="text-sm text-slate-400">No messages yet.</p>}
          {messages.map((m) => (
            <div key={m.id} className="rounded-xl bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-ink">{m.authorName ?? 'Support'}</p>
                {m.createdAt && <p className="text-[11px] text-slate-400">{timeAgo(m.createdAt)}</p>}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{m.body}</p>
            </div>
          ))}
        </div>
        <form onSubmit={send} className="mt-4 space-y-2">
          <Textarea label="Reply" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={2000} placeholder="Type your message…" required />
          <Button type="submit" loading={sending} size="sm">Send message</Button>
        </form>
      </Card>
    </div>
  );
}

/**
 * Shared support experience (Phase 11): FAQ accordion + ticket list +
 * new-ticket form + thread view. Used by customer and partner pages.
 */
export default function SupportTickets({ audience }: { audience: 'customer' | 'partner' }) {
  const { toast } = useToast();
  const [faq, setFaq] = useState<FaqItem[] | null>(null);
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [openTicket, setOpenTicket] = useState<string | null>(null);
  const [form, setForm] = useState({ subject: '', category: SUPPORT_CATEGORIES[0], message: '' });
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const [f, t] = await Promise.all([fetchFaq().catch(() => null), fetchTickets().catch(() => null)]);
      setFaq(f);
      setTickets(t);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load support.');
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.subject.trim() || !form.message.trim()) { toast('Please add a subject and a message.', 'error'); return; }
    setSending(true);
    try {
      await createTicket({ subject: form.subject.trim(), category: form.category, message: form.message.trim() });
      toast('Ticket submitted. Our team will get back to you.');
      setForm({ subject: '', category: SUPPORT_CATEGORIES[0], message: '' });
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not submit your ticket yet. Please try again later.', 'error');
    } finally {
      setSending(false);
    }
  };

  if (openTicket) return <ThreadView ticketId={openTicket} onBack={() => { setOpenTicket(null); load(); }} />;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-extrabold text-ink">Support</h1>

      {faq && faq.length > 0 && (
        <section>
          <h2 className="mb-2 font-extrabold text-ink">Quick answers</h2>
          <Accordion items={faq.map((f) => ({ title: f.question, content: f.answer }))} />
        </section>
      )}

      <Card className="p-6">
        <h2 className="font-bold text-ink">Open a ticket</h2>
        <form onSubmit={submit} className="mt-3 space-y-3">
          <Select label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
            options={SUPPORT_CATEGORIES.map((c) => ({ value: c, label: c }))} />
          <Input label="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required maxLength={120} />
          <Textarea label="Message" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={4} required maxLength={2000} />
          <Button type="submit" loading={sending}>Submit ticket</Button>
        </form>
      </Card>

      <div>
        <h2 className="mb-3 font-extrabold text-ink">Your tickets</h2>
        {error ? (
          <ErrorState title="Couldn't load tickets" description={error} onRetry={load} />
        ) : !ready ? (
          <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : tickets === null ? (
          <EmptyState icon="💬" title="Ticket list coming soon" description="The ticket API isn't live yet — new tickets are still sent to our team." />
        ) : tickets.length === 0 ? (
          <EmptyState icon="💬" title="No tickets yet" description="Open a ticket above and our team will help you out." />
        ) : (
          <Card className="divide-y divide-slate-100">
            {tickets.map((t) => (
              <button key={t.id} onClick={() => setOpenTicket(t.id)} className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-slate-50">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{t.subject}</p>
                  <p className="text-xs text-slate-400">
                    {t.category ? `${t.category} · ` : ''}{t.createdAt ? timeAgo(t.createdAt) : ''}
                  </p>
                </div>
                {t.status && <Badge tone={STATUS_TONE[t.status.toUpperCase()] ?? 'neutral'}>{t.status}</Badge>}
              </button>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
