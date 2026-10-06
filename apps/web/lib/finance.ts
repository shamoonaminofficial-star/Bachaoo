// ---------------------------------------------------------------------------
// Finance & analytics data layer (Phase 12).
//
// Built to the Phase 12 backend contract; every endpoint is defensive:
// 404/501 (un-deployed backend) surfaces as `null` so pages render honest
// "not live yet" states instead of fake figures. All money in integer paisa;
// the UI surfaces PKR via `paisaToPkr` (apps/web/lib/catalog) + `formatPKR`.
// Never invent figures here.
// ---------------------------------------------------------------------------

import { api, ApiError, getToken } from './api';
import type { QueryParams } from './catalog';

/** Normalize a paginated backend response ({ items, total } or a bare array). */
function pageOf<T>(raw: unknown): { items: T[]; total: number } {
  if (Array.isArray(raw)) return { items: raw as T[], total: raw.length };
  const o = (raw ?? {}) as Record<string, any>;
  const items = Array.isArray(o.items) ? o.items : Array.isArray(o.data) ? o.data : [];
  const total = Number(o.total ?? o.count ?? items.length);
  return { items: items as T[], total };
}

function missing(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 404 || e.status === 501);
}

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');

// ---------------------------------------------------------------------------
// Platform analytics (admin)
// ---------------------------------------------------------------------------

export interface DayPoint { day: string; value: number }

export interface AdminAnalytics {
  redemptionsByDay: DayPoint[];
  savingsByDay: DayPoint[]; // paisa
  usersByDay: DayPoint[];
  revenueByDay: DayPoint[]; // paisa
  topBusinesses: Array<{ id: string; name: string; redemptions: number; savingsGiven: number }>;
  topDeals: Array<{ id: string; title: string; redemptions: number; savingsGiven: number }>;
  categoryBreakdown: Array<{ category: string; value: number }>;
}

function normalizePoints(rows: unknown): DayPoint[] {
  if (!Array.isArray(rows)) return [];
  return (rows as Array<Record<string, any>>).map((r) => ({
    day: String(r.day ?? r.date ?? ''),
    value: Number(r.value ?? r.count ?? r.total ?? 0),
  }));
}

