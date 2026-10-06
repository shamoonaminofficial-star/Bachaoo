import React from 'react';
import Link from 'next/link';

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm">
      <ol className="flex flex-wrap items-center gap-1.5 text-slate-500">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden className="text-slate-300">/</span>}
            {it.href ? <Link href={it.href} className="hover:text-brand-700 hover:underline">{it.label}</Link> : <span className="font-medium text-ink" aria-current="page">{it.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
