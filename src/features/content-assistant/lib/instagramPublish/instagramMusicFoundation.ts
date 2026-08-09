/**
 * Instagram Music capability + draft audio selection.
 *
 * Phase A: foundation types / kill-switch defaults.
 * Phase B: instagram_music_available becomes true only with a valid
 * Facebook Login for Business connection (Page + IG Professional + scopes + page token).
 *
 * Phase D: audio_publish_available when search-ready; attach happens in instagram-publish.
 */

import {
  resolveInstagramMusicAvailable as resolveFromFacebookConnection,
  type SafeFacebookBusinessConnection,
} from '../facebookBusinessConnect';
import { hasAudioSearchScopes } from '../instagramAudio';

/**
 * Static defaults — music stays off until a real Facebook Business connection
 * satisfies resolveInstagramMusicCapability().
 */
export const INSTAGRAM_MUSIC_CAPABILITY = {
  /** Default kill-switch — false until a valid FB connection is present at runtime. */
  instagram_music_available: false as const,
  music_api_available: false as const,
  facebook_login_connected: false as const,
  /** Phase C — enabled at runtime only with valid FB connection + Audio API scopes. */
  audio_search_available: false as const,
  /** Phase D — enabled at runtime with valid FB music connection + scopes. */
  audio_publish_available: false as const,
} as const;

export type InstagramMusicCapability = {
  instagram_music_available: boolean;
  music_api_available: boolean;
  facebook_login_connected: boolean;
  audio_search_available: boolean;
  audio_publish_available: boolean;
};

export type InstagramAudioType = 'music' | 'original_sound';

/**
 * Stored on content_drafts.instagram_audio_json.
 * Only fields needed for later Meta audio_configuration + UI display.
 */
export type InstagramAudioSelection = {
  audio_id: string;
  audio_type: InstagramAudioType;
  title?: string | null;
  artist?: string | null;
  audio_volume?: number | null;
  video_volume?: number | null;
};

/** Meta audio_configuration payload shape (not sent in Phase A/B). */
export type InstagramAudioConfiguration = {
  audio_id: string;
  audio_volume: number;
  video_volume: number;
};

/** Resolve music capability from a safe Facebook Business connection view. */
export function resolveInstagramMusicCapability(
  connection: SafeFacebookBusinessConnection | null | undefined
): InstagramMusicCapability {
  const facebookConnected = connection?.status === 'connected';
  const musicAvailable = connection?.instagramMusicAvailable === true;
  const searchAvailable = musicAvailable && hasAudioSearchScopes(connection?.scopes);
  return {
    instagram_music_available: musicAvailable,
    facebook_login_connected: facebookConnected,
    music_api_available: searchAvailable,
    audio_search_available: searchAvailable,
    audio_publish_available: searchAvailable,
  };
}

export function isInstagramMusicAvailable(
  capability: { instagram_music_available: boolean } = INSTAGRAM_MUSIC_CAPABILITY
): boolean {
  return capability.instagram_music_available === true;
}

/** Re-export connection eligibility helper for tests / shared use. */
export { resolveFromFacebookConnection as resolveMusicEligibilityFromConnectionFields };

function clampVolume(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/** Parse DB/API JSON into a typed selection; invalid/empty → null. */
export function parseInstagramAudioJson(raw: unknown): InstagramAudioSelection | null {
  if (raw == null) return null;
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === 'null' || trimmed === '{}') return null;
    try {
      obj = JSON.parse(trimmed) as unknown;
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const rec = obj as Record<string, unknown>;
  const audioId = typeof rec.audio_id === 'string' ? rec.audio_id.trim() : '';
  if (!audioId) return null;
  const audioType =
    rec.audio_type === 'music' || rec.audio_type === 'original_sound' ? rec.audio_type : null;
  if (!audioType) return null;

  const selection: InstagramAudioSelection = {
    audio_id: audioId,
    audio_type: audioType,
  };
  if (typeof rec.title === 'string' || rec.title === null) selection.title = rec.title;
  if (typeof rec.artist === 'string' || rec.artist === null) selection.artist = rec.artist;
  if (rec.audio_volume != null) selection.audio_volume = clampVolume(rec.audio_volume, 100);
  if (rec.video_volume != null) selection.video_volume = clampVolume(rec.video_volume, 100);
  return selection;
}

/** Serialize selection for DB storage; null clears the field. */
export function serializeInstagramAudioJson(
  selection: InstagramAudioSelection | null | undefined
): InstagramAudioSelection | null {
  if (!selection) return null;
  return parseInstagramAudioJson(selection);
}

/**
 * Gate for Meta audio_configuration payload construction.
 * Returns null when music publish is disabled or no valid selection — existing path unchanged.
 */
export function buildAudioConfigurationForPublish(params: {
  musicAvailable?: boolean;
  selection?: InstagramAudioSelection | null;
}): InstagramAudioConfiguration | null {
  const musicAvailable =
    params.musicAvailable ?? INSTAGRAM_MUSIC_CAPABILITY.instagram_music_available;
  if (!musicAvailable) return null;
  const selection = parseInstagramAudioJson(params.selection ?? null);
  if (!selection?.audio_id) return null;
  return {
    audio_id: selection.audio_id,
    audio_volume: clampVolume(selection.audio_volume ?? 100, 100),
    video_volume: clampVolume(selection.video_volume ?? 100, 100),
  };
}
