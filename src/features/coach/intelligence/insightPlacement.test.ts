import { describe, expect, it } from 'vitest';
import { computeInsightPlacement } from './insightPlacement';

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON() {
      return {};
    },
  } as DOMRect;
}

describe('computeInsightPlacement', () => {
  const host = rect(0, 0, 800, 700);

  it('prefers the right side when there is room', () => {
    expect(computeInsightPlacement(rect(40, 200, 172, 204), host)).toBe('right');
  });

  it('falls back to the left when the right edge is tight', () => {
    expect(computeInsightPlacement(rect(600, 200, 172, 204), host)).toBe('left');
  });

  it('uses above when both sides are tight but top has room', () => {
    const narrowHost = rect(0, 0, 220, 700);
    expect(computeInsightPlacement(rect(20, 280, 180, 200), narrowHost)).toBe('above');
  });
});
