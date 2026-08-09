/**
 * Instagram Audio API — Phase C (search only).
 * Official Meta path: graph.facebook.com + Facebook Login User token.
 * No audio_configuration / publish here.
 */

export type InstagramAudioSearchType = 'music' | 'original_sound';

/** Permissions Meta lists for Instagram Audio API (Facebook Login). */
export const IG_AUDIO_SEARCH_SCOPES = ['instagram_basic', 'instagram_content_publish'] as const;

export interface InstagramAudioSearchItem {
  audio_id: string;
  audio_type: InstagramAudioSearchType;
  title: string | null;
  artist: string | null;
  duration_ms: number | null;
  cover_url: string | null;
  preview_url: string | null;
  ig_username: string | null;
}

export type InstagramAudioSearchErrorCode =
  | 'not_authenticated'
  | 'no_active_membership'
  | 'facebook_connection_missing'
  | 'facebook_connection_invalid'
  | 'missing_permission'
  | 'invalid_audio_type'
  | 'meta_api_error'
  | 'internal_error';

export function isInstagramAudioSearchType(value: unknown): value is InstagramAudioSearchType {
  return value === 'music' || value === 'original_sound';
}

export function hasAudioSearchScopes(scopes: string[] | null | undefined): boolean {
  const set = new Set((scopes ?? []).map((s) => s.trim()).filter(Boolean));
  return IG_AUDIO_SEARCH_SCOPES.every((s) => set.has(s));
}

export function missingAudioSearchScopes(scopes: string[] | null | undefined): string[] {
  const set = new Set((scopes ?? []).map((s) => s.trim()).filter(Boolean));
  return IG_AUDIO_SEARCH_SCOPES.filter((s) => !set.has(s));
}
