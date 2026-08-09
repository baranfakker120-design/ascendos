/**
 * Official Instagram Reels video requirements (IG User Media / Content Publishing).
 * Source: Meta IG User Media “Reel Specifications” — not invented.
 *
 * Validated here only when AscendOS already has the metadata (mime, size, dims, duration).
 * Codec/FPS/bitrate require binary probing and are left to Meta’s container processing.
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

/** Meta Reel specs (Instagram Graph / IG User Media). */
export const IG_REEL_VIDEO_SPECS = {
  /** MOV or MP4 containers only. */
  allowedMimeTypes: ['video/mp4', 'video/quicktime'] as const,
  /** 300 MB maximum. */
  maxBytes: 300 * 1024 * 1024,
  /** 3 seconds minimum. */
  minDurationSec: 3,
  /** 15 minutes maximum. */
  maxDurationSec: 15 * 60,
  /** Maximum columns (horizontal pixels). */
  maxWidthPx: 1920,
  /** Aspect ratio must be between 0.01:1 and 10:1. */
  minAspectRatio: 0.01,
  maxAspectRatio: 10,
  /** Recommended (not hard-fail). */
  recommendedAspectLabel: '9:16',
} as const;

/**
 * Instagram Audio API is documented for apps using Facebook Login, not
 * Business Login for Instagram (our Phase 5A/5C OAuth path).
 * Do not fake a music picker that cannot publish.
 */
export const IG_OFFICIAL_AUDIO_CAPABILITY = {
  availableWithCurrentOAuth: false as const,
  currentLoginPath: 'instagram_business_login',
  requiredLoginPath: 'facebook_login_for_business',
  changelogNote:
    'Instagram Audio API (GET /ig_audio, GET /{ig_audio_id}) is for apps using Facebook Login.',
  graphHostForAudio: 'graph.facebook.com',
  currentGraphHost: 'graph.instagram.com',
  canSearchMusic: false,
  canSelectOriginalSounds: false,
  canAttachLibraryAudioToReel: false,
  /** `audio_name` on REELS only renames original audio — not Music library selection. */
  audioNameRenamesOriginalOnly: true,
} as const;

export interface ReelAssetValidationInput {
  mediaKind: 'image' | 'video' | null | undefined;
  /** Draft format — Stories use a shorter Meta duration/size cap. */
  format?: 'story' | 'feed' | 'reel' | null;
  mimeType?: string | null;
  byteSize?: number | null;
  widthPx?: number | null;
  heightPx?: number | null;
  /** Seconds; omit when unknown — not treated as failure. */
  durationSec?: number | null;
  /** When true, duration must be present and within Meta bounds. */
  requireDuration?: boolean;
}

export function isInstagramPublishableVideoMime(mime: string | null | undefined): boolean {
  const m = (mime ?? '').trim().toLowerCase();
  return (IG_REEL_VIDEO_SPECS.allowedMimeTypes as readonly string[]).includes(m);
}

/**
 * Pre-publish checks for Reels / video containers.
 * Soft fields (duration/dims) are only enforced when provided or required.
 */
export function validateReelAssetForPublish(input: ReelAssetValidationInput): ReelValidationCode {
  if (!input.mediaKind) return 'missing_media';
  if (input.format === 'reel' && input.mediaKind !== 'video') return 'missing_media';
  if (input.mediaKind !== 'video') return 'ok';

  const mime = (input.mimeType ?? '').trim().toLowerCase();
  if (!mime) return 'unsupported_video_format';
  if (!isInstagramPublishableVideoMime(mime)) return 'unsupported_video_format';

  // Story video: 100 MB / 60 s · Reels: 300 MB / 15 min (official Meta specs).
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
    if (ratio < IG_REEL_VIDEO_SPECS.minAspectRatio || ratio > IG_REEL_VIDEO_SPECS.maxAspectRatio) {
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

/** Map validation codes → contentAssistant.* i18n key suffix. */
export function reelValidationI18nKey(code: ReelValidationCode): string {
  switch (code) {
    case 'missing_media':
      return 'igPublishNeedMedia';
    case 'unsupported_video_format':
      return 'igPublishVideoFormat';
    case 'video_file_too_large':
      return 'igPublishVideoTooLarge';
    case 'video_too_short':
      return 'igPublishVideoTooShort';
    case 'video_too_long':
      return 'igPublishVideoTooLong';
    case 'video_resolution_invalid':
      return 'igPublishVideoResolution';
    case 'video_aspect_invalid':
      return 'igPublishVideoAspect';
    case 'video_not_ready':
      return 'igPublishVideoNotReady';
    default:
      return 'igPublishFailed';
  }
}

/** Build official container fields for unit tests / Edge parity (no network). */
export function buildReelContainerFields(params: {
  mediaUrl: string;
  caption: string;
  shareToFeed?: boolean;
}): Record<string, string> {
  const fields: Record<string, string> = {
    media_type: 'REELS',
    video_url: params.mediaUrl,
  };
  if (params.caption) fields.caption = params.caption;
  if (params.shareToFeed !== false) fields.share_to_feed = 'true';
  return fields;
}
