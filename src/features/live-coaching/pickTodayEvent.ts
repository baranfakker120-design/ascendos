import { endsAt, resolveLiveCoachingState } from './liveState';
import type { LiveCoachingEvent } from './types';

/**
 * Whether an event should appear in active Heute / Home presentation.
 * Active future and live events are shown even when starts_at is not today
 * (announced 2–3 days ahead). Finished events are excluded — history stays in DB.
 */
export function isLiveCoachingPresentable(
  event: LiveCoachingEvent,
  now: Date = new Date()
): boolean {
  if (!event.active) return false;
  const start = new Date(event.starts_at);
  const end = endsAt(start, event.duration_minutes);
  if (now.getTime() > end.getTime()) return false;

  const state = resolveLiveCoachingState({
    startsAt: start,
    durationMinutes: event.duration_minutes,
    now,
  });
  return state === 'live' || state === 'countdown';
}

/**
 * Presentable events sorted for Home:
 * 1. LIVE first
 * 2. then upcoming by starts_at ascending
 * Finished never included.
 */
export function listPresentableCoachingEvents(
  events: LiveCoachingEvent[],
  now: Date = new Date()
): LiveCoachingEvent[] {
  return events
    .filter((e) => isLiveCoachingPresentable(e, now))
    .sort((a, b) => {
      const aState = resolveLiveCoachingState({
        startsAt: a.starts_at,
        durationMinutes: a.duration_minutes,
        now,
      });
      const bState = resolveLiveCoachingState({
        startsAt: b.starts_at,
        durationMinutes: b.duration_minutes,
        now,
      });
      if (aState === 'live' && bState !== 'live') return -1;
      if (bState === 'live' && aState !== 'live') return 1;
      return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
    });
}

/**
 * Next relevant active event for Today / Home (primary slot).
 */
export function pickTodayCoachingEvent(
  events: LiveCoachingEvent[],
  now: Date = new Date()
): LiveCoachingEvent | null {
  return listPresentableCoachingEvents(events, now)[0] ?? null;
}
