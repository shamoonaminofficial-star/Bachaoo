import React from 'react';
import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-ink p-10 text-white lg:flex">
        <Link href="/" className="text-xl font-extrabold">Bachatly<span className="text-accent">.</span></Link>
        <div>
          <h2 className="text-3xl font-extrabold leading-tight">Save More.<br />Live More.</h2>
          <p className="mt-3 max-w-sm text-slate-300">Join thousands of members unlocking exclusive deals, cashback and rewards across Pakistan.</p>
          <div className="mt-6 flex gap-6 text-sm"><span>🎟️ <strong>2,400+</strong> partners</span><span>💰 <strong>Rs. 18M+</strong> saved</span></div>
        </div>
        <p className="text-xs text-slate-500">© 2026 Bachatly</p>
      </div>
      <div className="flex items-center justify-center bg-slate-50 px-4 py-10">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
