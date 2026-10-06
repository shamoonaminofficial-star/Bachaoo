import { applyMaxDiscount, assertIntPaisa, percentOf } from '../../common/utils/money';

/**
 * Server-side redemption math (Phase 6).
 *
 * PURE function: no DB, no Redis, no floats. Everything is integer paisa;
 * percentages are whole percents converted to basis points internally, and
 * every division rounds DOWN (floor). The frontend never sends computed
 * values — `confirmRedemption` calls this with the raw bill and the
 * deal/plan rows it loaded itself.
 */

export interface RedemptionMathInput {
  /** Final bill in integer paisa. */
  billAmountPaisa: number;
  dealType: string; // DealType enum value
  discountPercent?: number | null; // whole percent, e.g. 20
  maxDiscountAmountPaisa?: number | null; // cap on the discount, paisa
  originalPricePaisa?: number | null; // FLAT_OFF input
  dealPricePaisa?: number | null; // FLAT_OFF input
  cashbackPercent?: number | null; // plan cashback, whole percent, e.g. 5
  rewardMultiplierBps?: number | null; // 10000 = 1x
}

export interface RedemptionMathResult {
  billAmount: number;
  discountAmount: number;
  paidAmount: number;
  savingAmount: number;
  cashbackEarned: number;
  pointsEarned: number;
  /** True when maxDiscountAmountPaisa clipped the raw discount. */
  maxDiscountApplied: boolean;
}

export function computeRedemptionAmounts(input: RedemptionMathInput): RedemptionMathResult {
  assertIntPaisa(input.billAmountPaisa, 'billAmountPaisa');
  const bill = input.billAmountPaisa;

  let rawDiscount = 0;
  if (input.dealType === 'PERCENT_OFF') {
    const discountBps = Math.round(Number(input.discountPercent ?? 0) * 100);
    rawDiscount = percentOf(bill, discountBps);
  } else if (input.dealType === 'FLAT_OFF') {
    // FLAT_OFF: discount is the original-vs-deal price difference.
    rawDiscount =
      input.originalPricePaisa != null && input.dealPricePaisa != null
        ? Math.max(0, input.originalPricePaisa - input.dealPricePaisa)
        : 0;
  }
  // BUY_ONE_GET_ONE / FREE_ITEM / CASHBACK have no bill-percentage math here.

  const maxDiscount = input.maxDiscountAmountPaisa ?? undefined;
  const discountAmount = Math.min(rawDiscount, applyMaxDiscount(rawDiscount, maxDiscount), bill);
  const maxDiscountApplied = maxDiscount !== undefined && rawDiscount > maxDiscount;
  const paidAmount = bill - discountAmount;
  const savingAmount = discountAmount;

  // Cashback is earned on the PAID amount (what the customer actually spends),
  // not the pre-discount bill.
  const cashbackBps = input.cashbackPercent != null ? Math.round(Number(input.cashbackPercent) * 100) : 0;
  const cashbackEarned = cashbackBps > 0 ? percentOf(paidAmount, cashbackBps) : 0;

  // Points: floor(paid rupees) scaled by the plan's reward multiplier.
  // 100 paisa = Rs. 1, so floor(paidAmount / 100) = whole rupees paid.
  const multiplierBps = Number(input.rewardMultiplierBps ?? 10000);
  const basePoints = Math.floor(paidAmount / 100);
  const pointsEarned = multiplierBps > 0 ? percentOf(basePoints, multiplierBps) : 0;

  return {
    billAmount: bill,
    discountAmount,
    paidAmount,
    savingAmount,
    cashbackEarned,
    pointsEarned,
    maxDiscountApplied,
  };
}
