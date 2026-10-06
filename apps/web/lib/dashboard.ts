// ---------------------------------------------------------------- Phase 7: customer dashboard data layer
//
// Backend contract (all under /api/v1, built in parallel by the backend worker):
//   GET  /users/me/dashboard            → dashboard summary
//   GET/PATCH /users/me                 → profile incl. profileCompleteness
//   POST /users/me/avatar               → multipart avatar upload (may 404; degrade gracefully)
//   POST /auth/password/change          → { currentPassword, newPassword }
//   GET  /auth/sessions                 → active sessions
//   POST /auth/sessions/logout-all
//   GET/PATCH /users/me/notification-preferences
//
// All fetchers are defensive: they tolerate { data }-wrapped and bare payloads
// and return null on 404/501 so pages can degrade to honest states.

import { api, apiForm, ApiError } from './api';
import { mapDeal, type ApiDeal } from './catalog';

export function unwrap<T>(data: unknown): T {
  if (data && typeof data === 'object' && 'data' in (data as Record<string, unknown>)) {
    return (data as { data: T }).data;
  }
  return data as T;
}

/** Call fn; return fallback on 404/501 (endpoint not deployed yet). */
async function tolerant<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 501)) return fallback;
    throw e;
  }
}

// ---------------------------------------------------------------- dashboard summary

export interface DashboardMembership {
  planName: string;
  status: string;
  expiresAt?: string | null;
  daysLeft?: number | null;
}

export interface DashboardStats {
  totalSavings: number; // paisa
  redemptionsCount: number;
  favoritesCount: number;
  activeVouchers: number;
  walletBalance: number; // paisa
  rewardPoints: number;
  cashbackBalance: number; // paisa
  referralsCount: number;
}

export interface DashboardActivity {
  type: string;
  label: string;
  at: string;
  amount?: number | null; // paisa
}

export interface DashboardData {
  membership: DashboardMembership | null;
  stats: DashboardStats;
  recentActivity: DashboardActivity[];
  recommendedDeals: ApiDeal[];
}

const EMPTY_STATS: DashboardStats = {
  totalSavings: 0, redemptionsCount: 0, favoritesCount: 0, activeVouchers: 0,
  walletBalance: 0, rewardPoints: 0, cashbackBalance: 0, referralsCount: 0,
};

export async function fetchDashboard(): Promise<DashboardData> {
  const raw = await api<unknown>('/users/me/dashboard');
  const d = unwrap<Partial<DashboardData>>(raw);
  return {
    membership: (d.membership ?? null) as DashboardMembership | null,
    stats: { ...EMPTY_STATS, ...((d.stats ?? {}) as Partial<DashboardStats>) },
    recentActivity: Array.isArray(d.recentActivity) ? d.recentActivity : [],
    recommendedDeals: Array.isArray(d.recommendedDeals)
      ? (d.recommendedDeals as unknown[]).map((x) => mapDeal(x as Record<string, unknown>)).filter((x) => x.id)
      : [],
  };
}

// ---------------------------------------------------------------- profile

export interface ProfileData {
  id?: string;
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
  dateOfBirth?: string | null;
  cityId?: string | null;
  cityName?: string | null;
  areaId?: string | null;
  areaName?: string | null;
  language?: string | null;
  marketingOptIn?: boolean;
  avatarUrl?: string | null;
  referralCode?: string | null;
  profileCompleteness?: number;
  [key: string]: unknown;
}

export async function fetchProfile(): Promise<ProfileData> {
  const raw = await api<unknown>('/users/me');
  return unwrap<ProfileData>(raw);
}

export async function updateProfile(patch: Record<string, unknown>): Promise<ProfileData> {
  const raw = await api<unknown>('/users/me', { method: 'PATCH', body: patch });
  return unwrap<ProfileData>(raw);
}

/** Returns null when the backend has no avatar endpoint yet. */
export async function uploadAvatar(file: File): Promise<string | null> {
  const form = new FormData();
  form.append('avatar', file);
  try {
    const raw = await apiForm<unknown>('/users/me/avatar', form);
    const d = unwrap<{ avatarUrl?: string }>(raw);
    return d.avatarUrl ?? null;
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 501)) return null;
    throw e;
  }
}

// ---------------------------------------------------------------- security

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await api('/auth/password/change', { method: 'POST', body: { currentPassword, newPassword } });
}

export interface SessionInfo {
  id: string;
  device?: string | null;
  ip?: string | null;
  createdAt?: string | null;
  current?: boolean;
}

