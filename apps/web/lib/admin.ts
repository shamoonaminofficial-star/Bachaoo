// ---------------------------------------------------------------------------
// Admin data layer (Phase 9).
//
// Built to the Phase 9 backend contract; every new endpoint is defensive:
// 404/501 (un-deployed backend) surfaces as `null` so pages render honest
// "not live yet" states instead of fake data. Never invent figures here.
// ---------------------------------------------------------------------------

import { api, ApiError } from './api';
import type { QueryParams } from './catalog';

// ---------------------------------------------------------------------------
// Types (mirroring the backend contract; all money in integer paisa)
// ---------------------------------------------------------------------------

export interface AdminOverview {
  users: { total: number; newThisMonth: number; customers: number; partners: number };
  businesses: { total: number; pending: number; verified: number; suspended: number };
  deals: { live: number; pendingApproval: number; drafts: number; expired: number };
  memberships: { active: number; expiringThisWeek: number; churn30d: number };
  revenue: { membershipRevenueThisMonth: number; membershipRevenueTotal: number; pendingCommissions: number; settledThisMonth: number };
  activity: { redemptionsToday: number; redemptionsThisMonth: number; savingsGivenTotal: number; viewsToday: number };
  queues: { pendingBusinesses: number; pendingDeals: number; pendingPayments: number; openSupportTickets: number; pendingReviews: number };
}

export interface ActivityItem {
  type: string; label: string; at: string; actor?: string; meta?: Record<string, unknown>;
}

export interface FraudAlert {
  id: string; type: 'SUSPICIOUS_QR_RATE'; userId: string; mintAttemptsLastHour: number; at: string;
}

export interface HealthStatus {
  db: { latencyMs: number; ok: boolean };
  redis: { ok: boolean };
  storage: { backend: string };
  env: string;
  queues: Record<string, number>;
}

export interface BatchResult {
  results: Array<{ id: string; ok: boolean; error?: string }>;
}

export interface AdminUserRow {
  id: string; firstName?: string; lastName?: string; name?: string; email: string;
  phone?: string; city?: string | { name?: string }; membership?: string;
  status: string; suspended?: boolean; createdAt?: string; joined?: string;
}

export interface AuditRow {
  id: string; actorId?: string; actor?: string; actorRole?: string; role?: string;
  action: string; entity?: string; entityId?: string; detail?: string;
  ip?: string; userAgent?: string; createdAt?: string; at?: string;
}

export interface RoleRow { id: string; name: string; description?: string; permissions?: string[] }
export interface PermissionRow { key: string; description?: string }

function missing(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 404 || e.status === 501);
}

// ---------------------------------------------------------------------------
// Overview / activity / fraud / health
// ---------------------------------------------------------------------------

export async function fetchAdminOverview(): Promise<AdminOverview | null> {
  try {
    const raw = await api<unknown>('/admin/overview');
    // Normalize backend field names → UI contract.
    const o = (raw ?? {}) as Record<string, any>;
    const b = (o.businesses ?? {}) as Record<string, any>;
    const m = (o.memberships ?? {}) as Record<string, any>;
    return {
      users: o.users ?? {},
      businesses: { ...b, pending: b.pending ?? b.pendingApplications ?? 0 },
      deals: o.deals ?? {},
      memberships: { ...m, churn30d: m.churn30d ?? m.churnedLast30d ?? 0 },
      revenue: o.revenue ?? {},
      activity: o.activity ?? {},
      queues: o.queues ?? {},
    } as AdminOverview;
  } catch (e) {
    if (missing(e)) return null;
    throw e;
  }
}

export async function fetchAdminActivity(): Promise<ActivityItem[] | null> {
  try {
    const data = await api<unknown>('/admin/activity');
    if (Array.isArray(data)) return data as ActivityItem[];
    const obj = data as { items?: ActivityItem[] } | null;
    return obj?.items ?? [];
  } catch (e) {
    if (missing(e)) return null;
    throw e;
  }
}

export async function fetchFraudAlerts(): Promise<FraudAlert[] | null> {
  try {
    const data = await api<unknown>('/admin/fraud-alerts');
    const rows = Array.isArray(data) ? (data as FraudAlert[]) : ((data as { items?: FraudAlert[] } | null)?.items ?? []);
    return rows.map((r, i) => ({ ...r, id: `${r.type}:${r.userId}:${r.at}:${i}` }));
  } catch (e) {
    if (missing(e)) return null;
    throw e;
  }
}