/** Platform-wide trend overview. */
export async function fetchAdminAnalytics(params: { from: string; to: string }): Promise<AdminAnalytics | null> {
  try {
    const raw = await api<Record<string, any>>('/analytics/admin/overview', { params: params as QueryParams });
    // Backend row shapes: redemptionsByDay [{ day, redemptions, savings, paid }],
    // newUsersByDay [{ day, users }], membershipRevenueByDay [{ day, revenue }].
    const rbd: Array<Record<string, any>> = Array.isArray(raw.redemptionsByDay) ? raw.redemptionsByDay : [];
    const unb: Array<Record<string, any>> = Array.isArray(raw.newUsersByDay) ? raw.newUsersByDay : [];
    const rvb: Array<Record<string, any>> = Array.isArray(raw.membershipRevenueByDay) ? raw.membershipRevenueByDay : [];
    return {
      redemptionsByDay: rbd.map((r) => ({ day: String(r.day ?? r.date ?? ''), value: Number(r.redemptions ?? r.value ?? 0) })),
      savingsByDay: rbd.map((r) => ({ day: String(r.day ?? r.date ?? ''), value: Number(r.savings ?? r.value ?? 0) })),
      usersByDay: unb.map((r) => ({ day: String(r.day ?? r.date ?? ''), value: Number(r.users ?? r.value ?? 0) })),
      revenueByDay: rvb.map((r) => ({ day: String(r.day ?? r.date ?? ''), value: Number(r.revenue ?? r.value ?? 0) })),
      topBusinesses: (Array.isArray(raw.topBusinesses) ? raw.topBusinesses : []).map((b: any) => ({
        id: String(b.businessId ?? b.id ?? ''), name: String(b.name ?? 'Business'),
        redemptions: Number(b.redemptions ?? 0), savingsGiven: Number(b.savings ?? b.savingsGiven ?? 0),
      })),
      topDeals: (Array.isArray(raw.topDeals) ? raw.topDeals : []).map((d: any) => ({
        id: String(d.dealId ?? d.id ?? ''), title: String(d.title ?? 'Deal'),
        redemptions: Number(d.redemptions ?? 0), savingsGiven: Number(d.savings ?? d.savingsGiven ?? 0),
      })),
      categoryBreakdown: (Array.isArray(raw.categoryBreakdown) ? raw.categoryBreakdown : []).map((c: any) => ({
        category: String(c.name ?? c.category ?? 'Other'), value: Number(c.savings ?? c.value ?? c.total ?? 0),
      })),
    };
  } catch (e) {
    if (missing(e)) return null;
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Reports (tabular preview + file export)
// ---------------------------------------------------------------------------

export type ReportType =
  | 'membership-sales' | 'redemptions' | 'savings' | 'commissions'
  | 'settlements' | 'businesses' | 'users';

export interface ReportResult {
  rows: Array<Record<string, any>>;
  columns: string[];
  summary: Record<string, number | string>;
}

export async function fetchReport(
  type: ReportType,
  params: { from: string; to: string; businessId?: string; page?: number; pageSize?: number },
): Promise<ReportResult | null> {
  try {
    const raw = await api<Record<string, any>>(`/reports/${type}`, { params: params as QueryParams });
    const rows: Array<Record<string, any>> = Array.isArray(raw.items)
      ? raw.items
      : Array.isArray(raw.rows)
        ? raw.rows
        : [];
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    return { rows, columns, summary: (raw.summary ?? {}) as Record<string, number | string> };
  } catch (e) {
    if (missing(e)) return null;
    throw e;
  }
}

/** Downloads a report export as a file. Throws on 404/501 so the page can be honest about it. */
export async function exportReport(
  type: ReportType,
  format: 'csv' | 'xlsx',
  params: { from: string; to: string; businessId?: string },
): Promise<void> {
  const url = new URL(`${API_BASE}/api/v1/reports/${type}/export`);
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined) url.searchParams.set(k, String(v)); });
  url.searchParams.set('format', format);
  const token = getToken();
  const res = await fetch(url.toString(), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 404 || res.status === 501) {
    throw new ApiError(res.status, `The ${format.toUpperCase()} export is not live yet on this server.`, res.status === 501 ? 'EXPORT_UNAVAILABLE' : 'NOT_FOUND');
  }
  if (!res.ok) {
    let message = `Export failed (${res.status}).`;
    try { const p = await res.json(); if (p.message) message = p.message; } catch { /* keep default */ }
    throw new ApiError(res.status, message);
  }
  const blob = await res.blob();
  const filename = res.headers.get('content-disposition')?.match(/filename="?([^";]+)"?/)?.[1]
    ?? `${type}-${params.from}-to-${params.to}.${format}`;
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 5000);
}

// ---------------------------------------------------------------------------
// Commissions
// ---------------------------------------------------------------------------

export interface CommissionRow {
  id: string;
  businessId?: string;
  businessName: string;
  redemptionId?: string;
  paidPaisa: number;
  commissionPaisa: number;
  status: string; // PENDING | SETTLED | ADJUSTED | ...
  createdAt?: string;
}

export interface CommissionQuery extends QueryParams {
  businessId?: string; from?: string; to?: string; status?: string; page?: number; pageSize?: number;
}

