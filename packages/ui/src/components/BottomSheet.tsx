'use client';
import React from 'react';
import { useDialogA11y } from './useDialogA11y';

export function BottomSheet({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode;
}) {
  const panelRef = useDialogA11y(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] md:hidden" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-ink/50" onClick={onClose} />
      <div ref={panelRef} tabIndex={-1} className="absolute bottom-0 left-0 right-0 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-white shadow-pop animate-[slideUp_.25s_ease] outline-none">
        <div className="sticky top-0 bg-white px-5 pt-3 pb-2">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-slate-300" />
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-ink">{title}</h2>
            <button onClick={onClose} aria-label="Close sheet" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">✕</button>
          </div>
        </div>
        <div className="px-5 pb-6">{children}</div>
      </div>
    </div>
  );
}
