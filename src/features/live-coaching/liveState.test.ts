import { describe, expect, it } from 'vitest';
import { formatCountdown, resolveLiveCoachingState } from './liveState';

describe('resolveLiveCoachingState', () => {
  const start = new Date('2026-08-03T18:00:00.000Z');

  it('countdown → live → finished', () => {
    expect(
      resolveLiveCoachingState({
        startsAt: start,
        durationMinutes: 60,
        now: new Date('2026-08-03T17:00:00.000Z'),
      })
    ).toBe('countdown');
    expect(
      resolveLiveCoachingState({
        startsAt: start,
        durationMinutes: 60,
        now: new Date('2026-08-03T18:30:00.000Z'),
      })
    ).toBe('live');
    expect(
      resolveLiveCoachingState({
        startsAt: start,
        durationMinutes: 60,
        now: new Date('2026-08-03T19:01:00.000Z'),
      })
    ).toBe('finished');
  });

  it('formats countdown', () => {
    expect(formatCountdown(start, new Date('2026-08-03T17:00:00.000Z'))).toMatch(/1h/);
  });
});
