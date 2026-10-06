'use client';
import React, { useMemo } from 'react';

/**
 * QrCode — PLACEHOLDER QR renderer (deterministic pseudo-QR pattern, NOT scannable).
 *
 * There is no QR-rendering library in package.json and `npm install` is out of
 * scope for this build, so this component draws a deterministic pseudo-QR
 * pattern (same token → same pattern) and always shows the raw token as text
 * underneath, so the flow is testable end-to-end.
 *
 * TO GO LIVE: add a real QR library (e.g. `react-qr-code` or `qrcode.react`),
 * install it, and replace the <svg> body below with e.g.
 *   <QRCode value={value} size={size} />
 * Everything else — the countdown, auto-refresh, and copy — already treats
 * `value` as a short-lived signed token. This file is the only thing that
 * needs to change.
 *
 * Security note (already enforced backend-side): the value encoded here is a
 * signed, single-use, ~90s token. It carries no PII — only jti/sub/dealId —
 * so a screenshot is useless once the token expires or is consumed.
 */

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const N = 29; // module grid

function isFinder(x: number, y: number): boolean {
  return (x < 8 && y < 8) || (x >= N - 8 && y < 8) || (x < 8 && y >= N - 8);
}

function Finder({ x, y }: { x: number; y: number }) {
  // 7×7 finder: dark outer, white ring, dark core.
  return (
    <g>
      <rect x={x} y={y} width={7} height={7} fill="currentColor" />
      <rect x={x + 1} y={y + 1} width={5} height={5} fill="white" />
      <rect x={x + 2} y={y + 2} width={3} height={3} fill="currentColor" />
    </g>
  );
}

export function QrCode({
  value,
  size = 220,
  showToken = true,
  label,
}: {
  value: string;
  size?: number;
  showToken?: boolean;
  label?: string;
}) {
  const modules = useMemo(() => {
    const rand = mulberry32(hashStr(value || 'empty'));
    const cells: Array<[number, number]> = [];
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (isFinder(x, y)) continue;
        if (rand() < 0.46) cells.push([x, y]);
      }
    }
    return cells;
  }, [value]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="rounded-2xl bg-white p-3 shadow-sm" role="img" aria-label={label ?? 'Redemption QR code'}>
        <svg width={size} height={size} viewBox={`0 0 ${N} ${N}`} className="block text-ink" aria-hidden>
          {modules.map(([x, y], i) => (
            <rect key={i} x={x} y={y} width={1} height={1} fill="currentColor" />
          ))}
          <Finder x={0} y={0} />
          <Finder x={N - 7} y={0} />
          <Finder x={0} y={N - 7} />
        </svg>
      </div>
      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
        Demo pattern — not scannable
      </span>
      {showToken && (
        <p className="w-full break-all rounded-lg bg-slate-50 px-2 py-1 text-center font-mono text-[10px] text-slate-500">
          {value}
        </p>
      )}
    </div>
  );
}
