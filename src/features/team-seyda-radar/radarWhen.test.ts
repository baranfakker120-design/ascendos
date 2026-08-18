import { describe, expect, it } from 'vitest';
import { radarBerlinDayOffset, radarWhenKind } from './radarWhen';

describe('Radar Berlin when labels', () => {
  const now = new Date('2026-08-18T17:11:00.000Z');

  it('treats a Berlin-today timestamp as today', () => {
    expect(radarWhenKind('2026-08-18T08:00:00.000Z', now)).toBe('today');
    expect(radarBerlinDayOffset('2026-08-18T08:00:00.000Z', now)).toBe(0);
  });

  it('treats yesterday 18:45 Berlin as yesterday', () => {
    expect(radarWhenKind('2026-08-17T16:45:30.000Z', now)).toBe('yesterday');
    expect(radarBerlinDayOffset('2026-08-17T16:45:30.000Z', now)).toBe(-1);
  });

  it('falls back to date for older posts', () => {
    expect(radarWhenKind('2026-07-01T13:48:41.000Z', now)).toBe('date');
  });
});
