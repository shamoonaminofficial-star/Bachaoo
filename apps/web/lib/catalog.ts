/**
 * Typed catalog API layer (Phase 3): locations, categories, businesses, branches,
 * partner applications. Backend contract (all under /api/v1):
 *
 *   Public:
 *   GET  /locations/cities?search=
 *   GET  /categories, /categories/:slug
 *   GET  /businesses?q&categoryId&cityId&areaId&ratingMin&hasDeals&sort&page&pageSize
 *   GET  /businesses/:slug
 *   GET  /branches/nearby?lat&lng&radiusKm
 *   POST /businesses/applications            (multipart)
 *
 *   Admin:
 *   /categories/admin/all, POST/PATCH/DELETE /categories/:id,
 *   POST /categories/reorder, PATCH /categories/:id/toggle,
 *   POST /categories/:id/icon|image,
 *   GET/POST/PATCH/DELETE /categories/:id/subcategories/:subId
 *   GET /businesses/admin/all, POST/PATCH/DELETE /businesses/:id,
 *   POST /businesses/:id/verify|suspend|reactivate
 *   GET /businesses/applications, POST /businesses/applications/:id/approve|reject|request-info|review
 *   GET /branches?businessId&q&page&pageSize
 *   GET /locations/tree, POST /locations/provinces/:id/cities, PATCH /locations/cities/:id,
 *   POST /locations/cities/:id/default, PATCH /locations/cities/:id/toggle,
 *   POST /locations/cities/:id/areas, PATCH|DELETE /locations/areas/:id
 *
 *   Partner (owner):
 *   GET /businesses/mine, PATCH /businesses/mine/:id,
 *   POST /businesses/mine/:id/logo|cover   (multipart, field "file")
 *   GET|POST /businesses/:businessId/branches, PATCH|DELETE /branches/:id
 *
 * List endpoints accept either `{ items: [...] }` or a bare array.
 */
import { api, apiForm, ApiError } from './api';

// ---------------------------------------------------------------- types

export interface ApiCity { id: string; name: string; slug: string; province: string; isDefault?: boolean; }
export interface ApiArea { id: string; name: string; slug: string; cityId: string; cityName?: string; }
export interface ApiSubcategory { id: string; name: string; slug: string; dealCount?: number; }
export interface ApiCategory {
  id: string; name: string; slug: string; icon?: string; image?: string;
  dealCount: number; isActive: boolean; sortOrder: number;
  subcategories: ApiSubcategory[];
}
export interface ApiBranch {
  id: string; name: string; manager?: string; phone?: string; address: string;
  city?: string; area?: string; latitude?: number; longitude?: number;
  openingHours?: Record<string, [string, string]>; isActive: boolean;
  distanceKm?: number; business?: { id: string; name: string; slug: string };
}
export interface ApiBusiness {
  id: string; slug: string; name: string; description?: string;
  logo?: string; cover?: string;
  category: { id: string; name: string; slug: string };
  ratingAvg: number; ratingCount: number;
  city: string; area?: string; address?: string; phone?: string;
  website?: string; instagram?: string; facebook?: string;
  isVerified: boolean; activeDealCount: number; minDiscountPercent?: number;
  distanceKm?: number;
}
export interface ApiDealSummary {
  id: string; slug: string; title: string; discountPercent: number;
  memberPrice?: number; originalPrice?: number; expiresAt: string; badges?: string[];
}
export interface ApiReview { id: string; author: string; rating: number; text: string; createdAt: string; }
export interface ApiBusinessDetail extends ApiBusiness {
  branches: ApiBranch[];
  deals: ApiDealSummary[];
  reviews: ApiReview[];
  reviewsSummary: { avg: number; count: number };
}
export interface ApiApplication {
  id: string; businessName: string; ownerName: string; email: string; phone: string;
  category?: string; city?: string; status: string; submittedAt: string; documents?: string[];
}
export interface Page<T> { items: T[]; page: number; pageSize: number; total: number; totalPages: number; }

// ---------------------------------------------------------------- helpers

export function unwrapItems<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  const obj = data as { items?: T[]; data?: T[] } | null;
  if (obj && Array.isArray(obj.items)) return obj.items;
  if (obj && Array.isArray(obj.data)) return obj.data;
  return [];
}

