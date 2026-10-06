'use client';
import React, { useEffect, useRef, useState } from 'react';
import { searchSuggest } from '@/lib/catalog';

/** Header search with live autocomplete suggestions from /search/suggest. */
export default function HeaderSearch({ placeholder = 'Search deals, businesses…' }: { placeholder?: string }) {
  const [q, setQ] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!q.trim()) { setSuggestions([]); return; }
    const t = setTimeout(() => {
      searchSuggest(q).then((s) => { setSuggestions(s.slice(0, 6)); setOpen(true); }).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const go = (term: string) => {
    const t = term.trim();
    if (!t) return;
    try {
      const recent = JSON.parse(localStorage.getItem('bachatly_recent_searches') || '[]').filter((x: string) => x !== t);
      localStorage.setItem('bachatly_recent_searches', JSON.stringify([t, ...recent].slice(0, 6)));
    } catch { /* ignore */ }
    window.location.href = `/search?q=${encodeURIComponent(t)}`;
  };

  return (
    <div ref={boxRef} className="relative w-full">
      <form role="search" onSubmit={(e) => { e.preventDefault(); setOpen(false); go(q); }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder={placeholder}
          aria-label="Search deals and businesses"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-600 focus:bg-white focus:ring-2 focus:ring-brand-100"
        />
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden>🔍</span>
      </form>
      {open && suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-[80] mt-1 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-pop" role="listbox">
          {suggestions.map((s) => (
            <li key={s} role="option" aria-selected="false">
              <button type="button" onMouseDown={() => go(s)}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50">
                <span className="text-slate-400" aria-hidden>🔍</span>{s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
