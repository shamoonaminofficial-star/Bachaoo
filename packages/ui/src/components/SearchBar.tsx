'use client';
import React from 'react';

export function SearchBar({ value, onChange, onSubmit, placeholder = 'What are you looking for?', suggestions = [] }: {
  value: string; onChange: (v: string) => void; onSubmit?: () => void; placeholder?: string; suggestions?: string[];
}) {
  const [focus, setFocus] = React.useState(false);
  const filtered = suggestions.filter((s) => s.toLowerCase().includes(value.toLowerCase())).slice(0, 6);
  const listOpen = focus && filtered.length > 0;
  return (
    <div className="relative w-full">
      <form onSubmit={(e) => { e.preventDefault(); onSubmit?.(); setFocus(false); }} role="search">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden>🔍</span>
        <input value={value} onChange={(e) => onChange(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 150)}
          onKeyDown={(e) => { if (e.key === 'Escape') setFocus(false); }}
          placeholder={placeholder} aria-label="Search" autoComplete="off"
          role="combobox" aria-expanded={listOpen} aria-controls="search-suggestions" aria-autocomplete="list"
          className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-11 pr-24 text-sm shadow-card outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-100" />
        <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">Search</button>
      </form>
      {listOpen && (
        <ul id="search-suggestions" className="absolute z-30 mt-1 w-full rounded-xl border border-slate-100 bg-white py-1 shadow-pop" role="listbox" aria-label="Search suggestions">
          {filtered.map((s) => (
            <li key={s} role="option" aria-selected="false"><button type="button" onMouseDown={() => { onChange(s); onSubmit?.(); }} className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50">{s}</button></li>
          ))}
        </ul>
      )}
    </div>
  );
}
