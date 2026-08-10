import { describe, expect, it } from 'vitest';

/** Pure Ascend two-step contract (state, not timed double-click). */
function nextAscendAction(navigationExpanded: boolean): 'collapse' | 'open_coach' {
  return navigationExpanded ? 'collapse' : 'open_coach';
}

describe('Ascend nav collapse (additive)', () => {
  it('first tap collapses when expanded', () => {
    expect(nextAscendAction(true)).toBe('collapse');
  });

  it('second tap opens coach only when collapsed', () => {
    expect(nextAscendAction(false)).toBe('open_coach');
  });
});
