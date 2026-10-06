'use client';
import React from 'react';
import { useDialogA11y } from './useDialogA11y';

export function Drawer({ open, onClose, title, children, side = 'right' }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode; side?: 'right' | 'left';
}) {
  const panelRef = useDialogA11y(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-ink/50" onClick={onClose} />
      <aside ref={panelRef} tabIndex={-1} className={`absolute top-0 bottom-0 ${side === 'right' ? 'right-0' : 'left-0'} w-full max-w-md bg-white shadow-pop flex flex-col animate-[slideIn_.25s_ease] outline-none`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-bold text-ink">{title}</h2>
          <button onClick={onClose} aria-label="Close panel" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </aside>
    </div>
  );
}
