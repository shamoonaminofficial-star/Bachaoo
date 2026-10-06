'use client';
import React, { useState } from 'react';
import { Card, Button, Input, Badge, QRScanner, useToast, Stepper, ErrorState } from '@bachatly/ui';
import {
  validateQrToken, confirmRedemption, estimateDiscount, paisaToPkr, ApiError,
  type TokenValidation, type RedemptionReceipt,
} from '@/lib/catalog';
import { formatPKR } from '@/lib/format';

/**
 * Partner QR scanner (Phase 6).
 *
 * Flow: scan QR → server validates the short-lived signed token → enter the
 * bill → CONFIRM. The bill preview shown before confirm is computed
 * client-side for display only ("Estimate") — the server recomputes bill →
 * discount → saving → cashback → points inside a DB transaction at confirm
 * time, and the receipt shows the server-authoritative figures.
 *
 * Camera decoding goes through the QRScanner's pluggable decoder (currently
 * the dev stub — plug in jsqr/@zxing for production); the scanned payload is
 * always validated server-side regardless of what decoded it.
 */
export default function ScannerPage() {
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [validated, setValidated] = useState<TokenValidation | null>(null);
  const [token, setToken] = useState('');
  const [scanError, setScanError] = useState('');
  const [validating, setValidating] = useState(false);
  const [billRs, setBillRs] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [receipt, setReceipt] = useState<RedemptionReceipt | null>(null);
  const [manualToken, setManualToken] = useState('');

  const reset = () => {
    setStep(0); setValidated(null); setToken(''); setScanError('');
    setBillRs(''); setConfirming(false); setReceipt(null); setManualToken('');
  };

  /** Maps backend token failures to plain-language cashier copy. */
  const friendlyScanError = (e: unknown): string => {
    if (e instanceof ApiError) {
      const msg = (e.message || '').toLowerCase();
      if (e.status === 404 || msg.includes('not found') || msg.includes('invalid')) {
        return 'This QR code is invalid. Ask the customer to open the deal page and generate a fresh code.';
      }
      if (e.status === 410 || msg.includes('expired')) {
        return 'This QR has expired (codes last ~90 seconds). Ask the customer to tap "Redeem Offer" again for a fresh one.';
      }
      if (e.status === 409 || msg.includes('already') || msg.includes('used') || msg.includes('replay')) {
        return 'This QR was already used. Each code works only once — the customer needs a fresh one.';
      }
      if (msg.includes('membership')) {
        return `Customer's membership is not eligible: ${e.message}`;
      }
      return e.message || 'Could not validate this QR. Try again.';
    }
    return 'Could not reach the server. Check your connection and try again.';
  };

  /** Called when the camera decodes a QR payload (the signed token). */
  const onScan = async (payload: string) => {
    const trimmed = payload.trim();
    if (!trimmed) return;
    setValidating(true); setScanError('');
    try {
      const res = await validateQrToken(trimmed);
      setValidated(res); setToken(trimmed); setStep(1);
      toast(`QR validated — ${res.customer.firstName}, ${res.deal.title}.`);
    } catch (e) {
      setScanError(friendlyScanError(e));
    } finally {
      setValidating(false);
    }
  };

  const billPaisa = Math.round((Number(billRs) || 0) * 100);
  const estimate = validated && billPaisa > 0
    ? estimateDiscount(billPaisa, validated.deal.discountPercent, validated.deal.maxDiscountPaisa)
    : null;
  const maxDiscountPkr = validated?.deal.maxDiscountPaisa !== undefined
    ? paisaToPkr(validated.deal.maxDiscountPaisa)
    : undefined;

  const confirm = async () => {
    if (!validated || billPaisa <= 0) { toast('Enter a valid bill amount.', 'error'); return; }
    setConfirming(true);
    try {
      const r = await confirmRedemption(token, billPaisa);
      setReceipt(r); setStep(3);
      toast('Redemption confirmed. Receipt generated.');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not confirm the redemption.', 'error');
    } finally {
      setConfirming(false);
    }
  };

  const membershipTone = validated?.membership.status?.toUpperCase() === 'ACTIVE' ? 'success' : 'error';

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-extrabold text-ink">QR Scanner</h1>
      <Stepper steps={['Scan QR', 'Enter bill', 'Confirm', 'Receipt']} current={step} />

      {step === 0 && (
        <div className="space-y-3">
          {validating && (
            <Card className="p-6 text-center">
              <p className="font-bold text-ink">Validating QR…</p>
              <p className="mt-1 text-sm text-slate-500">Checking the signature, expiry and single-use status.</p>
            </Card>
          )}
          {!validating && !scanError && <QRScanner onScan={onScan} onError={(m) => setScanError(m)} />}
          {scanError && (
            <div className="space-y-3">
              <ErrorState title="QR not accepted" description={scanError} onRetry={() => setScanError('')} />
              <QRScanner onScan={onScan} onError={(m) => setScanError(m)} />
            </div>
          )}
          <Card className="p-4 text-sm text-slate-600">
            <p className="font-bold text-ink">Manual entry</p>
            <p className="mt-1 text-xs">If the camera can't read the code, ask the customer for the token shown under their QR and paste it here.</p>
            <div className="mt-2 flex gap-2">
              <div className="flex-1">
                <Input placeholder="Paste customer token" aria-label="Manual redemption token" value={manualToken} onChange={(e) => setManualToken(e.target.value)} />
              </div>
              <Button onClick={() => onScan(manualToken)} disabled={!manualToken.trim() || validating}>Validate</Button>
            </div>
          </Card>
        </div>
      )}

      {step >= 1 && validated && (
        <Card className="space-y-3 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-ink">Customer & deal</h2>
            <Badge tone={membershipTone}>
              {membershipTone === 'success' ? '●' : '✕'} Membership {validated.membership.status.toLowerCase()}
            </Badge>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-slate-50 p-3">
              <dt className="text-xs text-slate-500">Customer</dt>
              <dd className="font-bold text-ink">{validated.customer.firstName}</dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <dt className="text-xs text-slate-500">Plan</dt>
              <dd className="font-bold text-ink">{validated.membership.planName}</dd>
            </div>
            <div className="col-span-2 rounded-xl bg-slate-50 p-3">
              <dt className="text-xs text-slate-500">Deal</dt>
              <dd className="font-bold text-ink">{validated.deal.title}</dd>
              {validated.branch?.name && <dd className="text-xs text-slate-500">📍 {validated.branch.name}</dd>}
            </div>
            <div className="col-span-2 rounded-xl bg-brand-50 p-3">
              <dt className="text-xs text-brand-700">Discount rule</dt>
              <dd className="font-bold text-brand-800">
                {validated.deal.discountPercent}% off
                {maxDiscountPkr !== undefined ? ` · capped at ${formatPKR(maxDiscountPkr)}` : ''}
                {validated.deal.dealType ? ` · ${validated.deal.dealType.replace(/_/g, ' ').toLowerCase()}` : ''}
              </dd>
            </div>
          </dl>
          {step === 1 && (
            <div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input label="Bill amount (Rs.)" type="number" min={1} step="1" value={billRs}
                    onChange={(e) => setBillRs(e.target.value)} placeholder="e.g. 5000" />
                </div>
                <div className="flex items-end">
                  <Button onClick={() => (billPaisa > 0 ? setStep(2) : toast('Enter a valid bill amount.', 'error'))}>
                    Continue
                  </Button>
                </div>
              </div>
              <button className="mt-2 text-xs font-semibold text-slate-400 hover:underline" onClick={reset}>
                ← Scan a different code
              </button>
            </div>
          )}
        </Card>
      )}

      {step === 2 && estimate && (
        <Card className="p-5">
          <h2 className="font-bold text-ink">
            Bill breakdown{' '}
            <span className="rounded-full bg-amber-100 px-2 py-0.5 align-middle text-[10px] font-bold uppercase text-amber-700">
              Estimate
            </span>
          </h2>
          <p className="mt-1 text-xs text-slate-400">Estimate only — final amounts are computed by the server when you confirm.</p>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Bill amount</dt><dd className="font-semibold">{formatPKR(paisaToPkr(billPaisa) ?? 0)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Discount ({validated!.deal.discountPercent}%)</dt><dd className="font-semibold text-success">−{formatPKR(paisaToPkr(estimate.discount) ?? 0)}</dd></div>
            <div className="flex justify-between border-t border-slate-100 pt-2 text-base"><dt className="font-bold text-ink">Customer pays</dt><dd className="font-extrabold text-brand-700">{formatPKR(paisaToPkr(estimate.paid) ?? 0)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Customer saving</dt><dd className="font-bold text-success">{formatPKR(paisaToPkr(estimate.discount) ?? 0)}</dd></div>
          </dl>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" onClick={() => setStep(1)}>← Edit bill</Button>
            <Button className="flex-1" loading={confirming} onClick={confirm}>Confirm Redemption</Button>
          </div>
        </Card>
      )}

      {step === 3 && receipt && (
        <Card className="p-8 text-center">
          <span className="text-5xl" aria-hidden>✅</span>
          <h2 className="mt-3 text-xl font-extrabold text-ink">Redemption confirmed</h2>
          <p className="mt-1 text-sm text-slate-500">Receipt <span className="font-mono font-bold text-ink">{receipt.redemptionId}</span></p>
          <dl className="mx-auto mt-4 max-w-sm space-y-1.5 text-left text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Bill</dt><dd className="font-semibold">{formatPKR(receipt.bill)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Discount</dt><dd className="font-semibold text-success">−{formatPKR(receipt.discount)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Customer paid</dt><dd className="font-bold text-ink">{formatPKR(receipt.paid)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Customer saved</dt><dd className="font-bold text-success">{formatPKR(receipt.saving)}</dd></div>
            <div className="flex justify-between text-xs text-slate-400"><dt>Customer earned</dt><dd>{formatPKR(receipt.cashback)} cashback · {receipt.points} pts</dd></div>
          </dl>
          <Button className="mt-5" onClick={reset}>Scan Next Customer</Button>
        </Card>
      )}
    </div>
  );
}
