'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, Badge, Button, DigitalMembershipCard, ConfirmModal, Modal, SkeletonCard, EmptyState, statusTone, useToast } from '@bachatly/ui';
import { ApiError } from '@/lib/api';
import { fetchMyMembership, fetchMembershipHistory, cancelMyMembership, type MyMembership, type MembershipHistoryItem } from '@/lib/memberships';
import { formatDate } from '@/lib/format';

export default function MembershipPage() {
  const { toast } = useToast();
  const [mine, setMine] = useState<MyMembership | null>(null);
  const [history, setHistory] = useState<MembershipHistoryItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([fetchMyMembership().catch(() => null), fetchMembershipHistory().catch(() => [])])
      .then(([m, h]) => { setMine(m); setHistory(h); })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const doCancel = async (reason: string) => {
    setCancelling(true);
    try {
      await cancelMyMembership(reason);
      toast('Cancellation requested. Our team will review it as per the Refund Policy.');
      setCancelOpen(false);
      load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not submit cancellation.', 'error');
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-extrabold text-ink">My Membership</h1>
        <SkeletonCard /><SkeletonCard />
      </div>
    );
  }

  if (!mine) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-extrabold text-ink">My Membership</h1>
        <EmptyState icon="🎫" title="No active membership"
          description="Become a member to unlock exclusive deals, rewards and cashback."
          actionLabel="View Plans" onAction={() => (window.location.href = '/membership')} />
      </div>
    );
  }

  const active = mine.status === 'active';
  const totalDays = Math.max(1, Math.round((new Date(mine.endDate).getTime() - new Date(mine.startDate).getTime()) / 86400000));
  const usedPct = Math.min(100, Math.max(0, Math.round(((totalDays - mine.daysRemaining) / totalDays) * 100)));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold text-ink">My Membership</h1>

      <DigitalMembershipCard membership={{
        id: mine.id,
        number: mine.number || '—',
        planName: mine.plan.name,
        status: active ? 'active' : (mine.status as 'expired' | 'cancelled' | 'pending'),
        joinedAt: mine.startDate,
        expiresAt: mine.endDate,
        holderName: mine.holderName || 'Member',
      }} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs text-slate-500">Plan</p>
          <p className="mt-1 font-bold text-ink">{mine.plan.name} <Badge tone={statusTone[mine.status] || 'neutral'}>{mine.status.toUpperCase()}</Badge></p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Started</p>
          <p className="mt-1 font-bold text-ink">{formatDate(mine.startDate)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Expires</p>
          <p className="mt-1 font-bold text-ink">{formatDate(mine.endDate)}</p>
        </Card>
      </div>

      {active && (
        <Card className="p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-ink">{mine.daysRemaining} days remaining</span>
            <span className="text-slate-500">{usedPct}% of {totalDays} days used</span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={usedPct} aria-valuemin={0} aria-valuemax={100} aria-label="Membership period used">
            <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${usedPct}%` }} />
          </div>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setRenewOpen(true)}>Renew / Upgrade</Button>
        {active && <Button variant="outline" onClick={() => setCancelOpen(true)}>Cancel Membership</Button>}
      </div>

      <Card className="p-5">
        <h2 className="font-bold text-ink">Membership history</h2>
        {!history?.length ? (
          <p className="mt-3 text-sm text-slate-500">No history yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {history.map((h) => (
              <li key={h.id} className="flex justify-between gap-4 py-3 text-sm">
                <div><p className="font-medium text-ink">{h.action}</p><p className="text-xs text-slate-500">{h.detail} · by {h.by}</p></div>
                <span className="shrink-0 text-xs text-slate-400">{h.date ? formatDate(h.date) : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmModal open={cancelOpen} onClose={() => setCancelOpen(false)}
        onConfirm={(reason: string) => doCancel(reason)} danger requireReason
        title="Cancel membership" action="Cancel membership"
        affected={`${mine.holderName || 'Member'} (${mine.number || mine.id})`}
        confirmLabel={cancelling ? 'Submitting…' : 'Yes, cancel'} />
      <Modal open={renewOpen} onClose={() => setRenewOpen(false)} title="Renew or upgrade"
        footer={<><Button variant="ghost" onClick={() => setRenewOpen(false)}>Close</Button><Link href="/membership"><Button>View Plans</Button></Link></>}>
        <p className="text-sm text-slate-600">Renew your {mine.plan.name} plan or pick a different one. Your remaining days carry over on upgrades, per the plan terms.</p>
      </Modal>
    </div>
  );
}
