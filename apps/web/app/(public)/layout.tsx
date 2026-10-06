'use client';
import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Button, LocationSelector, StickyMobileNav, BottomSheet, Skeleton, useToast } from '@bachatly/ui';
import HeaderSearch from '@/components/HeaderSearch';
import NotificationBell from '@/components/NotificationBell';
import { CITIES } from '@/lib/seed';
import { useAuth, dashboardForRoles, ADMIN_ROLES, PARTNER_ROLES } from '@/lib/auth';

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/deals', label: 'Explore Deals' },
  { href: '/categories', label: 'Categories' },
  { href: '/businesses', label: 'Businesses' },
  { href: '/nearby', label: 'Nearby' },
  { href: '/membership', label: 'Membership' },
  { href: '/rewards', label: 'Rewards' },
];

function UserMenu({ onNavigate }: { onNavigate?: () => void }) {
  const { user, roles, isLoading, logout } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open ]);

  if (isLoading) {
    return <Skeleton className="h-9 w-24 !rounded-full" />;
  }

  if (!user) {
    return (
      <>
        <Link href="/login" className="text-sm font-semibold text-slate-600 hover:text-brand-700" onClick={onNavigate}>
          Login
        </Link>
        <Link href="/membership" onClick={onNavigate}>
          <Button size="sm">Join Now</Button>
        </Link>
      </>
    );
  }

  const initial = (user.firstName?.[0] || user.email?.[0] || 'U').toUpperCase();
  const name = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Member';
  const dashboard = dashboardForRoles(roles);
  const dashboardLabel = roles.some((r) => ADMIN_ROLES.includes(r))
    ? 'Admin Panel'
    : roles.some((r) => PARTNER_ROLES.includes(r))
      ? 'Partner Dashboard'
      : 'My Account';

  const doLogout = async () => {
    setOpen(false);
    onNavigate?.();
    await logout();
    toast('Logged out.');
    router.replace('/');
  };

  const go = (href: string) => {
    setOpen(false);
    onNavigate?.();
    router.push(href);
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex items-center gap-2 rounded-full border border-slate-200 py-1 pl-1 pr-3 transition hover:border-brand-300 hover:bg-brand-50"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white" aria-hidden>
          {initial}
        </span>
        <span className="max-w-28 truncate text-sm font-semibold text-ink">{name.split(' ')[0]}</span>
        <span className="text-xs text-slate-400" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <>
          <div aria-hidden className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="truncate text-sm font-bold text-ink">{name}</p>
              {user.email && <p className="truncate text-xs text-slate-500">{user.email}</p>}
            </div>
            <div className="p-2">
              <button role="menuitem" onClick={() => go(dashboard)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                <span aria-hidden>📊</span> {dashboardLabel}
              </button>
              <button role="menuitem" onClick={() => go('/account/profile')} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                <span aria-hidden>👤</span> Profile Settings
              </button>
              <button role="menuitem" onClick={doLogout} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-error hover:bg-red-50">
                <span aria-hidden>🚪</span> Logout
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2" aria-label="Bachatly home">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-lg font-extrabold text-white" aria-hidden>B</span>
      <span className="text-xl font-extrabold tracking-tight text-ink">Bachatly<span className="text-brand-600">.</span></span>
    </Link>
  );
}

