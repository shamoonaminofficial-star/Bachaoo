/**
 * Decimal-safe money math for Bachatly.
 *
 * RULE: never use floats for money. Every amount is an INTEGER number of paisa
 * (Rs. 1 = 100 paisa). Percentages are expressed in BASIS POINTS
 * (2000 bps = 20%) so percent math stays in integer arithmetic; rounding
 * (floor) happens once, at the final step.
 */

/** Throws unless n is an integer paisa amount. Negative rejected unless explicitly allowed. */
export function assertIntPaisa(
  n: unknown,
  name: string,
  allowNegative = false,
): asserts n is number {
  if (typeof n !== 'number' || !Number.isInteger(n)) {
    throw new Error(`${name} must be an integer paisa amount, got: ${String(n)}`);
  }
  if (!allowNegative && n < 0) {
    throw new Error(`${name} must be >= 0 paisa, got: ${n}`);
  }
}

/** Rs. 19.99 -> 1999 paisa (rounds half-up; use only at system boundaries, never for stored money). */
export function toPaisa(rupees: number): number {
  return Math.round(rupees * 100);
}

/**
 * percentOf(500000, 2000) === 100000  (20% of Rs. 5,000 = Rs. 1,000).
 * All-integer: floor((amount * bps) / 10000).
 */
export function percentOf(amountPaisa: number, percentBps: number): number {
  assertIntPaisa(amountPaisa, 'amountPaisa');
  assertIntPaisa(percentBps, 'percentBps');
  return Math.floor((amountPaisa * percentBps) / 10000);
}

export function add(a: number, b: number): number {
  assertIntPaisa(a, 'a');
  assertIntPaisa(b, 'b');
  return a + b;
}

/** subtract(a, b); throws if the result would go negative unless allowNegative is set. */
export function subtract(a: number, b: number, allowNegative = false): number {
  assertIntPaisa(a, 'a');
  assertIntPaisa(b, 'b');
  const result = a - b;
  if (!allowNegative && result < 0) {
    throw new Error(`subtraction would go negative: ${a} - ${b}`);
  }
  return result;
}

/** cap(value, max): value bounded above by max (no-op when max is undefined). */
export function cap(value: number, max?: number): number {
  assertIntPaisa(value, 'value');
  if (max === undefined || max === null) return value;
  assertIntPaisa(max, 'max');
  return Math.min(value, max);
}

/** applyMaxDiscount(discount, maxDiscountPaisa): enforce a discount ceiling. */
export function applyMaxDiscount(amount: number, max?: number): number {
  return cap(amount, max);
}

/** formatPKR(500000) === 'Rs. 5,000'; formatPKR(1999) === 'Rs. 19.99'. */
export function formatPKR(paisa: number): string {
  assertIntPaisa(paisa, 'paisa', true);
  const hasPaisa = Math.abs(paisa) % 100 !== 0;
  const rupees = paisa / 100;
  return (
    'Rs. ' +
    rupees.toLocaleString('en-PK', {
      minimumFractionDigits: hasPaisa ? 2 : 0,
      maximumFractionDigits: hasPaisa ? 2 : 0,
    })
  );
}
