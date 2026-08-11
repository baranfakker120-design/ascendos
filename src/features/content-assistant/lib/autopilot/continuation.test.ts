import { describe, expect, it } from 'vitest';
import {
  isAutopilotPlanExhausted,
  isPermanentAutopilotPublishError,
  nextAutopilotPeriod,
} from './continuation';

describe('autopilot plan continuation', () => {
  it('is not exhausted while ready/planned/publishing slots remain', () => {
    expect(
      isAutopilotPlanExhausted({
        periodEnd: '2026-08-17',
        todayYmd: '2026-08-11',
        slots: [{ status: 'published' }, { status: 'ready' }],
      })
    ).toBe(false);
    expect(
      isAutopilotPlanExhausted({
        periodEnd: '2026-08-17',
        todayYmd: '2026-08-18',
        slots: [{ status: 'publishing' }],
      })
    ).toBe(false);
  });

  it('is exhausted when all slots are terminal — triggers auto next period', () => {
    expect(
      isAutopilotPlanExhausted({
        periodEnd: '2026-08-17',
        todayYmd: '2026-08-11',
        slots: [
          { status: 'published' },
          { status: 'skipped' },
          { status: 'failed' },
          { status: 'cancelled' },
        ],
      })
    ).toBe(true);
  });

  it('empty active plan past period end is exhausted', () => {
    expect(
      isAutopilotPlanExhausted({
        periodEnd: '2026-08-10',
        todayYmd: '2026-08-11',
        slots: [],
      })
    ).toBe(true);
  });

  it('empty plan still in period waits (not exhausted)', () => {
    expect(
      isAutopilotPlanExhausted({
        periodEnd: '2026-08-17',
        todayYmd: '2026-08-11',
        slots: [],
      })
    ).toBe(false);
  });

  it('next period is 7 inclusive days', () => {
    expect(nextAutopilotPeriod('2026-08-11')).toEqual({
      start: '2026-08-11',
      end: '2026-08-17',
    });
  });

  it('classifies permanent publish errors', () => {
    expect(isPermanentAutopilotPublishError('draft_not_ready')).toBe(true);
    expect(isPermanentAutopilotPublishError('not_connected')).toBe(false);
    expect(isPermanentAutopilotPublishError('signed_url_failed')).toBe(false);
  });
});
