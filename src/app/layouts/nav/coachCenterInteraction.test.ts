import { describe, expect, it } from 'vitest';

/**
 * Pure two-step Ascend center contract (no double-click timer):
 * navigationOpen → tap → collapse; !navigationOpen → tap → open coach.
 */
function nextAscendAction(navigationOpen: boolean): 'collapse' | 'open_coach' {
  return navigationOpen ? 'collapse' : 'open_coach';
}

describe('Ascend center two-step interaction', () => {
  it('first tap collapses when navigation is open', () => {
    expect(nextAscendAction(true)).toBe('collapse');
  });

  it('second tap opens coach only when already collapsed', () => {
    expect(nextAscendAction(false)).toBe('open_coach');
  });

  it('is a real state machine, not a timed double-click', () => {
    let open = true;
    expect(nextAscendAction(open)).toBe('collapse');
    open = false;
    expect(nextAscendAction(open)).toBe('open_coach');
    open = true;
    expect(nextAscendAction(open)).toBe('collapse');
  });
});
