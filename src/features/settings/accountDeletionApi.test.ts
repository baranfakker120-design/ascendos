import { describe, expect, it } from 'vitest';
import { daysUntilDeletion } from './accountDeletionMath';

describe('daysUntilDeletion', () => {
  it('returns 0 when missing or past', () => {
    expect(daysUntilDeletion(null)).toBe(0);
    expect(
      daysUntilDeletion('2020-01-01T00:00:00.000Z', new Date('2026-08-16T00:00:00.000Z'))
    ).toBe(0);
  });

  it('ceils remaining days within the 14-day window', () => {
    const now = new Date('2026-08-16T12:00:00.000Z');
    expect(daysUntilDeletion('2026-08-30T12:00:00.000Z', now)).toBe(14);
    expect(daysUntilDeletion('2026-08-17T00:00:00.000Z', now)).toBe(1);
  });
});
