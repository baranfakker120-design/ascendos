import { describe, expect, it } from 'vitest';
import { formatEnergyAp, resolveEnergyCoreState } from './EnergyCore';

describe('EnergyCore helpers', () => {
  it('formatiert AP deutsch und nicht negativ', () => {
    expect(formatEnergyAp(0)).toBe('0');
    expect(formatEnergyAp(1250)).toBe('1.250');
    expect(formatEnergyAp(-5)).toBe('0');
  });

  it('leitet idle / filled / max ab', () => {
    expect(resolveEnergyCoreState(0, false)).toBe('idle');
    expect(resolveEnergyCoreState(0.4, false)).toBe('filled');
    expect(resolveEnergyCoreState(1, true)).toBe('max');
    expect(resolveEnergyCoreState(0, false, 'max')).toBe('max');
  });
});
