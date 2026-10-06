'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Breadcrumbs, useToast } from '@bachatly/ui';
import { useAuth, ADMIN_ROLES } from '@/lib/auth';
import { fetchFraudAlerts } from '@/lib/admin';
import AuthGuard from '@/components/AuthGuard';

type NavItem = { href: string; label: string; icon: string; superOnly?: boolean };
type NavGroup = { title: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  { title: 'Overview', items: [{ href: '/admin', label: 'Dashboard', icon: '📊' }] },
  { title: 'Moderation', items: [
    { href: '/admin/applications', label: 'Partner Applications', icon: '📝' },
    { href: '/admin/deals', label: 'Deal Approvals', icon: '✅' },
    { href: '/admin/payments', label: 'Payment Verifications', icon: '💳' },
    { href: '/admin/reviews', label: 'Reviews', icon: '⭐' },
    { href: '/admin/support', label: 'Support Tickets', icon: '💬' },
    { href: '/admin/fraud-alerts', label: 'Fraud Alerts', icon: '🚨' },
  ]},
  { title: 'Catalog', items: [
    { href: '/admin/businesses', label: 'Businesses', icon: '🏪' },
    { href: '/admin/branches', label: 'Branches', icon: '🏬' },
    { href: '/admin/categories', label: 'Categories', icon: '🗂️' },
    { href: '/admin/locations', label: 'Locations', icon: '📍' },
    { href: '/admin/banners', label: 'Banners', icon: '🖼️' },
    { href: '/admin/campaigns', label: 'Campaigns', icon: '📣' },
  ]},
  { title: 'Commerce', items: [
    { href: '/admin/plans', label: 'Membership Plans', icon: '👑' },
    { href: '/admin/memberships', label: 'Memberships', icon: '🪪' },
    { href: '/admin/redemptions', label: 'Redemptions', icon: '🧾' },
    { href: '/admin/vouchers', label: 'Vouchers', icon: '🎫' },
    { href: '/admin/wallet', label: 'Wallet', icon: '👛' },
    { href: '/admin/cashback', label: 'Cashback', icon: '💸' },
    { href: '/admin/rewards', label: 'Rewards', icon: '⭐' },
    { href: '/admin/referrals', label: 'Referrals', icon: '🤝' },
    { href: '/admin/commissions', label: 'Commissions', icon: '📉' },
    { href: '/admin/settlements', label: 'Settlements', icon: '💰' },
  ]},
  { title: 'Users', items: [
    { href: '/admin/users', label: 'Users', icon: '👥' },
    { href: '/admin/staff', label: 'Admin Staff', icon: '🧑‍💼', superOnly: true },
  ]},
  { title: 'Engage', items: [
    { href: '/admin/notifications', label: 'Notifications', icon: '🔔' },
    { href: '/admin/cms', label: 'CMS', icon: '📄' },
  ]},
  { title: 'Insight', items: [
    { href: '/admin/reports', label: 'Reports', icon: '📑' },
    { href: '/admin/analytics', label: 'Analytics', icon: '📈' },
    { href: '/admin/audit', label: 'Audit Logs', icon: '📋' },
  ]},
  { title: 'System', items: [
    { href: '/admin/roles', label: 'Roles & Permissions', icon: '🔐', superOnly: true },
    { href: '/admin/settings', label: 'Settings', icon: '⚙️', superOnly: true },
    { href: '/admin/health', label: 'System Health', icon: '🩺' },
  ]},
];

const CRUMBS: Record<string, string> = {
  users: 'Users', businesses: 'Businesses', applications: 'Partner Applications', branches: 'Branches',
  categories: 'Categories', locations: 'Locations', deals: 'Deal Approvals', vouchers: 'Vouchers', plans: 'Membership Plans',
  memberships: 'Memberships', redemptions: 'Redemptions', rewards: 'Rewards', wallet: 'Wallet',
  cashback: 'Cashback', referrals: 'Referrals', payments: 'Payment Verifications', commissions: 'Commissions',
  settlements: 'Settlements', reviews: 'Reviews', notifications: 'Notifications', campaigns: 'Campaigns',
  banners: 'Banners', cms: 'CMS', reports: 'Reports', analytics: 'Analytics', support: 'Support Tickets',
  staff: 'Admin Staff', roles: 'Roles & Permissions', audit: 'Audit Logs', settings: 'Settings',
  'fraud-alerts': 'Fraud Alerts', health: 'System Health',
};

