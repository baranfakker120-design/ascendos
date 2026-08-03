import { describe, expect, it } from 'vitest';
import { pickTodayCoachingEvent } from './pickTodayEvent';
import type { LiveCoachingEvent } from './types';

function event(
  partial: Partial<LiveCoachingEvent> & Pick<LiveCoachingEvent, 'id' | 'starts_at'>
): LiveCoachingEvent {
  return {
    title: 'Coaching',
    subtitle: null,
    description: null,
    coach_name: 'Coach',
    category: 'Live Coaching',
    language: 'de',
    duration_minutes: 60,
    zoom_url: null,
    repeat_rule: 'none',
    media_type: 'image',
    media_path: null,
    media_url: null,
    active: true,
    published_at: null,
    published_by: null,
    replay_url: null,
    recording_url: null,
    guest_speakers: [],
    library_visible: false,
    created_by: null,
    updated_by: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...partial,
  };
}

describe('pickTodayCoachingEvent', () => {
  it('prefers upcoming over finished', () => {
    const now = new Date('2026-08-03T12:00:00.000Z');
    const picked = pickTodayCoachingEvent(
      [
        event({ id: 'old', starts_at: '2026-08-02T10:00:00.000Z' }),
        event({ id: 'next', starts_at: '2026-08-03T18:00:00.000Z' }),
      ],
      now
    );
    expect(picked?.id).toBe('next');
  });
});
