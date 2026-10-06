/**
 * Engagement data layer (Phase 11): notifications, reviews, support tickets, CMS.
 * All functions are defensive: they return null on 404/501 (endpoint not live yet)
 * via `tolerant`, so pages render honest "not live yet" states instead of crashing.
 */
import { api, ApiError } from './api';

/** Unwrap backend envelopes: { data: T } → T. */
function unwrap<T>(data: unknown): T {
  if (data && typeof data === 'object' && 'data' in (data as Record<string, unknown>)) {
    return (data as { data: T }).data;
  }
  return data as T;
}

/** Returns null when the backend route is not deployed (404/501). */
async function tolerant<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 501)) return null;
    throw e;
  }
}

// ---------------------------------------------------------------- notifications

export interface NotificationItem {
  id: string;
  title: string;
  body?: string | null;
  type?: string | null;
  read?: boolean;
  createdAt?: string | null;
}

export interface NotificationPage {
  items: NotificationItem[];
  unread: number;
  total?: number;
}

export async function fetchNotifications(page = 1, pageSize = 20): Promise<NotificationPage | null> {
  return tolerant(async () => {
    const raw = await api<unknown>('/notifications', { params: { page, pageSize } });
    const d = unwrap<Record<string, any>>(raw) ?? {};
    const items: NotificationItem[] = Array.isArray(d) ? d : d.items ?? [];
    return { items, unread: d.unread ?? items.filter((i) => !i.read).length, total: d.total };
  });
}

export async function fetchUnreadCount(): Promise<number | null> {
  return tolerant(async () => {
    const d = unwrap<Record<string, any>>(await api<unknown>('/notifications/unread-count')) ?? {};
    return Number(d.unread ?? 0);
  });
}

export async function markNotificationRead(id: string): Promise<void> {
  await api(`/notifications/${id}/read`, { method: 'POST' });
}

export async function markAllNotificationsRead(): Promise<void> {
  await api('/notifications/read-all', { method: 'POST' });
}

export const NOTIF_TYPE_ICONS: Record<string, string> = {
  deal: '🎟️', redemption: '🧾', membership: '👑', payment: '💳', cashback: '💸',
  reward: '⭐', referral: '🤝', support: '💬', review: '⭐', system: '⚙️', voucher: '🎫',
};

// ---------------------------------------------------------------- reviews

export interface ReviewItem {
  id: string;
  rating: number;
  title?: string | null;
  body?: string | null;
  createdAt?: string | null;
  authorName?: string | null;
  businessId?: string;
  dealId?: string | null;
  reply?: { body: string; createdAt?: string | null } | null;
}

export interface ReviewAggregate {
  average: number;
  count: number;
  distribution: Record<string, number>; // {1..5}
}

export async function fetchBusinessReviews(
  businessId: string, page = 1, pageSize = 10,
): Promise<{ items: ReviewItem[]; aggregate: ReviewAggregate | null } | null> {
  return tolerant(async () => {
    const raw = await api<unknown>(`/reviews/business/${businessId}`, { params: { page, pageSize } });
    const d = unwrap<Record<string, any>>(raw) ?? {};
    const items: ReviewItem[] = Array.isArray(d) ? d : d.items ?? [];
    return { items, aggregate: d.aggregate ?? null };
  });
}

export interface CreateReviewInput {
  businessId: string;
  dealId?: string;
  rating: number;
  title?: string;
  body?: string;
}

/** Throws ApiError with code NO_REDEMPTION when the user hasn't visited yet. */
export async function createReview(input: CreateReviewInput): Promise<ReviewItem> {
  const raw = await api<unknown>('/reviews', { method: 'POST', body: input });
  return unwrap<ReviewItem>(raw);
}

export async function replyToReview(reviewId: string, body: string): Promise<void> {
  await api(`/reviews/${reviewId}/reply`, { method: 'POST', body: { body } });
}

// ---------------------------------------------------------------- support

export interface SupportTicket {
  id: string;
  subject: string;
  category?: string | null;
  status?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface TicketMessage {
  id: string;
  body: string;
  authorName?: string | null;
  internal?: boolean;
  createdAt?: string | null;
}

export async function fetchTickets(): Promise<SupportTicket[] | null> {
  return tolerant(async () => {
    const raw = await api<unknown>('/support/tickets', { params: { pageSize: 20 } });
    const d = unwrap<unknown>(raw);
    return (Array.isArray(d) ? d : (d as { items?: SupportTicket[] })?.items ?? []) as SupportTicket[];
  });
}

export async function createTicket(input: { subject: string; category: string; message: string }): Promise<SupportTicket> {
  const raw = await api<unknown>('/support/tickets', { method: 'POST', body: input });
  return unwrap<SupportTicket>(raw);
}

export async function fetchTicket(id: string): Promise<{ ticket: SupportTicket; messages: TicketMessage[] } | null> {
  return tolerant(async () => {
    const raw = await api<unknown>(`/support/tickets/${id}`);
    const d = unwrap<Record<string, any>>(raw) ?? {};
    return { ticket: (d.ticket ?? d) as SupportTicket, messages: (d.messages ?? []) as TicketMessage[] };
  });
}

export async function sendTicketMessage(id: string, message: string): Promise<void> {
  await api(`/support/tickets/${id}/messages`, { method: 'POST', body: { message } });
}

export interface FaqItem { question: string; answer: string }

export async function fetchFaq(): Promise<FaqItem[] | null> {
  return tolerant(async () => {
    const raw = await api<unknown>('/support/faq');
    const d = unwrap<unknown>(raw);
    const items = (Array.isArray(d) ? d : (d as { items?: unknown[] })?.items ?? []) as Array<Record<string, any>>;
    return items.map((f) => ({ question: String(f.question ?? f.title ?? ''), answer: String(f.answer ?? f.body ?? '') }));
  });
}

export const SUPPORT_CATEGORIES = ['Deals', 'Redemption', 'Membership', 'Payments', 'Account', 'Partner', 'Other'];

// ---------------------------------------------------------------- CMS

export interface CmsPage {
  slug: string;
  title: string;
  body: string; // HTML from CMS — rendered with dangerouslySetInnerHTML
  updatedAt?: string | null;
}

export async function fetchCmsPage(slug: string): Promise<CmsPage | null> {
  return tolerant(async () => {
    const raw = await api<unknown>(`/cms/pages/${slug}`, { auth: false });
    const d = unwrap<Record<string, any>>(raw) ?? {};
    if (!d.body && !d.title) return null;
    return { slug, title: String(d.title ?? slug), body: String(d.body ?? ''), updatedAt: d.updatedAt ?? null };
  });
}

export interface CmsBanner {
  id: string;
  title: string;
  image?: string | null;
  link?: string | null;
  priority?: number;
}

export async function fetchActiveBanners(): Promise<CmsBanner[] | null> {
  return tolerant(async () => {
    const raw = await api<unknown>('/cms/banners/active', { auth: false });
    const d = unwrap<unknown>(raw);
    return (Array.isArray(d) ? d : (d as { items?: CmsBanner[] })?.items ?? []) as CmsBanner[];
  });
}
