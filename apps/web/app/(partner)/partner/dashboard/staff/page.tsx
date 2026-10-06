'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, ConfirmModal, EmptyState, ErrorState, Input, Select, Skeleton, useToast } from '@bachatly/ui';
import {
  fetchStaff, inviteStaff, updateStaffRole, removeStaff,
  STAFF_ROLES, roleLabel, type StaffMember, type StaffRole,
} from '@/lib/partner';
import { usePartnerBusiness } from '../layout';

const ROLE_TONE: Record<string, 'brand' | 'success' | 'warning' | 'neutral'> = {
  BUSINESS_OWNER: 'brand', BUSINESS_MANAGER: 'success', CASHIER: 'warning', SCANNER: 'neutral',
};

export default function PartnerStaffPage() {
  const { toast } = useToast();
  const { business, loading: bizLoading } = usePartnerBusiness();
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [error, setError] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('CASHIER');
  const [inviting, setInviting] = useState(false);
  const [remove, setRemove] = useState<StaffMember | null>(null);
  const [change, setChange] = useState<StaffMember | null>(null);

  const load = useCallback(async () => {
    if (!business?.id) return;
    setError(false);
    try {
      const list = await fetchStaff(business.id);
      setStaff(list);
    } catch (e) {
      const code = (e as { status?: number })?.status;
      if (code === 404 || code === 501) { setUnavailable(true); return; }
      console.warn('[partner staff]', e);
      setError(true);
    }
  }, [business]);
  useEffect(() => { if (!bizLoading) load(); }, [bizLoading, load]);

  const owners = (staff ?? []).filter((s) => s.role === 'BUSINESS_OWNER' || s.isOwner);

  const onInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!business?.id) return;
    setInviting(true);
    try {
      await inviteStaff(business.id, email.trim(), role);
      toast(`Invite sent to ${email.trim()}.`);
      setEmail(''); setRole('CASHIER');
      await load();
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? 'Could not send the invite.';
      toast(msg, 'error');
    } finally {
      setInviting(false);
    }
  };

  const onRoleChange = async (newRole: StaffRole) => {
    if (!business?.id || !change) return;
    if (change.isOwner || change.role === 'BUSINESS_OWNER') {
      toast('The business owner role cannot be changed.', 'error');
      setChange(null);
      return;
    }
    try {
      await updateStaffRole(business.id, change.id, newRole);
      toast(`Role updated to ${roleLabel(newRole)}.`);
      setChange(null);
      await load();
    } catch (e) {
      toast((e as { message?: string })?.message ?? 'Could not update the role.', 'error');
    }
  };

  const onRemove = async () => {
    if (!business?.id || !remove) return;
    if ((remove.isOwner || remove.role === 'BUSINESS_OWNER') && owners.length <= 1) {
      toast('You cannot remove the last owner of the business.', 'error');
      setRemove(null);
      return;
    }
    try {
      await removeStaff(business.id, remove.id);
      toast('Staff member removed.');
      setRemove(null);
      await load();
    } catch (e) {
      toast((e as { message?: string })?.message ?? 'Could not remove this staff member.', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Staff</h1>
          <p className="text-sm text-slate-500">Invite your team to scan and confirm customer QRs.</p>
        </div>
      </div>

      {unavailable ? (
        <EmptyState icon="🧑‍💼" title="Staff management not live yet"
          description="The staff API isn't deployed yet — invitations and role management will appear here once it is." />
      ) : error && !staff ? (
        <ErrorState title="Couldn't load staff" message="Something went wrong." onRetry={load} />
      ) : (
        <>
          <Card className="p-5">
            <h2 className="font-bold text-ink">Invite a team member</h2>
            <form onSubmit={onInvite} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Input type="email" required label="Email address" placeholder="cashier@example.com"
                  value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="sm:w-64">
                <Select label="Role" value={role} onChange={(e) => setRole(e.target.value as StaffRole)}
                  options={STAFF_ROLES.map((r) => ({ value: r.value, label: r.label }))} />
              </div>
              <Button type="submit" loading={inviting}>Send invite</Button>
            </form>
            <p className="mt-2 text-xs text-slate-400">Invited staff get an email to join and sign in to the partner app. Owners can do everything; cashiers can scan &amp; confirm; scanners can only validate.</p>
          </Card>

          <Card className="p-0">
            {!staff ? (
              <div className="space-y-2 p-5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
            ) : staff.length === 0 ? (
              <EmptyState icon="🧑‍💼" title="No staff yet" description="Invite your first team member above." />
            ) : (
              <ul className="divide-y divide-slate-50">
                {staff.map((s) => {
                  const lastOwner = (s.isOwner || s.role === 'BUSINESS_OWNER') && owners.length <= 1;
                  return (
                    <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 font-bold text-brand-700">
                        {(s.firstName?.[0] ?? s.email[0]).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">
                          {[s.firstName, s.lastName].filter(Boolean).join(' ') || s.email}
                        </p>
                        <p className="text-xs text-slate-500">{s.email}</p>
                      </div>
                      <Badge tone={ROLE_TONE[s.role] ?? 'neutral'}>{roleLabel(s.role)}</Badge>
                      {s.isOwner && <Badge tone="brand">Owner</Badge>}
                      {!lastOwner ? (
                        <>
                          <Select aria-label={`Role for ${s.email}`} value={s.role}
                            onChange={(e) => setChange({ ...s, role: e.target.value as StaffMember['role'] })}
                            options={s.isOwner || s.role === 'BUSINESS_OWNER'
                              ? [{ value: 'BUSINESS_OWNER', label: 'Owner' }]
                              : STAFF_ROLES.map((r) => ({ value: r.value, label: r.label }))}
                            className="!w-auto" />
                          <Button size="sm" variant="outline" onClick={() => setRemove(s)}>Remove</Button>
                        </>
                      ) : (
                        <span className="text-xs text-slate-400">Protected — last owner</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </>
      )}

      {change && (
        <ConfirmModal open title="Change role?"
          action={`Change ${change.email} to ${roleLabel(change.role)}?`}
          confirmLabel="Change role"
          onClose={() => setChange(null)}
          onConfirm={() => onRoleChange(change.role as StaffRole)} />
      )}
      {remove && (
        <ConfirmModal open title="Remove staff member?"
          action={`Remove ${remove.email} from this business? They will lose access immediately.`}
          confirmLabel="Remove" danger
          onClose={() => setRemove(null)}
          onConfirm={onRemove} />
      )}
    </div>
  );
}
