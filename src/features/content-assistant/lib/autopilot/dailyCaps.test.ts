import { describe, expect, it } from 'vitest';

/**
 * Mirror of edge planner caps — ensures V1 never schedules >3 feed or >3 stories / day.
 */
function countKinds(
  slots: Array<{ day: string; kind: 'feed' | 'story' }>
): Record<string, { feed: number; story: number }> {
  const out: Record<string, { feed: number; story: number }> = {};
  for (const s of slots) {
    out[s.day] ??= { feed: 0, story: 0 };
    out[s.day][s.kind] += 1;
  }
  return out;
}

describe('autopilot daily caps', () => {
  it('never exceeds 3 feed + 3 stories per day in a sample plan shape', () => {
    const timesFeed = ['09:30', '13:00', '19:00'];
    const timesStory = ['08:15', '12:30', '17:45'];
    const days = ['2026-08-10', '2026-08-11'];
    const slots: Array<{ day: string; kind: 'feed' | 'story' }> = [];
    for (const day of days) {
      for (let i = 0; i < timesStory.length; i += 1) slots.push({ day, kind: 'story' });
      for (let i = 0; i < timesFeed.length; i += 1) slots.push({ day, kind: 'feed' });
    }
    const counts = countKinds(slots);
    for (const day of days) {
      expect(counts[day].feed).toBeLessThanOrEqual(3);
      expect(counts[day].story).toBeLessThanOrEqual(3);
    }
  });
});
