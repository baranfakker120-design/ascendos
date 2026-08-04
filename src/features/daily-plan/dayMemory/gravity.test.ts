import { describe, expect, it } from 'vitest';
import type { DailyPlanItem } from '@shared/types/domain';
import { daysIdle, pickGravityPriority, scoreFollowUpGravity } from './gravity';

describe('scoreFollowUpGravity', () => {
  const now = new Date('2026-08-04T12:00:00.000Z');

  it('boosts overdue follow-ups with long idle time into critical', () => {
    const reading = scoreFollowUpGravity({
      missionType: 'follow_up_overdue',
      engineScore: 20,
      lastEventAt: '2026-07-15T12:00:00.000Z',
      now,
    });
    expect(reading.idleDays).toBe(20);
    expect(reading.band).toBe('critical');
    expect(reading.score).toBeGreaterThan(20);
  });

  it('applies light band when idle is fresh', () => {
    const reading = scoreFollowUpGravity({
      missionType: 'presentation_pending',
      engineScore: 15,
      lastEventAt: '2026-08-03T12:00:00.000Z',
      now,
    });
    expect(reading.band).toBe('light');
  });
});

describe('daysIdle', () => {
  it('returns whole days since last event', () => {
    expect(daysIdle('2026-08-01T12:00:00.000Z', new Date('2026-08-04T12:00:00.000Z'))).toBe(3);
    expect(daysIdle(null, new Date())).toBeNull();
  });
});

describe('pickGravityPriority', () => {
  it('prefers heavier neglect over higher raw position', () => {
    const items = [
      {
        id: 'a',
        plan_id: 'p',
        contact_id: 'c1',
        mission_type: 'presentation_pending',
        title: 'Fresh',
        reason: '',
        score: 50,
        position: 0,
        status: 'pending',
        status_reason: null,
        resolved_at: null,
        created_at: '',
      },
      {
        id: 'b',
        plan_id: 'p',
        contact_id: 'c2',
        mission_type: 'follow_up_overdue',
        title: 'Heavy',
        reason: '',
        score: 20,
        position: 1,
        status: 'pending',
        status_reason: null,
        resolved_at: null,
        created_at: '',
      },
    ] as DailyPlanItem[];

    const map = new Map<string, string | null>([
      ['c1', '2026-08-03T12:00:00.000Z'],
      ['c2', '2026-07-10T12:00:00.000Z'],
    ]);
    expect(pickGravityPriority(items, map, new Date('2026-08-04T12:00:00.000Z'))?.id).toBe('b');
  });
});
