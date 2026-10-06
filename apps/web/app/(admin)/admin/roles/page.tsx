'use client';
import React, { useEffect, useState } from 'react';
import { Card, Button, useToast, Skeleton, EmptyState, ErrorState } from '@bachatly/ui';
import { ApiError } from '@/lib/api';
import { adminListRoles, adminListPermissions, adminSaveRolePermissions, type RoleRow, type PermissionRow } from '@/lib/admin';

export default function RolesPage() {
  const { toast } = useToast();
  const [roles, setRoles] = useState<RoleRow[] | null>(null);
  const [perms, setPerms] = useState<PermissionRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState('');
  const [matrix, setMatrix] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([adminListRoles(), adminListPermissions()])
      .then(([r, p]) => {
        if (r === null || p === null) { setFailed(true); return; }
        setRoles(r); setPerms(p);
        const m: Record<string, string[]> = {};
        r.forEach((role) => { m[role.id] = role.permissions ?? []; });
        setMatrix(m);
        setActive(r[0]?.id ?? '');
      })
      .catch(() => setFailed(true));
  }, []);

  const toggle = (perm: string) => {
    if (!active) return;
    setMatrix((m) => {
      const has = (m[active] || []).includes(perm);
      return { ...m, [active]: has ? m[active].filter((x) => x !== perm) : [...(m[active] || []), perm] };
    });
  };

  const save = async () => {
    if (!active) return;
    setSaving(true);
    try {
      await adminSaveRolePermissions(active, matrix[active] || []);
      toast('Permissions updated (logged to audit).');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Save failed.', 'error');
    } finally { setSaving(false); }
  };

  if (failed) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-extrabold text-ink">Roles & Permissions</h1>
        <ErrorState title="Could not load roles" description="GET /roles is not deployed yet, or you lack the admin.manage permission." onRetry={() => window.location.reload()} />
      </div>
    );
  }

  if (!roles || !perms) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-extrabold text-ink">Roles & Permissions</h1>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const activeRole = roles.find((r) => r.id === active);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-ink">Roles & Permissions</h1>
      {roles.length === 0 ? <EmptyState title="No roles found" description="Roles are seeded with the platform." /> : (
        <div className="grid gap-4 lg:grid-cols-4">
          <Card className="p-3 lg:col-span-1">
            <p className="px-2 pb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Roles</p>
            {roles.map((r) => (
              <button key={r.id} onClick={() => setActive(r.id)} className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-medium ${active === r.id ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{r.name}</button>
            ))}
          </Card>
          <Card className="p-5 lg:col-span-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-ink">{activeRole?.name}</h2>
                {activeRole?.description && <p className="text-sm text-slate-500">{activeRole.description}</p>}
              </div>
              <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Permissions'}</Button>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {perms.map((p) => {
                const on = (matrix[active] || []).includes(p.key);
                return (
                  <label key={p.key} className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm ${on ? 'border-brand-600 bg-brand-50' : 'border-slate-200'}`}>
                    <span><span className="font-mono text-xs">{p.key}</span>{p.description && <span className="block text-xs text-slate-500">{p.description}</span>}</span>
                    <input type="checkbox" checked={on} onChange={() => toggle(p.key)} className="h-4 w-4 accent-[#0B6B4F]" aria-label={p.key} />
                  </label>
                );
              })}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
