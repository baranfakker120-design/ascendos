import { describe, expect, it } from 'vitest';
import { isAutopilotPlanExhausted, nextAutopilotPeriod } from './continuation';

/**
 * Logical E2E contract for Autopilot (unit-level):
 * Activate → plan → cron claim/publish → exhausted → auto next 7-day plan.
 * No browser timers; continuation is server/cron only.
 */
describe('autopilot E2E continuation contract', () => {
  it('after all slots terminal, next period is prepared automatically', () => {
    const period = { start: '2026-08-11', end: '2026-08-17' };
    const slots = [
      { status: 'published' },
      { status: 'published' },
      { status: 'skipped' },
      { status: 'failed' },
    ];
    expect(
      isAutopilotPlanExhausted({
        periodEnd: period.end,
        todayYmd: '2026-08-17',
        slots,
      })
    ).toBe(true);

    const next = nextAutopilotPeriod('2026-08-17');
    expect(next).toEqual({ start: '2026-08-17', end: '2026-08-23' });
  });

  it('does not continue while open slots remain (cron still claims/publishes)', () => {
    expect(
      isAutopilotPlanExhausted({
        periodEnd: '2026-08-17',
        todayYmd: '2026-08-12',
        slots: [{ status: 'published' }, { status: 'ready' }],
      })
    ).toBe(false);
  });
});
