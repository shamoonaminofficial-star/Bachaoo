'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Button, Skeleton, Select } from '@bachatly/ui';
import { QrCode } from './QrCode';
import {
  checkDealEligibility, mintQrToken, ApiError, type QrToken,
} from '@/lib/catalog';

interface BranchOption { id: string; name: string; isActive?: boolean }

export interface RedeemDealInfo {
  id: string;
  slug: string;
  title: string;
  businessName?: string;
  branches?: BranchOption[];
}

/**
 * RedeemQrModal — customer redemption flow for a deal.
 *
 * 1. On open: checks per-user eligibility (GET /redemptions/deal/:id/eligibility).
 * 2. If eligible: mints a short-lived signed QR token (POST /redemptions/qr),
 *    shows it with a live countdown, and re-mints ~10s before expiry while the
 *    modal stays open. Re-minting stops the moment the modal closes.
 * 3. If not eligible: shows the server-provided reasons.
 *
 * The token is single-use and carries no PII — UI copy says so plainly.
 */
export function RedeemQrModal({
  open, onClose, deal,
}: {
  open: boolean; onClose: () => void; deal: RedeemDealInfo;
}) {
  const [phase, setPhase] = useState<'checking' | 'minting' | 'ready' | 'ineligible' | 'error'>('checking');
  const [qr, setQr] = useState<QrToken | null>(null);
  const [expiresAt, setExpiresAt] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [reasons, setReasons] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [branchId, setBranchId] = useState('');
  const refreshingRef = useRef(false);
  const openRef = useRef(open);
  openRef.current = open;

  const mint = useCallback(async (silent: boolean, bid?: string) => {
    if (!silent) setPhase('minting');
    refreshingRef.current = true;
    try {
      const t = await mintQrToken(deal.id, bid || branchId || undefined);
      if (!openRef.current) return; // modal closed while minting — discard
      setQr(t);
      setExpiresAt(Date.now() + t.expiresIn * 1000);
      setSecondsLeft(t.expiresIn);
      setPhase('ready');
    } catch (e) {
      if (!openRef.current) return;
      setError(e instanceof ApiError ? e.message : 'Could not generate a QR code. Please try again.');
      setPhase('error');
    } finally {
      refreshingRef.current = false;
    }
  }, [deal.id, branchId]);

  const start = useCallback(async (initialBid?: string) => {
    setPhase('checking'); setError(''); setReasons([]); setQr(null);
    try {
      const { eligible, reasons: rs } = await checkDealEligibility(deal.id);
      if (!openRef.current) return;
      if (!eligible) {
        setReasons(rs.length ? rs : ['This deal is not available for your account right now.']);
        setPhase('ineligible');
        return;
      }
      await mint(false, initialBid);
    } catch (e) {
      if (!openRef.current) return;
      setError(e instanceof ApiError ? e.message : 'Could not check eligibility. Please try again.');
      setPhase('error');
    }
  }, [deal.id, mint]);

  // (Re)start the flow whenever the modal opens; default branch = first active.
  useEffect(() => {
    if (!open) return;
    const firstActive = deal.branches?.find((b) => b.isActive !== false)?.id ?? deal.branches?.[0]?.id ?? '';
    setBranchId(firstActive);
    refreshingRef.current = false;
    start(firstActive);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, deal.id]);

  // Live countdown + auto-refresh ~10s before expiry while open.
  useEffect(() => {
    if (!open || phase !== 'ready' || !expiresAt) return;
    const iv = setInterval(() => {
      const left = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 10 && !refreshingRef.current) {
        // Refresh in the background; the visible QR swaps only on success.
        mint(true).catch(() => { /* keep the current QR until it expires */ });
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [open, phase, expiresAt, mint]);

  const retry = () => { setError(''); start(branchId); };
  const changeBranch = (bid: string) => {
    setBranchId(bid);
    if (phase === 'ready' || phase === 'error') mint(false, bid);
  };

  const activeBranches = (deal.branches ?? []).filter((b) => b.isActive !== false);
  const pct = qr ? Math.max(0, Math.min(100, (secondsLeft / (qr.expiresIn || 1)) * 100)) : 0;
  const urgent = secondsLeft <= 15;
  const selectedBranch = activeBranches.find((b) => b.id === branchId);

  return (
    <Modal open={open} onClose={onClose} title="Redeem this offer">
      <div className="space-y-4">
        <div className="text-center">
          <p className="font-extrabold text-ink">{deal.title}</p>
          <p className="text-sm text-slate-500">
            {deal.businessName ?? ''}
            {selectedBranch ? ` · ${selectedBranch.name}` : ''}
          </p>
        </div>

        {activeBranches.length > 1 && (phase === 'ready' || phase === 'minting') && (
          <Select
            label="Choose a branch"
            value={branchId}
            onChange={(e) => changeBranch(e.target.value)}
            options={activeBranches.map((b) => ({ value: b.id, label: b.name }))}
          />
        )}

        {(phase === 'checking' || phase === 'minting') && (
          <div className="space-y-2">
            <Skeleton className="mx-auto h-56 w-56 !rounded-2xl" />
            <p className="text-center text-sm text-slate-500">
              {phase === 'checking' ? 'Checking eligibility…' : 'Generating your secure QR code…'}
            </p>
          </div>
        )}

        {phase === 'ready' && qr && (
          <div className="space-y-3">
            <QrCode value={qr.token} size={220} label={`Redemption QR for ${deal.title}`} />
            <div>
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className={urgent ? 'text-error' : 'text-slate-500'}>
                  {urgent ? 'Refreshing soon…' : 'Code refreshes automatically'}
                </span>
                <span className={`font-mono ${urgent ? 'text-error' : 'text-ink'}`}>{secondsLeft}s</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar"
                aria-valuenow={secondsLeft} aria-valuemin={0} aria-valuemax={qr.expiresIn}
                aria-label="QR code time remaining">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${urgent ? 'bg-error' : 'bg-brand-600'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
            <div className="rounded-2xl bg-brand-50 p-4 text-center">
              <p className="font-bold text-brand-800">📱 Show this to the cashier</p>
              <p className="mt-1 text-xs leading-relaxed text-brand-700/80">
                Your QR refreshes every ~90 seconds and can't be screenshotted for reuse.
                The code is single-use and contains no personal details.
              </p>
            </div>
          </div>
        )}

        {phase === 'ineligible' && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="font-bold text-amber-800">You can't redeem this deal yet</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-700">
              {reasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={onClose}>Close</Button>
              <Button className="flex-1" onClick={() => { window.location.href = `/membership?next=/deal/${deal.slug}`; }}>
                View membership plans
              </Button>
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-center">
            <p className="font-bold text-error">Something went wrong</p>
            <p className="mt-1 text-sm text-slate-600">{error}</p>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={onClose}>Close</Button>
              <Button className="flex-1" onClick={retry}>Try again</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
