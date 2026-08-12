import { describe, expect, it } from 'vitest';
import { berlinCalendarDayOffset, berlinYmd } from './berlinTime';
import { formatCountdown, resolveLiveCoachingState } from './liveState';
import {
  isLiveCoachingPresentable,
  listPresentableCoachingEvents,
  pickTodayCoachingEvent,
} from './pickTodayEvent';
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

describe('isLiveCoachingPresentable / upcoming visibility', () => {
  it('shows a future coaching (same day later)', () => {
    const now = new Date('2026-08-12T10:00:00.000Z');
    const ev = event({ id: 'later', starts_at: '2026-08-12T19:15:00.000Z' });
    expect(isLiveCoachingPresentable(ev, now)).toBe(true);
  });

  it('shows coaching tomorrow (announced day before)', () => {
    // 12.08.2026 Berlin afternoon; event 13.08.2026 21:15 Berlin = 19:15 UTC (CEST)
    const now = new Date('2026-08-12T12:00:00.000Z');
    const tomorrow = event({
      id: 'warum',
      title: 'WARUM',
      starts_at: '2026-08-13T19:15:00.000Z',
      duration_minutes: 60,
    });
    expect(berlinYmd(now)).toBe('2026-08-12');
    expect(berlinYmd(new Date(tomorrow.starts_at))).toBe('2026-08-13');
    expect(berlinCalendarDayOffset(tomorrow.starts_at, now)).toBe(1);
    expect(isLiveCoachingPresentable(tomorrow, now)).toBe(true);
    expect(pickTodayCoachingEvent([tomorrow], now)?.id).toBe('warum');
  });

  it('shows coaching in 3 days', () => {
    const now = new Date('2026-08-12T12:00:00.000Z');
    const in3 = event({ id: 'd3', starts_at: '2026-08-15T19:15:00.000Z' });
    expect(berlinCalendarDayOffset(in3.starts_at, now)).toBe(3);
    expect(isLiveCoachingPresentable(in3, now)).toBe(true);
  });

  it('marks LIVE coaching presentable during the window', () => {
    const starts = '2026-08-12T18:30:00.000Z';
    const now = new Date('2026-08-12T18:45:00.000Z');
    const ev = event({ id: 'live', starts_at: starts, duration_minutes: 60 });
    expect(resolveLiveCoachingState({ startsAt: starts, durationMinutes: 60, now })).toBe('live');
    expect(isLiveCoachingPresentable(ev, now)).toBe(true);
    expect(pickTodayCoachingEvent([ev], now)?.id).toBe('live');
  });

  it('hides finished events after starts_at + duration (history stays caller-side)', () => {
    // 18:30 UTC = 20:30 Berlin (CEST); +60m ends 21:30 Berlin
    const starts = '2026-08-12T18:30:00.000Z';
    const now = new Date('2026-08-12T19:31:00.000Z'); // 21:31 Berlin
    const ev = event({ id: 'gone', starts_at: starts, duration_minutes: 60 });
    expect(isLiveCoachingPresentable(ev, now)).toBe(false);
    expect(pickTodayCoachingEvent([ev], now)).toBeNull();
  });

  it('hides inactive events even if in the future', () => {
    const now = new Date('2026-08-12T12:00:00.000Z');
    const ev = event({
      id: 'draft',
      starts_at: '2026-08-13T19:15:00.000Z',
      active: false,
    });
    expect(isLiveCoachingPresentable(ev, now)).toBe(false);
  });
});

describe('listPresentableCoachingEvents sorting', () => {
  it('prefers LIVE, then chronological upcoming', () => {
    const now = new Date('2026-08-12T18:45:00.000Z');
    const listed = listPresentableCoachingEvents(
      [
        event({ id: 'later', starts_at: '2026-08-15T19:00:00.000Z' }),
        event({ id: 'soon', starts_at: '2026-08-13T19:00:00.000Z' }),
        event({ id: 'live', starts_at: '2026-08-12T18:30:00.000Z', duration_minutes: 60 }),
        event({ id: 'done', starts_at: '2026-08-11T10:00:00.000Z', duration_minutes: 60 }),
      ],
      now
    );
    expect(listed.map((e) => e.id)).toEqual(['live', 'soon', 'later']);
  });

  it('sorts multiple future coachings by starts_at', () => {
    const now = new Date('2026-08-12T08:00:00.000Z');
    const listed = listPresentableCoachingEvents(
      [
        event({ id: 'c', starts_at: '2026-08-16T18:00:00.000Z' }),
        event({ id: 'a', starts_at: '2026-08-13T18:00:00.000Z' }),
        event({ id: 'b', starts_at: '2026-08-14T18:00:00.000Z' }),
      ],
      now
    );
    expect(listed.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(pickTodayCoachingEvent(listed, now)?.id).toBe('a');
  });
});

describe('Berlin timezone helpers', () => {
  it('uses Europe/Berlin calendar days around CEST midnight', () => {
    // 2026-08-12 22:30 UTC = 2026-08-13 00:30 Berlin
    const berlinNextDay = new Date('2026-08-12T22:30:00.000Z');
    expect(berlinYmd(berlinNextDay)).toBe('2026-08-13');

    const eventStart = '2026-08-13T19:15:00.000Z'; // 21:15 Berlin
    const dayBefore = new Date('2026-08-12T10:00:00.000Z');
    expect(berlinCalendarDayOffset(eventStart, dayBefore)).toBe(1);
    expect(berlinCalendarDayOffset(eventStart, berlinNextDay)).toBe(0);
  });
});

describe('formatCountdown (de)', () => {
  it('formats multi-day countdown in German parts', () => {
    const start = new Date('2026-08-13T19:15:00.000Z');
    const now = new Date('2026-08-12T04:28:00.000Z');
    expect(formatCountdown(start, now, 'de')).toMatch(/1 Tag \/ \d+ Std\. \/ \d+ Min\./);
  });
});
