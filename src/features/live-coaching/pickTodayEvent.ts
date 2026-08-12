import { berlinYmd } from './berlinTime';
import { endsAt, resolveLiveCoachingState } from './liveState';
import type { LiveCoachingEvent } from './types';

/**
 * Whether an event should appear in active Heute / overlay presentation.
 * Finished events (past end) are excluded — history stays in DB.
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
  if (state === 'live') return true;
  if (state === 'countdown' && berlinYmd(start) === berlinYmd(now)) return true;
  return false;
}

/**
 * Next relevant active event for Today:
 * - live preferred
 * - then soonest countdown starting today (Europe/Berlin)
 * - finished never returned
 */
export function pickTodayCoachingEvent(
  events: LiveCoachingEvent[],
  now: Date = new Date()
): LiveCoachingEvent | null {
  const candidates = events.filter((e) => isLiveCoachingPresentable(e, now));
  if (candidates.length === 0) return null;

  const ranked = [...candidates].sort((a, b) => {
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

  return ranked[0] ?? null;
}
