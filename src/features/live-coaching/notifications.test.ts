import { describe, expect, it } from 'vitest';
import { buildCoachingNotificationPlan, COACHING_REMINDER_T45_MS } from './notifications';

describe('buildCoachingNotificationPlan', () => {
  it('schedules publish + 45m + 5m when event is in the future', () => {
    const plan = buildCoachingNotificationPlan({
      eventId: 'e1',
      title: 'Weekly',
      startsAt: '2026-08-03T18:00:00.000Z',
      publishedAt: '2026-08-03T10:00:00.000Z',
      now: new Date('2026-08-03T10:00:00.000Z'),
    });
    expect(plan.map((p) => p.kind)).toEqual(['published', 't_minus_30', 't_minus_5']);
    const t45 = plan.find((p) => p.kind === 't_minus_30')!;
    expect(t45.scheduledFor.toISOString()).toBe(
      new Date(
        new Date('2026-08-03T18:00:00.000Z').getTime() - COACHING_REMINDER_T45_MS
      ).toISOString()
    );
  });

  it('skips past reminders', () => {
    const plan = buildCoachingNotificationPlan({
      eventId: 'e1',
      title: 'Weekly',
      startsAt: '2026-08-03T18:00:00.000Z',
      now: new Date('2026-08-03T17:58:00.000Z'),
    });
    expect(plan.map((p) => p.kind)).toEqual(['published']);
  });
});
