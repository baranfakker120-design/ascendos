import { describe, expect, it } from 'vitest';

/**
 * Mirror of edge planner daily structure (3 feed + 3 story times, no duplicate assets).
 * Edge: supabase/functions/_shared/content-autopilot/planner.ts
 */

const FEED = ['09:30', '13:00', '19:00'];
const STORY = ['08:15', '12:30', '17:45'];

function buildDaySlots(day: string, assetIds: string[]) {
  const reserved = new Set<string>();
  const slots: Array<{ day: string; kind: 'feed' | 'story'; hm: string; assetId: string | null }> =
    [];
  const queue = [...assetIds];
  const times: Array<{ kind: 'feed' | 'story'; hm: string }> = [
    ...STORY.map((hm) => ({ kind: 'story' as const, hm })),
    ...FEED.map((hm) => ({ kind: 'feed' as const, hm })),
  ];
  for (const t of times) {
    let picked: string | null = null;
    while (queue.length) {
      const id = queue.shift()!;
      if (!reserved.has(id)) {
        picked = id;
        reserved.add(id);
        break;
      }
    }
    slots.push({ day, kind: t.kind, hm: t.hm, assetId: picked });
  }
  return slots;
}

describe('autopilot planner shape', () => {
  it('plans exactly 3 feed + 3 story per day when assets suffice', () => {
    const assets = Array.from({ length: 20 }, (_, i) => `a${i}`);
    const slots = buildDaySlots('2026-08-11', assets);
    expect(slots.filter((s) => s.kind === 'feed')).toHaveLength(3);
    expect(slots.filter((s) => s.kind === 'story')).toHaveLength(3);
    expect(slots.every((s) => s.assetId)).toBe(true);
    const ids = slots.map((s) => s.assetId);
    expect(new Set(ids).size).toBe(6);
  });

  it('never assigns the same asset twice in one day plan', () => {
    const assets = Array.from({ length: 6 }, (_, i) => `a${i}`);
    const slots = buildDaySlots('2026-08-11', assets);
    const ids = slots.map((s) => s.assetId).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses distinct default times (no overlapping HH:mm)', () => {
    const all = [...FEED, ...STORY];
    expect(new Set(all).size).toBe(6);
  });
});
