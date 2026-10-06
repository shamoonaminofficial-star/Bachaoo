'use client';
import React from 'react';

/** Lightweight SVG charts — no heavy dependencies. */

export function Sparkline({ data, width = 160, height = 44, stroke = '#0B6B4F' }: { data: number[]; width?: number; height?: number; stroke?: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data), min = Math.min(...data), range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * (height - 6) - 3}`).join(' ');
  return (
    <svg width={width} height={height} role="img" aria-label="Trend chart">
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BarChart({ data, height = 160 }: { data: { label: string; value: number }[]; height?: number }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-2" style={{ height }} role="img" aria-label="Bar chart">
      {data.map((d) => (
        <div key={d.label} className="flex flex-1 flex-col items-center gap-1" title={`${d.label}: ${d.value}`}>
          <div className="w-full rounded-t-lg bg-brand-200 transition hover:bg-brand-500" style={{ height: `${Math.max(4, (d.value / max) * (height - 28))}px` }} />
          <span className="text-[10px] font-medium text-slate-500">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export function Donut({ segments, size = 120 }: { segments: { label: string; value: number; color: string }[]; size?: number }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let acc = 0;
  const r = 44, c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label="Distribution chart">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#e2e8f0" strokeWidth="16" />
        {segments.map((s) => {
          const frac = s.value / total;
          const el = <circle key={s.label} cx="60" cy="60" r={r} fill="none" stroke={s.color} strokeWidth="16"
            strokeDasharray={`${frac * c} ${c}`} strokeDashoffset={-acc * c} transform="rotate(-90 60 60)" />;
          acc += frac; return el;
        })}
      </svg>
      <ul className="space-y-1 text-xs">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5 text-slate-600">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} aria-hidden />{s.label} ({Math.round((s.value / total) * 100)}%)
          </li>
        ))}
      </ul>
    </div>
  );
}
