import { computeRedemptionAmounts } from './redemption-math';

describe('computeRedemptionAmounts (Phase 6 — server-side bill math)', () => {
  it('computes a plain 20% discount in integer paisa', () => {
    const r = computeRedemptionAmounts({
      billAmountPaisa: 500000, // Rs. 5,000
      dealType: 'PERCENT_OFF',
      discountPercent: 20,
    });
    expect(r.discountAmount).toBe(100000); // Rs. 1,000
    expect(r.paidAmount).toBe(400000);
    expect(r.savingAmount).toBe(100000);
    expect(r.maxDiscountApplied).toBe(false);
  });

  it('enforces the max-discount cap', () => {
    const r = computeRedemptionAmounts({
      billAmountPaisa: 500000,
      dealType: 'PERCENT_OFF',
      discountPercent: 20, // raw Rs. 1,000
      maxDiscountAmountPaisa: 50000, // cap Rs. 500
    });
    expect(r.discountAmount).toBe(50000);
    expect(r.paidAmount).toBe(450000);
    expect(r.savingAmount).toBe(50000);
    expect(r.maxDiscountApplied).toBe(true);
  });

  it('rounds the discount DOWN (floor, never up)', () => {
    // 20% of Rs. 1,999.99 (199999 paisa) = 39999.8 -> must floor to 39999
    const r = computeRedemptionAmounts({
      billAmountPaisa: 199999,
      dealType: 'PERCENT_OFF',
      discountPercent: 20,
    });
    expect(r.discountAmount).toBe(39999);
    expect(r.paidAmount).toBe(199999 - 39999);
  });

  it('never discounts more than the bill', () => {
    const r = computeRedemptionAmounts({
      billAmountPaisa: 10000, // Rs. 100 bill
      dealType: 'PERCENT_OFF',
      discountPercent: 100,
    });
    expect(r.discountAmount).toBe(10000);
    expect(r.paidAmount).toBe(0);
  });

  it('FLAT_OFF uses the original-vs-deal price difference', () => {
    const r = computeRedemptionAmounts({
      billAmountPaisa: 200000,
      dealType: 'FLAT_OFF',
      originalPricePaisa: 100000,
      dealPricePaisa: 80000,
    });
    expect(r.discountAmount).toBe(20000);
    expect(r.paidAmount).toBe(180000);
  });

  it('FLAT_OFF is still capped at the bill amount', () => {
    const r = computeRedemptionAmounts({
      billAmountPaisa: 10000,
      dealType: 'FLAT_OFF',
      originalPricePaisa: 100000,
      dealPricePaisa: 80000, // Rs. 200 flat off a Rs. 100 bill
    });
    expect(r.discountAmount).toBe(10000);
    expect(r.paidAmount).toBe(0);
  });

  it('computes cashback on the PAID amount (not the bill)', () => {
    const r = computeRedemptionAmounts({
      billAmountPaisa: 500000, // Rs. 5,000 bill
      dealType: 'PERCENT_OFF',
      discountPercent: 20, // paid = Rs. 4,000
      cashbackPercent: 5, // 5% of paid
    });
    // 5% of 400000 = 20000 (NOT 5% of 500000 = 25000)
    expect(r.cashbackEarned).toBe(20000);
  });

  it('earns zero cashback when the plan has none', () => {
    const r = computeRedemptionAmounts({
      billAmountPaisa: 500000,
      dealType: 'PERCENT_OFF',
      discountPercent: 20,
      cashbackPercent: 0,
    });
    expect(r.cashbackEarned).toBe(0);
  });

  it('awards points per Rs. 100 of paid amount, scaled by the multiplier', () => {
    const r = computeRedemptionAmounts({
      billAmountPaisa: 500000,
      dealType: 'PERCENT_OFF',
      discountPercent: 20, // paid Rs. 4,000
      rewardMultiplierBps: 15000, // 1.5x
    });
    // floor(400000/100) = 4000 base points * 1.5 = 6000
    expect(r.pointsEarned).toBe(6000);
  });

  it('rounds points down with fractional multipliers', () => {
    const r = computeRedemptionAmounts({
      billAmountPaisa: 19999, // Rs. 199.99 paid (no discount)
      dealType: 'PERCENT_OFF',
      discountPercent: 0,
      rewardMultiplierBps: 10000, // 1x
    });
    // floor(19999/100) = 199 points
    expect(r.pointsEarned).toBe(199);
  });

  it('rejects non-integer or negative bills', () => {
    expect(() =>
      computeRedemptionAmounts({ billAmountPaisa: 199.99, dealType: 'PERCENT_OFF' }),
    ).toThrow();
    expect(() =>
      computeRedemptionAmounts({ billAmountPaisa: -100, dealType: 'PERCENT_OFF' }),
    ).toThrow();
  });

  it('treats a zero bill as zero everywhere (DTO @Min(1) is the real guard)', () => {
    const r = computeRedemptionAmounts({
      billAmountPaisa: 0,
      dealType: 'PERCENT_OFF',
      discountPercent: 20,
      cashbackPercent: 5,
    });
    expect(r).toMatchObject({
      discountAmount: 0,
      paidAmount: 0,
      savingAmount: 0,
      cashbackEarned: 0,
      pointsEarned: 0,
    });
  });
});
