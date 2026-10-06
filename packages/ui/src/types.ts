/** Shared domain types mirrored from the backend API contracts. */

export interface Category { id: string; name: string; slug: string; icon?: string; image?: string; order: number; active: boolean; subcategories?: Subcategory[]; }
export interface Subcategory { id: string; name: string; slug: string; categoryId: string; }

export interface Business {
  id: string; name: string; slug: string; logo?: string; cover?: string;
  category: string; rating: number; reviewsCount: number; city: string; area: string;
  address: string; phone?: string; verified: boolean; activeOffers: number;
  memberDiscount?: string; distanceKm?: number; lat?: number; lng?: number;
}

export type DealBadge = 'EXCLUSIVE' | 'MEMBERS ONLY' | 'TRENDING' | 'NEW' | 'LIMITED TIME' | 'POPULAR';

export interface Deal {
  id: string; slug: string; title: string; shortDescription: string; description: string;
  image?: string; discountPercent: number; originalPrice?: number; memberPrice?: number;
  business: Pick<Business, 'id' | 'name' | 'slug' | 'logo' | 'verified' | 'city' | 'area'>;
  category: string; city: string; area: string; distanceKm?: number;
  badges: DealBadge[]; memberOnly: boolean; expiresAt: string; startsAt: string;
  terms: string[]; perUserLimit: number; usageLimit?: number; rating: number;
}

export interface MembershipPlan {
  id: string; name: string; description: string; regularPrice: number; salePrice: number;
  durationMonths: number; benefits: string[]; rewardMultiplier: number; cashbackPercent: number;
  featured: boolean; active: boolean;
}

export interface Membership {
  id: string; number: string; planName: string; status: 'active' | 'expired' | 'cancelled' | 'pending';
  joinedAt: string; expiresAt: string; holderName: string;
}

export interface Voucher {
  id: string; title: string; businessName: string; value: number; code: string;
  expiresAt: string; status: 'available' | 'redeemed' | 'expired' | 'cancelled'; kind: string;
}

export interface Redemption {
  id: string; dealTitle: string; businessName: string; billAmount: number;
  discountPercent: number; discountAmount: number; paidAmount: number; savedAmount: number;
  cashbackEarned: number; pointsEarned: number; createdAt: string; receiptNo: string;
}

export interface Paginated<T> { data: T[]; page: number; perPage: number; total: number; totalPages: number; }