export async function fetchSessions(): Promise<SessionInfo[] | null> {
  return tolerant(async () => {
    const raw = await api<unknown>('/auth/sessions');
    const d = unwrap<unknown>(raw);
    if (Array.isArray(d)) return d as SessionInfo[];
    if (d && typeof d === 'object' && 'items' in d) return (d as { items: SessionInfo[] }).items ?? [];
    return [];
  }, null);
}

export async function logoutAllSessions(): Promise<void> {
  await api('/auth/sessions/logout-all', { method: 'POST' });
}

// ---------------------------------------------------------------- notification preferences

export interface NotificationPrefs {
  [key: string]: boolean;
}

export const NOTIF_PREF_DEFS: Array<{ key: string; label: string; hint: string }> = [
  { key: 'dealAlerts', label: 'Deal alerts', hint: 'New deals near you and price drops on saved deals.' },
  { key: 'redemptionUpdates', label: 'Redemption updates', hint: 'Confirmations and receipts when you redeem.' },
  { key: 'membershipUpdates', label: 'Membership updates', hint: 'Renewal reminders, expiry warnings, plan changes.' },
  { key: 'cashbackRewards', label: 'Cashback & rewards', hint: 'Cashback credits and points earned.' },
  { key: 'referralUpdates', label: 'Referral updates', hint: 'When someone joins with your code.' },
  { key: 'promotions', label: 'Promotions & offers', hint: 'Special campaigns from Bachatly and partners.' },
];

export async function fetchNotificationPreferences(): Promise<NotificationPrefs | null> {
  return tolerant(async () => {
    const raw = await api<unknown>('/users/me/notification-preferences');
    const d = unwrap<{ preferences?: NotificationPrefs } | NotificationPrefs>(raw);
    if (d && typeof d === 'object' && 'preferences' in d) return (d as { preferences: NotificationPrefs }).preferences;
    return d as NotificationPrefs;
  }, null);
}

export async function updateNotificationPreferences(prefs: NotificationPrefs): Promise<void> {
  // Backend expects flat toggles (PATCH /users/me/notification-preferences).
  await api('/users/me/notification-preferences', { method: 'PATCH', body: prefs });
}

// ---------------------------------------------------------------- inbox (real /notifications)

export interface InboxNotification {
  id: string;
  title: string;
  body?: string | null;
  type?: string | null;
  isRead?: boolean;
  createdAt?: string | null;
}

export async function fetchInbox(page = 1, pageSize = 20): Promise<InboxNotification[] | null> {
  return tolerant(async () => {
    const raw = await api<unknown>('/notifications', { params: { page, pageSize } });
    const d = unwrap<unknown>(raw);
    const items = Array.isArray(d) ? d : (d as { items?: unknown[] })?.items ?? [];
    return items as InboxNotification[];
  }, null);
}

export async function markInboxRead(id: string): Promise<void> {
  await api(`/notifications/${id}/read`, { method: 'POST' });
}

// ---------------------------------------------------------------- referral (real referralCode from /auth/me)

export async function fetchMyReferralCode(): Promise<string | null> {
  try {
    const raw = await api<unknown>('/auth/me');
    const d = unwrap<{ referralCode?: string | null }>(raw);
    return d.referralCode ?? null;
  } catch {
    return null;
  }
}

export function referralLink(code: string): string {
  if (typeof window === 'undefined') return `https://bachatly.pk/signup?ref=${code}`;
  return `${window.location.origin}/signup?ref=${code}`;
}

// ---------------------------------------------------------------- Phase 10: rewards economy
//
// Backend contract (all under /api/v1, built in parallel by the backend worker):
//   GET  /vouchers/my                     → my vouchers [{ id, code, title, valuePaisa, status, expiresAt }]
//   POST /vouchers/claim { code }         → claimed voucher
//   GET  /rewards/account                 → { balance, lifetimeEarned, lifetimeRedeemed } (points)
//   GET  /rewards/transactions?page&pageSize → paginated points ledger
//   GET  /rewards/catalog                 → redeemable rewards [{ id, title, description?, pointsCost, type }]
//   POST /rewards/:id/redeem { idempotencyKey } → creates a voucher
//   GET  /cashback                        → { balance, pending, lifetimeEarned, lifetimeWithdrawn } (paisa)
//   GET  /cashback/transactions?page&pageSize → paginated cashback ledger
//   POST /cashback/withdraw { amountPaisa, method, accountDetails } → pending withdrawal
//   GET  /cashback/withdrawals            → withdrawal history
//   GET  /referrals/stats                 → { referredCount, qualifiedCount, pendingCount, totalRewardsEarned (paisa), referred: [] }
//   POST /referrals/apply { code }        → applies a referral code to own account
//
// All fetchers are defensive: they tolerate { data }-wrapped and bare payloads
// and return null on 404/501 so pages degrade to honest states.

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

