'use client';
import React from 'react';
import { Button } from './Button';
import { useDialogA11y } from './useDialogA11y';

export function Modal({ open, onClose, title, children, footer, wide }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean;
}) {
  const panelRef = useDialogA11y(open, onClose);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-ink/50 backdrop-blur-[2px] animate-[fadeIn_.2s_ease]" onClick={onClose} />
      <div ref={panelRef} tabIndex={-1} className={`relative w-full bg-white rounded-t-3xl sm:rounded-2xl shadow-pop animate-[slideUp_.25s_ease] outline-none ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'} max-h-[92vh] flex flex-col`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-bold text-ink">{title}</h2>
          <button onClick={onClose} aria-label="Close dialog" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">✕</button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-slate-100 px-5 py-4 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

/** Confirmation modal for destructive/sensitive actions: shows action, affected account, amount, reason field. */
export function ConfirmModal({ open, onClose, onConfirm, title, action, affected, amount, requireReason, confirmLabel = 'Confirm', danger, description, children }: {
  open: boolean; onClose: () => void; onConfirm: (reason: string) => void | Promise<void>; title: string;
  action: string; affected?: string; amount?: string; requireReason?: boolean; confirmLabel?: string; danger?: boolean; description?: string; children?: React.ReactNode;
}) {
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const submit = async () => {
    if (requireReason && !reason.trim()) { setError('Please provide a reason.'); return; }
    setBusy(true);
    try { await onConfirm(reason); setReason(''); setError(''); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Action failed. Please try again.'); }
    finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={title}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} disabled={busy} onClick={submit}>{busy ? 'Working…' : confirmLabel}</Button></>}>
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between"><dt className="text-slate-500">Action</dt><dd className="font-semibold text-ink">{action}</dd></div>
        {affected && <div className="flex justify-between"><dt className="text-slate-500">Affected</dt><dd className="font-semibold text-ink">{affected}</dd></div>}
        {amount && <div className="flex justify-between"><dt className="text-slate-500">Amount</dt><dd className="font-semibold text-ink">{amount}</dd></div>}
      </dl>
      {description && <p className="mt-3 text-sm text-slate-500">{description}</p>}
      {children && <div className="mt-4">{children}</div>}
      {requireReason && (
        <div className="mt-4">
          <label htmlFor="confirm-reason" className="mb-1.5 block text-sm font-semibold text-ink">Reason</label>
          <textarea id="confirm-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100" placeholder="Why is this action needed?" />
          {error && <p className="mt-1 text-xs text-error" role="alert">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
