import { describe, expect, it } from 'vitest';
import { clampProgressRatio, progressRatioToPercent } from './ProgressRing';

describe('ProgressRing helpers', () => {
  it('klemmt ratio auf 0..1', () => {
    expect(clampProgressRatio(0)).toBe(0);
    expect(clampProgressRatio(0.5)).toBe(0.5);
    expect(clampProgressRatio(1)).toBe(1);
    expect(clampProgressRatio(-1)).toBe(0);
    expect(clampProgressRatio(2)).toBe(1);
    expect(clampProgressRatio(Number.NaN)).toBe(0);
  });

  it('wandelt ratio in Prozent für aria-valuenow', () => {
    expect(progressRatioToPercent(0)).toBe(0);
    expect(progressRatioToPercent(0.5)).toBe(50);
    expect(progressRatioToPercent(1)).toBe(100);
    expect(progressRatioToPercent(1.5)).toBe(100);
    expect(progressRatioToPercent(-0.2)).toBe(0);
  });
});