export function unwrapPage<T>(data: unknown, fallbackPageSize: number): Page<T> {
  const obj = data as Page<T> & { data?: T[] } | null;
  if (obj && (Array.isArray(obj.items) || Array.isArray((obj as { data?: T[] }).data))) {
    const items = (obj.items ?? (obj as { data?: T[] }).data ?? []) as T[];
    return {
      items,
      page: obj.page ?? 1,
      pageSize: obj.pageSize ?? fallbackPageSize,
      total: obj.total ?? items.length,
      totalPages: obj.totalPages ?? 1,
    };
  }
  const items = unwrapItems<T>(data);
  return { items, page: 1, pageSize: fallbackPageSize, total: items.length, totalPages: 1 };
}

export type QueryParams = Record<string, string | number | boolean | undefined>;

// Backend names the field `coverImage`; the UI uses `cover`.
function normalizeBusiness<T extends { coverImage?: string; cover?: string }>(b: T): T {
  if (b && typeof b === 'object' && b.coverImage && !b.cover) {
    return { ...b, cover: b.coverImage };
  }
  return b;
}

// ---------------------------------------------------------------- public

export async function fetchCities(search = ''): Promise<ApiCity[]> {
  const data = await api<unknown>('/locations/cities', { auth: false, params: { search: search || undefined } });
  return unwrapItems<ApiCity>(data);
}

export async function fetchCategories(): Promise<ApiCategory[]> {
  const data = await api<unknown>('/categories', { auth: false });
  return unwrapItems<ApiCategory>(data);
}

export async function fetchCategory(slug: string): Promise<ApiCategory> {
  return api<ApiCategory>(`/categories/${slug}`, { auth: false });
}

export interface BusinessQuery extends QueryParams {
  q?: string; categoryId?: string; cityId?: string; areaId?: string;
  ratingMin?: number; hasDeals?: boolean; sort?: string; page?: number; pageSize?: number;
}

export async function fetchBusinesses(params: BusinessQuery = {}): Promise<Page<ApiBusiness>> {
  const data = await api<unknown>('/businesses', { auth: false, params: params as QueryParams });
  const page = unwrapPage<ApiBusiness>(data, Number(params.pageSize) || 12);
  page.items = page.items.map(normalizeBusiness);
  return page;
}

export async function fetchBusiness(slug: string): Promise<ApiBusinessDetail> {
  const detail = await api<ApiBusinessDetail>(`/businesses/${slug}`, { auth: false });
  return normalizeBusiness(detail);
}

export async function fetchNearbyBranches(lat: number, lng: number, radiusKm: number): Promise<ApiBranch[]> {
  const data = await api<unknown>('/branches/nearby', { auth: false, params: { lat, lng, radiusKm } });
  return unwrapItems<ApiBranch>(data);
}

export async function submitApplication(form: FormData): Promise<{ id: string; status: string }> {
  return apiForm<{ id: string; status: string }>('/businesses/applications', form, { auth: false });
}

// ---------------------------------------------------------------- admin

export async function adminListCategories(): Promise<ApiCategory[]> {
  const data = await api<unknown>('/categories/admin/all');
  return unwrapItems<ApiCategory>(data);
}
export async function adminCreateCategory(body: { name: string; slug?: string; icon?: string; image?: string; sortOrder?: number }): Promise<ApiCategory> {
  return api<ApiCategory>('/categories', { method: 'POST', body });
}
export async function adminUpdateCategory(id: string, body: Partial<{ name: string; slug: string; icon: string; image: string; sortOrder: number; isActive: boolean }>): Promise<ApiCategory> {
  return api<ApiCategory>(`/categories/${id}`, { method: 'PATCH', body });
}
export async function adminToggleCategory(id: string): Promise<ApiCategory> {
  return api<ApiCategory>(`/categories/${id}/toggle`, { method: 'PATCH', body: {} });
}
export async function adminDeleteCategory(id: string): Promise<void> {
  await api<void>(`/categories/${id}`, { method: 'DELETE' });
}
export async function adminReorderCategories(ids: string[]): Promise<void> {
  await api<void>('/categories/reorder', { method: 'POST', body: { ids } });
}
export async function adminCreateSubcategory(categoryId: string, body: { name: string; slug?: string }): Promise<ApiSubcategory> {
  return api<ApiSubcategory>(`/categories/${categoryId}/subcategories`, { method: 'POST', body });
}
export async function adminDeleteSubcategory(categoryId: string, subId: string): Promise<void> {
  await api<void>(`/categories/${categoryId}/subcategories/${subId}`, { method: 'DELETE' });
}

