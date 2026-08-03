import type { LiveCoachingEvent } from './types';

/** Next relevant active event for Today (soonest not finished preferred). */
export function pickTodayCoachingEvent(
  events: LiveCoachingEvent[],
  now: Date = new Date()
): LiveCoachingEvent | null {
  const active = events.filter((e) => e.active);
  if (active.length === 0) return null;
  const ranked = [...active].sort((a, b) => {
    const aEnd = new Date(a.starts_at).getTime() + a.duration_minutes * 60_000;
    const bEnd = new Date(b.starts_at).getTime() + b.duration_minutes * 60_000;
    const aDone = aEnd < now.getTime();
    const bDone = bEnd < now.getTime();
    if (aDone !== bDone) return aDone ? 1 : -1;
    return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
  });
  return ranked[0] ?? null;
}
