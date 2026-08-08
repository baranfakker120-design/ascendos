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
  hook: string;
  caption: string;
  keywords: string[];
  hashtags: string[];
  cta: string;
  target_audience: string | null;
  posting_hint: string | null;
  llm_clean_flags: string[];
}

export const CONTENT_ASSETS_BUCKET = 'content-assets';
export const DEFAULT_DAILY_GENERATION_LIMIT = 25;
export const VISION_MODEL = 'google/gemini-2.5-flash';
export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const VISION_TIMEOUT_MS = 60_000;
