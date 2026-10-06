'use client';
import React from 'react';
import { Input } from './Input';
import { Button } from './Button';
import { EmptyState } from './EmptyState';

export interface Column<T> { key: string; header: string; render?: (row: T) => React.ReactNode; sortable?: boolean; hideable?: boolean; }

export function DataTable<T extends { id: string | number }>({ columns, rows, searchable, onRowClick, exportName }: {
  columns: Column<T>[]; rows: T[]; searchable?: string[]; onRowClick?: (row: T) => void; exportName?: string;
}) {
  const [q, setQ] = React.useState('');
  const [sortKey, setSortKey] = React.useState<string | null>(null);
  const [sortDir, setSortDir] = React.useState<1 | -1>(1);
  const [hidden, setHidden] = React.useState<string[]>([]);
  const [page, setPage] = React.useState(1);
  const perPage = 10;

  const visible = columns.filter((c) => !hidden.includes(c.key));
  let filtered = rows;
  if (q && searchable) {
    const needle = q.toLowerCase();
    filtered = rows.filter((r) => searchable.some((k) => String((r as any)[k] ?? '').toLowerCase().includes(needle)));
  }
  if (sortKey) {
    filtered = [...filtered].sort((a, b) => {
      const av = (a as any)[sortKey]; const bv = (b as any)[sortKey];
      return (av > bv ? 1 : av < bv ? -1 : 0) * sortDir;
    });
  }
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageRows = filtered.slice((page - 1) * perPage, page * perPage);

  const exportCsv = () => {
    const head = visible.map((c) => c.header).join(',');
    const body = filtered.map((r) => visible.map((c) => `"${String(c.render ? '' : (r as any)[c.key] ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([[head, body].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `${exportName || 'export'}.csv`; a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {searchable && <div className="min-w-[220px] flex-1"><Input placeholder="Search…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Search table" /></div>}
        <div className="ml-auto flex gap-2">
          {exportName && <Button variant="outline" size="sm" onClick={exportCsv}>Export CSV</Button>}
        </div>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60">
              {visible.map((c) => (
                <th key={c.key} className="px-4 py-3 font-semibold text-slate-600">
                  {c.sortable ? (
                    <button onClick={() => { setSortKey(c.key); setSortDir(sortKey === c.key && sortDir === 1 ? -1 : 1); }} className="inline-flex items-center gap-1 hover:text-ink">
                      {c.header} <span aria-hidden>{sortKey === c.key ? (sortDir === 1 ? '▲' : '▼') : '⇅'}</span>
                    </button>
                  ) : c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => (
              <tr key={r.id} onClick={() => onRowClick?.(r)} className={`border-b border-slate-50 last:border-0 hover:bg-slate-50/60 ${onRowClick ? 'cursor-pointer' : ''}`}>
                {visible.map((c) => <td key={c.key} className="px-4 py-3 text-slate-700">{c.render ? c.render(r) : String((r as any)[c.key] ?? '—')}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {pageRows.length === 0 && <div className="p-4"><EmptyState icon="📋" title="No records found" description="Try adjusting your search." /></div>}
      </div>
      <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
        <span>{filtered.length} of {rows.length} records</span>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹ Prev</Button>
          <span className="px-2 py-1.5">{page} / {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next ›</Button>
        </div>
      </div>
    </div>
  );
}
