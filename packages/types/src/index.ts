// @bachatly/types — shared TypeScript contracts.
// Original content. String unions mirror the Prisma enums in
// packages/database/prisma/schema.prisma (single source of truth for
// the enum members; these unions keep non-Prisma consumers dependency-free).

/* ------------------------------------------------------------------ */
/* Money                                                               */
/* ------------------------------------------------------------------ */

/** Integer paisa (PKR × 100). Never use floats in money paths. */
export type Paisa = number;
/** Alias used at API boundaries for clarity. */
export type MoneyPaisa = Paisa;

export const CURRENCY_SYMBOL = 'Rs.';

/* ------------------------------------------------------------------ */
/* API envelope                                                        */
/* ------------------------------------------------------------------ */

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    timestamp: string;
    path?: string;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/* ------------------------------------------------------------------ */
/* Enum unions (mirror Prisma enums)                                   */
/* ------------------------------------------------------------------ */

export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED' | 'PENDING_VERIFICATION';

export type MembershipStatus = 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'PENDING_PAYMENT';

export type DealStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'REJECTED';

export type DealType = 'PERCENTAGE' | 'FLAT' | 'BUY_ONE_GET_ONE' | 'FREE_ITEM' | 'CASHBACK';

export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED' | 'CANCELLED';

export type PaymentGateway = 'STRIPE' | 'JAZZCASH' | 'EASYPASA' | 'BANK_TRANSFER' | 'MANUAL';

export type VoucherStatus = 'ACTIVE' | 'CLAIMED' | 'REDEEMED' | 'EXPIRED';

export type CashbackStatus = 'PENDING' | 'CREDITED' | 'EXPIRED' | 'CANCELLED';

export type ApplicationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ONBOARDED';

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export type SettlementStatus = 'PENDING' | 'PROCESSING' | 'PAID' | 'FAILED';

export type RedemptionStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED';

export type ReferralStatus = 'PENDING' | 'COMPLETED' | 'REWARDED' | 'EXPIRED';

export type StaffRole = 'OWNER' | 'MANAGER' | 'CASHIER';

export type NotificationChannel = 'EMAIL' | 'SMS' | 'WHATSAPP' | 'PUSH' | 'IN_APP';

/** The 11 platform roles (see docs/analysis/02-roles-permissions.md). */
export type RoleName =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'FINANCE'
  | 'SUPPORT'
  | 'MODERATOR'
  | 'CONTENT'
  | 'BUSINESS_OWNER'
  | 'BUSINESS_MANAGER'
  | 'BRANCH_STAFF'
  | 'CUSTOMER'
  | 'GUEST';

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

export interface JwtUser {
  id: string;
  email: string;
  roles: string[];
  permissions: string[];
}

/* ------------------------------------------------------------------ */
/* Domain results                                                      */
/* ------------------------------------------------------------------ */

export interface RedemptionReceipt {
  redemptionId: string;
  dealId: string;
  businessId: string;
  branchId: string;
  billAmount: MoneyPaisa;
  discountAmount: MoneyPaisa;
  payableAmount: MoneyPaisa;
  cashbackEarned: MoneyPaisa;
  confirmedAt: string;
}

export interface EligibilityResult {
  eligible: boolean;
  reasons: string[];
}
