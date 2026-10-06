'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function StickyMobileNav({ items }: { items: { href: string; label: string; icon: string; match?: string }[] }) {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[60] border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="Mobile navigation">
      <div className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
        {items.map((it) => {
          const active = pathname === it.href || (it.match && pathname.startsWith(it.match));
          return (
            <Link key={it.href} href={it.href} aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${active ? 'text-brand-700' : 'text-slate-500'}`}>
              <span className="text-xl" aria-hidden>{it.icon}</span>{it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
