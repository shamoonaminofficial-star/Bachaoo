
// ---------------------------------------------------------------- memberships & payments (Phase 5)
import { api, apiForm } from './api';
import { paisaToPkr, unwrapItems, unwrapPage, type Page, type QueryParams } from './catalog';
//
// Backend contract (all under /api/v1), money in paisa:
//   GET  /memberships/plans                       public, active plans
//   POST /memberships/purchase { planId, gateway } → { paymentId, gateway, clientData }
//   POST /memberships/manual-receipt/:paymentId    multipart, field "receipt"
//   GET  /memberships/me                           active membership (auth)
//   GET  /memberships/history                      (auth)
//   POST /memberships/me/cancel { reason }         (auth)
//   GET  /payments/:id                             (auth)
//   Admin:
//   GET  /memberships/plans/admin, POST /memberships/plans, PATCH|DELETE /memberships/plans/:id
//   GET  /memberships/admin?status&q&page&pageSize
//   POST /memberships/admin/assign { userId?, userEmail?, planId, days? }
//   POST /memberships/:id/extend { days, reason }, POST /memberships/:id/cancel { reason }
//   GET  /payments/admin?status&gateway&q&page&pageSize
//   POST /payments/:id/approve { reason? }, POST /payments/:id/reject { reason }

export interface ApiPlan {
  id: string; slug: string; name: string; description: string;
  regularPrice: number; salePrice: number; // Rs. (converted from paisa)
  regularPricePaisa: number; salePricePaisa: number;
  durationDays: number; benefits: string[];
  rewardMultiplierBps: number; cashbackPercent: number;
  isFeatured: boolean; isActive: boolean;
}

export function mapPlan(item: Record<string, unknown>): ApiPlan {
  const salePaisa = Number(item.salePrice ?? 0);
  const regPaisa = Number(item.regularPrice ?? salePaisa);
  return {
    id: String(item.id ?? ''),
    slug: String(item.slug ?? ''),
    name: String(item.name ?? ''),
    description: String(item.description ?? ''),
    regularPrice: paisaToPkr(regPaisa) ?? 0,
    salePrice: paisaToPkr(salePaisa) ?? 0,
    regularPricePaisa: regPaisa,
    salePricePaisa: salePaisa,
    durationDays: Number(item.durationDays ?? 30),
    benefits: (Array.isArray(item.benefits) ? item.benefits : []) as string[],
    rewardMultiplierBps: Number(item.rewardMultiplierBps ?? 10000),
    cashbackPercent: Number(item.cashbackPercent ?? 0),
    isFeatured: Boolean(item.isFeatured),
    isActive: item.isActive !== false,
  };
}

export async function fetchPlans(): Promise<ApiPlan[]> {
  const data = await api<unknown>('/memberships/plans', { auth: false });
  return unwrapItems<Record<string, unknown>>(data).map(mapPlan);
}

export async function adminListPlans(): Promise<ApiPlan[]> {
  const data = await api<unknown>('/memberships/plans/admin');
  return unwrapItems<Record<string, unknown>>(data).map(mapPlan);
}

export interface PlanForm {
  name: string; slug?: string; description: string;
  regularPriceRs: number; salePriceRs: number; durationDays: number;
  benefits: string[]; rewardMultiplierBps: number; cashbackPercent: number;
  isFeatured: boolean; isActive: boolean;
}

function planFormToBody(f: PlanForm): Record<string, unknown> {
  return {
    name: f.name,
    slug: f.slug || undefined,
    description: f.description,
    regularPrice: Math.round(f.regularPriceRs * 100),
    salePrice: Math.round(f.salePriceRs * 100),
    durationDays: f.durationDays,
    benefits: f.benefits,
    rewardMultiplierBps: f.rewardMultiplierBps,
    cashbackPercent: f.cashbackPercent,
    isFeatured: f.isFeatured,
    isActive: f.isActive,
  };
}

export async function adminCreatePlan(form: PlanForm): Promise<ApiPlan> {
  const raw = await api<Record<string, unknown>>('/memberships/plans', { method: 'POST', body: planFormToBody(form) });
  return mapPlan(raw);
}
export async function adminUpdatePlan(id: string, form: PlanForm): Promise<ApiPlan> {
  const raw = await api<Record<string, unknown>>(`/memberships/plans/${id}`, { method: 'PATCH', body: planFormToBody(form) });
  return mapPlan(raw);
}
export async function adminTogglePlan(id: string, isActive: boolean): Promise<void> {
  await api<void>(`/memberships/plans/${id}`, { method: 'PATCH', body: { isActive } });
}
export async function adminDeletePlan(id: string): Promise<void> {
  await api<void>(`/memberships/plans/${id}`, { method: 'DELETE' });
}

export interface MyMembership {
  id: string; number: string; status: string;
  startDate: string; endDate: string; daysRemaining: number;
  plan: ApiPlan; holderName: string;
}

export async function fetchMyMembership(): Promise<MyMembership | null> {
  const data = await api<Record<string, unknown> | { membership: Record<string, unknown> | null }>('/memberships/me');
  // Backend returns the membership flat (or null); tolerate a { membership } wrapper too.
  const m = (data && typeof data === 'object' && 'membership' in data
    ? (data as { membership: Record<string, unknown> | null }).membership
    : data) as Record<string, unknown> | null;
  if (!m || !m.id) return null;
  const plan = mapPlan((m.plan as Record<string, unknown>) || {});
  return {
    id: String(m.id ?? ''),
    number: String((m as Record<string, unknown>).number ?? (m as Record<string, unknown>).membershipNumber ?? ''),
    status: String(m.status ?? 'active'),
    startDate: String(m.startDate ?? ''),
    endDate: String(m.endDate ?? ''),
    daysRemaining: Number((m as Record<string, unknown>).daysRemaining ?? 0),
    plan,
    holderName: String((m as Record<string, unknown>).holderName ?? ''),
  };
}

