export type ContentFormat = 'story' | 'feed' | 'reel';

export interface MembershipRow {
  id: string;
  org_id: string;
  role: string;
  status: string;
}

export interface AssetRow {
  id: string;
  org_id: string;
  owner_membership_id: string;
  scope: string;
  media_kind: 'image' | 'video';
  storage_path: string;
  file_name: string;
  mime_type: string;
  title: string | null;
  aspect_ratio: string | null;
  suggested_formats: string[] | null;
}

export interface KeywordDetail {
  keyword: string;
  why: string;
}

export interface HashtagDetail {
  tag: string;
  why: string;
}

export interface SlideAnalysis {
  index: number;
  summary: string;
  role: string;
  issue: string | null;
  fix: string | null;
}

export interface GenerationPayload {
  visual_summary: string;
  theme: string | null;
  audience_hint: string | null;
  mood: string | null;
  content_category: string | null;
  message: string | null;
  product_hint: string | null;
  uncertain: string[];
  content_type: ContentFormat;
  content_intent: string | null;
  core_message: string | null;
  problem: string | null;
  emotion: string | null;
  why_swipe: string | null;
  why_save: string | null;
  why_share: string | null;
  hook: string;
  hook_strength: 'strong' | 'ok' | 'weak' | null;
  hook_alternatives: string[];
  caption: string;
  keywords: string[];
  keyword_details: KeywordDetail[];
  hashtags: string[];
  hashtag_details: HashtagDetail[];
  cta: string;
  target_audience: string | null;
  posting_hint: string | null;
  optimization: string | null;
  slides: SlideAnalysis[];
  llm_clean_flags: string[];
}

/** Hard product rule: Instagram Content Assistant always returns exactly 5 hashtags. */
export const REQUIRED_HASHTAG_COUNT = 5;
/** Instagram Graph carousel hard max (children). Not the library or Autopilot pool size. */
export const CAROUSEL_MAX_ASSETS = 10;

export const CONTENT_ASSETS_BUCKET = 'content-assets';
export const DEFAULT_DAILY_GENERATION_LIMIT = 25;
export const VISION_MODEL = 'google/gemini-2.5-flash';
export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
/** OpenRouter call budget (after video bytes are already in memory). */
export const VISION_TIMEOUT_MS = 45_000;
/** Server-side download of the private storage object. */
export const VISION_VIDEO_FETCH_TIMEOUT_MS = 25_000;
/**
 * Max video size for AI analysis (base64 expands ~4/3).
 * Storage assets allow up to 50 MB; vision stays below that for edge memory.
 * ~30 MB iPhone MOVs (current production sample) must fit.
 */
export const VISION_VIDEO_MAX_BYTES = 35 * 1024 * 1024;
export const VISION_VIDEO_MIMES = ['video/mp4', 'video/webm', 'video/quicktime'] as const;

export type VisionVideoMime = (typeof VISION_VIDEO_MIMES)[number];

export type VisionErrorCode =
  | 'VIDEO_FETCH_FAILED'
  | 'VIDEO_TOO_LARGE'
  | 'VIDEO_UNSUPPORTED_MIME'
  | 'AI_PROVIDER_BAD_REQUEST'
  | 'AI_PROVIDER_AUTH_ERROR'
  | 'AI_PROVIDER_RATE_LIMIT'
  | 'AI_PROVIDER_TIMEOUT'
  | 'AI_PROVIDER_CREDITS_EXHAUSTED'
  | 'AI_PROVIDER_ERROR'
  | 'missing_openrouter_key';

/** Sanitized OpenRouter/upstream diagnostic fields — never secrets, URLs, or media. */
export type ProviderErrorDetails = {
  http_status: number | null;
  content_type: string | null;
  body_length: number;
  error_message?: string | null;
  error_code?: string | number | null;
  error_type?: string | null;
  provider_name?: string | null;
  /** Non-JSON bodies only; max 1000 chars, already sanitized. */
  body_preview?: string | null;
};
