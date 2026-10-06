'use client';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Badge, Button, Select, Skeleton, useToast, EmptyState } from '@bachatly/ui';
import { useAuth, PARTNER_ROLES } from '@/lib/auth';
import AuthGuard from '@/components/AuthGuard';
import NotificationBell from '@/components/NotificationBell';
import {
  fetchMyBusinesses, getActiveBusinessId, setActiveBusinessId,
  roleLabel, type PartnerBusiness,
} from '@/lib/partner';

const ITEMS = [
  { href: '/partner/dashboard', label: 'Overview', icon: '📊', exact: true },
  { href: '/partner/dashboard/scanner', label: 'QR Scanner', icon: '📷', highlight: true },
  { href: '/partner/dashboard/deals', label: 'Deals', icon: '🎟️' },
  { href: '/partner/dashboard/redemptions', label: 'Redemptions', icon: '🧾' },
  { href: '/partner/dashboard/branches', label: 'Branches', icon: '🏪' },
  { href: '/partner/dashboard/analytics', label: 'Analytics', icon: '📈' },
  { href: '/partner/dashboard/staff', label: 'Staff', icon: '🧑‍💼' },
  { href: '/partner/dashboard/customers', label: 'Customers', icon: '👥' },
  { href: '/partner/dashboard/reviews', label: 'Reviews', icon: '⭐' },
  { href: '/partner/dashboard/settlements', label: 'Settlements', icon: '💰' },
  { href: '/partner/dashboard/profile', label: 'Business Profile', icon: '🏢' },
  { href: '/partner/dashboard/notifications', label: 'Notifications', icon: '🔔' },
  { href: '/partner/dashboard/settings', label: 'Settings', icon: '⚙️' },
  { href: '/partner/dashboard/support', label: 'Support', icon: '💬' },
];

interface PartnerCtx {
  business: PartnerBusiness | null;
  businesses: PartnerBusiness[];
  switchBusiness: (id: string) => void;
  refresh: () => Promise<void>;
  loading: boolean;
}
const Ctx = createContext<PartnerCtx>({ business: null, businesses: [], switchBusiness: () => {}, refresh: async () => {}, loading: true });
export const usePartnerBusiness = () => useContext(Ctx);

export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const { logout: signOut, user, roles } = useAuth();
  const [open, setOpen] = useState(false);
  const [businesses, setBusinesses] = useState<PartnerBusiness[] | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const list = await fetchMyBusinesses();
      setBusinesses(list);
    } catch (e) {
      console.warn('[partner] failed to load businesses', e);
      setBusinesses([]);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const business = useMemo(() => {
    if (!businesses || !businesses.length) return null;
    const activeId = getActiveBusinessId();
    return businesses.find((b) => b.id === activeId) ?? businesses[0];
  }, [businesses]);

  const switchBusiness = useCallback((id: string) => {
    setActiveBusinessId(id);
    window.location.reload();
  }, []);

  const logout = async () => { await signOut(); toast('Logged out.'); window.location.href = '/partner'; };

  const ctx = useMemo<PartnerCtx>(() => ({
    business, businesses: businesses ?? [], switchBusiness, refresh, loading,
  }), [business, businesses, switchBusiness, refresh, loading]);

  const myRole = roles.includes('BUSINESS_OWNER') ? 'BUSINESS_OWNER'
    : roles.includes('BUSINESS_MANAGER') ? 'BUSINESS_MANAGER'
    : roles.includes('CASHIER') ? 'CASHIER' : 'SCANNER';

  const nav = (
    <nav className="flex flex-col gap-1 p-3" aria-label="Partner">
      {ITEMS.map((it) => {
        const active = it.exact ? pathname === it.href : pathname.startsWith(it.href);
        return (
          <Link key={it.href} href={it.href} onClick={() => setOpen(false)} aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${it.highlight ? 'bg-accent-soft font-bold text-amber-800' : active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`}>
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
    <AuthGuard roles={PARTNER_ROLES}>
      <Ctx.Provider value={ctx}>
        <div className="min-h-screen bg-slate-50">
          <header className="sticky top-0 z-[60] border-b border-slate-100 bg-white/95 backdrop-blur">
            <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
              <button className="rounded-lg p-2 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open partner menu">☰</button>
              <Link href="/partner/dashboard" className="text-lg font-extrabold text-ink">Bachatly <span className="rounded-md bg-brand-600 px-1.5 py-0.5 text-xs text-white">PARTNER</span></Link>
              {business && (
                <div className="hidden items-center gap-2 md:flex">
                  <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-sm font-semibold text-ink">{business.name}</span>
                  <Badge tone="brand">{roleLabel(business.role ?? myRole)}</Badge>
                  {business.verified && <Badge tone="success">✓ Verified</Badge>}
                </div>
              )}
              <div className="ml-auto flex items-center gap-2">
                {businesses && businesses.length > 1 && (
                  <Select
                    aria-label="Switch business"
                    value={business?.id ?? ''}
                    onChange={(e) => switchBusiness(e.target.value)}
                    options={businesses.map((b) => ({ value: b.id, label: b.name }))}
                    className="!w-auto"
                  />
                )}
                <Link href="/partner/dashboard/scanner"><Button size="sm" variant="accent">📷 Scan QR</Button></Link>
                <NotificationBell />
              </div>
            </div>
          </header>
          <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
            <aside className="hidden w-60 shrink-0 lg:block">
              <div className="sticky top-20 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
                <div className="border-b border-slate-100 p-4">
                  {loading ? <Skeleton className="h-10" /> : business ? (
                    <>
                      <p className="font-bold text-ink">{business.name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {[business.cityName, roleLabel(business.role ?? myRole), user?.firstName].filter(Boolean).join(' · ')}
                      </p>
                    </>
                  ) : null}
                </div>
                {nav}
              </div>
            </aside>
            {open && (
              <div className="fixed inset-0 z-[80] lg:hidden" role="dialog" aria-label="Partner menu">
                <div className="absolute inset-0 bg-ink/50" onClick={() => setOpen(false)} />
                <div className="absolute bottom-0 left-0 top-0 w-72 overflow-y-auto bg-white shadow-pop">
                  {business && (
                    <div className="border-b border-slate-100 p-4">
                      <p className="font-bold text-ink">{business.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{roleLabel(business.role ?? myRole)}{business.verified ? ' · ✓ Verified' : ''}</p>
                    </div>
                  )}
                  {nav}
                </div>
              </div>
            )}
            <main id="main-content" className="min-w-0 flex-1">
              {!loading && business === null && (
                <EmptyState
                  icon="🏢"
                  title="No business linked"
                  description="This account isn't linked to any business yet. Apply to list your business on Bachatly."
                  actionLabel="Apply as a business"
                  onAction={() => router.push('/partner/apply')}
                />
              )}
              {(!loading || business) && children}
            </main>
          </div>
        </div>
      </Ctx.Provider>
    </AuthGuard>
  );
}
