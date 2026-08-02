import { describe, expect, it } from 'vitest';
import { AP_BADGE_SIZE_PX, apBadgeAriaLabel, formatApBadgeValue } from './ApBadge';

describe('ApBadge helpers', () => {
  it('kennt die Design-Freeze-Größen', () => {
    expect(AP_BADGE_SIZE_PX).toEqual({ sm: 40, md: 56, lg: 72 });
  });

  it('formatiert AP mit deutschem Tausenderpunkt', () => {
    expect(formatApBadgeValue(0)).toBe('0');
    expect(formatApBadgeValue(25)).toBe('25');
    expect(formatApBadgeValue(1250)).toBe('1.250');
    expect(formatApBadgeValue(30000)).toBe('30.000');
  });

  it('schneidet Nachkommastellen ab', () => {
    expect(formatApBadgeValue(99.9)).toBe('99');
  });

  it('liefert aria-label mit AP-Suffix', () => {
    expect(apBadgeAriaLabel(250)).toBe('250 AP');
    expect(apBadgeAriaLabel(15000)).toBe('15.000 AP');
  });
});
