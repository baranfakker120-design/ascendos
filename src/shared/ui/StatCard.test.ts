import { describe, expect, it } from 'vitest';
import { formatStatNumber } from './StatCard';

describe('StatCard helpers', () => {
  it('formatiert Zahlen deutsch', () => {
    expect(formatStatNumber(0)).toBe('0');
    expect(formatStatNumber(15000)).toBe('15.000');
  });

  it('liefert Gedankenstrich bei ungültigen Werten', () => {
    expect(formatStatNumber(Number.NaN)).toBe('—');
    expect(formatStatNumber(Number.POSITIVE_INFINITY)).toBe('—');
  });
});
