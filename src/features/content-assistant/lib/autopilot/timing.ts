/**
 * Mirror of edge timing helpers for unit tests (story count > 3).
 */
export const DEFAULT_FEED_TIMES = ['09:30', '13:00', '19:00'] as const;
export const DEFAULT_STORY_TIMES = [
  '08:15',
  '12:30',
  '17:45',
  '20:30',
  '10:00',
  '14:45',
  '16:15',
  '07:00',
  '18:30',
  '21:15',
] as const;

export function storyTimesForCount(count: number): string[] {
  const n = Math.max(0, Math.min(DEFAULT_STORY_TIMES.length, Math.round(count)));
  return [...DEFAULT_STORY_TIMES].slice(0, n).sort();
}

export function feedTimesForCount(count: number): string[] {
  const n = Math.max(0, Math.min(DEFAULT_FEED_TIMES.length, Math.round(count)));
  return [...DEFAULT_FEED_TIMES].slice(0, n);
}
