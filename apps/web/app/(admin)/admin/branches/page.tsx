'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { Card, Badge, DataTable, Input, Pagination, statusTone, EmptyState, ErrorState, Skeleton, useToast } from '@bachatly/ui';
import { adminListBranches, type ApiBranch, type Page } from '@/lib/catalog';

export default function AdminBranchesPage() {
  const { toast } = useToast();
  const [data, setData] = useState<Page<ApiBranch> | null>(null);
  const [error, setError] = useState(false);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [pageNum, setPageNum] = useState(1);

  useEffect(() => { const t = setTimeout(() => { setDebouncedQ(q); setPageNum(1); }, 350); return () => clearTimeout(t); }, [q]);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await adminListBranches({ q: debouncedQ || undefined, page: pageNum, pageSize: 12 });
      setData(res);
    } catch { setData(null); setError(true); }
  }, [debouncedQ, pageNum]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-extrabold text-ink">Branches</h1>
      <p className="text-sm text-slate-500">{data ? `${data.total} branches across all businesses` : 'Every branch of every partner business.'}</p></div>
      <Card className="p-4">
        <div className="mb-3 max-w-md">
          <Input aria-label="Search branches" placeholder="Search branch, business, city…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {!data && !error && <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>}
        {error && <ErrorState title="Could not load branches" onRetry={load} />}
        {data && data.items.length === 0 && <EmptyState icon="📍" title="No branches found" />}
        {data && data.items.length > 0 && (
          <>
            <DataTable<ApiBranch> rows={data.items} searchable={['name', 'city']} exportName="branches"
              columns={[
                { key: 'name', header: 'Branch', sortable: true },
                { key: 'business', header: 'Business', sortable: true, render: (r) => r.business?.name || '—' },
                { key: 'city', header: 'City', sortable: true, render: (r) => r.city || '—' },
                { key: 'manager', header: 'Manager', render: (r) => r.manager || '—' },
                { key: 'phone', header: 'Phone', render: (r) => r.phone || '—' },
                { key: 'status', header: 'Status', render: (r) => <Badge tone={statusTone[r.isActive ? 'active' : 'cancelled'] || 'neutral'}>{r.isActive ? 'ACTIVE' : 'INACTIVE'}</Badge> },
              ]} />
            <div className="mt-4"><Pagination page={data.page} totalPages={data.totalPages} onChange={setPageNum} /></div>
          </>
        )}
      </Card>
      <p className="text-xs text-slate-400">Branch edits are made by the business owner in the partner portal; admins can view all branches here.</p>
    </div>
  );
}