export async function adminListBusinesses(params: BusinessQuery & { status?: 'active' | 'suspended' | 'all' } = {}): Promise<Page<ApiBusiness>> {
  const data = await api<unknown>('/businesses/admin/all', { params: params as QueryParams });
  return unwrapPage<ApiBusiness>(data, Number(params.pageSize) || 10);
}
export async function adminCreateBusiness(body: Record<string, unknown>): Promise<ApiBusiness> {
  return api<ApiBusiness>('/businesses', { method: 'POST', body });
}
export async function adminBusinessAction(id: string, action: 'verify' | 'suspend' | 'reactivate', reason?: string): Promise<void> {
  await api<void>(`/businesses/${id}/${action}`, { method: 'POST', body: { reason } });
}

export async function adminListApplications(params: { status?: string; page?: number; pageSize?: number } = {}): Promise<Page<ApiApplication>> {
  const data = await api<unknown>('/businesses/applications', { params: params as QueryParams });
  return unwrapPage<ApiApplication>(data, Number(params.pageSize) || 10);
}
export async function adminDecideApplication(id: string, decision: 'approve' | 'reject' | 'request-changes', reason?: string, notes?: string): Promise<void> {
  // Backend names the third action "request-info".
  const action = decision === 'request-changes' ? 'request-info' : decision;
  await api<void>(`/businesses/applications/${id}/${action}`, { method: 'POST', body: { reason, notes } });
}

export async function adminListBranches(params: { q?: string; businessId?: string; page?: number; pageSize?: number } = {}): Promise<Page<ApiBranch>> {
  const data = await api<unknown>('/branches', { params: params as QueryParams });
  return unwrapPage<ApiBranch>(data, Number(params.pageSize) || 10);
}

