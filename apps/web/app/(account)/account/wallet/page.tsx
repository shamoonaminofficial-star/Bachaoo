'use client';
import React, { useEffect, useState } from 'react';
import { Card, StatCard, Skeleton, EmptyState, ErrorState } from '@bachatly/ui';
import { ApiError } from '@/lib/api';
import { fetchWallet, type WalletInfo } from '@/lib/dashboard';
import { formatPKR } from '@/lib/format';
import { paisaToPkr } from '@/lib/catalog';

export default function WalletPage() {
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    fetchWallet()
      .then((w) => { if (live) setWallet(w); })
      .catch((e) => { if (live) setError(e instanceof ApiError ? e.message : 'Could not load your wallet.'); })
      .finally(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, []);

  if (!ready) return <div className="space-y-4"><h1 className="text-2xl font-extrabold text-ink">Wallet</h1><Skeleton className="h-28 w-full !rounded-2xl" /><Skeleton className="h-40 w-full !rounded-2xl" /></div>;
  if (error) return <div className="space-y-4"><h1 className="text-2xl font-extrabold text-ink">Wallet</h1><ErrorState title="Couldn't load your wallet" description={error} onRetry={() => window.location.reload()} /></div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-ink">Wallet</h1>
      {wallet ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Wallet Balance" value={formatPKR(paisaToPkr(wallet.balance) ?? 0)} icon="👛" />
          </div>
          <Card className="p-6">
            <EmptyState icon="🧾" title="No transactions yet" description="Your wallet ledger will appear here once transactions are recorded." />
          </Card>
        </>
      ) : (
        <Card className="p-8 text-center">
          <EmptyState icon="👛" title="Wallet coming soon"
            description="Wallet balances and the transaction ledger are still being built. Your redemptions and savings already appear under Redemptions and Savings." />
        </Card>
      )}
    </div>
  );
}