export interface MembershipHistoryItem {
  id: string; action: string; detail: string; by: string; date: string;
}

export async function fetchMembershipHistory(): Promise<MembershipHistoryItem[]> {
  const data = await api<unknown>('/memberships/history');
  return unwrapItems<Record<string, unknown>>(data).map((h) => {
    const actor = h.actor as { firstName?: string; lastName?: string } | undefined;
    const by = actor ? `${actor.firstName ?? ''} ${actor.lastName ?? ''}`.trim() : 'System';
    return {
      id: String(h.id ?? ''),
      action: String(h.action ?? ''),
      detail: String(h.reason ?? ''),
      by: by || 'System',
      date: String(h.date ?? h.createdAt ?? ''),
    };
  });
}

export async function cancelMyMembership(reason: string): Promise<void> {
  await api<void>('/memberships/me/cancel', { method: 'POST', body: { reason } });
}

export interface BankAccount { bankName: string; accountTitle: string; iban: string; }
export interface PurchaseResult {
  paymentId: string; gateway: string;
  clientData?: {
    bankAccounts?: BankAccount[]; instructions?: string; reference?: string;
    [k: string]: unknown;
  };
}

export async function purchaseMembership(planId: string, gateway: string): Promise<PurchaseResult> {
  return api<PurchaseResult>('/memberships/purchase', { method: 'POST', body: { planId, gateway } });
}

export async function uploadPaymentReceipt(paymentId: string, file: File): Promise<{ uploaded: boolean }> {
  const form = new FormData();
  form.append('file', file);
  return apiForm<{ uploaded: boolean }>(`/memberships/manual-receipt/${paymentId}`, form);
}

export interface ApiPayment {
  id: string; status: string; amount: number; // Rs.
  amountPaisa: number; gateway: string; gatewayTransactionId?: string;
  user?: { id: string; name: string; email: string };
  item?: string; receiptUrl?: string; createdAt: string; verifiedAt?: string;
  verifiedBy?: string; rejectReason?: string;
}

export function mapPayment(p: Record<string, unknown>): ApiPayment {
  const amountPaisa = Number(p.amount ?? 0);
  const user = (p.user as Record<string, unknown>) || {};
  return {
    id: String(p.id ?? ''),
    status: String(p.status ?? 'pending').toLowerCase(),
    amount: paisaToPkr(amountPaisa) ?? 0,
    amountPaisa,
    gateway: String(p.gateway ?? 'manual'),
    gatewayTransactionId: (p.gatewayTransactionId as string) || undefined,
    user: user.id ? { id: String(user.id), name: String(user.name ?? ''), email: String(user.email ?? '') } : undefined,
    item: (p.item as string) || (p.description as string) || undefined,
    receiptUrl: (p.receiptUrl as string) || undefined,
    createdAt: String(p.createdAt ?? ''),
    verifiedAt: (p.verifiedAt as string) || undefined,
    verifiedBy: (p.verifiedBy as string) || undefined,
    rejectReason: (p.rejectReason as string) || undefined,
  };
}

export async function fetchPayment(id: string): Promise<ApiPayment> {
  const raw = await api<Record<string, unknown>>(`/payments/${id}`);
  return mapPayment(raw);
}

export interface AdminMembershipRow {
  id: string; holder: string; email: string; number: string;
  plan: string; status: string; startDate: string; endDate: string; daysRemaining: number;
}

export async function adminListMemberships(params: { status?: string; q?: string; page?: number; pageSize?: number } = {}): Promise<Page<AdminMembershipRow>> {
  const data = await api<unknown>('/memberships/admin', { params: params as QueryParams });
  const page = unwrapPage<Record<string, unknown>>(data, Number(params.pageSize) || 10);
  return {
    ...page,
    items: page.items.map((m) => ({
      id: String(m.id ?? ''),
      holder: String((m.holder as Record<string, unknown>)?.name ?? m.holderName ?? m.userName ?? ''),
      email: String((m.holder as Record<string, unknown>)?.email ?? m.email ?? ''),
      number: String(m.number ?? m.membershipNumber ?? ''),
      plan: String((m.plan as Record<string, unknown>)?.name ?? m.planName ?? ''),
      status: String(m.status ?? '').toLowerCase(),
      startDate: String(m.startDate ?? ''),
      endDate: String(m.endDate ?? ''),
      daysRemaining: Number(m.daysRemaining ?? 0),
    })),
  };
}

export async function adminAssignMembership(body: { userEmail: string; planId: string; days?: number; reason?: string }): Promise<void> {
  await api<void>('/memberships/admin/assign', { method: 'POST', body });
}
export async function adminExtendMembership(id: string, body: { days: number; reason: string }): Promise<void> {
  await api<void>(`/memberships/${id}/extend`, { method: 'POST', body });
}
export async function adminCancelMembership(id: string, body: { reason: string }): Promise<void> {
  await api<void>(`/memberships/${id}/cancel`, { method: 'POST', body });
}

export async function adminListPayments(params: { status?: string; gateway?: string; q?: string; page?: number; pageSize?: number } = {}): Promise<Page<ApiPayment>> {
  const data = await api<unknown>('/payments/admin', { params: params as QueryParams });
  const page = unwrapPage<Record<string, unknown>>(data, Number(params.pageSize) || 10);
  return { ...page, items: page.items.map(mapPayment) };
}

export async function adminVerifyPayment(id: string, approve: boolean, reason?: string): Promise<void> {
  await api<void>(`/payments/${id}/${approve ? 'approve' : 'reject'}`, { method: 'POST', body: { reason } });
}
