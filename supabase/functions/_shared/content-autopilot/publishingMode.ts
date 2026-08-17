/**
 * Autopilot publishing modes — generation + publish caps.
 * Instagram Content Publishing API only. No Close Friends / audience / story @mentions.
 */

export const AUTOPILOT_PUBLISHING_MODES = [
  'stories',
  'feed',
  'full',
  'marked_stories',
] as const;

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

export function parseAutopilotPublishingModeOrNull(
  raw: unknown
): AutopilotPublishingMode | null {
  if (
    raw === 'stories' ||
    raw === 'feed' ||
    raw === 'full' ||
    raw === 'marked_stories'
  ) {
    return raw;
  }
  return null;
}

export function parseAutopilotPublishingMode(raw: unknown): AutopilotPublishingMode {
  return parseAutopilotPublishingModeOrNull(raw) ?? AUTOPILOT_DEFAULT_PUBLISHING_MODE;
}

/** Stored DB value only. Missing/invalid is not invented as `full`. */
export function readStoredPublishingMode(raw: unknown): AutopilotPublishingMode | null {
  return parseAutopilotPublishingModeOrNull(raw);
}

/**
 * Flatten edge/gateway bodies: JSON string, nested `body`, camelCase + snake_case.
 * Does not default a missing mode to `full`.
 */
export function normalizeAutopilotRequestBody(raw: unknown): Record<string, unknown> {
  let value: unknown = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const obj = value as Record<string, unknown>;
  const nested = obj.body;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return { ...obj, ...normalizeAutopilotRequestBody(nested) };
  }
  if (typeof nested === 'string') {
    return { ...obj, ...normalizeAutopilotRequestBody(nested) };
  }
  return obj;
}

export function extractPublishingPrefsFromBody(body: unknown): {
  publishingMode?: AutopilotPublishingMode;
  maxStoriesPerDay?: number;
} {
  const src = normalizeAutopilotRequestBody(body);
  const publishingMode = parseAutopilotPublishingModeOrNull(
    src.publishingMode ?? src.publishing_mode
  );
  const storiesRaw = src.maxStoriesPerDay ?? src.max_stories_per_day;
  const out: { publishingMode?: AutopilotPublishingMode; maxStoriesPerDay?: number } = {};
  if (publishingMode) out.publishingMode = publishingMode;
  if (storiesRaw !== undefined && storiesRaw !== null && storiesRaw !== '') {
    out.maxStoriesPerDay = clampUserStoryCount(storiesRaw, AUTOPILOT_DEFAULT_STORIES_PER_DAY);
  }
  return out;
}

export type PublishingPrefsPatchResult =
  | {
      ok: true;
      skip: boolean;
      patch: { publishing_mode: AutopilotPublishingMode; max_stories_per_day?: number };
    }
  | { ok: false; error: 'publishing_mode_required' };

/**
 * Compute the settings UPDATE for a start/resume/replan/update_settings body.
 * A valid request mode is never coerced to `full`. Missing mode is not written as `full`.
 */
export function resolvePublishingPrefsPatch(input: {
  body: unknown;
  storedMode: unknown;
  storedStories: unknown;
  requireMode?: boolean;
}): PublishingPrefsPatchResult {
  const extracted = extractPublishingPrefsFromBody(input.body);
  if (input.requireMode && !extracted.publishingMode) {
    return { ok: false, error: 'publishing_mode_required' };
  }
  const storedMode =
    parseAutopilotPublishingModeOrNull(input.storedMode) ?? AUTOPILOT_DEFAULT_PUBLISHING_MODE;
  const nextMode = extracted.publishingMode ?? storedMode;
  const patch: { publishing_mode: AutopilotPublishingMode; max_stories_per_day?: number } = {
    publishing_mode: nextMode,
  };
  if (extracted.maxStoriesPerDay !== undefined) {
    patch.max_stories_per_day = extracted.maxStoriesPerDay;
  }
  const sameMode = nextMode === storedMode;
  const sameStories =
    extracted.maxStoriesPerDay === undefined ||
    extracted.maxStoriesPerDay === Number(input.storedStories);
  const skip =
    (!extracted.publishingMode && extracted.maxStoriesPerDay === undefined) ||
    (sameMode && sameStories);
  return { ok: true, skip, patch };
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
