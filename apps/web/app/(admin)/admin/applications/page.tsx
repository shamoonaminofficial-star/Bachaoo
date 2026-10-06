'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { Card, Badge, Button, DataTable, Modal, Textarea, Select, Pagination, statusTone, useToast, EmptyState, ErrorState, Skeleton } from '@bachatly/ui';
import { ApiError } from '@/lib/api';
import { adminListApplications, adminDecideApplication, type ApiApplication, type Page } from '@/lib/catalog';

const STATUSES = ['', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'MORE_INFO'];

export default function ApplicationsPage() {
  const { toast } = useToast();
  const [data, setData] = useState<Page<ApiApplication> | null>(null);
  const [error, setError] = useState(false);
  const [status, setStatus] = useState('');
  const [pageNum, setPageNum] = useState(1);
  const [view, setView] = useState<ApiApplication | null>(null);
  const [decision, setDecision] = useState<{ row: ApiApplication; kind: 'approve' | 'reject' | 'request-changes' } | null>(null);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await adminListApplications({ status: status || undefined, page: pageNum, pageSize: 10 });
      setData(res);
    } catch { setData(null); setError(true); }
  }, [status, pageNum]);
  useEffect(() => { load(); }, [load]);

  const submitDecision = async () => {
    if (!decision) return;
    if ((decision.kind === 'reject' || decision.kind === 'request-changes') && !reason.trim()) {
      toast('A reason is required.', 'error'); return;
    }
    setSaving(true);
    try {
      await adminDecideApplication(decision.row.id, decision.kind, reason.trim() || undefined, notes.trim() || undefined);
      toast(decision.kind === 'approve' ? 'Application approved.' : decision.kind === 'reject' ? 'Application rejected.' : 'Sent back for more information.');
      setDecision(null); setReason(''); setNotes('');
      await load();
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Decision failed.', 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-extrabold text-ink">Partner Applications</h1>
        <p className="text-sm text-slate-500">{data ? `${data.total} applications` : 'Review and decide on partner applications.'}</p></div>
        <div className="w-56">
          <Select aria-label="Filter by status" value={status} onChange={(e) => { setStatus(e.target.value); setPageNum(1); }}
            options={[{ value: '', label: 'All statuses' }, ...STATUSES.filter(Boolean).map((s) => ({ value: s, label: s.replace(/_/g, ' ') }))]} />
        </div>
      </div>

      <Card className="p-4">
        {!data && !error && <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>}
        {error && <ErrorState title="Could not load applications" onRetry={load} />}
        {data && data.items.length === 0 && <EmptyState icon="📝" title="No applications" description={status ? 'Nothing with this status.' : 'New partner applications will appear here.'} />}
        {data && data.items.length > 0 && (
          <>
            <DataTable<ApiApplication> rows={data.items} searchable={['businessName', 'ownerName', 'city']} exportName="applications" onRowClick={setView}
              columns={[
                { key: 'businessName', header: 'Business', sortable: true },
                { key: 'ownerName', header: 'Owner' },
                { key: 'category', header: 'Category', render: (r) => r.category || '—' },
                { key: 'city', header: 'City', sortable: true, render: (r) => r.city || '—' },
                { key: 'submittedAt', header: 'Submitted', sortable: true, render: (r) => new Date(r.submittedAt).toLocaleDateString('en-PK') },
                { key: 'status', header: 'Status', render: (r) => <Badge tone={statusTone[r.status.toLowerCase()] || 'neutral'}>{r.status.replace(/_/g, ' ')}</Badge> },
                { key: 'actions', header: 'Actions', render: (r) => (
                  <span onClick={(e) => e.stopPropagation()} className="flex gap-1.5">
                    <Button size="sm" onClick={() => setDecision({ row: r, kind: 'approve' })}>Approve</Button>
                    <Button size="sm" variant="outline" onClick={() => setDecision({ row: r, kind: 'request-changes' })}>Request info</Button>
                    <Button size="sm" variant="ghost" onClick={() => setDecision({ row: r, kind: 'reject' })}>Reject</Button>
                  </span>) },
              ]} />
            <div className="mt-4"><Pagination page={data.page} totalPages={data.totalPages} onChange={setPageNum} /></div>
          </>
        )}
      </Card>

      <Modal open={!!view} onClose={() => setView(null)} title={view?.businessName || ''} wide
        footer={<Button variant="ghost" onClick={() => setView(null)}>Close</Button>}>
        {view && (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {[['Owner', view.ownerName], ['Email', view.email], ['Phone', view.phone], ['Category', view.category || '—'], ['City', view.city || '—'], ['Submitted', new Date(view.submittedAt).toLocaleString('en-PK')], ['Status', view.status.replace(/_/g, ' ')]].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">{k}</dt><dd className="font-semibold text-ink">{v}</dd></div>
            ))}
            <div className="col-span-2 rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Documents</p>
              <p className="text-sm text-brand-700">{view.documents?.length ? view.documents.map((d) => `📎 ${d}`).join(' · ') : 'No documents attached'}</p>
            </div>
          </dl>
        )}
      </Modal>

      <Modal open={!!decision} onClose={() => setDecision(null)}
        title={`${decision?.kind === 'approve' ? 'Approve' : decision?.kind === 'reject' ? 'Reject' : 'Request more information'} — ${decision?.row.businessName}`}
        footer={<><Button variant="ghost" onClick={() => setDecision(null)}>Cancel</Button>
          <Button variant={decision?.kind === 'reject' ? 'danger' : 'primary'} onClick={submitDecision} loading={saving}>Confirm</Button></>}>
        <div className="space-y-3">
          <div><label className="mb-1.5 block text-sm font-semibold">Reason {decision?.kind !== 'approve' && '*'}</label>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason shown to the applicant…" /></div>
          <div><label className="mb-1.5 block text-sm font-semibold">Internal notes</label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reviewer notes (stored with reviewer + timestamp)…" /></div>
        </div>
      </Modal>
    </div>
  );
}
