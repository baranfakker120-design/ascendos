import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BASE_PRICE_CENTS,
  DEFAULT_SEAT_PRICE_CENTS,
  estimateMonthlyCents,
  formatEurFromCents,
  seatTotalCents,
} from './billingMath';

describe('Phase 11 — billing money (cents)', () => {
  it('uses default €20 + €2 pricing in cents', () => {
    expect(DEFAULT_BASE_PRICE_CENTS).toBe(2000);
    expect(DEFAULT_SEAT_PRICE_CENTS).toBe(200);
  });

  it('calculates monthly totals for the required seat matrix', () => {
    expect(estimateMonthlyCents(0)).toBe(2000);
    expect(estimateMonthlyCents(1)).toBe(2200);
    expect(estimateMonthlyCents(10)).toBe(4000);
    expect(estimateMonthlyCents(50)).toBe(12000);
    expect(estimateMonthlyCents(200)).toBe(42000);
    expect(estimateMonthlyCents(1000)).toBe(202000);
  });

  it('never uses float arithmetic for seat totals', () => {
    expect(seatTotalCents(200)).toBe(40000);
    expect(Number.isInteger(estimateMonthlyCents(7))).toBe(true);
  });

  it('clamps negative seats to zero', () => {
    expect(estimateMonthlyCents(-5)).toBe(2000);
  });

  it('formats EUR from cents without float drift', () => {
    expect(formatEurFromCents(42000, 'de-DE')).toBe('420,00 €');
    expect(formatEurFromCents(2200, 'en-US')).toBe('€22.00');
  });
});
