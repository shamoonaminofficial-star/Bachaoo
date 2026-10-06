'use client';
import React, { useEffect, useState } from 'react';
import { Card, Badge, Button, Input, Skeleton, EmptyState, ErrorState, useToast } from '@bachatly/ui';
import { ApiError } from '@/lib/api';
import { fetchMyVouchers, claimVoucher, type MyVoucher } from '@/lib/dashboard';
import { formatDate, daysUntil, formatPKR } from '@/lib/format';
import { paisaToPkr } from '@/lib/catalog';

const STATUS_TONE: Record<string, 'success' | 'warning' | 'neutral' | 'error' | 'info' | 'brand' | 'accent'> = {
  ACTIVE: 'success', USED: 'neutral', EXPIRED: 'error', PENDING: 'warning',
};

export default function VouchersPage() {
  const { toast } = useToast();
  const [list, setList] = useState<MyVoucher[] | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    let live = true;
    fetchMyVouchers()
      .then((v) => { if (live) setList(v); })
      .catch((e) => { if (live) setError(e instanceof ApiError ? e.message : 'Could not load vouchers.'); })
      .finally(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, []);

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast('Voucher code copied.'); }
    catch { toast('Could not copy. Please copy it manually.', 'error'); }
  };

  const onClaim = async () => {
    if (!code.trim() || claiming) return;
    setClaiming(true);
    try {
      const v = await claimVoucher(code);
      setList((prev) => (prev === null ? prev : [v, ...prev]));
      setCode('');
      toast(`Voucher claimed: ${v.code}.`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not claim this code.', 'error');
    } finally { setClaiming(false); }
  };

  if (!ready) return <div className="space-y-4"><h1 className="text-2xl font-extrabold text-ink">My Vouchers</h1><Skeleton className="h-32 w-full !rounded-2xl" /><Skeleton className="h-32 w-full !rounded-2xl" /></div>;
  if (error) return <div className="space-y-4"><h1 className="text-2xl font-extrabold text-ink">My Vouchers</h1><ErrorState title="Couldn't load vouchers" description={error} onRetry={() => window.location.reload()} /></div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-ink">My Vouchers</h1>

      {list !== null && (
        <Card className="p-6">
          <h2 className="font-bold text-ink">Have a voucher code?</h2>
          <p className="mt-1 text-sm text-slate-500">Enter it below to add it to your wallet.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Input label="Voucher code" placeholder="e.g. BCH-ABC123" value={code}
              onChange={(e) => setCode(e.target.value)} className="uppercase" />
            <div className="flex items-end">
              <Button onClick={onClaim} loading={claiming} disabled={!code.trim()}>Claim</Button>
            </div>
          </div>
        </Card>
      )}

      {list === null ? (
        <Card className="p-8 text-center">
          <EmptyState icon="🎫" title="Vouchers coming soon"
            description="Your voucher wallet is still being built. Vouchers you earn will show here." />
        </Card>
      ) : list.length === 0 ? (
        <EmptyState icon="🎫" title="No vouchers yet"
          description="Redeem points for rewards or claim a code above — your vouchers will appear here." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((v) => {
            const tone = v.status ? (STATUS_TONE[v.status.toUpperCase()] ?? 'neutral') : 'neutral';
            const days = v.expiresAt ? daysUntil(v.expiresAt) : null;
            return (
              <Card key={v.id} className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-ink">{v.title ?? 'Voucher'}</p>
                    {v.businessName && <p className="text-xs text-slate-500">{v.businessName}</p>}
                  </div>
                  {v.status && <Badge tone={tone}>{v.status}</Badge>}
                </div>
                <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                  <p className="font-mono text-lg font-extrabold tracking-widest text-brand-700">{v.code}</p>
                  <Button size="sm" variant="outline" onClick={() => copy(v.code)}>Copy</Button>
                </div>
                {v.valuePaisa != null && v.valuePaisa > 0 && (
                  <p className="mt-2 text-sm font-semibold text-ink">Worth {formatPKR(paisaToPkr(v.valuePaisa) ?? 0)}</p>
                )}
                {v.expiresAt && (
                  <p className="mt-1 text-xs text-slate-500">
                    Expires {formatDate(v.expiresAt)}
                    {days !== null && days >= 0 && ` · ${days}d left`}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {list !== null && (
        <Card className="p-6">
          <h2 className="font-bold text-ink">How to use a voucher</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
            <li>Open the deal page and tap <span className="font-semibold">Redeem Offer</span> to get your QR.</li>
            <li>Show your QR at the partner scanner, then give the cashier your voucher code.</li>
            <li>The partner applies the voucher at confirmation — the discount is computed by the server.</li>
          </ol>
        </Card>
      )}
    </div>
  );
}
