import {
  add,
  applyMaxDiscount,
  assertIntPaisa,
  cap,
  formatPKR,
  percentOf,
  subtract,
  toPaisa,
} from '../src/common/utils/money';

describe('money utils (integer paisa, no floats)', () => {
  describe('percentOf (basis points)', () => {
    it('computes 20% of Rs. 5,000 as 100000 paisa', () => {
      // 500000 paisa * 2000 bps / 10000
      expect(percentOf(500000, 2000)).toBe(100000);
    });

    it('floors fractional paisa (rounds down at the final step)', () => {
      // 999 * 3333 / 10000 = 332.9667 -> 332
      expect(percentOf(999, 3333)).toBe(332);
    });

    it('handles 100% and 0%', () => {
      expect(percentOf(12345, 10000)).toBe(12345);
      expect(percentOf(12345, 0)).toBe(0);
    });

    it('throws on non-integer or negative inputs', () => {
      expect(() => percentOf(10.5, 2000)).toThrow();
      expect(() => percentOf(-100, 2000)).toThrow();
      expect(() => percentOf(100, -5)).toThrow();
    });
  });

  describe('toPaisa', () => {
    it('converts rupees to paisa', () => {
      expect(toPaisa(5000)).toBe(500000);
    });

    it('rounds half-up at the boundary only', () => {
      expect(toPaisa(19.99)).toBe(1999);
      expect(toPaisa(19.995)).toBe(2000);
    });
  });

  describe('assertIntPaisa', () => {
    it('accepts non-negative integers', () => {
      expect(() => assertIntPaisa(0, 'x')).not.toThrow();
      expect(() => assertIntPaisa(2500, 'x')).not.toThrow();
    });

    it('rejects floats, NaN, non-numbers and negatives by default', () => {
      expect(() => assertIntPaisa(1.5, 'x')).toThrow();
      expect(() => assertIntPaisa(NaN, 'x')).toThrow();
      expect(() => assertIntPaisa('100' as unknown as number, 'x')).toThrow();
      expect(() => assertIntPaisa(-5, 'x')).toThrow();
    });

    it('allows negatives via the signed variant', () => {
      expect(() => assertIntPaisa(-5, 'x', true)).not.toThrow();
    });
  });

  describe('add / subtract', () => {
    it('adds integer amounts', () => {
      expect(add(100000, 50000)).toBe(150000);
    });

    it('subtracts and guards against negative results', () => {
      expect(subtract(100000, 40000)).toBe(60000);
      expect(() => subtract(10000, 40000)).toThrow();
      expect(subtract(10000, 40000, true)).toBe(-30000);
    });
  });

  describe('cap / applyMaxDiscount', () => {
    it('bounds a value above by max', () => {
      expect(cap(150000, 100000)).toBe(100000);
      expect(cap(50000, 100000)).toBe(50000);
    });

    it('is a no-op when max is undefined', () => {
      expect(cap(150000)).toBe(150000);
      expect(applyMaxDiscount(150000)).toBe(150000);
    });

    it('applies a discount ceiling', () => {
      expect(applyMaxDiscount(150000, 100000)).toBe(100000);
      expect(applyMaxDiscount(80000, 100000)).toBe(80000);
    });
  });

  describe('formatPKR', () => {
    it('formats whole rupees with en-PK grouping', () => {
      expect(formatPKR(500000)).toBe('Rs. 5,000');
      expect(formatPKR(12500000)).toBe('Rs. 125,000');
    });

    it('shows paisa only when present', () => {
      expect(formatPKR(1999)).toBe('Rs. 19.99');
      expect(formatPKR(0)).toBe('Rs. 0');
    });
  });
});
