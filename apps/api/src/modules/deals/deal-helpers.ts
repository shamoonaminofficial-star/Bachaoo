import { BadRequestException } from '@nestjs/common';

/**
 * Pure, side-effect-free deal helpers. Kept separate from DealsService so they
 * are unit-testable without Prisma/Redis mocks.
 */

/** Badge thresholds — documented constants, tweakable in one place. */
export const BADGE_THRESHOLDS = {
  /** Redemptions in the trailing 7 days for the TRENDING badge. */
  TRENDING_REDEMPTIONS_7D: 25,
  /** Lifetime redemptions for the POPULAR badge. */
  POPULAR_REDEMPTIONS: 100,
  /** Age in days for the NEW badge. */
  NEW_DAYS: 7,
  /** Hours remaining for the LIMITED_TIME badge. */
  LIMITED_TIME_HOURS: 72,
} as const;

export const DEAL_BADGES = {
  EXCLUSIVE: 'EXCLUSIVE',
  MEMBERS_ONLY: 'MEMBERS_ONLY',
  TRENDING: 'TRENDING',
  NEW: 'NEW',
  LIMITED_TIME: 'LIMITED_TIME',
  POPULAR: 'POPULAR',
} as const;

export interface BadgeDeal {
  requiresMembership: boolean;
  eligiblePlanIds?: string[] | null;
  redemptionCount?: number | null;
  createdAt: Date | string;
  endDate: Date | string;
}

/**
 * Compute display badges for a deal. Pure: pass the trailing-7-day redemption
 * count in (the service fetches it in one grouped query for lists).
 */
export function computeBadges(deal: BadgeDeal, redemptions7d: number, now: Date = new Date()): string[] {
  const badges: string[] = [];
  const eligiblePlanIds = deal.eligiblePlanIds ?? [];

  if (deal.requiresMembership && eligiblePlanIds.length > 0) {
    badges.push(DEAL_BADGES.EXCLUSIVE);
  } else if (deal.requiresMembership) {
    badges.push(DEAL_BADGES.MEMBERS_ONLY);
  }

  if (redemptions7d >= BADGE_THRESHOLDS.TRENDING_REDEMPTIONS_7D) {
    badges.push(DEAL_BADGES.TRENDING);
  }

  const ageMs = now.getTime() - new Date(deal.createdAt).getTime();
  if (ageMs >= 0 && ageMs < BADGE_THRESHOLDS.NEW_DAYS * 24 * 60 * 60 * 1000) {
    badges.push(DEAL_BADGES.NEW);
  }

  const msLeft = new Date(deal.endDate).getTime() - now.getTime();
  if (msLeft > 0 && msLeft < BADGE_THRESHOLDS.LIMITED_TIME_HOURS * 60 * 60 * 1000) {
    badges.push(DEAL_BADGES.LIMITED_TIME);
  }

  if ((deal.redemptionCount ?? 0) >= BADGE_THRESHOLDS.POPULAR_REDEMPTIONS) {
    badges.push(DEAL_BADGES.POPULAR);
  }

  return badges;
}

export interface SavingsDeal {
  originalPrice?: number | null;
  dealPrice?: number | null;
}

export interface ComputedSavings {
  /** Exact saving in paisa — null unless it can be calculated accurately. */
  youSavePaisa: number | null;
  /** Member price in paisa — null when unknown. */
  memberPricePaisa: number | null;
}

/**
 * Server-side savings computation. We only report a saving when BOTH the
 * original and the member price are known integers — never estimated from a
 * bare percentage, and never trusted from the frontend.
 */
