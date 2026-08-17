/**
 * Autopilot start-flow helpers — local draft → persist-on-start.
 * Does not change planner/media intelligence.
 */

import {
  AUTOPILOT_DEFAULT_STORIES_PER_DAY,
  AUTOPILOT_STORY_COUNT_MAX,
  AUTOPILOT_STORY_COUNT_MIN,
  clampUserStoryCount,
  parseAutopilotPublishingMode,
  type AutopilotPublishingMode,
} from './publishingMode';

export { clampUserStoryCount };

export type AutopilotStartPrefs = {
  publishingMode: AutopilotPublishingMode;
  maxStoriesPerDay: number;
};

/** Stored DB value: keep existing numbers (incl. legacy 3). Missing/invalid → 4. */
export function resolveStoredStoryCount(stored: unknown): number {
  if (stored == null || stored === '') return AUTOPILOT_DEFAULT_STORIES_PER_DAY;
  const n = typeof stored === 'number' ? stored : Number(stored);
  if (!Number.isFinite(n)) return AUTOPILOT_DEFAULT_STORIES_PER_DAY;
  const rounded = Math.round(n);
  if (rounded < AUTOPILOT_STORY_COUNT_MIN) return AUTOPILOT_DEFAULT_STORIES_PER_DAY;
  return Math.min(AUTOPILOT_STORY_COUNT_MAX, rounded);
}

export function showsStoryCountControl(mode: AutopilotPublishingMode): boolean {
  return mode === 'stories' || mode === 'full' || mode === 'marked_stories';
}

export function buildAutopilotStartPayload(draft: AutopilotStartPrefs): AutopilotStartPrefs {
  return {
    publishingMode: parseAutopilotPublishingMode(draft.publishingMode),
    maxStoriesPerDay: clampUserStoryCount(draft.maxStoriesPerDay),
  };
}

export type AutopilotErrorI18nKey =
  | 'contentAssistant.autopilotNeedInstagram'
  | 'contentAssistant.autopilotNeedInstagramExpired'
  | 'contentAssistant.autopilotNeedAssets'
  | 'contentAssistant.autopilotActionFailed';

/** Map server error codes to concrete UI copy. Never invent secrets. */
export function mapAutopilotActionError(raw: string | null | undefined): AutopilotErrorI18nKey {
  const msg = (raw ?? '').toLowerCase();
  if (
    msg.includes('instagram_expired') ||
    msg.includes('instagram_reconnect') ||
    msg.includes('token_expired') ||
    msg.includes('oauth_expired')
  ) {
    return 'contentAssistant.autopilotNeedInstagramExpired';
  }
  if (msg.includes('instagram_not_connected') || msg.includes('instagram_not_configured')) {
    return 'contentAssistant.autopilotNeedInstagram';
  }
  if (
    msg.includes('below_min_assets') ||
    msg.includes('no_suitable_asset') ||
    msg.includes('insufficient_story_assets') ||
    msg.includes('asset_not_compatible')
  ) {
    return 'contentAssistant.autopilotNeedAssets';
  }
  return 'contentAssistant.autopilotActionFailed';
}

export function classifyInstagramConnection(params: {
  status?: string | null;
  igUserId?: string | null;
  tokenRef?: string | null;
  scopes?: string[] | null;
  lastError?: string | null;
}): 'ok' | 'instagram_not_connected' | 'instagram_expired' {
  const last = (params.lastError ?? '').toLowerCase();
  const expiredHint =
    last.includes('expired') ||
    last.includes('session has been invalidated') ||
    last.includes('code 190') ||
    last.includes('oauthexception');
  if (params.status === 'error' && expiredHint) return 'instagram_expired';
  if (params.status !== 'connected' || !params.igUserId || !params.tokenRef) {
    return 'instagram_not_connected';
  }
  const scopes = params.scopes ?? [];
  if (!scopes.includes('instagram_business_content_publish')) {
    return 'instagram_not_connected';
  }
  return 'ok';
}
