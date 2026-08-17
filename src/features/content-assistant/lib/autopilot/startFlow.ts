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
  parseAutopilotPublishingModeOrNull,
  type AutopilotPublishingMode,
} from './publishingMode';

export { clampUserStoryCount, parseAutopilotPublishingModeOrNull };

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

/** Wire format for content-autopilot invoke — camelCase + snake_case, never drop the mode. */
export function toAutopilotInvokeBody(
  action: string,
  prefs?: { publishingMode?: string; maxStoriesPerDay?: number }
): Record<string, unknown> {
  const body: Record<string, unknown> = { action };
  if (!prefs) return body;
  if (typeof prefs.publishingMode === 'string' && prefs.publishingMode) {
    body.publishingMode = prefs.publishingMode;
    body.publishing_mode = prefs.publishingMode;
  }
  if (prefs.maxStoriesPerDay !== undefined) {
    body.maxStoriesPerDay = prefs.maxStoriesPerDay;
    body.max_stories_per_day = prefs.maxStoriesPerDay;
  }
  return body;
}

export function selectDisplayedPublishingMode(
  draftMode: AutopilotPublishingMode | null,
  storedMode: unknown,
  eligibilityMode?: unknown
): AutopilotPublishingMode {
  if (draftMode) return draftMode;
  return (
    parseAutopilotPublishingModeOrNull(storedMode) ?? parseAutopilotPublishingMode(eligibilityMode)
  );
}

export function selectDisplayedStoryCount(
  draftStories: number | null,
  storedStories: unknown,
  eligibilityStories?: unknown
): number {
  if (draftStories != null) return draftStories;
  if (storedStories != null && storedStories !== '') return resolveStoredStoryCount(storedStories);
  return resolveStoredStoryCount(eligibilityStories);
}

export function rehydrateAutopilotDraft(params: {
  dirty: boolean;
  draftMode: AutopilotPublishingMode | null;
  draftStories: number | null;
  storedMode: unknown;
  storedStories: unknown;
}): { mode: AutopilotPublishingMode | null; stories: number | null } {
  if (params.dirty) {
    return { mode: params.draftMode, stories: params.draftStories };
  }
  const stored = parseAutopilotPublishingModeOrNull(params.storedMode);
  return {
    mode: stored ?? params.draftMode,
    stories:
      params.storedStories == null || params.storedStories === ''
        ? params.draftStories
        : resolveStoredStoryCount(params.storedStories),
  };
}

export function startPrefsPersistedInSettings(
  request: AutopilotStartPrefs,
  settings: { publishing_mode?: unknown; max_stories_per_day?: unknown } | null | undefined
): boolean {
  const mode = parseAutopilotPublishingModeOrNull(settings?.publishing_mode);
  if (mode !== request.publishingMode) return false;
  if (settings?.max_stories_per_day == null || settings.max_stories_per_day === '') return false;
  return resolveStoredStoryCount(settings.max_stories_per_day) === request.maxStoriesPerDay;
}

export type AutopilotStateSlice = {
  settings?: { publishing_mode?: unknown; max_stories_per_day?: unknown } | null;
  eligibility?: { publishingMode?: unknown; maxStoriesPerDay?: unknown };
  slots?: unknown;
};

export function isFullAutopilotState(payload: unknown): payload is AutopilotStateSlice {
  if (!payload || typeof payload !== 'object') return false;
  const row = payload as AutopilotStateSlice;
  return Boolean(row.settings) && Boolean(row.eligibility);
}

/**
 * Activate write-result wins over a subsequent get_state that still has stale `full`.
 * Does not invent stories — only copies publishing_mode / count that the mutation returned.
 */
export function mergeActivateWithGetState<T extends AutopilotStateSlice>(
  activated: AutopilotStateSlice,
  fetched: T
): T {
  const fromActivate = activated.settings;
  if (!fromActivate?.publishing_mode && fromActivate?.max_stories_per_day == null) {
    return fetched;
  }
  const mergedSettings = {
    ...(fetched.settings ?? {}),
    ...fromActivate,
  };
  const eligibility = fetched.eligibility
    ? {
        ...fetched.eligibility,
        ...(fromActivate.publishing_mode ? { publishingMode: fromActivate.publishing_mode } : {}),
        ...(fromActivate.max_stories_per_day != null
          ? { maxStoriesPerDay: fromActivate.max_stories_per_day }
          : {}),
      }
    : fetched.eligibility;
  return { ...fetched, settings: mergedSettings, eligibility };
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
