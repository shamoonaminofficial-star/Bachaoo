'use client';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Button, Card, EmptyState, ErrorState, Skeleton, useToast,
} from '@bachatly/ui';
import { ApiError } from '@/lib/api';
import {
  exportReport, fetchReport, type ReportResult, type ReportType,
} from '@/lib/finance';

const REPORTS: Array<{ id: ReportType; label: string; icon: string }> = [
  { id: 'membership-sales', label: 'Membership Sales', icon: '👑' },
  { id: 'redemptions', label: 'Redemptions', icon: '🧾' },
  { id: 'savings', label: 'Customer Savings', icon: '💰' },
  { id: 'commissions', label: 'Commissions', icon: '📉' },
  { id: 'settlements', label: 'Settlements', icon: '🏦' },
  { id: 'businesses', label: 'Businesses', icon: '🏪' },
  { id: 'users', label: 'Users', icon: '👥' },
];

function prettyKey(k: string): string {
  return k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim();
}

function prettyValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  if (/^\d{4}-\d{2}-\d{2}T/.test(String(v))) {
    const d = new Date(String(v));
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-PK');
  }
  return String(v);
}

export default function ReportsPage() {
  const { toast } = useToast();
  const [type, setType] = useState<ReportType>('membership-sales');
  const [from, setFrom] = useState('2026-09-01');
  const [to, setTo] = useState('2026-10-06');
  const [report, setReport] = useState<ReportResult | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const r = await fetchReport(type, { from, to, page: 1, pageSize: 20 });
      if (r === null) { setUnavailable(true); return; }
      setUnavailable(false);
      setReport(r);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load the report.');
    }
  }, [type, from, to]);

  useEffect(() => { load(); }, [load]);

  const runExport = async (format: 'csv' | 'xlsx') => {
    setExporting(true);
    try {
      await exportReport(type, format, { from, to });
      toast(`Report exported as ${format.toUpperCase()}.`, 'success');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'EXPORT_UNAVAILABLE') {
        toast('XLSX export is not live yet — please use CSV.', 'error');
      } else {
        toast(e instanceof ApiError ? e.message : 'Export failed.', 'error');
      }
    } finally {
      setExporting(false);
    }
  };

  const label = REPORTS.find((r) => r.id === type)?.label ?? type;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-ink">Reports</h1>

      <div className="flex flex-wrap gap-2">
        {REPORTS.map((r) => (
          <button key={r.id} type="button" onClick={() => setType(r.id)}
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${
              type === r.id ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>
            <span aria-hidden>{r.icon}</span> {r.label}
          </button>
        ))}
      </div>

      <Card className="flex flex-wrap items-end gap-3 p-5">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <Button variant="outline" onClick={load}>Apply</Button>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" disabled={exporting || unavailable} onClick={() => runExport('csv')}>
            {exporting ? 'Exporting…' : '⬇ Export CSV'}
          </Button>
          <Button variant="outline" size="sm" disabled={exporting || unavailable} onClick={() => runExport('xlsx')}>
            {exporting ? 'Exporting…' : '⬇ Export XLSX'}
          </Button>
        </div>
      </Card>

      {unavailable ? (
        <Card className="p-4">
          <EmptyState title="Reports are not live yet" icon="📑"
            description="The GET /reports/:type endpoints are not deployed yet. Report previews and exports will render here automatically once the backend lands." />
        </Card>
      ) : error ? (
        <ErrorState title="Couldn't load the report" description={error} onRetry={load} />
      ) : !report ? (
        <Skeleton className="h-48 !rounded-2xl" />
      ) : (
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold text-ink">{label} — preview (first 20 rows)</h2>
            {Object.keys(report.summary).length > 0 && (
              <div className="flex gap-3 text-xs text-slate-500">
                {Object.entries(report.summary).map(([k, v]) => (
                  <span key={k}><strong className="text-ink">{prettyValue(v)}</strong> {prettyKey(k)}</span>
                ))}
              </div>
            )}
          </div>
          {report.rows.length === 0 ? (
            <EmptyState title="No rows" icon="📭" description="No records match this period." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    {report.columns.slice(0, 8).map((c) => (
                      <th key={c} className="px-3 py-2 font-bold text-slate-600">{prettyKey(c)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      {report.columns.slice(0, 8).map((c) => (
                        <td key={c} className="max-w-[220px] truncate px-3 py-2 text-slate-700">{prettyValue(row[c])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-slate-400">
            Full data is available via CSV export. XLSX export may not be enabled on the server yet — CSV always works.
          </p>
        </Card>
      )}
    </div>
  );
}