export async function fetchCommissions(params: CommissionQuery = {}): Promise<{ items: CommissionRow[]; total: number } | null> {
  try {
    const raw = await api<unknown>('/commissions', { params: params as QueryParams });
    const pg = pageOf<any>(raw);
    const items: CommissionRow[] = pg.items.map((r: any) => ({
      id: String(r.id),
      businessId: r.businessId ?? r.business?.id,
      businessName: String(r.businessName ?? r.business?.name ?? 'Business'),
      redemptionId: r.redemptionId ?? undefined,
      paidPaisa: Number(r.paidPaisa ?? r.paidAmount ?? 0),
      commissionPaisa: Number(r.commissionPaisa ?? 0),
      status: String(r.status ?? 'ACCRUED'),
      createdAt: r.createdAt ?? undefined,
    }));
    return { items, total: Number(pg.total ?? items.length) };
  } catch (e) {
    if (missing(e)) return null;
    throw e;
  }
}

/** Manual commission adjustment — server enforces reason + audit. */
export async function adjustCommission(id: string, body: { amountPaisa?: number; reason: string }): Promise<void> {
  await api(`/commissions/${id}/adjust`, { method: 'POST', body });
}

// ---------------------------------------------------------------------------
// Settlements
// ---------------------------------------------------------------------------

export interface SettlementRow {
  id: string;
  businessId?: string;
  businessName?: string;
  periodFrom?: string;
  periodTo?: string;
  period?: string;
  grossPaisa?: number; gross?: number;
  commissionPaisa?: number; commission?: number;
  netPaisa?: number; net?: number;
  status: string; // DRAFT | PENDING | PAID | CANCELLED | ...
  payoutReference?: string | null;
  payoutMethod?: string | null;
  paidAt?: string | null;
  createdAt?: string;
}

export interface SettlementQuery extends QueryParams {
  businessId?: string; from?: string; to?: string; status?: string; page?: number; pageSize?: number;
}

export async function fetchSettlements(params: SettlementQuery = {}): Promise<{ items: SettlementRow[]; total: number } | null> {
  try {
    const raw = await api<unknown>('/settlements', { params: params as QueryParams });
    const pg = pageOf<any>(raw);
    const items: SettlementRow[] = pg.items.map((r: any) => ({
      id: String(r.id),
      businessId: r.businessId ?? r.business?.id,
      businessName: r.businessName ?? r.business?.name ?? 'Business',
      periodFrom: r.periodFrom ?? r.periodStart ?? undefined,
      periodTo: r.periodTo ?? r.periodEnd ?? undefined,
      grossPaisa: Number(r.grossPaisa ?? r.grossAmount ?? 0),
      commissionPaisa: Number(r.commissionPaisa ?? r.commissionAmount ?? 0),
      netPaisa: Number(r.netPaisa ?? r.netAmount ?? 0),
      status: String(r.status ?? 'PENDING'),
      payoutReference: r.payoutReference ?? null,
      payoutMethod: r.payoutMethod ?? r.method ?? null,
    }));
    return { items, total: Number(pg.total ?? items.length) };
  } catch (e) {
    if (missing(e)) return null;
    throw e;
  }
}

/** Partner-scoped settlements (tries the dedicated route, falls back to the filtered list). */
export async function fetchPartnerSettlements(businessId: string): Promise<SettlementRow[] | null> {
  try {
    const raw = await api<unknown>(`/settlements/business/${businessId}`);
    return (Array.isArray(raw) ? raw : (raw as any)?.items ?? []) as SettlementRow[];
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 501)) {
      // Fall back to the generic list with a business filter (older backend shape).
      const list = await fetchSettlements({ businessId, pageSize: 50 });
      return list ? list.items : null;
    }
    throw e;
  }
}

export async function runSettlement(body: { businessId?: string; from: string; to: string }): Promise<SettlementRow> {
  return api<SettlementRow>('/settlements/run', { method: 'POST', body });
}

export async function markSettlementPaid(id: string, body: { payoutReference: string; method: string }): Promise<SettlementRow> {
  return api<SettlementRow>(`/settlements/${id}/mark-paid`, { method: 'POST', body });
}

export async function cancelSettlement(id: string, body: { reason: string }): Promise<void> {
  await api(`/settlements/${id}/cancel`, { method: 'POST', body });
}