function unwrapPage<T>(data: unknown, page = 1, pageSize = 20): Page<T> {
  if (Array.isArray(data)) return { items: data as T[], total: (data as T[]).length, page, pageSize };
  const o = (data ?? {}) as Record<string, unknown>;
  const items = (o.items ?? o.results ?? o.rows ?? []) as T[];
  return {
    items,
    total: Number(o.total ?? o.count ?? items.length) || items.length,
    page: Number(o.page ?? page) || page,
    pageSize: Number(o.pageSize ?? pageSize) || pageSize,
  };
}

// ---- vouchers

export interface MyVoucher {
  id: string;
  code: string;
  title?: string | null;
  description?: string | null;
  valuePaisa?: number | null;
  status?: string | null; // ACTIVE | USED | EXPIRED
  expiresAt?: string | null;
  businessName?: string | null;
}

export async function fetchMyVouchers(): Promise<MyVoucher[] | null> {
  return tolerant(async () => {
    const raw = await api<unknown>('/vouchers/my');
    const d = unwrap<unknown>(raw);
    return (Array.isArray(d) ? d : (d as { items?: MyVoucher[] })?.items ?? []) as MyVoucher[];
  }, null);
}

/** Claim a voucher by its code. Returns the claimed voucher. */
export async function claimVoucher(code: string): Promise<MyVoucher> {
  const raw = await api<unknown>('/vouchers/claim', {
    method: 'POST',
    body: { code: code.trim().toUpperCase() },
  });
  return unwrap<MyVoucher>(raw);
}

// ---- rewards (points)

export interface RewardsAccount {
  balance: number; // points
  lifetimeEarned: number;
  lifetimeRedeemed: number;
}

export async function fetchRewardsAccount(): Promise<RewardsAccount | null> {
  return tolerant(async () => {
    const raw = await api<unknown>('/rewards/account');
    const d = unwrap<Partial<RewardsAccount>>(raw);
    return {
      balance: d.balance ?? 0,
      lifetimeEarned: d.lifetimeEarned ?? 0,
      lifetimeRedeemed: d.lifetimeRedeemed ?? 0,
    };
  }, null);
}

export interface RewardLedgerRow {
  id: string;
  points: number;
  label?: string | null;
  type?: string | null; // EARN | REDEEM | EXPIRE | ADJUST
  createdAt?: string | null;
}

export async function fetchRewardTransactions(page = 1, pageSize = 20): Promise<Page<RewardLedgerRow> | null> {
  return tolerant(async () => {
    const raw = await api<unknown>('/rewards/transactions', { params: { page, pageSize } });
    return unwrapPage<RewardLedgerRow>(unwrap<unknown>(raw), page, pageSize);
  }, null);
}

export interface RewardCatalogItem {
  id: string;
  title: string;
  description?: string | null;
  pointsCost: number;
  type?: string | null; // VOUCHER | DISCOUNT | ...
}

export async function fetchRewardsCatalog(): Promise<RewardCatalogItem[] | null> {
  return tolerant(async () => {
    const raw = await api<unknown>('/rewards/catalog');
    const d = unwrap<unknown>(raw);
    return (Array.isArray(d) ? d : (d as { items?: RewardCatalogItem[] })?.items ?? []) as RewardCatalogItem[];
  }, null);
}

/** Redeem a catalog reward for points → creates a voucher. Idempotent via generated key. */
export async function redeemReward(rewardId: string): Promise<MyVoucher> {
  const idempotencyKey = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const raw = await api<unknown>(`/rewards/${rewardId}/redeem`, {
    method: 'POST',
    body: { idempotencyKey },
  });
  const d = unwrap<{ voucher?: MyVoucher } | MyVoucher>(raw);
  return ('voucher' in (d as Record<string, unknown>) && (d as { voucher?: MyVoucher }).voucher)
    ? (d as { voucher: MyVoucher }).voucher
    : (d as MyVoucher);
}

// ---- cashback

export interface CashbackInfo {
  balance: number; // withdrawable, paisa
  pending: number; // paisa
  lifetimeEarned: number; // paisa
  lifetimeWithdrawn: number; // paisa
}

