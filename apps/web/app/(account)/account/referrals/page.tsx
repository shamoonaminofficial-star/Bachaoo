'use client';
import React, { useEffect, useState } from 'react';
import { Card, Button, Input, StatCard, Skeleton, ErrorState, useToast, ShareButtons } from '@bachatly/ui';
import { ApiError } from '@/lib/api';
import { fetchMyReferralCode, referralLink, fetchReferralStats, applyReferralCode, type ReferralStats } from '@/lib/dashboard';
import { formatPKR, formatDate } from '@/lib/format';
import { paisaToPkr } from '@/lib/catalog';

function rewardText(r: { points?: number | null; cashbackPaisa?: number | null } | null | undefined): string | null {
  if (!r) return null;
  const parts: string[] = [];
  if (r.points && r.points > 0) parts.push(`${r.points.toLocaleString()} points`);
  if (r.cashbackPaisa && r.cashbackPaisa > 0) parts.push(formatPKR(paisaToPkr(r.cashbackPaisa) ?? 0));
  return parts.length ? parts.join(' + ') : null;
}

export default function ReferralsPage() {
  const { toast } = useToast();
  const [code, setCode] = useState<string | null>(null);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [applyCode, setApplyCode] = useState('');
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([fetchMyReferralCode(), fetchReferralStats()])
      .then(([c, s]) => { if (live) { setCode(c); setStats(s); } })
      .catch((e) => { if (live) setError(e instanceof ApiError ? e.message : 'Could not load referrals.'); })
      .finally(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, []);

  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); toast(`${what} copied.`); }
    catch { toast('Could not copy. Please copy it manually.', 'error'); }
  };

  const onApply = async () => {
    if (!applyCode.trim() || applying) return;
    setApplying(true);
    try {
      await applyReferralCode(applyCode);
      toast('Referral code applied to your account.');
      setApplyCode('');
      const s = await fetchReferralStats();
      setStats(s);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not apply this code.', 'error');
    } finally { setApplying(false); }
  };

  if (!ready) return <div className="space-y-4"><h1 className="text-2xl font-extrabold text-ink">Referrals</h1><Skeleton className="h-40 w-full !rounded-2xl" /></div>;
  if (error) return <div className="space-y-4"><h1 className="text-2xl font-extrabold text-ink">Referrals</h1><ErrorState title="Couldn't load referrals" description={error} onRetry={() => window.location.reload()} /></div>;

  const referrerReward = rewardText(stats?.referrerReward);
  const refereeReward = rewardText(stats?.refereeReward);

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-extrabold text-ink">Referrals</h1>

      <Card className="p-6 text-center">
        <span className="text-4xl" aria-hidden>🤝</span>
        <h2 className="mt-2 font-extrabold text-ink">Invite friends to Bachatly</h2>
        <p className="mt-1 text-sm text-slate-500">
          Share your code — when a friend signs up with it, you both become eligible for referral rewards
          {referrerReward ? ` (you earn ${referrerReward})` : ''}.
        </p>
        {code ? (
          <>
            <p className="mx-auto mt-4 inline-block rounded-xl bg-brand-50 px-6 py-3 font-mono text-2xl font-extrabold tracking-widest text-brand-700">{code}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button size="sm" onClick={() => copy(code, 'Referral code')}>Copy code</Button>
              <Button size="sm" variant="outline" onClick={() => copy(referralLink(code), 'Referral link')}>Copy invite link</Button>
            </div>
            <div className="mt-4">
              <ShareButtons url={referralLink(code)} title="Join Bachatly with my referral code"
                text={`Join Bachatly with my code ${code} and save on every deal!`} />
            </div>
          </>
        ) : (
          <p className="mt-4 text-sm text-slate-500">Your referral code isn't available right now. Try again shortly.</p>
        )}
      </Card>

      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Friends joined" value={String(stats.referredCount)} icon="👥" />
          <StatCard label="Qualified" value={String(stats.qualifiedCount)} icon="✅" />
          <StatCard label="Pending" value={String(stats.pendingCount)} icon="⏳" />
          <StatCard label="Rewards earned" value={formatPKR(paisaToPkr(stats.totalRewardsEarned) ?? 0)} icon="🎁" />
        </div>
      )}

      {stats?.referred && stats.referred.length > 0 && (
        <Card className="p-6">
          <h2 className="font-bold text-ink">Your referrals</h2>
          <ul className="mt-3 divide-y divide-slate-100">
            {stats.referred.map((f, i) => (
              <li key={f.id ?? i} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <p className="font-medium text-ink">{f.firstName ?? 'Friend'}</p>
                  <p className="text-xs text-slate-400">{f.joinedAt ? `Joined ${formatDate(f.joinedAt)}` : ''}</p>
                </div>
                <span className="text-xs font-semibold text-slate-500">{f.status ?? ''}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-6">
        <h2 className="font-bold text-ink">How it works</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
          <li>Share your referral code or link with friends.</li>
          <li>They sign up with your code{refereeReward ? ` — they earn ${refereeReward}` : ' — and earn a welcome reward'}.</li>
          <li>Once they complete a qualifying action, your referral is marked qualified{referrerReward ? ` and you earn ${referrerReward}` : ' and you earn your reward'}.</li>
        </ol>
      </Card>

      <Card className="p-6">
        <h2 className="font-bold text-ink">Have a friend's code?</h2>
        <p className="mt-1 text-sm text-slate-500">Enter it here to apply it to your account.</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input label="Referral code" placeholder="e.g. BCH-XYZ789" value={applyCode}
            onChange={(e) => setApplyCode(e.target.value)} className="uppercase" />
          <div className="flex items-end">
            <Button onClick={onApply} loading={applying} disabled={!applyCode.trim()}>Apply</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
