'use client';

import { api, apiForm, ApiError, withSeedFallback } from './api';
import { unwrap } from './dashboard';
import { paisaToPkr, unwrapItems, unwrapPage, type Page, type QueryParams } from './catalog';

// ---------------------------------------------------------------- partner dashboard (Phase 8)
//
// Backend contract (built in parallel — these helpers degrade gracefully if
// the endpoint is not yet deployed):
// - GET /businesses/mine/dashboard
// - GET/POST /businesses/mine/:id/staff, PATCH/DELETE /businesses/mine/:id/staff/:staffId
// - GET /businesses/mine/:id/analytics?from&to
// - GET /businesses/mine/:id/redemptions?dealId&branchId&from&to&q&page&pageSize

export interface PartnerBusiness {
  id: string; name: string; slug?: string; logo?: string | null; cover?: string | null;
  cityName?: string; verified?: boolean; status?: string;
  role?: string; // caller's role for this business
}

export interface PartnerDashboard {
  business: PartnerBusiness | null;
  stats: {
    activeDeals: number; pendingApproval: number; draftDeals: number; totalBranches: number;
    redemptionsToday: number; redemptionsThisMonth: number;
    totalSavingsGiven: number; viewsThisMonth: number;
    ratingAverage: number | null; reviewsCount: number; staffCount: number;
  };
  dealsByStatus: Record<string, number>;
  recentRedemptions: PartnerRedemption[];
  topDeals: Array<{ id: string; title: string; slug?: string; redemptions: number; savingsGiven: number }>;
}

export interface PartnerRedemption {
  id: string; createdAt: string;
  bill: number; discount: number; paid: number; saving: number; cashback: number; points: number;
  dealId?: string; dealTitle?: string;
  branchId?: string; branchName?: string;
  customerFirstName?: string;
  status?: string;
}

export interface StaffMember {
  id: string; email: string; firstName?: string; lastName?: string;
  role: 'BUSINESS_OWNER' | 'BUSINESS_MANAGER' | 'CASHIER' | 'SCANNER';
  isOwner?: boolean; joinedAt?: string; lastActiveAt?: string | null;
}

export interface PartnerAnalytics {
  redemptionsByDay: Array<{ day: string; value: number }>;
  savingsByDay: Array<{ day: string; value: number }>; // paisa
  viewsByDay: Array<{ day: string; value: number }>; // empty — per-day view events are not tracked yet (see API docs)
  topBranches: Array<{ id: string; name: string; redemptions: number; savingsGiven: number }>; // paisa
  hourlyHeat: Array<{ hour: number; value: number }>;
  summary?: { redemptions: number; savingsGiven: number; uniqueCustomers: number; viewsTotal: number };
}

export interface PartnerRedemptionQuery extends QueryParams {
  dealId?: string; branchId?: string; from?: string; to?: string; q?: string;
  page?: number; pageSize?: number;
}

const ACTIVE_BUSINESS_KEY = 'bachatly:partner:activeBusiness';

export function getActiveBusinessId(): string | null {
  try { return localStorage.getItem(ACTIVE_BUSINESS_KEY); } catch { return null; }
}
export function setActiveBusinessId(id: string) {
  try { localStorage.setItem(ACTIVE_BUSINESS_KEY, id); } catch { /* noop */ }
}

// ---------------------------------------------------------------- businesses (multi-business support)

export async function fetchMyBusinesses(): Promise<PartnerBusiness[]> {
  const data = await api<unknown>('/businesses/mine');
  return unwrapItems<PartnerBusiness>(data);
}

export async function fetchActiveBusiness(): Promise<PartnerBusiness> {
  const list = await fetchMyBusinesses();
  if (!list.length) throw new ApiError(404, 'No business is linked to this account.', 'NO_BUSINESS');
  const activeId = getActiveBusinessId();
  const chosen = list.find((b) => b.id === activeId) ?? list[0];
  setActiveBusinessId(chosen.id);
  return chosen;
}

export async function fetchPartnerDashboard(businessId?: string): Promise<PartnerDashboard> {
  const data = await api<unknown>('/businesses/mine/dashboard', {
    params: (businessId ? { businessId } : {}) as QueryParams,
  });
  const d = unwrap<Partial<PartnerDashboard>>(data);
  const stats: Partial<PartnerDashboard['stats']> = d.stats ?? {};
  return {
    business: d.business ?? null,
    stats: {
      activeDeals: stats.activeDeals ?? 0, pendingApproval: stats.pendingApproval ?? 0,
      draftDeals: stats.draftDeals ?? 0, totalBranches: stats.totalBranches ?? 0,
      redemptionsToday: stats.redemptionsToday ?? 0, redemptionsThisMonth: stats.redemptionsThisMonth ?? 0,
      totalSavingsGiven: stats.totalSavingsGiven ?? 0, viewsThisMonth: stats.viewsThisMonth ?? 0,
      ratingAverage: stats.ratingAverage ?? null, reviewsCount: stats.reviewsCount ?? 0,
      staffCount: stats.staffCount ?? 0,
    },
    dealsByStatus: d.dealsByStatus ?? {},
    recentRedemptions: (d.recentRedemptions ?? []) as PartnerRedemption[],
    topDeals: (d.topDeals ?? []) as PartnerDashboard['topDeals'],
  };
}

