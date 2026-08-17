import { describe, expect, it } from 'vitest';
import { feedTimesForCount, storyTimesForCount } from './timing';
import { resolveAutopilotSlotCaps } from './publishingMode';

describe('autopilot daily caps with publishing modes', () => {
  it('stories mode schedules exactly N story times and 0 feed', () => {
    for (const n of [2, 4, 6, 10]) {
      const caps = resolveAutopilotSlotCaps({
        publishingMode: 'stories',
        maxFeedPerDay: 3,
        maxStoriesPerDay: n,
      });
      expect(storyTimesForCount(caps.maxStoriesPerDay)).toHaveLength(n);
      expect(feedTimesForCount(caps.maxFeedPerDay)).toHaveLength(0);
    }
  });

  it('feed mode schedules feed only', () => {
    const caps = resolveAutopilotSlotCaps({
      publishingMode: 'feed',
      maxFeedPerDay: 3,
      maxStoriesPerDay: 8,
    });
    expect(feedTimesForCount(caps.maxFeedPerDay)).toHaveLength(3);
    expect(storyTimesForCount(caps.maxStoriesPerDay)).toHaveLength(0);
  });

  it('full mode can keep legacy 3+3', () => {
    const caps = resolveAutopilotSlotCaps({
      publishingMode: 'full',
      maxFeedPerDay: 3,
      maxStoriesPerDay: 3,
    });
    expect(feedTimesForCount(caps.maxFeedPerDay)).toHaveLength(3);
    expect(storyTimesForCount(caps.maxStoriesPerDay)).toHaveLength(3);
  });
});
