import { describe, expect, it } from 'vitest';
import { endLocalInputValue, formatEndClock } from './berlinTime';
import { assertValidDuration } from './liveCoachingApi';

describe('duration end time', () => {
  it('computes end for 30/60/90 minutes', () => {
    const start = '2026-08-12T20:30';
    expect(endLocalInputValue(start, 30)).toBe('2026-08-12T21:00');
    expect(endLocalInputValue(start, 60)).toBe('2026-08-12T21:30');
    expect(endLocalInputValue(start, 90)).toBe('2026-08-12T22:00');
    expect(formatEndClock(start, 60)).toMatch(/21:30/);
  });

  it('validates duration bounds without snapping to 60', () => {
    expect(() => assertValidDuration(30)).not.toThrow();
    expect(() => assertValidDuration(45)).not.toThrow();
    expect(() => assertValidDuration(90)).not.toThrow();
    expect(() => assertValidDuration(0)).toThrow();
    expect(() => assertValidDuration(481)).toThrow();
  });
});