// ---------------------------------------------------------------- staff

export const STAFF_ROLES = [
  { value: 'BUSINESS_MANAGER', label: 'Manager — full day-to-day control' },
  { value: 'CASHIER', label: 'Cashier — can scan & confirm QRs' },
  { value: 'SCANNER', label: 'Scanner — can validate QRs only' },
] as const;

export type StaffRole = 'BUSINESS_MANAGER' | 'CASHIER' | 'SCANNER';

export async function fetchStaff(businessId: string): Promise<StaffMember[]> {
  const data = await api<unknown>(`/businesses/mine/${businessId}/staff`);
  return unwrapItems<StaffMember>(data);
}

/** Backend staff role enum is unprefixed (MANAGER), UI uses BUSINESS_*-prefixed labels. */
function toApiRole(role: StaffRole | string): string {
  return role.replace(/^BUSINESS_/, '');
}

export async function inviteStaff(businessId: string, email: string, role: StaffRole): Promise<StaffMember> {
  const data = await api<unknown>(`/businesses/mine/${businessId}/staff`, {
    method: 'POST', body: { email, role: toApiRole(role) },
  });
  return unwrap<StaffMember>(data);
}

export async function updateStaffRole(businessId: string, staffId: string, role: StaffRole): Promise<StaffMember> {
  const data = await api<unknown>(`/businesses/mine/${businessId}/staff/${staffId}`, {
    method: 'PATCH', body: { role: toApiRole(role) },
  });
  return unwrap<StaffMember>(data);
}

export async function removeStaff(businessId: string, staffId: string): Promise<void> {
  await api(`/businesses/mine/${businessId}/staff/${staffId}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------- analytics

export async function fetchPartnerAnalytics(
  businessId: string, from?: string, to?: string,
): Promise<PartnerAnalytics | null> {
  try {
    const data = await api<unknown>(`/businesses/mine/${businessId}/analytics`, {
      params: { from, to } as QueryParams,
    });
    const d = unwrap<unknown>(data) as Record<string, any>;
    // Normalize backend rows → chart shapes.
    const rows: Array<{ date?: string; day?: string; redemptions?: number; savingsGiven?: number }> =
      Array.isArray(d.redemptionsByDay) ? d.redemptionsByDay : [];
    const topBranches: Array<Record<string, any>> = Array.isArray(d.topBranches) ? d.topBranches : [];
    const heat = d.hourlyHeat;
    const hourlyHeat: Array<{ hour: number; value: number }> = Array.isArray(heat)
      ? heat.map((v: any, i: number) =>
          typeof v === 'number' ? { hour: i, value: v } : { hour: v?.hour ?? i, value: v?.value ?? 0 })
      : [];
    return {
      redemptionsByDay: rows.map((r) => ({ day: r.date ?? r.day ?? '', value: r.redemptions ?? 0 })),
      savingsByDay: rows.map((r) => ({ day: r.date ?? r.day ?? '', value: r.savingsGiven ?? 0 })),
      viewsByDay: [], // backend exposes only lifetime deal views; no per-day view events yet
      topBranches: topBranches.map((b) => ({
        id: String(b.branchId ?? b.id ?? ''),
        name: String(b.branchName ?? b.name ?? 'Branch'),
        redemptions: b.redemptions ?? 0,
        savingsGiven: b.savingsGiven ?? 0,
      })),
      hourlyHeat,
      summary: d.summary ?? undefined,
    };
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 501)) return null;
    throw e;
  }
}

// ---------------------------------------------------------------- partner redemption ledger

export async function fetchPartnerRedemptions(
  businessId: string, params: PartnerRedemptionQuery = {},
): Promise<Page<PartnerRedemption> | null> {
  try {
    const data = await api<unknown>(`/businesses/mine/${businessId}/redemptions`, { params });
    return unwrapPage<PartnerRedemption>(data, params.pageSize ?? 20);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 501)) return null;
    throw e;
  }
}

// ---------------------------------------------------------------- display helpers

export const pkr = (paisa?: number | null): number => paisaToPkr(paisa) ?? 0;

export function roleLabel(role?: string): string {
  switch (role) {
    case 'BUSINESS_OWNER': return 'Owner';
    case 'BUSINESS_MANAGER': return 'Manager';
    case 'CASHIER': return 'Cashier';
    case 'SCANNER': return 'Scanner';
    default: return role ?? 'Staff';
  }
}

export function verifiedLabel(b?: PartnerBusiness | null): string {
  if (!b) return '';
  if (b.verified) return 'Verified';
  if (b.status === 'pending' || b.status === 'PENDING_APPROVAL') return 'Pending verification';
  return b.status ?? '';
}

export { ApiError, withSeedFallback };
