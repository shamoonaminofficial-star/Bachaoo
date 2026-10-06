'use client';
import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import {
  Card, Badge, Button, DataTable, Modal, Textarea, Tabs, statusTone,
  useToast, EmptyState, Drawer, Rating,
} from '@bachatly/ui';
import { ApiError } from '@/lib/api';
import { adminDealQueue, adminDealDecision, type ApiPartnerDeal } from '@/lib/catalog';
import { adminBatchDeals } from '@/lib/admin';
import { formatDate } from '@/lib/format';

type DecisionKind = 'approve' | 'reject' | 'request-changes' | 'publish';

export default function AdminDealsPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<ApiPartnerDeal[] | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState('pending_approval');
  const [preview, setPreview] = useState<ApiPartnerDeal | null>(null);
  const [decision, setDecision] = useState<{ row: ApiPartnerDeal; kind: DecisionKind } | null>(null);
  const [reason, setReason] = useState('');
  const [deciding, setDeciding] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batching, setBatching] = useState(false);

  const load = async () => {
    setError(false);
    try { setRows(await adminDealQueue(tab === 'all' ? '' : tab)); }
    catch { setRows(null); setError(true); }
  };
  useEffect(() => { load(); }, [tab]);

  const decide = async () => {
    if (!decision) return;
    if (decision.kind !== 'approve' && decision.kind !== 'publish' && !reason.trim()) { toast('A reason is required — it is stored with the reviewer and timestamp.', 'error'); return; }
    setDeciding(true);
    try {
      await adminDealDecision(decision.row.id, decision.kind, reason.trim() || undefined);
      toast(
        decision.kind === 'approve' ? 'Deal approved. It can now be published.'
        : decision.kind === 'publish' ? 'Deal published — it is now live.'
        : decision.kind === 'reject' ? 'Deal rejected.' : 'Sent back with requested changes.',
      );
      setDecision(null); setReason(''); setPreview(null); load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Decision failed.', 'error');
    } finally { setDeciding(false); }
  };

  const batch = async (action: 'approve' | 'reject' | 'pause' | 'publish', reason?: string) => {
    const ids = [...selected];
    if (!ids.length) return;
    if ((action === 'reject' || action === 'pause') && !reason?.trim()) { toast('A reason is required for reject/pause.', 'error'); return; }
    setBatching(true);
    try {
      const res = await adminBatchDeals(ids, action, reason?.trim() || undefined);
      const ok = res.results.filter((r) => r.ok).length;
      const failed = res.results.filter((r) => !r.ok);
      toast(`${ok} deal${ok === 1 ? '' : 's'} ${action}d.` + (failed.length ? ` ${failed.length} failed.` : ''));
      failed.forEach((f) => toast(`${f.id.slice(0, 8)}: ${f.error ?? 'failed'}`, 'error'));
      setSelected(new Set()); load();
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Batch action failed.', 'error'); }
    finally { setBatching(false); }
  };

  const toggleSelect = (id: string) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const counts = {
    pending_approval: (rows || []).filter((r) => r.status === 'pending_approval').length,
    approved: (rows || []).filter((r) => r.status === 'approved').length,
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-ink">Deals</h1>
      <Tabs tabs={[
        { id: 'pending_approval', label: `Approval Queue (${counts.pending_approval})` },
        { id: 'approved', label: `Approved — Awaiting Publish (${counts.approved})` },
        { id: 'all', label: 'All Deals' },
      ]} active={tab} onChange={setTab} />

      <Card className="p-4">
        {error ? (
          <EmptyState icon="⚠️" title="Could not load deals" actionLabel="Retry" onAction={load} />
        ) : !rows ? (
          <p className="p-4 text-sm text-slate-500">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState icon="✅" title="Queue is clear"
            description={tab === 'all' ? 'No deals found.' : 'Nothing waiting for review right now.'} />
        ) : (
          <>
          {selected.size > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl bg-brand-50 p-3">
              <span className="text-sm font-semibold text-brand-800">{selected.size} selected</span>
              <Button size="sm" disabled={batching} onClick={() => batch('approve')}>Approve</Button>
              <Button size="sm" disabled={batching} onClick={() => batch('publish')}>Publish</Button>
              <Button size="sm" variant="outline" disabled={batching} onClick={() => batch('pause', prompt('Reason for pausing:') ?? '')}>Pause</Button>
              <Button size="sm" variant="danger" disabled={batching} onClick={() => batch('reject', prompt('Rejection reason:') ?? '')}>Reject</Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
            </div>
          )}
          <DataTable<ApiPartnerDeal> rows={rows} searchable={['title']} exportName="admin-deals" onRowClick={setPreview}
            columns={[
              { key: 'select', header: '', render: (r) => (
                <input type="checkbox" checked={selected.has(r.id)} onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleSelect(r.id)} aria-label={`Select ${r.title}`} className="h-4 w-4 accent-[#0B6B4F]" />) },
              { key: 'title', header: 'Deal', sortable: true, render: (r) => <span className="font-medium text-ink">{r.title}</span> },
              { key: 'business', header: 'Business', sortable: true, render: (r) => r.business?.name ?? '—' },
              { key: 'discountPercent', header: 'Discount', render: (r) => `${r.discountPercent}%` },
              { key: 'submittedAt', header: 'Submitted', sortable: true, render: (r) => (r.submittedAt ? formatDate(r.submittedAt) : '—') },
              { key: 'status', header: 'Status', render: (r) => <Badge tone={statusTone[r.status] || 'neutral'}>{r.status.replace(/_/g, ' ').toUpperCase()}</Badge> },
              {
                key: 'actions', header: 'Actions', render: (r) => (
                  <span onClick={(e) => e.stopPropagation()} className="flex flex-wrap gap-1.5">
                    {r.status === 'pending_approval' && (<>
                      <Button size="sm" onClick={() => setDecision({ row: r, kind: 'approve' })}>Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => setDecision({ row: r, kind: 'request-changes' })}>Request changes</Button>
                      <Button size="sm" variant="ghost" onClick={() => setDecision({ row: r, kind: 'reject' })}>Reject</Button>
                    </>)}
                    {r.status === 'approved' && (
                      <Button size="sm" onClick={() => setDecision({ row: r, kind: 'publish' })}>Publish</Button>
                    )}
                    {r.status === 'published' && <Button size="sm" variant="ghost" onClick={() => setPreview(r)}>View</Button>}
                  </span>),
              },
            ]} />
          </>
        )}
      </Card>

      {/* Preview drawer */}
      <Drawer open={!!preview} onClose={() => setPreview(null)} title="Deal preview">
        {preview && (
          <div className="space-y-4">
            <div className="relative h-44 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-50 to-slate-100">
              {preview.image
                ? <Image src={preview.image} alt={preview.title} fill sizes="50vw" className="object-cover" />
                : <div className="flex h-full items-center justify-center text-5xl" aria-hidden>🎟️</div>}
              <span className="absolute left-3 top-3 rounded-lg bg-error px-2.5 py-1 text-sm font-extrabold text-white">{preview.discountPercent}% OFF</span>
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-ink">{preview.title}</h3>
              <p className="text-sm text-slate-500">{preview.shortDescription}</p>
              <div className="mt-2 flex items-center gap-2 text-sm">
                <Badge tone={statusTone[preview.status] || 'neutral'}>{preview.status.replace(/_/g, ' ').toUpperCase()}</Badge>
                <span className="text-slate-500">🏪 {preview.business?.name}</span>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {[['Category', preview.category], ['City / Area', `${preview.city}${preview.area ? `, ${preview.area}` : ''}`],
                ['Members only', preview.requiresMembership ? 'Yes' : 'No'], ['Deal type', preview.dealType?.replace(/_/g, ' ') || '—'],
                ['Per-user limit', String(preview.perUserLimit)], ['Expires', preview.expiresAt ? formatDate(preview.expiresAt) : '—'],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">{k}</dt><dd className="font-semibold text-ink">{v}</dd></div>
              ))}
            </dl>
            {preview.description && <p className="text-sm text-slate-600">{preview.description}</p>}
            {preview.terms?.length > 0 && (
              <div><p className="text-sm font-semibold text-ink">Terms</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-600">{preview.terms.map((t, i) => <li key={i}>{t}</li>)}</ul></div>
            )}
            {preview.status === 'pending_approval' && (
              <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                <Button onClick={() => setDecision({ row: preview, kind: 'approve' })}>Approve & Publish</Button>
                <Button variant="outline" onClick={() => setDecision({ row: preview, kind: 'request-changes' })}>Request changes</Button>
                <Button variant="ghost" className="!text-error" onClick={() => setDecision({ row: preview, kind: 'reject' })}>Reject</Button>
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* Decision modal */}
      <Modal open={!!decision} onClose={() => setDecision(null)}
        title={decision?.kind === 'approve' ? 'Approve deal' : decision?.kind === 'reject' ? 'Reject deal' : decision?.kind === 'publish' ? 'Publish deal' : 'Request changes'}
        footer={<>
          <Button variant="ghost" onClick={() => setDecision(null)}>Cancel</Button>
          <Button variant={decision?.kind === 'reject' ? 'danger' : 'primary'} onClick={decide} loading={deciding}>Confirm</Button>
        </>}>
        <p className="text-sm text-slate-600">Deal: <strong className="text-ink">{decision?.row.title}</strong> — {decision?.row.business?.name}</p>
        <label className="mb-1.5 mt-4 block text-sm font-semibold text-ink">
          Reason / notes {(decision?.kind === 'reject' || decision?.kind === 'request-changes') && <span className="text-error">*</span>}
        </label>
        <Textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="Stored with reviewer name + timestamp in the audit log…" />
        {decision?.kind === 'approve' && (
          <p className="mt-2 text-xs text-slate-500">The deal goes live immediately and becomes visible to customers.</p>
        )}
      </Modal>
    </div>
  );
}
