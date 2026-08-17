/**
 * Autopilot publishing modes — generation + publish caps.
 * Instagram Content Publishing API only. No Close Friends / audience / story @mentions.
 */

export const AUTOPILOT_PUBLISHING_MODES = ['stories', 'feed', 'full', 'marked_stories'] as const;

export type AutopilotPublishingMode = (typeof AUTOPILOT_PUBLISHING_MODES)[number];

/** Existing plans without a mode keep feed+stories (current V1 behavior). */
export const AUTOPILOT_DEFAULT_PUBLISHING_MODE: AutopilotPublishingMode = 'full';

/** Default for NEW settings rows / Nur-Stories UX — never rewrite stored counts. */
export const AUTOPILOT_DEFAULT_STORIES_PER_DAY = 4;

/** Absolute cap (Instagram Graph daily volume is far higher; keep product-bounded). */
export const AUTOPILOT_STORY_COUNT_MAX = 10;
export const AUTOPILOT_STORY_COUNT_MIN = 1;

export const AUTOPILOT_MAX_FEED_PER_DAY = 3;

/**
 * Official Instagram Login Content Publishing API (graph.instagram.com):
 * Stories containers accept image_url / video_url + media_type=STORIES only.
 * Close Friends, story audience targeting, and story @mentions / user_tags
 * are NOT available on this path. No private API / scraping fallback.
 */
export const MARKED_STORIES_API = {
  autoPublishSupported: false,
  closeFriends: false,
  audienceTargeting: false,
  storyMentions: false,
  behavior: 'manual_fallback',
} as const;

export function parseAutopilotPublishingMode(raw: unknown): AutopilotPublishingMode {
  if (raw === 'stories' || raw === 'feed' || raw === 'full' || raw === 'marked_stories') {
    return raw;
  }
  return AUTOPILOT_DEFAULT_PUBLISHING_MODE;
}

export function clampAutopilotStoryCount(
  value: unknown,
  fallback = AUTOPILOT_DEFAULT_STORIES_PER_DAY
): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(AUTOPILOT_STORY_COUNT_MAX, Math.max(0, Math.round(n)));
}

/** User-facing story slots: 1–10. Does not rewrite stored 0 used as feed-mode cap. */
export function clampUserStoryCount(
  value: unknown,
  fallback = AUTOPILOT_DEFAULT_STORIES_PER_DAY
): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(AUTOPILOT_STORY_COUNT_MAX, Math.max(AUTOPILOT_STORY_COUNT_MIN, Math.round(n)));
}

export function clampAutopilotFeedCount(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return AUTOPILOT_MAX_FEED_PER_DAY;
  return Math.min(AUTOPILOT_MAX_FEED_PER_DAY, Math.max(0, Math.round(n)));
}

export type AutopilotSlotCaps = {
  maxFeedPerDay: number;
  maxStoriesPerDay: number;
  generateFeed: boolean;
  generateStories: boolean;
  /** False → prepare story drafts/slots but never Graph-publish. */
  autoPublish: boolean;
};

export function resolveAutopilotSlotCaps(params: {
  publishingMode: unknown;
  maxFeedPerDay: unknown;
  maxStoriesPerDay: unknown;
}): AutopilotSlotCaps {
  const mode = parseAutopilotPublishingMode(params.publishingMode);
  const stories = clampAutopilotStoryCount(params.maxStoriesPerDay);
  const feed = clampAutopilotFeedCount(params.maxFeedPerDay);

  if (mode === 'stories' || mode === 'marked_stories') {
    return {
      maxFeedPerDay: 0,
      maxStoriesPerDay: stories,
      generateFeed: false,
      generateStories: true,
      autoPublish: mode === 'stories',
    };
  }
  if (mode === 'feed') {
    return {
      maxFeedPerDay: feed,
      maxStoriesPerDay: 0,
      generateFeed: true,
      generateStories: false,
      autoPublish: true,
    };
  }
  return {
    maxFeedPerDay: feed,
    maxStoriesPerDay: stories,
    generateFeed: true,
    generateStories: true,
    autoPublish: true,
  };
}

export function isMarkedStoriesManualFallback(mode: unknown): boolean {
  return parseAutopilotPublishingMode(mode) === 'marked_stories';
}
