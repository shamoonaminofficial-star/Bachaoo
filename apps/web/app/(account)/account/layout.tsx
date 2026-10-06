'use client';
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { StickyMobileNav, Badge, Avatar, useToast } from '@bachatly/ui';
import { useAuth } from '@/lib/auth';
import NotificationBell from '@/components/NotificationBell';
import { fetchMyMembership, type MyMembership } from '@/lib/memberships';
import { daysUntil } from '@/lib/format';
import AuthGuard from '@/components/AuthGuard';

const ITEMS = [
  { href: '/account', label: 'Overview', icon: '🏠', exact: true },
  { href: '/account/membership', label: 'My Membership', icon: '👑' },
  { href: '/account/qr', label: 'My QR', icon: '📱' },
  { href: '/account/saved', label: 'Saved Deals', icon: '♡' },
  { href: '/account/vouchers', label: 'My Vouchers', icon: '🎫' },
  { href: '/account/rewards', label: 'Rewards', icon: '⭐' },
  { href: '/account/wallet', label: 'Wallet', icon: '👛' },
  { href: '/account/cashback', label: 'Cashback', icon: '💸' },
  { href: '/account/referrals', label: 'Referrals', icon: '🤝' },
  { href: '/account/history', label: 'Redemptions', icon: '🧾' },
  { href: '/account/savings', label: 'Savings', icon: '📊' },
  { href: '/account/notifications', label: 'Notifications', icon: '🔔' },
  { href: '/account/profile', label: 'Profile', icon: '👤' },
  { href: '/account/security', label: 'Security', icon: '🔒' },
  { href: '/account/support', label: 'Support', icon: '💬' },
];

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { toast } = useToast();
  const { user, logout: signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [membership, setMembership] = useState<MyMembership | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    fetchMyMembership().catch(() => null).then((m) => { if (live) setMembership(m); });
    return () => { live = false; };
  }, []);

  const logout = useCallback(async () => {
    await signOut();
    toast('Logged out.');
    window.location.href = '/';
  }, [signOut, toast]);

  const active = membership?.status?.toUpperCase() === 'ACTIVE';
  const left = membership?.endDate ? daysUntil(membership.endDate) : null;

  const nav = (
    <nav className="flex flex-col gap-1 p-3" aria-label="Account">
      {ITEMS.map((it) => {
        const isActive = it.exact ? pathname === it.href : pathname === it.href || pathname.startsWith(it.href + '/');
        return (
          <Link key={it.href} href={it.href} onClick={() => setOpen(false)} aria-current={isActive ? 'page' : undefined}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`}>
            <span className="text-lg" aria-hidden>{it.icon}</span>{it.label}
          </Link>
        );
      })}
      <button onClick={logout} className="mt-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-error hover:bg-red-50">
        <span className="text-lg" aria-hidden>🚪</span>Logout
      </button>
    </nav>
  );

  return (
    <AuthGuard>
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-[60] border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <button className="rounded-lg p-2 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open account menu">☰</button>
          <Link href="/" className="text-lg font-extrabold text-ink">Bachatly<span className="text-brand-600">.</span></Link>
          <div className="ml-auto flex items-center gap-2">
            {active && membership?.plan && (
              <Link href="/account/membership">
                <Badge tone="brand">👑 {membership.plan.name}{left !== null && left >= 0 ? ` · ${left}d left` : ''}</Badge>
              </Link>
            )}
            {membership === null && (
              <Link href="/membership"><Badge tone="warn">No membership</Badge></Link>
            )}
            <Link href="/account/profile" className="flex items-center gap-2 rounded-lg p-1 hover:bg-slate-100" aria-label="Profile">
              <Avatar name={user ? `${user.firstName} ${user.lastName}` : 'Bachatly user'} size="sm" />
              <span className="hidden max-w-[120px] truncate text-sm font-semibold text-ink sm:block">
                {user?.firstName || 'Account'}
              </span>
            </Link>
            <NotificationBell />
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6 lg:px-6">
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-20 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">{nav}</div>
        </aside>
        {open && (
          <div className="fixed inset-0 z-[80] lg:hidden" role="dialog" aria-label="Account menu">
            <div className="absolute inset-0 bg-ink/50" onClick={() => setOpen(false)} />
            <div className="absolute bottom-0 left-0 top-0 w-72 overflow-y-auto bg-white shadow-pop">{nav}</div>
          </div>
        )}
        <main id="main-content" className="min-w-0 flex-1 pb-20 lg:pb-0">{children}</main>
      </div>
      <StickyMobileNav items={[
        { href: '/account', label: 'Home', icon: '🏠' },
        { href: '/account/qr', label: 'My QR', icon: '📱' },
        { href: '/account/vouchers', label: 'Vouchers', icon: '🎫' },
        { href: '/account/savings', label: 'Savings', icon: '📊' },
        { href: '/account/profile', label: 'Profile', icon: '👤' },
      ]} />
    </div>
    </AuthGuard>
  );
}
