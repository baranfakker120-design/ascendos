/**
 * Official Instagram Reels video requirements (IG User Media Reel Specifications).
 * Used server-side before creating a Graph media container.
 */

export type ReelValidationCode =
  | 'ok'
  | 'missing_media'
  | 'unsupported_video_format'
  | 'video_file_too_large'
  | 'video_too_short'
  | 'video_too_long'
  | 'video_resolution_invalid'
  | 'video_aspect_invalid'
  | 'video_not_ready';

/** Meta Reel specs — Instagram Graph / IG User Media. */
export const IG_REEL_VIDEO_SPECS = {
  allowedMimeTypes: ['video/mp4', 'video/quicktime'] as const,
  maxBytes: 300 * 1024 * 1024,
  minDurationSec: 3,
  maxDurationSec: 15 * 60,
  maxWidthPx: 1920,
  minAspectRatio: 0.01,
  maxAspectRatio: 10,
} as const;

/**
 * Instagram Audio API requires Facebook Login (Meta changelog).
 * AscendOS uses Business Login for Instagram → not available without OAuth redesign.
 */
export const IG_OFFICIAL_AUDIO_CAPABILITY = {
  availableWithCurrentOAuth: false as const,
  currentLoginPath: 'instagram_business_login',
  requiredLoginPath: 'facebook_login_for_business',
  endpoints: ['GET /ig_audio', 'GET /{ig_audio_id}'] as const,
} as const;

export function isInstagramPublishableVideoMime(mime: string | null | undefined): boolean {
  const m = (mime ?? '').trim().toLowerCase();
  return (IG_REEL_VIDEO_SPECS.allowedMimeTypes as readonly string[]).includes(m);
}

export function validateReelAssetForPublish(input: {
  mediaKind: 'image' | 'video' | null | undefined;
  /** Draft format — Stories use a shorter Meta duration/size cap. */
  format?: 'story' | 'feed' | 'reel' | null;
  mimeType?: string | null;
  byteSize?: number | null;
  widthPx?: number | null;
  heightPx?: number | null;
  durationSec?: number | null;
  requireDuration?: boolean;
}): ReelValidationCode {
  if (!input.mediaKind) return 'missing_media';
  if (input.format === 'reel' && input.mediaKind !== 'video') return 'missing_media';
  if (input.mediaKind !== 'video') return 'ok';

  const mime = (input.mimeType ?? '').trim().toLowerCase();
  if (!mime || !isInstagramPublishableVideoMime(mime)) return 'unsupported_video_format';

  // Story video: 100 MB / 60 s (Meta Story Video Specifications).
  // Reels / feed video as REELS: 300 MB / 15 min (Meta Reel Specifications).
  const isStory = input.format === 'story';
  const maxBytes = isStory ? 100 * 1024 * 1024 : IG_REEL_VIDEO_SPECS.maxBytes;
  const maxDuration = isStory ? 60 : IG_REEL_VIDEO_SPECS.maxDurationSec;

  const bytes = input.byteSize ?? null;
  if (bytes != null && (bytes <= 0 || bytes > maxBytes)) {
    return 'video_file_too_large';
  }

  const w = input.widthPx ?? null;
  const h = input.heightPx ?? null;
  if (w != null && h != null && w > 0 && h > 0) {
    if (w > IG_REEL_VIDEO_SPECS.maxWidthPx) return 'video_resolution_invalid';
    const ratio = w / h;
    if (
      ratio < IG_REEL_VIDEO_SPECS.minAspectRatio ||
      ratio > IG_REEL_VIDEO_SPECS.maxAspectRatio
    ) {
      return 'video_aspect_invalid';
    }
  }

  const duration = input.durationSec;
  if (input.requireDuration && (duration == null || !Number.isFinite(duration))) {
    return 'video_not_ready';
  }
  if (duration != null && Number.isFinite(duration)) {
    if (duration < IG_REEL_VIDEO_SPECS.minDurationSec) return 'video_too_short';
    if (duration > maxDuration) return 'video_too_long';
  }

  return 'ok';
}

export function reelValidationErrorMessage(code: ReelValidationCode): string {
  switch (code) {
    case 'unsupported_video_format':
      return 'Videoformat nicht unterstützt. Instagram Reels benötigen MP4 (oder MOV).';
    case 'video_file_too_large':
      return 'Videodatei zu groß (max. 300 MB laut Meta).';
    case 'video_too_short':
      return 'Video zu kurz (mindestens 3 Sekunden laut Meta).';
    case 'video_too_long':
      return 'Video zu lang (maximal 15 Minuten laut Meta).';
    case 'video_resolution_invalid':
      return 'Videoauflösung nicht unterstützt (max. 1920 px Breite laut Meta).';
    case 'video_aspect_invalid':
      return 'Seitenverhältnis nicht unterstützt (zwischen 0,01:1 und 10:1 laut Meta).';
    case 'video_not_ready':
      return 'Video-Metadaten noch nicht bereit. Bitte kurz warten und erneut versuchen.';
    case 'missing_media':
      return 'Kein Medium ausgewählt.';
    default:
      return 'Video-Validierung fehlgeschlagen.';
  }
}
