import type { LiveCoachingEvent } from './types';

/** Next relevant active event for Today — never returns a finished one-shot. */
export function pickTodayCoachingEvent(
  events: LiveCoachingEvent[],
  now: Date = new Date()
): LiveCoachingEvent | null {
  const active = events.filter((e) => e.active);
  if (active.length === 0) return null;
  const upcoming = active.filter((e) => {
    const end = new Date(e.starts_at).getTime() + e.duration_minutes * 60_000;
    return end >= now.getTime();
  });
  if (upcoming.length === 0) return null;
  const ranked = [...upcoming].sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
  );
  return ranked[0] ?? null;
}
