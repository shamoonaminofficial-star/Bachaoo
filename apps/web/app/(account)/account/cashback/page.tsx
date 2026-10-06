'use client';
import React, { useEffect, useState } from 'react';
import { Card, StatCard, Badge, Button, Input, Select, Skeleton, EmptyState, ErrorState, Pagination, useToast } from '@bachatly/ui';
import { ApiError } from '@/lib/api';
import {
  fetchCashback, fetchCashbackTransactions, fetchCashbackWithdrawals, requestCashbackWithdraw,
  cashbackRowAmount, CASHBACK_WITHDRAW_METHODS,
  type CashbackInfo, type Page, type CashbackLedgerRow, type CashbackWithdrawal,
} from '@/lib/dashboard';
import { formatPKR, formatDate, timeAgo } from '@/lib/format';
import { paisaToPkr } from '@/lib/catalog';

export default function CashbackPage() {
  const { toast } = useToast();
  const [cb, setCb] = useState<CashbackInfo | null>(null);
  const [tx, setTx] = useState<Page<CashbackLedgerRow> | null>(null);
  const [txPage, setTxPage] = useState(1);
  const [withdrawals, setWithdrawals] = useState<CashbackWithdrawal[] | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('bank');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [c, t, w] = await Promise.all([
          fetchCashback(),
          fetchCashbackTransactions(txPage, 15),
          fetchCashbackWithdrawals(),
        ]);
        if (!live) return;
        setCb(c); setTx(t); setWithdrawals(w);
      } catch (e) {
        if (live) setError(e instanceof ApiError ? e.message : 'Could not load cashback.');
      } finally { if (live) setReady(true); }
    })();
    return () => { live = false; };
  }, [txPage]);

  const onWithdraw = async () => {
    const rs = Number(amount);
    if (!rs || rs <= 0) { toast('Enter a valid amount.', 'error'); return; }
    if (!details.trim()) { toast('Enter your account details.', 'error'); return; }
    const paisa = Math.round(rs * 100);
    if (cb && paisa > cb.balance) { toast(`Amount exceeds your withdrawable balance of ${formatPKR(paisaToPkr(cb.balance) ?? 0)}.`, 'error'); return; }
    setBusy(true);
    try {
      await requestCashbackWithdraw(paisa, method, details);
      toast('Withdrawal request submitted. It is pending review.');
      setAmount(''); setDetails('');
      const [c, w] = await Promise.all([fetchCashback(), fetchCashbackWithdrawals()]);
      setCb(c); setWithdrawals(w);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not submit withdrawal.', 'error');
    } finally { setBusy(false); }
  };

  if (!ready) return <div className="space-y-4"><h1 className="text-2xl font-extrabold text-ink">Cashback</h1><Skeleton className="h-28 w-full !rounded-2xl" /><Skeleton className="h-40 w-full !rounded-2xl" /></div>;
  if (error) return <div className="space-y-4"><h1 className="text-2xl font-extrabold text-ink">Cashback</h1><ErrorState title="Couldn't load cashback" description={error} onRetry={() => window.location.reload()} /></div>;

  if (cb === null) return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-ink">Cashback</h1>
      <Card className="p-8 text-center">
        <EmptyState icon="💸" title="Cashback coming soon"
          description="Cashback balances and the credit ledger are still being built. Cashback you earn on redemptions is already being recorded and will show here." />
      </Card>
    </div>
  );

  const pkr = (p: number) => formatPKR(paisaToPkr(p) ?? 0);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-ink">Cashback</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Withdrawable" value={pkr(cb.balance)} icon="💰" />
        <StatCard label="Pending" value={pkr(cb.pending)} icon="⏳" />
        <StatCard label="Earned (lifetime)" value={pkr(cb.lifetimeEarned)} icon="📈" />
        <StatCard label="Withdrawn (lifetime)" value={pkr(cb.lifetimeWithdrawn)} icon="🏦" />
      </div>

      <Card className="p-6">
        <h2 className="font-bold text-ink">Request withdrawal</h2>
        <p className="mt-1 text-sm text-slate-500">
          Withdrawable balance: <span className="font-bold text-ink">{pkr(cb.balance)}</span>.
          Requests are reviewed before release — the server enforces the limit.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Input label="Amount (Rs.)" type="number" min="1" placeholder="e.g. 500"
            value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Select label="Method" options={CASHBACK_WITHDRAW_METHODS} value={method}
            onChange={(e) => setMethod(e.target.value)} />
        </div>
        <div className="mt-3">
          <Input label="Account details"
            placeholder={method === 'bank' ? 'IBAN (e.g. PK36SCBL0000001123456702)' : method === 'jazzcash' || method === 'easypaisa' ? 'Mobile number (e.g. 03001234567)' : 'Bachatly wallet number'}
            value={details} onChange={(e) => setDetails(e.target.value)} />
        </div>
        <div className="mt-3">
          <Button onClick={onWithdraw} loading={busy} disabled={!amount || !details.trim()}>Submit request</Button>
        </div>
      </Card>

      {withdrawals !== null && (
        <Card className="p-6">
          <h2 className="font-bold text-ink">Withdrawal history</h2>
          {withdrawals.length === 0 ? (
            <div className="mt-2"><EmptyState icon="🏦" title="No withdrawals yet" description="Your withdrawal requests will appear here." /></div>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {withdrawals.map((w) => (
                <li key={w.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <p className="font-medium text-ink">{pkr(w.amountPaisa ?? w.amount ?? 0)}</p>
                    <p className="text-xs text-slate-400">{w.createdAt ? formatDate(w.createdAt) : ''}{w.method ? ` · ${w.method}` : ''}</p>
                  </div>
                  {w.status && <Badge tone={w.status === 'PAID' ? 'success' : w.status === 'REJECTED' ? 'error' : 'warning'}>{w.status}</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tx !== null && (
        <Card className="p-6">
          <h2 className="font-bold text-ink">Cashback activity</h2>
          {tx.items.length === 0 ? (
            <div className="mt-2"><EmptyState icon="💸" title="No cashback activity yet" description="Redeem deals to start earning cashback." /></div>
          ) : (
            <>
              <ul className="mt-3 divide-y divide-slate-100">
                {tx.items.map((r) => {
                  const amt = cashbackRowAmount(r);
                  return (
                    <li key={r.id} className="flex items-center justify-between py-2.5 text-sm">
                      <div>
                        <p className="font-medium text-ink">{r.label ?? r.type ?? 'Cashback'}</p>
                        <p className="text-xs text-slate-400">{r.createdAt ? timeAgo(r.createdAt) : ''}{r.status ? ` · ${r.status}` : ''}</p>
                      </div>
                      <span className={`font-bold ${amt >= 0 ? 'text-success' : 'text-error'}`}>{amt >= 0 ? '+' : '−'}{pkr(Math.abs(amt))}</span>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-4">
                <Pagination page={tx.page} totalPages={Math.ceil(tx.total / tx.pageSize)} onChange={setTxPage} />
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
