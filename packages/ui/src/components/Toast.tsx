'use client';
import React, { createContext, useCallback, useContext, useState } from 'react';

type ToastKind = 'success' | 'error' | 'info' | 'warning';
interface ToastItem { id: number; kind: ToastKind; message: string; }
const ToastCtx = createContext<{ toast: (message: string, kind?: ToastKind) => void }>({ toast: () => {} });
export const useToast = () => useContext(ToastCtx);

const kindStyle: Record<ToastKind, string> = {
  success: 'bg-brand-700', error: 'bg-error', info: 'bg-ink', warning: 'bg-amber-600',
};
const kindIcon: Record<ToastKind, string> = { success: '✓', error: '!', info: 'i', warning: '⚠' };

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toast = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);
  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-20 md:bottom-6 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2 px-4 w-full max-w-md" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`${kindStyle[t.kind]} flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-pop animate-[slideUp_.2s_ease] w-full`}>
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/25 text-xs font-bold">{kindIcon[t.kind]}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
