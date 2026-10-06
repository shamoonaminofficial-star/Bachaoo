'use client';
import React, { useEffect, useState } from 'react';
import type { Membership } from '../types';

/**
 * Premium digital membership card.
 *
 * When a real short-lived signed redemption `token` is passed (issued by the
 * backend, e.g. via POST /api/v1/redemptions/qr), the card renders a QR panel
 * with a live countdown. Without a token it renders an honest static panel —
 * deal-specific QRs are minted from each deal's "Redeem Offer" flow, never
 * faked here. (An earlier dev build fabricated rotating tokens client-side;
 * that was removed — no fake tokens, ever.)
 *
 * The QR artwork itself is a deterministic pseudo-QR placeholder living in the
 * web app (apps/web/components/QrCode.tsx). Until a real QR library is wired,
 * the panel is clearly labeled as a placeholder.
 */
export function DigitalMembershipCard({
  membership,
  token,
  expiresIn,
}: {
  membership: Membership;
  /** Real signed short-lived token (backend-issued). Omit when none is minted. */
  token?: string;
  /** Token lifetime in seconds (from the mint response). */
  expiresIn?: number;
}) {
  const [secondsLeft, setSecondsLeft] = useState(expiresIn ?? 90);

  useEffect(() => {
    if (!token) return;
    setSecondsLeft(expiresIn ?? 90);
    const tick = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(tick);
  }, [token, expiresIn]);

  const active = membership.status === 'active';
  return (
    <div className="relative overflow-hidden rounded-3xl bg-ink p-6 text-white shadow-pop">
      <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand-600/40" aria-hidden />
      <div className="absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-accent/20" aria-hidden />
      <div className="relative">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xl font-extrabold tracking-tight">Bachatly<span className="text-accent">.</span></p>
            <p className="text-xs text-white/60">Save More. Live More.</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${active ? 'bg-success/20 text-green-300' : 'bg-white/10 text-white/70'}`}>
            {active ? '● ACTIVE' : membership.status.toUpperCase()}
          </span>
        </div>
        <div className="mt-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">{membership.holderName}</p>
            <p className="mt-1 font-mono text-xs text-white/70 tracking-widest">{membership.number}</p>
            <p className="mt-3 text-xs text-white/60">{membership.planName} · Expires {new Date(membership.expiresAt).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="flex h-24 w-24 items-center justify-center rounded-xl bg-white p-1" role="img" aria-label={token ? 'Redemption QR code' : 'Membership code panel'}>
              {token ? (
                <svg viewBox="0 0 24 24" className="h-full w-full text-ink" aria-hidden>
                  <rect x="2" y="2" width="7" height="7" fill="currentColor" /><rect x="4" y="4" width="3" height="3" fill="white" />
                  <rect x="15" y="2" width="7" height="7" fill="currentColor" /><rect x="17" y="4" width="3" height="3" fill="white" />
                  <rect x="2" y="15" width="7" height="7" fill="currentColor" /><rect x="4" y="17" width="3" height="3" fill="white" />
                  {Array.from({ length: 24 }).map((_, i) => <rect key={i} x={11 + (i % 6) * 2} y={11 + Math.floor(i / 6) * 2.6} width="1.4" height="1.4" fill="currentColor" opacity={0.7} />)}
                </svg>
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-ink">
                  <span className="text-3xl" aria-hidden>🎟️</span>
                  <span className="px-1 text-center text-[8px] font-bold leading-tight text-slate-500">QR issued<br />per deal</span>
                </div>
              )}
            </div>
            {token ? (
              <p className="text-[10px] text-white/60">Refreshes in {secondsLeft}s</p>
            ) : (
              <p className="text-[10px] text-white/50">Redeem a deal for a QR</p>
            )}
          </div>
        </div>
        <p className="mt-4 text-[10px] leading-relaxed text-white/40">
          {token
            ? 'QR contains a short-lived signed token only. Show it to the partner to redeem — screenshots expire automatically.'
            : 'Each redemption QR is minted fresh from the deal page and expires in ~90 seconds. Screenshots cannot be reused.'}
        </p>
      </div>
    </div>
  );
}
