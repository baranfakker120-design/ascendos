/** Instagram Content Publishing (Phase 5C) — official Graph path only. */

export const IG_PUBLISH_SCOPE = 'instagram_business_content_publish' as const;

/** Same Graph version as Phase 5A profile fetch. */
export const IG_GRAPH_API_VERSION = 'v25.0' as const;

export const IG_GRAPH_HOST = 'https://graph.instagram.com' as const;

export type PublishAttemptStatus =
  | 'queued'
  | 'submitted'
  | 'published'
  | 'failed'
  | 'cancelled';

/** Named distinctly from content-generate ContentFormat — setup bundles share one scope. */
export type PublishContentFormat = 'story' | 'feed' | 'reel';

export type MediaKind = 'image' | 'video';

export type PublishErrorCode =
  | 'not_authenticated'
  | 'no_active_membership'
  | 'confirm_required'
  | 'draft_not_found'
  | 'draft_not_ready'
  | 'asset_not_found'
  | 'not_connected'
  | 'missing_token'
  | 'missing_publish_permission'
  | 'missing_media'
  | 'missing_caption'
  | 'signed_url_failed'
  | 'container_failed'
  | 'container_timeout'
  | 'container_error'
  | 'publish_failed'
  | 'already_in_progress'
  | 'unsupported_video_format'
  | 'video_file_too_large'
  | 'video_too_short'
  | 'video_too_long'
  | 'video_resolution_invalid'
  | 'video_aspect_invalid'
  | 'video_not_ready'
  | 'audio_unavailable'
  | 'internal_error';
