import { describe, expect, it } from 'vitest';
import type { DailyPlanItem, MissionStatus } from '@shared/types/domain';
import { missionProgress, orderMissions } from './missionOrder';

function item(id: string, position: number, status: MissionStatus, resolved_at?: string) {
  return {
    id,
    plan_id: 'p',
    contact_id: null,
    mission_type: 'follow_up_overdue',
    title: id,
    reason: '',
    score: 50,
    position,
    status,
    status_reason: null,
    resolved_at: resolved_at ?? null,
    created_at: '',
  } as DailyPlanItem;
}

describe('orderMissions', () => {
  it('wählt die erste offene Mission als aktuelle', () => {
    const o = orderMissions([item('a', 1, 'pending'), item('b', 2, 'pending')]);
    expect(o.current?.id).toBe('a');
    expect(o.queue.map((i) => i.id)).toEqual(['b']);
    expect(o.dayComplete).toBe(false);
  });

  it('schiebt "Später heute" ans Ende, hält sie aber im Spiel', () => {
    const o = orderMissions([
      item('a', 1, 'deferred'),
      item('b', 2, 'pending'),
      item('c', 3, 'pending'),
    ]);
    expect(o.current?.id).toBe('b');
    expect(o.queue.map((i) => i.id)).toEqual(['c', 'a']);
  });

  it('rückt verschobene nach, wenn alle offenen erledigt sind', () => {
    const o = orderMissions([
      item('a', 1, 'done', '2026-07-23T10:00:00Z'),
      item('b', 2, 'deferred'),
    ]);
    expect(o.current?.id).toBe('b');
    expect(o.dayComplete).toBe(false);
  });

  it('meldet den Tag als abgeschlossen, wenn nichts mehr wartet', () => {
    const o = orderMissions([
      item('a', 1, 'done', '2026-07-23T10:00:00Z'),
      item('b', 2, 'skipped', '2026-07-23T11:00:00Z'),
    ]);
    expect(o.current).toBeNull();
    expect(o.dayComplete).toBe(true);
    expect(o.resolved.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('zählt Fortschritt ohne übersprungene Missionen', () => {
    const p = missionProgress([
      item('a', 1, 'done'),
      item('b', 2, 'skipped'),
      item('c', 3, 'pending'),
    ]);
    expect(p).toEqual({ done: 1, total: 2 });
  });
});
