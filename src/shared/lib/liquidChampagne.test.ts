import { describe, expect, it } from 'vitest';
import {
  LIQUID_MAX_OFFSET_PX,
  clampLiquidOffset,
  easeOutExpo,
  lerpLiquid,
  liquidStretch,
} from './liquidChampagne';

describe('liquidChampagne helpers', () => {
  it('clamps offset to max surface-tension radius', () => {
    const c = clampLiquidOffset(100, 0);
    expect(Math.hypot(c.x, c.y)).toBeCloseTo(LIQUID_MAX_OFFSET_PX, 5);
    expect(c.y).toBe(0);
  });

  it('leaves short offsets untouched', () => {
    expect(clampLiquidOffset(3, 4)).toEqual({ x: 3, y: 4 });
  });

  it('lerps toward the target', () => {
    expect(lerpLiquid(0, 10, 0.2)).toBeCloseTo(2, 5);
  });

  it('eases out exponentially', () => {
    expect(easeOutExpo(0)).toBe(0);
    expect(easeOutExpo(1)).toBe(1);
    expect(easeOutExpo(0.5)).toBeGreaterThan(0.9);
  });

  it('stretches along motion without extreme scale', () => {
    const s = liquidStretch(8, 0);
    expect(s.scaleX).toBeGreaterThan(1);
    expect(s.scaleY).toBeLessThanOrEqual(1);
    expect(s.scaleX).toBeLessThan(1.3);
  });
});
