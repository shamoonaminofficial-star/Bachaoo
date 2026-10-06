'use client';
import React from 'react';

export function LocationSelector({ cities, value, onChange, compact }: {
  cities: string[]; value: string; onChange: (c: string) => void; compact?: boolean;
}) {
  return (
    <label className={`inline-flex items-center gap-1.5 ${compact ? 'text-sm' : ''}`}>
      <span aria-hidden>📍</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Select city"
        className={`cursor-pointer bg-transparent font-semibold text-ink outline-none ${compact ? 'text-sm max-w-[110px]' : 'text-sm'}`}>
        {cities.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    </label>
  );
}
