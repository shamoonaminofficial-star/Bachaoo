'use client';
import React from 'react';
import { useToast } from './Toast';

export function ShareButtons({ url, text, title = 'Share' }: { url: string; text: string; title?: string }) {
  const { toast } = useToast();
  const encoded = encodeURIComponent(url);
  const msg = encodeURIComponent(text);
  const links = [
    { name: 'WhatsApp', icon: '💬', href: `https://wa.me/?text=${msg}%20${encoded}` },
    { name: 'Facebook', icon: '📘', href: `https://www.facebook.com/sharer/sharer.php?u=${encoded}` },
    { name: 'X', icon: '𝕏', href: `https://twitter.com/intent/tweet?text=${msg}&url=${encoded}` },
    { name: 'Email', icon: '✉️', href: `mailto:?subject=${encodeURIComponent(text)}&body=${encoded}` },
  ];
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast('Link copied to clipboard.'); }
    catch { toast('Could not copy link.', 'error'); }
  };
  return (
    <div aria-label={title}>
      <p className="mb-2 text-sm font-semibold text-ink">{title}</p>
      <div className="flex flex-wrap gap-2">
        {links.map((l) => (
          <a key={l.name} href={l.href} target="_blank" rel="noopener noreferrer" aria-label={`Share on ${l.name}`}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-brand-500 hover:text-brand-700">
            <span aria-hidden>{l.icon}</span>{l.name}
          </a>
        ))}
        <button onClick={copy} className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-brand-500 hover:text-brand-700">
          <span aria-hidden>🔗</span>Copy Link
        </button>
      </div>
    </div>
  );
}
