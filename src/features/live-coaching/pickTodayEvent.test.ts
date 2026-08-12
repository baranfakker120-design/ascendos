import { describe, expect, it } from 'vitest';
import { isLiveCoachingPresentable, pickTodayCoachingEvent } from './pickTodayEvent';
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
  it('prefers upcoming today over finished', () => {
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

  it('hides finished events after end (20:30 + 60m → gone at 21:31)', () => {
    // 18:30 UTC = 20:30 Berlin (CEST)
    const starts = '2026-08-12T18:30:00.000Z';
    const now = new Date('2026-08-12T19:31:00.000Z'); // 21:31 Berlin
    const ev = event({ id: 'gone', starts_at: starts, duration_minutes: 60 });
    expect(isLiveCoachingPresentable(ev, now)).toBe(false);
    expect(pickTodayCoachingEvent([ev], now)).toBeNull();
  });

  it('keeps live event during window', () => {
    const starts = '2026-08-12T18:30:00.000Z';
    const now = new Date('2026-08-12T18:45:00.000Z');
    const ev = event({ id: 'live', starts_at: starts, duration_minutes: 60 });
    expect(isLiveCoachingPresentable(ev, now)).toBe(true);
    expect(pickTodayCoachingEvent([ev], now)?.id).toBe('live');
  });

  it('does not show tomorrow event on today', () => {
    const now = new Date('2026-08-12T12:00:00.000Z');
    const tomorrow = event({ id: 'tmw', starts_at: '2026-08-13T18:30:00.000Z' });
    expect(isLiveCoachingPresentable(tomorrow, now)).toBe(false);
  });
});
