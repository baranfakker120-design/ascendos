/** Instagram Content Autopilot V1 — shared contracts (no Facebook). */

export {
  AUTOPILOT_MAX_FEED_PER_DAY,
  AUTOPILOT_DEFAULT_STORIES_PER_DAY,
  AUTOPILOT_STORY_COUNT_MAX as AUTOPILOT_MAX_STORIES_PER_DAY,
} from './publishingMode.ts';

export const AUTOPILOT_MIN_ELIGIBLE_ASSETS = 10;
export const AUTOPILOT_DEFAULT_MAX_RETRIES = 3;
export const AUTOPILOT_ASSET_COOLDOWN_DAYS = 3;

export type AutopilotSlotKind = 'feed' | 'story';
export type AutopilotContentFormat = 'story' | 'feed' | 'reel';
export type AutopilotSlotStatus =
  | 'planned'
  | 'ready'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export type AutopilotPlanStatus = 'active' | 'completed' | 'cancelled';

export interface AutopilotEligibleAsset {
  id: string;
  scope: 'personal' | 'central' | string;
  media_kind: 'image' | 'video' | string;
  mime_type: string | null;
  storage_path: string | null;
  theme: string | null;
  keywords: string[] | null;
  suggested_formats: string[] | null;
  aspect_ratio: string | null;
  analysis_status: string | null;
  last_used_at: string | null;
  usage_count: number;
  created_at: string;
}

export interface AutopilotHistoryItem {
  assetId: string | null;
  category: string | null;
  theme: string | null;
  publishedAt: string;
  slotKind: AutopilotSlotKind | string;
}

export interface ScoredCandidate {
  asset: AutopilotEligibleAsset;
  score: number;
  category: string;
  reasons: string[];
}