function MobileAuthLinks({ onNavigate }: { onNavigate: () => void }) {
  const { user, roles, isLoading, logout } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  if (isLoading) return <Skeleton className="h-11 w-full !rounded-xl" />;
  if (!user) {
    return (
      <div className="flex gap-2">
        <Link href="/login" className="flex-1" onClick={onNavigate}>
          <Button variant="outline" fullWidth>Login</Button>
        </Link>
        <Link href="/membership" className="flex-1" onClick={onNavigate}>
          <Button fullWidth>Join Now</Button>
        </Link>
      </div>
    );
  }
  const name = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Member';
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 font-bold text-white" aria-hidden>
          {(name[0] || 'U').toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-ink">{name}</p>
          {user.email && <p className="truncate text-xs text-slate-500">{user.email}</p>}
        </div>
      </div>
      <Link href={dashboardForRoles(roles)} onClick={onNavigate}>
        <Button fullWidth>Open Dashboard</Button>
      </Link>
      <Button
        variant="outline"
        fullWidth
        onClick={async () => {
          onNavigate();
          await logout();
          toast('Logged out.');
          router.replace('/');
        }}
      >
        Logout
      </Button>
    </div>
  );
}

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [city, setCity] = useState(CITIES[0]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileSearch, setMobileSearch] = useState(false);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-[70] border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 lg:px-6">
          <Logo />
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${pathname === n.href ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-ink'}`}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto hidden items-center gap-3 lg:flex">
            <div className="w-64"><HeaderSearch /></div>
            <LocationSelector cities={CITIES} value={city} onChange={setCity} compact />
            <NotificationBell />
            <UserMenu />
          </div>
          <div className="ml-auto flex items-center gap-1 lg:hidden">
            <button onClick={() => setMobileSearch((s) => !s)} aria-label="Search" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100">🔍</button>
            <LocationSelector cities={CITIES} value={city} onChange={setCity} compact />
            <NotificationBell />
            <button onClick={() => setMenuOpen(true)} aria-label="Open menu" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100">☰</button>
          </div>
        </div>
        {mobileSearch && (
          <div className="border-t border-slate-100 px-4 py-2 lg:hidden">
            <HeaderSearch />
          </div>
        )}
      </header>

      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu">
        <nav className="flex flex-col gap-1" aria-label="Mobile">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setMenuOpen(false)}
              className={`rounded-xl px-4 py-3 font-medium ${pathname === n.href ? 'bg-brand-50 text-brand-700' : 'text-slate-700 hover:bg-slate-100'}`}>
              {n.label}
            </Link>
          ))}
          <div className="mt-3 border-t border-slate-100 pt-4">
            <MobileAuthLinks onNavigate={() => setMenuOpen(false)} />
          </div>
        </nav>
      </BottomSheet>

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">{children}</main>

      <footer className="border-t border-slate-200 bg-ink text-slate-300">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4 lg:px-6">
          <div>
            <p className="text-xl font-extrabold text-white">Bachatly<span className="text-accent">.</span></p>
            <p className="mt-2 text-sm text-slate-400">Save More. Live More. Exclusive deals, vouchers and rewards from businesses around you.</p>
            <div className="mt-4 flex gap-2">
              {['Facebook', 'Instagram', 'X', 'YouTube'].map((s) => (
                <a key={s} href="#" aria-label={s} className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-sm hover:bg-brand-600">◉</a>
              ))}
            </div>
          </div>
          <nav aria-label="Company and customers">
            <p className="font-bold text-white">Company</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link href="/about" className="hover:text-white">About</Link></li>
              <li><Link href="/contact" className="hover:text-white">Contact</Link></li>
              <li><Link href="/about" className="hover:text-white">Careers</Link></li>
            </ul>
            <p className="mt-6 font-bold text-white">Customers</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link href="/deals" className="hover:text-white">Explore Deals</Link></li>
              <li><Link href="/membership" className="hover:text-white">Membership</Link></li>
              <li><Link href="/rewards" className="hover:text-white">Rewards</Link></li>
              <li><Link href="/faqs" className="hover:text-white">Help</Link></li>
            </ul>
          </nav>
          <nav aria-label="Partners">
            <p className="font-bold text-white">Partners</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link href="/partner" className="hover:text-white">Become a Partner</Link></li>
              <li><Link href="/login?next=/partner/dashboard" className="hover:text-white">Partner Login</Link></li>
            </ul>
          </nav>
          <nav aria-label="Legal">
            <p className="font-bold text-white">Legal</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link href="/terms" className="hover:text-white">Terms</Link></li>
              <li><Link href="/privacy" className="hover:text-white">Privacy</Link></li>
              <li><Link href="/refund" className="hover:text-white">Refund Policy</Link></li>
            </ul>
          </nav>
        </div>
        <div className="border-t border-white/10 py-4 text-center text-xs text-slate-500">© 2026 Bachatly. All rights reserved. Made for smart savers in Pakistan.</div>
      </footer>

      <StickyMobileNav items={[
        { href: '/', label: 'Home', icon: '🏠' },
        { href: '/deals', label: 'Deals', icon: '🎟️', match: '/deal' },
        { href: '/nearby', label: 'Nearby', icon: '📍' },
        { href: '/membership', label: 'Join', icon: '👑' },
        { href: '/account', label: 'Account', icon: '👤' },
      ]} />
    </div>
  );
}