export function computeSavings(deal: SavingsDeal): ComputedSavings {
  const { originalPrice, dealPrice } = deal;
  if (
    typeof originalPrice === 'number' &&
    typeof dealPrice === 'number' &&
    Number.isInteger(originalPrice) &&
    Number.isInteger(dealPrice) &&
    originalPrice >= 0 &&
    dealPrice >= 0
  ) {
    return {
      youSavePaisa: Math.max(0, originalPrice - dealPrice),
      memberPricePaisa: dealPrice,
    };
  }
  return { youSavePaisa: null, memberPricePaisa: null };
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_CODES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

/** Normalize day codes to uppercase 3-letter form; throws on invalid codes. */
export function normalizeDaysAvailable(days?: string[]): string[] {
  if (!days || days.length === 0) return [];
  const out = days.map((d) => String(d).trim().toUpperCase().slice(0, 3));
  for (const d of out) {
    if (!DAY_CODES.includes(d)) {
      throw new BadRequestException({
        code: 'INVALID_DAYS_AVAILABLE',
        message: `Invalid day "${d}". Use ${DAY_CODES.join(', ')}.`,
      });
    }
  }
  return [...new Set(out)];
}

export interface PricingInput {
  dealType?: string;
  discountPercent?: number | null;
  originalPrice?: number | null;
  dealPrice?: number | null;
  maxDiscountAmount?: number | null;
  startDate?: string | Date;
  endDate?: string | Date;
  timeStart?: string | null;
  timeEnd?: string | null;
}

/**
 * Validate deal pricing/schedule sanity server-side. Throws 400 with a stable
 * error code on any inconsistency.
 */
export function validateDealPricing(input: PricingInput): void {
  const fail = (code: string, message: string): never => {
    throw new BadRequestException({ code, message });
  };

  if (input.startDate && input.endDate) {
    const start = new Date(input.startDate).getTime();
    const end = new Date(input.endDate).getTime();
    if (Number.isNaN(start) || Number.isNaN(end)) fail('INVALID_DATES', 'startDate/endDate must be valid dates.');
    if (end <= start) fail('INVALID_DATE_RANGE', 'endDate must be after startDate.');
  }

  if (input.discountPercent !== undefined && input.discountPercent !== null) {
    if (!Number.isInteger(input.discountPercent) || input.discountPercent < 0 || input.discountPercent > 100) {
      fail('INVALID_DISCOUNT_PERCENT', 'discountPercent must be an integer between 0 and 100.');
    }
  }

  const { originalPrice, dealPrice } = input;
  if (originalPrice !== undefined && originalPrice !== null && (!Number.isInteger(originalPrice) || originalPrice < 0)) {
    fail('INVALID_ORIGINAL_PRICE', 'originalPrice must be a non-negative integer (paisa).');
  }
  if (dealPrice !== undefined && dealPrice !== null && (!Number.isInteger(dealPrice) || dealPrice < 0)) {
    fail('INVALID_DEAL_PRICE', 'dealPrice must be a non-negative integer (paisa).');
  }
  if (
    originalPrice !== undefined && originalPrice !== null &&
    dealPrice !== undefined && dealPrice !== null &&
    dealPrice > originalPrice
  ) {
    fail('DEAL_PRICE_EXCEEDS_ORIGINAL', 'dealPrice cannot be greater than originalPrice.');
  }

  if (input.maxDiscountAmount !== undefined && input.maxDiscountAmount !== null) {
    if (!Number.isInteger(input.maxDiscountAmount) || input.maxDiscountAmount <= 0) {
      fail('INVALID_MAX_DISCOUNT', 'maxDiscountAmount must be a positive integer (paisa).');
    }
  }

  const { timeStart, timeEnd } = input;
  if ((timeStart && !timeEnd) || (!timeStart && timeEnd)) {
    fail('INVALID_TIME_WINDOW', 'timeStart and timeEnd must be provided together.');
  }
  if (timeStart && !TIME_RE.test(timeStart)) fail('INVALID_TIME_START', 'timeStart must be "HH:MM".');
  if (timeEnd && !TIME_RE.test(timeEnd)) fail('INVALID_TIME_END', 'timeEnd must be "HH:MM".');
}
