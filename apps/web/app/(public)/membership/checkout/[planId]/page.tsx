'use client';
import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button, Card, Badge, Stepper, Breadcrumbs, SkeletonCard, EmptyState, FileUpload, useToast } from '@bachatly/ui';
import { ApiError, apiForm, validateUploadFile, getToken } from '@/lib/api';
import { fetchPlans, purchaseMembership, uploadPaymentReceipt, fetchPayment, type ApiPlan, type PurchaseResult } from '@/lib/memberships';
import { formatPKR } from '@/lib/format';

type MethodId = 'manual' | 'jazzcash' | 'easypaisa' | 'card';

const METHODS: { id: MethodId; label: string; icon: string; desc: string; available: boolean }[] = [
  { id: 'manual', label: 'Bank Transfer', icon: '🏦', desc: 'Transfer to our account, then upload your receipt', available: true },
  { id: 'jazzcash', label: 'JazzCash', icon: '📱', desc: 'Pay instantly from your JazzCash account', available: false },
  { id: 'easypaisa', label: 'Easypaisa', icon: '📲', desc: 'Pay instantly from your Easypaisa account', available: false },
  { id: 'card', label: 'Credit / Debit Card', icon: '💳', desc: 'Visa & Mastercard', available: false },
];

export default function CheckoutPage() {
  const params = useParams();
  const planId = String(params?.planId ?? '');
  const { toast } = useToast();
  const [plan, setPlan] = useState<ApiPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [method, setMethod] = useState<MethodId>('manual');
  const [paying, setPaying] = useState(false);
  const [purchase, setPurchase] = useState<PurchaseResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [receiptDone, setReceiptDone] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      window.location.href = `/login?next=${encodeURIComponent(`/membership/checkout/${planId}`)}`;
      return;
    }
    fetchPlans()
      .then((plans) => {
        const p = plans.find((x) => x.id === planId || x.slug === planId);
        if (!p) setNotFound(true);
        else setPlan(p);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [planId]);

  const startPayment = async () => {
    if (!plan) return;
    setPaying(true);
    try {
      const res = await purchaseMembership(plan.id, method);
      setPurchase(res);
      toast('Payment created. Follow the steps below.', 'info');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not start payment.', 'error');
    } finally {
      setPaying(false);
    }
  };

  const onReceipt = async (file: File) => {
    const err = validateUploadFile(file, { maxMb: 5, kinds: ['image', 'pdf'] });
    if (err) { toast(err, 'error'); return; }
    if (!purchase?.paymentId) return;
    setUploading(true);
    try {
      await uploadPaymentReceipt(purchase.paymentId, file);
      setReceiptDone(true);
      toast('Receipt uploaded — awaiting admin verification.');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Upload failed.', 'error');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6"><SkeletonCard /><div className="mt-4"><SkeletonCard /></div></div>
    );
  }
  if (notFound || !plan) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <EmptyState icon="🎫" title="Plan not found" description="This plan may have been removed." actionLabel="View Plans" onAction={() => (window.location.href = '/membership')} />
      </div>
    );
  }

  // ---- pending verification state -------------------------------------------
  if (purchase && receiptDone) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <span className="text-6xl" aria-hidden>⏳</span>
        <h1 className="mt-4 text-3xl font-extrabold text-ink">Receipt received!</h1>
        <p className="mt-2 text-slate-500">
          Your payment of <strong className="text-ink">{formatPKR(plan.salePrice)}</strong> for the{' '}
          <strong className="text-ink">{plan.name}</strong> plan is <Badge tone="warning">awaiting verification</Badge>.
        </p>
        <p className="mt-2 text-sm text-slate-500">Our team usually verifies bank transfers within a few working hours. Your membership activates automatically once approved.</p>
        <p className="mt-3 text-xs text-slate-400">Payment reference: <span className="font-mono">{purchase.paymentId}</span></p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/account/membership"><Button>Track in My Membership</Button></Link>
          <Link href="/deals"><Button variant="outline">Browse Deals</Button></Link>
        </div>
      </div>
    );
  }

  // Backend sends `accounts`; tolerate a `bankAccounts` alias too.
  const clientData = purchase?.clientData as Record<string, unknown> | undefined;
  const bankAccounts = (clientData?.accounts ?? clientData?.bankAccounts) as Array<{ bankName: string; accountTitle: string; iban: string }> | undefined;
  const reference = (purchase?.clientData?.reference as string) || purchase?.paymentId;
  const instructions = purchase?.clientData?.instructions as string | undefined;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 lg:px-6">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Membership', href: '/membership' }, { label: 'Checkout' }]} />
      <div className="mt-4"><Stepper steps={['Choose plan', 'Pay securely', 'Start saving']} current={1} /></div>

      {/* Order summary */}
      <Card className="mt-6 p-5">
        <h2 className="font-extrabold text-ink">Order summary</h2>
        <div className="mt-3 flex items-start justify-between gap-4">
          <div>
            <p className="font-bold text-ink">{plan.name} <Badge tone="brand">{Math.round(plan.durationDays / 30)} months</Badge></p>
            <p className="mt-1 text-sm text-slate-500">{plan.durationDays} days · {plan.cashbackPercent}% cashback · {(plan.rewardMultiplierBps / 10000).toFixed(1)}× points</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-extrabold text-brand-700">{formatPKR(plan.salePrice)}</p>
            {plan.regularPrice > plan.salePrice && <p className="text-sm text-slate-400 line-through">{formatPKR(plan.regularPrice)}</p>}
          </div>
        </div>
      </Card>

      {!purchase ? (
        <>
          <h2 className="mt-6 font-bold text-ink">Payment method</h2>
          <div className="mt-3 space-y-2">
            {METHODS.map((m) => (
              <button key={m.id} disabled={!m.available} onClick={() => setMethod(m.id)} aria-pressed={method === m.id}
                className={`flex w-full items-center gap-3 rounded-2xl border-2 p-4 text-left transition ${!m.available ? 'cursor-not-allowed opacity-60' : method === m.id ? 'border-brand-600 bg-brand-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                <span className="text-2xl" aria-hidden>{m.icon}</span>
                <span className="flex-1">
                  <span className="block font-bold text-ink">{m.label}</span>
                  <span className="block text-xs text-slate-500">{m.available ? m.desc : `${m.desc} — coming soon (sandbox)`}</span>
                </span>
                {!m.available && <Badge tone="neutral">Soon</Badge>}
                {m.available && method === m.id && <span className="text-brand-600" aria-hidden>●</span>}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-400">Online gateways (JazzCash, Easypaisa, cards) are being integrated. Bank transfer works right now.</p>
          <Button className="mt-5 w-full" size="lg" loading={paying} onClick={startPayment}>
            Continue — {formatPKR(plan.salePrice)}
          </Button>
          <p className="mt-2 text-center text-xs text-slate-400">🔒 Payments are verified by our team. Never share card details in chat.</p>
        </>
      ) : (
        <>
          <h2 className="mt-6 font-bold text-ink">Complete your bank transfer</h2>
          <Card className="mt-3 space-y-4 p-5">
            {instructions && <p className="text-sm text-slate-600">{instructions}</p>}
            {bankAccounts && bankAccounts.length > 0 ? (
              bankAccounts.map((a, i) => (
                <div key={i} className="rounded-2xl bg-slate-50 p-4 text-sm">
                  <p className="font-extrabold text-ink">{a.bankName}</p>
                  <p className="mt-1 text-slate-600">Account title: <strong>{a.accountTitle}</strong></p>
                  <p className="text-slate-600">IBAN: <span className="font-mono font-bold text-ink">{a.iban}</span></p>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">Bank details will be sent to your email shortly.</p>
            )}
            <div className="rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50 p-4 text-sm">
              <p className="text-slate-600">Use this reference with your transfer so we can match it:</p>
              <p className="mt-1 font-mono text-lg font-extrabold text-brand-700">{reference}</p>
            </div>
            <div>
              <p className="mb-2 text-sm font-bold text-ink">Upload payment receipt</p>
              <FileUpload label="Receipt (image or PDF, max 5 MB)" accept="image/*,.pdf"
                hint={uploading ? 'Uploading…' : 'Screenshot or photo of your transfer confirmation'}
                onSelect={onReceipt} />
            </div>
          </Card>
          <Button variant="outline" className="mt-4" onClick={() => setPurchase(null)}>← Choose a different method</Button>
        </>
      )}
    </div>
  );
}