export function roleLabel(roles: string[]): string {
  if (roles.includes('SUPER_ADMIN')) return 'Super Admin';
  if (roles.includes('ADMIN') || roles.includes('ADMINISTRATOR')) return 'Administrator';
  if (roles.includes('SUPPORT_AGENT')) return 'Support Agent';
  if (roles.includes('FINANCE_MANAGER')) return 'Finance Manager';
  if (roles.includes('CONTENT_MANAGER')) return 'Content Manager';
  if (roles.includes('MARKETING_MANAGER')) return 'Marketing Manager';
  return 'Admin';
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { toast } = useToast();
  const { user, roles, logout: signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [fraudCount, setFraudCount] = useState<number | null>(null);
  const seg = pathname.split('/')[2];
  const isSuper = roles.includes('SUPER_ADMIN');

  useEffect(() => {
    fetchFraudAlerts().then((a) => setFraudCount(a ? a.length : null)).catch(() => setFraudCount(null));
  }, []);

  const logout = async () => { await signOut(); toast('Logged out.'); window.location.href = '/'; };

  const initials = user ? `${(user.firstName?.[0] ?? '').toUpperCase()}${(user.lastName?.[0] ?? '').toUpperCase()}` || 'A' : 'A';

  const nav = (
    <div className="h-full overflow-y-auto p-3">
      {GROUPS.map((g) => {
        const items = g.items.filter((it) => !it.superOnly || isSuper);
        if (!items.length) return null;
        return (
          <div key={g.title} className="mb-4">
            <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">{g.title}</p>
            {items.map((it) => {
              const active = it.href === '/admin' ? pathname === '/admin' : pathname === it.href || pathname.startsWith(it.href + '/');
              return (
                <Link key={it.href} href={it.href} onClick={() => setOpen(false)} aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition ${active ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                  <span aria-hidden>{it.icon}</span><span className="flex-1">{it.label}</span>
                  {it.href === '/admin/fraud-alerts' && fraudCount != null && fraudCount > 0 && (
                    <span className={`rounded-full px-1.5 text-[10px] font-bold ${active ? 'bg-white/25 text-white' : 'bg-error text-white'}`}>{fraudCount}</span>
                  )}
                </Link>
              );
            })}
          </div>
        );
      })}
      <button onClick={logout} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-error hover:bg-red-50">
        <span aria-hidden>🚪</span>Logout
      </button>
    </div>
  );

  return (
    <AuthGuard roles={ADMIN_ROLES}>
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-[60] border-b border-slate-200 bg-white">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <button className="rounded-lg p-2 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open admin menu">☰</button>
          <Link href="/admin" className="text-lg font-extrabold text-ink">Bachatly <span className="rounded-md bg-ink px-1.5 py-0.5 text-xs text-white">ADMIN</span></Link>
          <div className="ml-auto flex items-center gap-2.5 text-sm">
            {fraudCount != null && fraudCount > 0 && (
              <Link href="/admin/fraud-alerts" className="hidden rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-error sm:block">● {fraudCount} fraud flag{fraudCount === 1 ? '' : 's'}</Link>
            )}
            <span className="hidden rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700 sm:block">{roleLabel(roles)}</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700" title={user?.email ?? 'Admin'} aria-label="Admin user">{initials}</span>
          </div>
        </div>
      </header>
      <div className="flex">
        <aside className="sticky top-[57px] hidden h-[calc(100vh-57px)] w-60 shrink-0 border-r border-slate-200 bg-white lg:block">{nav}</aside>
        {open && (
          <div className="fixed inset-0 z-[80] lg:hidden" role="dialog" aria-label="Admin menu">
            <div className="absolute inset-0 bg-ink/50" onClick={() => setOpen(false)} />
            <div className="absolute bottom-0 left-0 top-0 w-72 bg-white shadow-pop">{nav}</div>
          </div>
        )}
        <main id="main-content" className="min-w-0 flex-1 p-4 md:p-6">
          {seg && CRUMBS[seg] && (
            <div className="mb-4"><Breadcrumbs items={[{ label: 'Admin', href: '/admin' }, { label: CRUMBS[seg] }]} /></div>
          )}
          {children}
        </main>
      </div>
    </div>
    </AuthGuard>
  );
}
