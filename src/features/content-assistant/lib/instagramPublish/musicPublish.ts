/**
 * Client mirror of Edge music publish planning (Phase D).
 * No tokens — pure decision helpers for tests + UI gates.
 */

export type MusicPublishErrorCode =
  'MUSIC_CONNECTION_REQUIRED' | 'MUSIC_AUDIO_INVALID' | 'MUSIC_NOT_SUPPORTED_FOR_FEED';

export type AudioConfigurationPayload = {
  audio_id: string;
  audio_volume: number;
  video_volume: number;
};

export type MusicPublishPlan =
  | { mode: 'none' }
  | {
      mode: 'attach';
      audioConfiguration: AudioConfigurationPayload;
      graphHost: 'https://graph.facebook.com';
    }
  | { mode: 'error'; error: MusicPublishErrorCode; message: string };

function clampVolume(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/**
 * Fix 1: music planning must not run when a prior publish already succeeded.
 * Edge returns alreadyPublished before any MUSIC_* validation or FB lookup.
 */
export function shouldPlanMusicPublish(params: {
  alreadyPublishedMediaId: string | null | undefined;
}): boolean {
  return !params.alreadyPublishedMediaId;
}

/**
 * Fix 2: content_facebook_business_connections is loaded only when the draft
 * has an audio selection. No-audio Feed/Reel publish must not depend on that table.
 */
export function shouldLoadFacebookConnectionForPublish(instagramAudioJson: unknown): boolean {
  return draftHasAudioSelection(instagramAudioJson);
}

export function draftHasAudioSelection(raw: unknown): boolean {
  if (raw == null) return false;
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === 'null' || trimmed === '{}') return false;
    try {
      obj = JSON.parse(trimmed) as unknown;
    } catch {
      return true;
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const rec = obj as Record<string, unknown>;
  if (typeof rec.audio_id === 'string' && rec.audio_id.trim()) return true;
  if (rec.audio_type != null) return true;
  return Object.keys(rec).length > 0;
}

export function parseAudioSelectionForPublish(raw: unknown):
  | {
      ok: true;
      selection: {
        audio_id: string;
        audio_type: 'music' | 'original_sound';
        audio_volume?: number | null;
        video_volume?: number | null;
      };
    }
  | { ok: false; error: 'MUSIC_AUDIO_INVALID' } {
  if (raw == null) return { ok: false, error: 'MUSIC_AUDIO_INVALID' };
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw) as unknown;
    } catch {
      return { ok: false, error: 'MUSIC_AUDIO_INVALID' };
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, error: 'MUSIC_AUDIO_INVALID' };
  }
  const rec = obj as Record<string, unknown>;
  const audioId = typeof rec.audio_id === 'string' ? rec.audio_id.trim() : '';
  if (!audioId || !/^\d+$/.test(audioId)) {
    return { ok: false, error: 'MUSIC_AUDIO_INVALID' };
  }
  const audioType =
    rec.audio_type === 'music' || rec.audio_type === 'original_sound' ? rec.audio_type : null;
  if (!audioType) return { ok: false, error: 'MUSIC_AUDIO_INVALID' };
  return {
    ok: true,
    selection: {
      audio_id: audioId,
      audio_type: audioType,
      audio_volume: rec.audio_volume == null ? null : clampVolume(rec.audio_volume, 100),
      video_volume: rec.video_volume == null ? null : clampVolume(rec.video_volume, 100),
    },
  };
}

export function buildAudioConfigurationPayload(selection: {
  audio_id: string;
  audio_volume?: number | null;
  video_volume?: number | null;
}): AudioConfigurationPayload {
  return {
    audio_id: selection.audio_id,
    audio_volume: clampVolume(selection.audio_volume ?? 100, 100),
    video_volume: clampVolume(selection.video_volume ?? 100, 100),
  };
}

export function isReelPublishProduct(params: {
  mediaKind: 'image' | 'video' | null | undefined;
  format: string | null | undefined;
}): boolean {
  return params.mediaKind === 'video' || params.format === 'reel';
}

export function assertFacebookMusicPublishConnection(params: {
  status: string | null | undefined;
  igUserId: string | null | undefined;
  scopes: string[] | null | undefined;
  hasPageToken: boolean;
}): { ok: true; igUserId: string } | { ok: false; error: 'MUSIC_CONNECTION_REQUIRED' } {
  if (params.status !== 'connected') return { ok: false, error: 'MUSIC_CONNECTION_REQUIRED' };
  if (!params.igUserId?.trim()) return { ok: false, error: 'MUSIC_CONNECTION_REQUIRED' };
  if (!params.hasPageToken) return { ok: false, error: 'MUSIC_CONNECTION_REQUIRED' };
  const set = new Set((params.scopes ?? []).map((s) => s.trim()).filter(Boolean));
  if (!set.has('instagram_basic') || !set.has('instagram_content_publish')) {
    return { ok: false, error: 'MUSIC_CONNECTION_REQUIRED' };
  }
  return { ok: true, igUserId: params.igUserId.trim() };
}

export function planMusicPublish(params: {
  instagramAudioJson: unknown;
  mediaKind: 'image' | 'video' | null | undefined;
  format: string | null | undefined;
  facebookConnection: {
    status: string | null | undefined;
    igUserId: string | null | undefined;
    scopes: string[] | null | undefined;
    hasPageToken: boolean;
  } | null;
}): MusicPublishPlan {
  if (!draftHasAudioSelection(params.instagramAudioJson)) {
    return { mode: 'none' };
  }
  if (!isReelPublishProduct({ mediaKind: params.mediaKind, format: params.format })) {
    return {
      mode: 'error',
      error: 'MUSIC_NOT_SUPPORTED_FOR_FEED',
      message: 'Instagram library audio can only be attached to Reels.',
    };
  }
  const parsed = parseAudioSelectionForPublish(params.instagramAudioJson);
  if (!parsed.ok) {
    return {
      mode: 'error',
      error: 'MUSIC_AUDIO_INVALID',
      message: 'Selected Instagram audio is missing or invalid.',
    };
  }
  const fb = assertFacebookMusicPublishConnection({
    status: params.facebookConnection?.status,
    igUserId: params.facebookConnection?.igUserId,
    scopes: params.facebookConnection?.scopes,
    hasPageToken: Boolean(params.facebookConnection?.hasPageToken),
  });
  if (!fb.ok) {
    return {
      mode: 'error',
      error: 'MUSIC_CONNECTION_REQUIRED',
      message:
        'Publishing with Instagram library audio requires a valid Facebook Login for Business connection.',
    };
  }
  return {
    mode: 'attach',
    audioConfiguration: buildAudioConfigurationPayload(parsed.selection),
    graphHost: 'https://graph.facebook.com',
  };
}
