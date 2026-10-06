'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { Card, StatCard, Badge, Button, Modal, Skeleton, EmptyState, ErrorState, Pagination, useToast } from '@bachatly/ui';
import { ApiError } from '@/lib/api';
import {
  fetchRewardsAccount, fetchRewardsCatalog, fetchRewardTransactions, redeemReward,
  type RewardsAccount, type RewardCatalogItem, type Page, type RewardLedgerRow,
} from '@/lib/dashboard';
import { timeAgo } from '@/lib/format';

export default function RewardsPage() {
  const { toast } = useToast();
  const [account, setAccount] = useState<RewardsAccount | null>(null);
  const [catalog, setCatalog] = useState<RewardCatalogItem[] | null>(null);
  const [tx, setTx] = useState<Page<RewardLedgerRow> | null>(null);
  const [txPage, setTxPage] = useState(1);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [redeeming, setRedeeming] = useState<RewardCatalogItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [newVoucherCode, setNewVoucherCode] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [a, c] = await Promise.all([fetchRewardsAccount(), fetchRewardsCatalog()]);
      setAccount(a); setCatalog(c);
      const t = await fetchRewardTransactions(txPage, 15);
      setTx(t);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load rewards.');
    } finally { setReady(true); }
  }, [txPage]);

  useEffect(() => { let live = true; load().catch(() => { if (live) setError('Could not load rewards.'); }); return () => { live = false; }; }, [load]);

  const confirmRedeem = async () => {
    if (!redeeming || busy) return;
    setBusy(true);
    try {
      const voucher = await redeemReward(redeeming.id);
      setNewVoucherCode(voucher.code);
      toast(`Reward redeemed! Your voucher code is ${voucher.code}.`);
      const a = await fetchRewardsAccount();
      setAccount(a);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not redeem this reward.', 'error');
    } finally { setBusy(false); setRedeeming(null); }
  };

  if (!ready) return <div className="space-y-4"><h1 className="text-2xl font-extrabold text-ink">Rewards</h1><Skeleton className="h-28 w-full !rounded-2xl" /><Skeleton className="h-40 w-full !rounded-2xl" /></div>;
  if (error) return <div className="space-y-4"><h1 className="text-2xl font-extrabold text-ink">Rewards</h1><ErrorState title="Couldn't load rewards" description={error} onRetry={() => window.location.reload()} /></div>;

  const allDown = account === null && catalog === null && tx === null;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-ink">Rewards</h1>

      {newVoucherCode && (
        <Card className="border-success/30 bg-success/5 p-5 text-center">
          <p className="font-bold text-ink">Voucher created!</p>
          <p className="mx-auto mt-2 inline-block rounded-xl bg-white px-6 py-2 font-mono text-xl font-extrabold tracking-widest text-brand-700">{newVoucherCode}</p>
          <p className="mt-2 text-xs text-slate-500">Show this code at the partner scanner. It is also saved in <a href="/account/vouchers" className="underline font-semibold">My Vouchers</a>.</p>
        </Card>
      )}

      {allDown ? (
        <Card className="p-8 text-center">
          <EmptyState icon="⭐" title="Rewards coming soon"
            description="Points balances and the rewards catalog are still being built. Points you earn from redemptions are already being recorded and will show here." />
        </Card>
      ) : (
        <>
          {account && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatCard label="Points Balance" value={account.balance.toLocaleString()} icon="⭐" />
              <StatCard label="Earned (lifetime)" value={account.lifetimeEarned.toLocaleString()} icon="📈" />
              <StatCard label="Redeemed (lifetime)" value={account.lifetimeRedeemed.toLocaleString()} icon="🎁" />
            </div>
          )}

          {catalog !== null && (
            <Card className="p-6">
              <h2 className="font-bold text-ink">Redeem points</h2>
              {catalog.length === 0 ? (
                <div className="mt-2"><EmptyState icon="🎁" title="No rewards available yet" description="New rewards will appear here soon." /></div>
              ) : (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {catalog.map((r) => {
                    const affordable = account !== null && account.balance >= r.pointsCost;
                    return (
                      <div key={r.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-bold text-ink">{r.title}</p>
                            {r.description && <p className="mt-1 text-xs text-slate-500">{r.description}</p>}
                          </div>
                          {r.type && <Badge tone="neutral">{r.type}</Badge>}
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                          <span className="text-sm font-extrabold text-brand-700">⭐ {r.pointsCost.toLocaleString()} pts</span>
                          <Button size="sm" disabled={!affordable || busy} onClick={() => setRedeeming(r)}>
                            {!account ? 'Redeem' : affordable ? 'Redeem' : 'Not enough points'}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          )}

          {tx !== null && (
            <Card className="p-6">
              <h2 className="font-bold text-ink">Points history</h2>
              {tx.items.length === 0 ? (
                <div className="mt-2"><EmptyState icon="⭐" title="No points activity yet" description="Redeem a deal to start earning points." /></div>
              ) : (
                <>
                  <ul className="mt-3 divide-y divide-slate-100">
                    {tx.items.map((r) => (
                      <li key={r.id} className="flex items-center justify-between py-2.5 text-sm">
                        <div>
                          <p className="font-medium text-ink">{r.label ?? r.type ?? 'Points'}</p>
                          <p className="text-xs text-slate-400">{r.createdAt ? timeAgo(r.createdAt) : ''}</p>
                        </div>
                        <span className={`font-bold ${r.points >= 0 ? 'text-success' : 'text-error'}`}>{r.points >= 0 ? '+' : ''}{r.points.toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4">
                    <Pagination page={tx.page} totalPages={Math.ceil(tx.total / tx.pageSize)} onChange={setTxPage} />
                  </div>
                </>
              )}
            </Card>
          )}
        </>
      )}

      <Modal open={redeeming !== null} onClose={() => setRedeeming(null)} title="Redeem reward"
        footer={<>
          <Button variant="ghost" onClick={() => setRedeeming(null)}>Cancel</Button>
          <Button loading={busy} onClick={confirmRedeem}>Confirm redemption</Button>
        </>}>
        {redeeming && (
          <div className="space-y-2 text-sm text-slate-600">
            <p><span className="font-semibold text-ink">{redeeming.title}</span></p>
            <p>This will use <span className="font-extrabold text-brand-700">{redeeming.pointsCost.toLocaleString()} points</span> and create a voucher for you.</p>
            {account && <p>Balance after: <span className="font-bold">{(account.balance - redeeming.pointsCost).toLocaleString()} pts</span></p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