export interface LocationTree {
  countries: Array<{ id: string; name: string; code: string; provinces: Array<{
    id: string; name: string; cities: Array<{ id: string; name: string; slug: string; isDefault: boolean; areas: ApiArea[] }>
  }> }>;
}
export async function adminLocationTree(): Promise<LocationTree> {
  return api<LocationTree>('/locations/tree');
}
export async function adminCreateCity(body: { name: string; provinceId: string; isDefault?: boolean }): Promise<ApiCity> {
  return api<ApiCity>(`/locations/provinces/${body.provinceId}/cities`, { method: 'POST', body: { name: body.name, isDefault: body.isDefault } });
}
export async function adminUpdateCity(id: string, body: Partial<{ name: string; isDefault: boolean }>): Promise<ApiCity> {
  return api<ApiCity>(`/locations/cities/${id}`, { method: 'PATCH', body });
}
export async function adminCreateArea(body: { name: string; cityId: string }): Promise<ApiArea> {
  return api<ApiArea>(`/locations/cities/${body.cityId}/areas`, { method: 'POST', body: { name: body.name } });
}
export async function adminDeleteArea(id: string): Promise<void> {
  await api<void>(`/locations/areas/${id}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------- partner (owner)

async function myBusinessId(): Promise<string> {
  const list = await api<ApiBusiness[]>('/businesses/mine');
  const first = Array.isArray(list) ? list[0] : null;
  if (!first?.id) throw new ApiError(404, 'No business found for this account.', 'NO_BUSINESS');
  return first.id;
}

export async function partnerGetProfile(): Promise<ApiBusinessDetail> {
  const list = await api<ApiBusiness[]>('/businesses/mine');
  const first = Array.isArray(list) ? list[0] : null;
  if (!first?.slug) throw new ApiError(404, 'No business found for this account.', 'NO_BUSINESS');
  // Full detail (branches, deals, reviews) via the public detail endpoint.
  return fetchBusiness(first.slug);
}
export async function partnerUpdateProfile(body: Record<string, unknown>): Promise<ApiBusinessDetail> {
  const id = await myBusinessId();
  await api<ApiBusiness>(`/businesses/mine/${id}`, { method: 'PATCH', body });
  return partnerGetProfile();
}
export async function partnerUploadProfileImage(kind: 'logo' | 'cover', file: File): Promise<{ url: string }> {
  const id = await myBusinessId();
  const form = new FormData();
  form.append('file', file);
  return apiForm<{ url: string }>(`/businesses/mine/${id}/${kind}`, form);
}
export async function partnerListBranches(): Promise<ApiBranch[]> {
  const id = await myBusinessId();
  const data = await api<unknown>(`/businesses/${id}/branches`, { params: { includeInactive: true } });
  return unwrapItems<ApiBranch>(data);
}
export async function partnerCreateBranch(body: Record<string, unknown>): Promise<ApiBranch> {
  const id = await myBusinessId();
  return api<ApiBranch>(`/businesses/${id}/branches`, { method: 'POST', body });
}
export async function partnerUpdateBranch(id: string, body: Record<string, unknown>): Promise<ApiBranch> {
  return api<ApiBranch>(`/branches/${id}`, { method: 'PATCH', body });
}
export async function partnerDeleteBranch(id: string): Promise<void> {
  await api<void>(`/branches/${id}`, { method: 'DELETE' });
}

export { ApiError };

// ---------------------------------------------------------------- deals (Phase 4)

import type { Deal as UiDeal, Redemption as UiRedemption } from '@bachatly/ui';
import { formatPKR } from './format';

/** Backend money arrives in paisa; the UI Deal type uses whole PKR. */
export function paisaToPkr(paisa?: number | null): number | undefined {
  if (paisa === undefined || paisa === null) return undefined;
  return Math.round(paisa) / 100;
}

export interface DealQuery extends QueryParams {
  q?: string; categoryId?: string; subcategoryId?: string; cityId?: string; areaId?: string;
  businessId?: string; minDiscount?: number; dealType?: string; maxPrice?: number;
  ratingMin?: number; membershipRequired?: boolean; availableNow?: boolean;
  sort?: 'recommended' | 'nearby' | 'newest' | 'discount' | 'popular' | 'ending' | string;
  lat?: number; lng?: number; radiusKm?: number; page?: number; pageSize?: number;
}

/** API deal normalized to the UI Deal shape, with backend extras attached. */
export interface ApiDeal extends UiDeal {
  youSavePaisa?: number;
  requiresMembership: boolean;
  dealType?: string;
  viewCount?: number;
  categorySlug?: string;
  subcategory?: string;
  status?: string;
}

export interface ApiDealDetail extends Omit<ApiDeal, 'business'> {
  images: string[];
  startDate: string;
  endDate: string;
  branches: ApiBranch[];
  business: ApiBusiness & { phone?: string; website?: string; address?: string; openingHours?: Record<string, [string, string]> };
  computed: { youSavePaisa?: number; memberPricePaisa?: number; eligible: boolean; reasons: string[] };
  reviewsSummary?: { avg: number; count: number };
}

/** Normalize a backend deal item (paisa money, nested objects) to the UI Deal shape. */
export function mapDeal(item: Record<string, unknown>): ApiDeal {
  const biz = (item.business as Record<string, unknown>) || {};
  const cat = (item.category as Record<string, unknown>) || {};
  const badges = (Array.isArray(item.badges) ? item.badges : []) as UiDeal['badges'];
  // Backend nests savings in `computed: { youSavePaisa, memberPricePaisa }`.
  const computed = (item.computed as Record<string, unknown>) || {};
  const termsRaw = item.terms;
  const terms: string[] = Array.isArray(termsRaw)
    ? (termsRaw as string[])
    : typeof termsRaw === 'string' && termsRaw.trim()
      ? termsRaw.split('\n').map((t) => t.trim()).filter(Boolean)
      : [];
  return {
    id: String(item.id ?? ''),
    slug: String(item.slug ?? ''),
    title: String(item.title ?? ''),
    shortDescription: String(item.shortDescription ?? ''),
    description: String(item.description ?? item.shortDescription ?? ''),
    image: (item.image as string) || undefined,
    discountPercent: Number(item.discountPercent ?? 0),
    originalPrice: paisaToPkr(item.originalPrice as number),
    memberPrice: paisaToPkr((computed.memberPricePaisa ?? item.memberPricePaisa ?? item.dealPrice ?? item.memberPrice) as number),
    business: {
      id: String(biz.id ?? ''), name: String(biz.name ?? ''), slug: String(biz.slug ?? ''),
      logo: (biz.logo as string) || undefined, verified: Boolean(biz.isVerified ?? biz.verified),
      city: String(item.city ?? biz.city ?? ''), area: String(item.area ?? biz.area ?? ''),
    },
    category: String(cat.name ?? item.category ?? ''),
    categorySlug: (cat.slug as string) || undefined,
    city: String(item.city ?? ''),
    area: String(item.area ?? ''),
    distanceKm: item.distanceKm as number | undefined,
    badges,
    memberOnly: Boolean(item.requiresMembership ?? item.memberOnly),
    requiresMembership: Boolean(item.requiresMembership ?? item.memberOnly),
    expiresAt: String(item.endsAt ?? item.expiresAt ?? ''),
    startsAt: String(item.startDate ?? item.startsAt ?? ''),
    terms,
    perUserLimit: Number(item.perUserLimit ?? 1),
    usageLimit: (item.usageLimit as number) || undefined,
    rating: Number((biz.ratingAvg as number) ?? item.rating ?? 0),
    youSavePaisa: (computed.youSavePaisa ?? item.youSavePaisa) as number | undefined,
    dealType: item.dealType as string | undefined,
    viewCount: item.viewCount as number | undefined,
    subcategory: (item.subcategory as string) || undefined,
    // Backend uses UPPER_CASE statuses; the UI convention is lowercase.
    status: typeof item.status === 'string' ? item.status.toLowerCase() : undefined,
  };
}

function mapDealPage(data: unknown, fallbackPageSize: number): Page<ApiDeal> {
  const page = unwrapPage<Record<string, unknown>>(data, fallbackPageSize);
  return { ...page, items: page.items.map(mapDeal) };
}

export async function fetchDeals(params: DealQuery = {}): Promise<Page<ApiDeal>> {
  const data = await api<unknown>('/deals', { auth: false, params: params as QueryParams });
  return mapDealPage(data, Number(params.pageSize) || 12);
}

export async function fetchDeal(slug: string): Promise<ApiDealDetail> {
  const raw = await api<Record<string, unknown>>(`/deals/${slug}`, { auth: false });
  const base = mapDeal(raw);
  const business = (raw.business as Record<string, unknown>) || {};
  // Backend returns images as [{ id, url, sortOrder }]; eligibility separate from computed.
  const rawImages = raw.images as Array<{ url?: string } | string> | undefined;
  const images = Array.isArray(rawImages)
    ? rawImages.map((img) => (typeof img === 'string' ? img : img.url)).filter(Boolean) as string[]
    : base.image ? [base.image] : [];
  const eligibility = (raw.eligibility as { eligible?: boolean; reasons?: string[] }) || {};
  return {
    ...base,
    images,
    startDate: String(raw.startDate ?? base.startsAt ?? ''),
    endDate: String(raw.endDate ?? base.expiresAt ?? ''),
    branches: (Array.isArray(raw.branches) ? raw.branches : []) as ApiBranch[],
    business: {
      ...(base.business as unknown as ApiBusiness),
      phone: business.phone as string | undefined,
      website: business.website as string | undefined,
      address: business.address as string | undefined,
      openingHours: business.openingHours as Record<string, [string, string]> | undefined,
    } as ApiDealDetail['business'],
    computed: {
      youSavePaisa: base.youSavePaisa,
      memberPricePaisa: ((raw.computed as Record<string, unknown> | undefined)?.memberPricePaisa) as number | undefined,
      eligible: eligibility.eligible ?? true,
      reasons: eligibility.reasons ?? [],
    },
    reviewsSummary: raw.reviewsSummary as ApiDealDetail['reviewsSummary'],
  };
}

// ---------------------------------------------------------------- search

export interface SearchResults {
  deals: ApiDeal[];
  businesses: ApiBusiness[];
  categories: ApiCategory[];
}

export async function globalSearch(q: string): Promise<SearchResults> {
  const data = await api<Record<string, unknown>>('/search', { auth: false, params: { q } });
  return {
    deals: unwrapItems<Record<string, unknown>>(data.deals).map(mapDeal),
    businesses: unwrapItems<ApiBusiness>(data.businesses),
    categories: unwrapItems<ApiCategory>(data.categories),
  };
}

export async function searchSuggest(q: string): Promise<string[]> {
  if (!q.trim()) return [];
  try {
    const data = await api<{ suggestions?: string[] } | string[]>('/search/suggest', { auth: false, params: { q } });
    if (Array.isArray(data)) return data;
    return data.suggestions || [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------- favorites

export type FavoriteTarget = 'deal' | 'business';
export interface ApiFavorite {
  id: string;
  targetType: FavoriteTarget;
  targetId: string;
  deal?: Record<string, unknown>;
  business?: ApiBusiness;
  createdAt?: string;
}

export async function fetchFavorites(type?: FavoriteTarget): Promise<ApiFavorite[]> {
  const data = await api<unknown>('/favorites', { params: type ? { type } : {} });
  return unwrapItems<ApiFavorite>(data);
}

export async function addFavorite(targetType: FavoriteTarget, targetId: string): Promise<ApiFavorite> {
  return api<ApiFavorite>('/favorites', { method: 'POST', body: { targetType, targetId } });
}

export async function removeFavorite(favoriteId: string): Promise<void> {
  await api<void>(`/favorites/${favoriteId}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------- partner deals

export type PartnerDealStatus = 'draft' | 'pending_approval' | 'approved' | 'published' | 'paused' | 'rejected' | 'expired';

export interface ApiPartnerDeal extends ApiDeal {
  status: PartnerDealStatus;
  redemptions?: number;
  submittedAt?: string;
}

export async function partnerMyDeals(status?: string): Promise<ApiPartnerDeal[]> {
  const data = await api<unknown>('/deals/mine', { params: status ? { status: status.toUpperCase() } : {} });
  return unwrapItems<Record<string, unknown>>(data).map((d) => { const m = mapDeal(d); return { ...m, status: (m.status as PartnerDealStatus) || 'draft', redemptions: d.redemptions as number | undefined, submittedAt: d.submittedAt as string | undefined }; });
}

/** Maps the backend DealType enum back to the UI's deal-type values. */
export function fromBackendDealType(v: string | undefined): string {
  const map: Record<string, string> = {
    PERCENT_OFF: 'percent_off',
    FLAT_OFF: 'flat_off',
    BUY_ONE_GET_ONE: 'bogo',
    FREE_ITEM: 'freebie',
    CASHBACK: 'cashback',
  };
  return (v && map[v]) || 'percent_off';
}

/** Maps the UI's deal-type values to the backend DealType enum. */
export function toBackendDealType(v: string): string {
  const map: Record<string, string> = {
    percent_off: 'PERCENT_OFF',
    flat_off: 'FLAT_OFF',
    bogo: 'BUY_ONE_GET_ONE',
    freebie: 'FREE_ITEM',
    cashback: 'CASHBACK',
  };
  return map[v] || v.toUpperCase();
}

export async function partnerCreateDeal(body: Record<string, unknown>, images: File[] = []): Promise<ApiPartnerDeal> {
  // Backend: JSON create first, then a separate multipart image upload.
  const raw = await api<Record<string, unknown>>('/deals', { method: 'POST', body });
  const id = String(raw.id ?? '');
  if (id && images.length) {
    const form = new FormData();
    images.forEach((f) => form.append('files', f));
    await apiForm(`/deals/${id}/images`, form);
  }
  const m = mapDeal(raw); return { ...m, status: (m.status as PartnerDealStatus) || 'draft' };
}

export async function partnerUpdateDeal(id: string, body: Record<string, unknown>): Promise<ApiPartnerDeal> {
  const raw = await api<Record<string, unknown>>(`/deals/${id}`, { method: 'PATCH', body });
  const m = mapDeal(raw); return { ...m, status: (m.status as PartnerDealStatus) || 'draft' };
}

export async function partnerDealAction(id: string, action: 'duplicate' | 'submit' | 'pause' | 'resume' | 'publish'): Promise<ApiPartnerDeal> {
  const raw = await api<Record<string, unknown>>(`/deals/${id}/${action}`, { method: 'POST', body: {} });
  const m = mapDeal(raw); return { ...m, status: (m.status as PartnerDealStatus) || 'draft' };
}

export async function partnerDeleteDeal(id: string): Promise<void> {
  await api<void>(`/deals/${id}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------- admin deals

const QUEUE_STATUSES = ['PENDING_APPROVAL', 'APPROVED', 'PUBLISHED', 'PAUSED', 'REJECTED', 'DRAFT', 'EXPIRED'];

export async function adminDealQueue(status = 'pending_approval'): Promise<ApiPartnerDeal[]> {
  const statuses = status === '' || status === 'all' ? QUEUE_STATUSES : [status.toUpperCase()];
  const pages = await Promise.all(
    statuses.map((s) => api<unknown>('/deals/admin/queue', { params: { status: s, pageSize: 100 } })),
  );
  const items = pages.flatMap((p) => unwrapItems<Record<string, unknown>>(p));
  return items.map((d) => {
    const mapped = mapDeal(d);
    return { ...mapped, status: (mapped.status as PartnerDealStatus) || 'pending_approval', redemptions: d.redemptions as number | undefined, submittedAt: d.submittedAt as string | undefined };
  });
}

export async function adminDealDecision(
  id: string,
  decision: 'approve' | 'reject' | 'request-changes' | 'publish',
  reason?: string,
): Promise<void> {
  await api<void>(`/deals/${id}/${decision}`, { method: 'POST', body: { reason } });
}

// ---------------------------------------------------------------- redemptions & savings (Phase 6)
//
// Backend contract (all under /api/v1):
//   POST /redemptions/qr { dealId, branchId? }            → { token, expiresIn }   (short-lived signed JWT, ~90s)
//   POST /redemptions/validate { token }                  → { customer, membership, deal, branch }
//   POST /redemptions/confirm { token, billAmountPaisa }   → receipt (all amounts in paisa)
//   GET  /redemptions/history?page&pageSize               → { items: [...] }        (paisa)
//   GET  /redemptions/savings/summary                     → { total, thisMonth, thisYear, byCategory, byMonth } (paisa)
//   GET  /redemptions/deal/:id/eligibility                → { eligible, reasons[] }
//   GET  /redemptions/admin?q&status&businessId&from&to&page&pageSize  (admin list)
//
// Money arrives in integer paisa; the UI surfaces whole PKR via paisaToPkr /
// formatPaisa. The QR payload is a signed, single-use, short-lived token — it
// carries no PII (only jti/sub/dealId), so screenshots expire with it.
//
// NOTE: an early draft of docs/API.md named the mint endpoint
// `/redemptions/qr-token`. mintQrToken tries the Phase 6 contract first and
// falls back to the old path on 404.

export interface QrToken { token: string; expiresIn: number /* seconds */ }

export interface TokenValidation {
  customer: { firstName: string };
  membership: { status: string; planName: string };
  deal: {
    id: string; title: string; discountPercent: number;
    maxDiscountPaisa?: number; dealType?: string;
  };
  branch?: { id?: string; name?: string } | null;
}

export interface RedemptionReceipt {
  redemptionId: string;
  bill: number; discount: number; paid: number; saving: number;
  cashback: number; points: number; // points are counts, not money
}

export interface DealEligibility { eligible: boolean; reasons: string[]; }

export interface ApiRedemptionItem {
  id: string; createdAt: string; receiptNo?: string;
  bill: number; discount: number; paid: number; saving: number;
  cashback?: number; points?: number;
  deal: { id?: string; title: string; slug?: string };
  business: { id?: string; name: string };
  branch?: { id?: string; name?: string } | null;
  status?: string;
  customer?: { id?: string; name?: string; firstName?: string } | null;
}

export interface ApiSavingsSummary {
  total: number; thisMonth: number; thisYear: number;
  byCategory: Array<{ category: string; total: number }>;
  byMonth: Array<{ month: string; total: number }>;
}

export interface AdminRedemptionQuery extends QueryParams {
  q?: string; status?: string; businessId?: string;
  from?: string; to?: string; page?: number; pageSize?: number;
}

/** Paisa → display string, e.g. "Rs. 1,250". Reuses the PKR formatter. */
export function formatPaisa(paisa?: number | null): string {
  return formatPKR(paisaToPkr(paisa) ?? 0);
}

/** Normalize a backend redemption record (paisa money) to the UI Redemption shape (whole PKR). */
export function mapRedemption(item: ApiRedemptionItem): UiRedemption {
  const bill = paisaToPkr(item.bill) ?? 0;
  const discount = paisaToPkr(item.discount) ?? 0;
  return {
    id: String(item.id ?? ''),
    dealTitle: item.deal?.title ?? '',
    businessName: item.business?.name ?? '',
    billAmount: bill,
    discountPercent: bill > 0 ? Math.round((discount / bill) * 100) : 0,
    discountAmount: discount,
    paidAmount: paisaToPkr(item.paid) ?? 0,
    savedAmount: paisaToPkr(item.saving) ?? 0,
    cashbackEarned: paisaToPkr(item.cashback ?? 0) ?? 0,
    pointsEarned: item.points ?? 0,
    createdAt: String(item.createdAt ?? ''),
    receiptNo: item.receiptNo ?? String(item.id ?? '').slice(0, 12).toUpperCase(),
  };
}

/** "YYYY-MM" → "Sep ’26"; anything else passes through. */
export function formatMonthLabel(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return month;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  return d.toLocaleString('en-PK', { month: 'short' }) + ' ’' + String(m[1]).slice(2);
}

export async function mintQrToken(dealId: string, branchId?: string): Promise<QrToken> {
  try {
    return await api<QrToken>('/redemptions/qr', { method: 'POST', body: { dealId, branchId } });
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      // Older backend naming (early docs/API.md draft).
      const alt = await api<{ token: string; expiresIn?: number }>('/redemptions/qr-token', {
        method: 'POST', body: { dealId },
      });
      return { token: alt.token, expiresIn: alt.expiresIn ?? 90 };
    }
    throw e;
  }
}

export async function validateQrToken(token: string): Promise<TokenValidation> {
  return api<TokenValidation>('/redemptions/validate', { method: 'POST', body: { token } });
}

/** Client-side display estimate for the scanner. Clearly labeled in the UI:
 *  the server recomputes everything at confirm time — this is never the source of truth. */
export function estimateDiscount(billPaisa: number, discountPercent: number, maxDiscountPaisa?: number): { discount: number; paid: number } {
  const raw = Math.floor((billPaisa * discountPercent) / 100);
  const discount = maxDiscountPaisa !== undefined ? Math.min(raw, maxDiscountPaisa) : raw;
  return { discount, paid: Math.max(0, billPaisa - discount) };
}

export async function confirmRedemption(token: string, billPaisa: number): Promise<RedemptionReceipt> {
  const r = await api<{
    redemptionId: string; bill: number; discount: number; paid: number;
    saving: number; cashback: number; points: number;
  }>('/redemptions/confirm', { method: 'POST', body: { token, billAmountPaisa: Math.round(billPaisa) } });
  return {
    redemptionId: r.redemptionId,
    bill: paisaToPkr(r.bill) ?? 0,
    discount: paisaToPkr(r.discount) ?? 0,
    paid: paisaToPkr(r.paid) ?? 0,
    saving: paisaToPkr(r.saving) ?? 0,
    cashback: paisaToPkr(r.cashback) ?? 0,
    points: r.points ?? 0,
  };
}

export async function fetchRedemptionHistory(page = 1, pageSize = 20): Promise<Page<UiRedemption>> {
  const data = await api<unknown>('/redemptions/history', { params: { page, pageSize } });
  const pg = unwrapPage<ApiRedemptionItem>(data, pageSize);
  return { ...pg, items: pg.items.map(mapRedemption) };
}

export async function fetchSavingsSummary(): Promise<ApiSavingsSummary> {
  interface SavingsSummaryRaw {
    total?: number; thisMonth?: number; thisYear?: number;
    byCategory?: Array<{ category?: string; categoryName?: string; total?: number }>;
    byMonth?: Array<{ month: string; total: number }>;
  }
  const data = await api<SavingsSummaryRaw>('/redemptions/savings/summary');
  return {
    total: data.total ?? 0,
    thisMonth: data.thisMonth ?? 0,
    thisYear: data.thisYear ?? 0,
    // Backend sends { categoryId, categoryName, total }; normalize to the UI shape.
    byCategory: (data.byCategory ?? []).map((c) => ({
      category: c.category ?? c.categoryName ?? 'Other',
      total: c.total ?? 0,
    })),
    byMonth: data.byMonth ?? [],
  };
}

export async function checkDealEligibility(dealId: string): Promise<DealEligibility> {
  const data = await api<{ eligible?: boolean; reasons?: string[] }>(`/redemptions/deal/${dealId}/eligibility`);
  return { eligible: data.eligible ?? true, reasons: data.reasons ?? [] };
}

export async function adminListRedemptions(params: AdminRedemptionQuery = {}): Promise<Page<ApiRedemptionItem>> {
  const data = await api<unknown>('/redemptions/admin', { params: params as QueryParams });
  return unwrapPage<ApiRedemptionItem>(data, Number(params.pageSize) || 15);
}
