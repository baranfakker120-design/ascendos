import { describe, expect, it } from 'vitest';
import {
  AUTOPILOT_DEFAULT_PUBLISHING_MODE,
  AUTOPILOT_DEFAULT_STORIES_PER_DAY,
  AUTOPILOT_STORY_COUNT_MAX,
  MARKED_STORIES_API,
  clampAutopilotStoryCount,
  isMarkedStoriesManualFallback,
  parseAutopilotPublishingMode,
  resolveAutopilotSlotCaps,
} from './publishingMode';

describe('autopilot publishing modes', () => {
  it('defaults unknown mode to full (backward compatible)', () => {
    expect(parseAutopilotPublishingMode(undefined)).toBe('full');
    expect(parseAutopilotPublishingMode(null)).toBe(AUTOPILOT_DEFAULT_PUBLISHING_MODE);
    expect(parseAutopilotPublishingMode('stories')).toBe('stories');
  });

  it('Nur Stories: no feed slots, keeps story count', () => {
    const caps = resolveAutopilotSlotCaps({
      publishingMode: 'stories',
      maxFeedPerDay: 3,
      maxStoriesPerDay: 4,
    });
    expect(caps).toEqual({
      maxFeedPerDay: 0,
      maxStoriesPerDay: 4,
      generateFeed: false,
      generateStories: true,
      autoPublish: true,
    });
  });

  it('Nur Feed: no story slots', () => {
    const caps = resolveAutopilotSlotCaps({
      publishingMode: 'feed',
      maxFeedPerDay: 3,
      maxStoriesPerDay: 6,
    });
    expect(caps.maxFeedPerDay).toBe(3);
    expect(caps.maxStoriesPerDay).toBe(0);
    expect(caps.generateStories).toBe(false);
  });

  it('Full keeps feed + stories', () => {
    const caps = resolveAutopilotSlotCaps({
      publishingMode: 'full',
      maxFeedPerDay: 3,
      maxStoriesPerDay: 3,
    });
    expect(caps.generateFeed).toBe(true);
    expect(caps.generateStories).toBe(true);
    expect(caps.maxStoriesPerDay).toBe(3);
  });

  it('Marked Stories prepares stories but never auto-publishes', () => {
    expect(MARKED_STORIES_API.autoPublishSupported).toBe(false);
    expect(isMarkedStoriesManualFallback('marked_stories')).toBe(true);
    const caps = resolveAutopilotSlotCaps({
      publishingMode: 'marked_stories',
      maxFeedPerDay: 3,
      maxStoriesPerDay: 4,
    });
    expect(caps.generateFeed).toBe(false);
    expect(caps.generateStories).toBe(true);
    expect(caps.autoPublish).toBe(false);
  });

  it('clamps story count 0..10 and defaults new value to 4', () => {
    expect(AUTOPILOT_DEFAULT_STORIES_PER_DAY).toBe(4);
    expect(clampAutopilotStoryCount(2)).toBe(2);
    expect(clampAutopilotStoryCount(6)).toBe(6);
    expect(clampAutopilotStoryCount(99)).toBe(AUTOPILOT_STORY_COUNT_MAX);
    expect(clampAutopilotStoryCount('x')).toBe(4);
  });

  it('preserves existing story count when resolving full/stories', () => {
    expect(
      resolveAutopilotSlotCaps({
        publishingMode: 'stories',
        maxFeedPerDay: 3,
        maxStoriesPerDay: 2,
      }).maxStoriesPerDay
    ).toBe(2);
  });
});
