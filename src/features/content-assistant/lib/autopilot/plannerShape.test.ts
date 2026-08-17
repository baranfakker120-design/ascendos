import { describe, expect, it } from 'vitest';
import { feedTimesForCount, storyTimesForCount } from './timing';

/**
 * Mirror of edge planner daily structure with publishing-mode caps.
 */

function buildDaySlots(day: string, assetIds: string[], maxFeed: number, maxStories: number) {
  const reserved = new Set<string>();
  const slots: Array<{ day: string; kind: 'feed' | 'story'; hm: string; assetId: string | null }> =
    [];
  const queue = [...assetIds];
  const times: Array<{ kind: 'feed' | 'story'; hm: string }> = [
    ...storyTimesForCount(maxStories).map((hm) => ({ kind: 'story' as const, hm })),
    ...feedTimesForCount(maxFeed).map((hm) => ({ kind: 'feed' as const, hm })),
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
  it('plans exactly 3 feed + 3 story per day for legacy full caps', () => {
    const assets = Array.from({ length: 20 }, (_, i) => `a${i}`);
    const slots = buildDaySlots('2026-08-11', assets, 3, 3);
    expect(slots.filter((s) => s.kind === 'feed')).toHaveLength(3);
    expect(slots.filter((s) => s.kind === 'story')).toHaveLength(3);
    expect(slots.every((s) => s.assetId)).toBe(true);
    const ids = slots.map((s) => s.assetId);
    expect(new Set(ids).size).toBe(6);
  });

  it('Nur Stories default plans 4 distinct story slots and no feed', () => {
    const assets = Array.from({ length: 20 }, (_, i) => `a${i}`);
    const slots = buildDaySlots('2026-08-11', assets, 0, 4);
    expect(slots.filter((s) => s.kind === 'feed')).toHaveLength(0);
    expect(slots.filter((s) => s.kind === 'story')).toHaveLength(4);
    const ids = slots.map((s) => s.assetId);
    expect(new Set(ids).size).toBe(4);
  });

  it('never assigns the same asset twice in one day plan', () => {
    const assets = Array.from({ length: 6 }, (_, i) => `a${i}`);
    const slots = buildDaySlots('2026-08-11', assets, 3, 3);
    const ids = slots.map((s) => s.assetId).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses distinct default times (no overlapping HH:mm) for 4 stories', () => {
    const all = storyTimesForCount(4);
    expect(new Set(all).size).toBe(4);
  });
});