export async function fetchHealth(): Promise<HealthStatus | null> {
  try {
    return await api<HealthStatus>('/admin/health');
  } catch (e) {
    if (missing(e)) return null;
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Batch moderation
// ---------------------------------------------------------------------------

export async function adminBatchBusinesses(
  ids: string[], action: 'suspend' | 'reactivate' | 'verify', reason?: string,
): Promise<BatchResult> {
  return api<BatchResult>('/admin/businesses/batch', { method: 'POST', body: { ids, action, reason } });
}

export async function adminBatchDeals(
  ids: string[], action: 'approve' | 'reject' | 'pause' | 'publish', reason?: string,
): Promise<BatchResult> {
  return api<BatchResult>('/admin/deals/batch', { method: 'POST', body: { ids, action, reason } });
}

// ---------------------------------------------------------------------------
// Users (admin)
// ---------------------------------------------------------------------------

export async function adminListUsers(params: { q?: string; status?: string; role?: string; page?: number; pageSize?: number } = {}): Promise<{ items: AdminUserRow[]; total: number; page: number; pageSize: number }> {
  const data = await api<unknown>('/users', { params: params as QueryParams });
  if (Array.isArray(data)) return { items: data as AdminUserRow[], total: (data as unknown[]).length, page: 1, pageSize: (data as unknown[]).length };
  const obj = data as { items?: AdminUserRow[]; data?: AdminUserRow[]; total?: number; page?: number; pageSize?: number } | null;
  const items = obj?.items ?? obj?.data ?? [];
  return { items, total: obj?.total ?? items.length, page: obj?.page ?? 1, pageSize: obj?.pageSize ?? items.length };
}

export async function adminSuspendUser(id: string, reason: string): Promise<void> {
  await api(`/users/${id}/suspend`, { method: 'POST', body: { reason } });
}

export async function adminReactivateUser(id: string): Promise<void> {
  await api(`/users/${id}/reactivate`, { method: 'POST' });
}

// ---------------------------------------------------------------------------
// Audit logs
// ---------------------------------------------------------------------------

export async function fetchAuditLogs(params: { q?: string; action?: string; page?: number; pageSize?: number } = {}): Promise<{ items: AuditRow[]; total: number } | null> {
  try {
    const data = await api<unknown>('/admin/audit-logs', { params: params as QueryParams });
    if (Array.isArray(data)) return { items: data as AuditRow[], total: (data as unknown[]).length };
    const obj = data as { items?: AuditRow[]; data?: AuditRow[]; total?: number } | null;
    const items = obj?.items ?? obj?.data ?? [];
    return { items, total: obj?.total ?? items.length };
  } catch (e) {
    if (missing(e)) return null;
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Roles & permissions (real Phase 2 CRUD)
// ---------------------------------------------------------------------------

export async function adminListRoles(): Promise<RoleRow[] | null> {
  try {
    const data = await api<unknown>('/roles');
    if (Array.isArray(data)) return data as RoleRow[];
    const obj = data as { items?: RoleRow[]; data?: RoleRow[] } | null;
    return obj?.items ?? obj?.data ?? [];
  } catch (e) {
    if (missing(e)) return null;
    throw e;
  }
}

export async function adminListPermissions(): Promise<PermissionRow[] | null> {
  try {
    const data = await api<unknown>('/roles/permissions');
    if (Array.isArray(data)) return data as PermissionRow[];
    const obj = data as { items?: PermissionRow[]; data?: PermissionRow[] } | null;
    return obj?.items ?? obj?.data ?? [];
  } catch (e) {
    if (missing(e)) return null;
    throw e;
  }
}

export async function adminSaveRolePermissions(roleId: string, permissions: string[]): Promise<void> {
  await api(`/roles/${roleId}/permissions`, { method: 'PUT', body: { permissions } });
}

// ---------------------------------------------------------------------------
// Reviews moderation (backend still a stub → honest "not live yet")
// ---------------------------------------------------------------------------

export async function adminModerateReview(id: string, action: 'APPROVE' | 'HIDE'): Promise<void> {
  await api(`/reviews/${id}/moderate`, { method: 'PATCH', body: { action } });
}

// ---------------------------------------------------------------------------
// Support tickets
// ---------------------------------------------------------------------------

export interface SupportTicketRow {
  id: string; subject: string; message?: string; category?: string; status: string;
  userId?: string; userEmail?: string; createdAt?: string; at?: string;
}

export async function adminListTickets(params: { status?: string; page?: number; pageSize?: number } = {}): Promise<{ items: SupportTicketRow[]; total: number } | null> {
  try {
    const data = await api<unknown>('/support/tickets', { params: params as QueryParams });
    if (Array.isArray(data)) return { items: data as SupportTicketRow[], total: (data as unknown[]).length };
    const obj = data as { items?: SupportTicketRow[]; data?: SupportTicketRow[]; total?: number } | null;
    const items = obj?.items ?? obj?.data ?? [];
    return { items, total: obj?.total ?? items.length };
  } catch (e) {
    if (missing(e)) return null;
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Reports (export endpoints — all backend stubs at the moment)
// ---------------------------------------------------------------------------

export async function adminExportReport(type: string, from: string, to: string, format: 'csv' | 'xlsx' = 'csv'): Promise<{ downloadUrl: string } | null> {
  try {
    return await api<{ downloadUrl: string }>(`/reports/${type}/export`, { params: { from, to, format } as QueryParams });
  } catch (e) {
    if (missing(e)) return null;
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Settings (no backend module yet → honest "not live yet")
// ---------------------------------------------------------------------------

export async function adminFetchSettings(): Promise<Record<string, unknown> | null> {
  try {
    return await api<Record<string, unknown>>('/admin/settings');
  } catch (e) {
    if (missing(e)) return null;
    throw e;
  }
}

export async function adminSaveSettings(settings: Record<string, unknown>): Promise<void> {
  await api('/admin/settings', { method: 'PUT', body: { settings } });
}