export async function fetchCashback(): Promise<CashbackInfo | null> {
  return tolerant(async () => {
    const raw = await api<unknown>('/cashback');
    const d = unwrap<Partial<CashbackInfo>>(raw);
    return {
      balance: d.balance ?? 0,
      pending: d.pending ?? 0,
      lifetimeEarned: d.lifetimeEarned ?? 0,
      lifetimeWithdrawn: d.lifetimeWithdrawn ?? 0,
    };
  }, null);
}

export interface CashbackLedgerRow {
  id: string;
  amountPaisa?: number | null;
  amount?: number | null; // paisa fallback
  label?: string | null;
  type?: string | null;
  status?: string | null;
  createdAt?: string | null;
}

export function cashbackRowAmount(r: CashbackLedgerRow): number {
  return r.amountPaisa ?? r.amount ?? 0;
}

export async function fetchCashbackTransactions(page = 1, pageSize = 20): Promise<Page<CashbackLedgerRow> | null> {
  return tolerant(async () => {
    const raw = await api<unknown>('/cashback/transactions', { params: { page, pageSize } });
    return unwrapPage<CashbackLedgerRow>(unwrap<unknown>(raw), page, pageSize);
  }, null);
}

export interface CashbackWithdrawal {
  id: string;
  amountPaisa?: number | null;
  amount?: number | null;
  method?: string | null;
  status?: string | null; // PENDING | APPROVED | REJECTED | PAID
  createdAt?: string | null;
}

export async function fetchCashbackWithdrawals(): Promise<CashbackWithdrawal[] | null> {
  return tolerant(async () => {
    const raw = await api<unknown>('/cashback/withdrawals');
    const d = unwrap<unknown>(raw);
    return (Array.isArray(d) ? d : (d as { items?: CashbackWithdrawal[] })?.items ?? []) as CashbackWithdrawal[];
  }, null);
}

export const CASHBACK_WITHDRAW_METHODS = [
  { value: 'bank', label: 'Bank transfer (IBAN)' },
  { value: 'jazzcash', label: 'JazzCash' },
  { value: 'easypaisa', label: 'Easypaisa' },
  { value: 'wallet', label: 'Bachatly wallet' },
];

/** Request a cashback withdrawal. Server enforces amount ≤ balance. Returns the pending withdrawal. */
export async function requestCashbackWithdraw(amountPaisa: number, method: string, accountDetails: string): Promise<CashbackWithdrawal> {
  const raw = await api<unknown>('/cashback/withdraw', {
    method: 'POST',
    body: { amountPaisa: Math.round(amountPaisa), method, accountDetails: accountDetails.trim() },
  });
  return unwrap<CashbackWithdrawal>(raw);
}

// ---- referrals (stats)

export interface ReferredFriend {
  id?: string | null;
  firstName?: string | null;
  email?: string | null;
  joinedAt?: string | null;
  status?: string | null; // PENDING | QUALIFIED
}

export interface ReferralStats {
  referredCount: number;
  qualifiedCount: number;
  pendingCount: number;
  totalRewardsEarned: number; // paisa (cashback earned; points shown separately)
  totalPointsEarned?: number; // points
  referred?: ReferredFriend[] | null;
  referrerReward?: { points?: number | null; cashbackPaisa?: number | null } | null;
  refereeReward?: { points?: number | null; cashbackPaisa?: number | null } | null;
}

export async function fetchReferralStats(): Promise<ReferralStats | null> {
  return tolerant(async () => {
    const raw = await api<unknown>('/referrals/stats');
    const d = unwrap<Record<string, any>>(raw) ?? {};
    return {
      referredCount: d.referredCount ?? 0,
      qualifiedCount: d.qualifiedCount ?? 0,
      pendingCount: d.pendingCount ?? 0,
      // Backend splits rewards by type; UI "Rewards earned" card shows the cashback value.
      totalRewardsEarned: d.totalRewardsEarned ?? d.totalCashbackEarnedPaisa ?? 0,
      totalPointsEarned: d.totalPointsEarned ?? 0,
      referred: d.referred ?? null,
      referrerReward: d.referrerReward ?? null,
      refereeReward: d.refereeReward ?? null,
    };
  }, null);
}

/** Apply someone else's referral code to your own account. */
export async function applyReferralCode(code: string): Promise<void> {
  await api('/referrals/apply', { method: 'POST', body: { code: code.trim().toUpperCase() } });
}

// ---- wallet (unchanged legacy shape)

export interface WalletInfo { balance: number; currency: string }
export async function fetchWallet(): Promise<WalletInfo | null> {
  return tolerant(async () => unwrap<WalletInfo>(await api<unknown>('/wallet')), null);
}
