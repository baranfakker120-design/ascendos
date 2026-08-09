/** Client mirrors of Phase 5C Graph publish helpers (no secrets). */

export const IG_PUBLISH_SCOPE = 'instagram_business_content_publish';
export const IG_GRAPH_API_VERSION = 'v25.0';

export type ContentFormat = 'story' | 'feed' | 'reel';
export type MediaKind = 'image' | 'video';

/** Official Meta IG Container status_code values. */
export type ContainerStatusCode =
  'EXPIRED' | 'ERROR' | 'FINISHED' | 'IN_PROGRESS' | 'PUBLISHED' | string;

export type ContainerReadiness = 'ready' | 'pending' | 'error' | 'expired';

export const CONTAINER_POLL_DEFAULTS = {
  initialDelayMs: 2000,
  intervalMs: 2000,
  maxAttempts: 30,
} as const;

export function connectionHasPublishScope(scopes: string[] | null | undefined): boolean {
  return (scopes ?? []).includes(IG_PUBLISH_SCOPE);
}

export function classifyContainerStatus(statusCode: string | null | undefined): ContainerReadiness {
  const code = String(statusCode ?? '')
    .trim()
    .toUpperCase();
  if (code === 'FINISHED' || code === 'PUBLISHED') return 'ready';
  if (code === 'ERROR') return 'error';
  if (code === 'EXPIRED') return 'expired';
  return 'pending';
}

export function pollConfigForMedia(mediaKind: MediaKind): {
  initialDelayMs: number;
  intervalMs: number;
  maxAttempts: number;
} {
  if (mediaKind === 'video') {
    return { initialDelayMs: 3000, intervalMs: 3000, maxAttempts: 40 };
  }
  return { ...CONTAINER_POLL_DEFAULTS };
}

/**
 * Testable poll loop — mirrors Edge `waitForContainerReady`.
 * `getStatus` returns Meta `status_code` strings in sequence.
 */
export async function waitForContainerReady(params: {
  getStatus: () => Promise<string>;
  mediaKind?: MediaKind;
  initialDelayMs?: number;
  intervalMs?: number;
  maxAttempts?: number;
  sleepFn?: (ms: number) => Promise<void>;
}): Promise<{ statusCode: string; attempts: number; published: boolean }> {
  const defaults = pollConfigForMedia(params.mediaKind ?? 'image');
  const initialDelayMs = params.initialDelayMs ?? defaults.initialDelayMs;
  const intervalMs = params.intervalMs ?? defaults.intervalMs;
  const maxAttempts = params.maxAttempts ?? defaults.maxAttempts;
  const sleepFn = params.sleepFn ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  if (initialDelayMs > 0) await sleepFn(initialDelayMs);

  for (let i = 0; i < maxAttempts; i++) {
    const statusCode = await params.getStatus();
    const readiness = classifyContainerStatus(statusCode);
    if (readiness === 'ready') {
      return { statusCode, attempts: i + 1, published: false };
    }
    if (readiness === 'error') throw new Error('container_error');
    if (readiness === 'expired') throw new Error('container_expired');
    if (i < maxAttempts - 1) await sleepFn(intervalMs);
  }
  throw new Error('container_timeout');
}

/** Simulate publish pipeline decisions for unit tests (no network). */
export async function runPublishPipeline(params: {
  statusSequence: string[];
  mediaKind?: MediaKind;
  alreadyPublishedMediaId?: string | null;
  sleepFn?: (ms: number) => Promise<void>;
  initialDelayMs?: number;
  intervalMs?: number;
  maxAttempts?: number;
}): Promise<{
  published: boolean;
  mediaId: string | null;
  mediaPublishCalled: boolean;
  error?: string;
}> {
  if (params.alreadyPublishedMediaId) {
    return {
      published: true,
      mediaId: params.alreadyPublishedMediaId,
      mediaPublishCalled: false,
    };
  }

  let idx = 0;
  let mediaPublishCalled = false;
  try {
    await waitForContainerReady({
      mediaKind: params.mediaKind ?? 'image',
      initialDelayMs: params.initialDelayMs ?? 0,
      intervalMs: params.intervalMs ?? 0,
      maxAttempts: params.maxAttempts ?? params.statusSequence.length + 2,
      sleepFn: params.sleepFn ?? (async () => undefined),
      getStatus: async () => {
        const code = params.statusSequence[Math.min(idx, params.statusSequence.length - 1)]!;
        idx += 1;
        return code;
      },
    });
    mediaPublishCalled = true;
    return { published: true, mediaId: 'media-test-1', mediaPublishCalled };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'publish_failed';
    return { published: false, mediaId: null, mediaPublishCalled, error };
  }
}

export function resolveMediaProduct(params: { mediaKind: MediaKind; format: ContentFormat }): {
  mediaType: 'IMAGE' | 'REELS' | 'STORIES' | null;
  useImageUrl: boolean;
  useVideoUrl: boolean;
  shareToFeed: boolean;
} {
  const { mediaKind, format } = params;
  if (format === 'story') {
    return {
      mediaType: 'STORIES',
      useImageUrl: mediaKind === 'image',
      useVideoUrl: mediaKind === 'video',
      shareToFeed: false,
    };
  }
  if (mediaKind === 'video' || format === 'reel') {
    return {
      mediaType: 'REELS',
      useImageUrl: false,
      useVideoUrl: true,
      shareToFeed: true,
    };
  }
  return { mediaType: null, useImageUrl: true, useVideoUrl: false, shareToFeed: false };
}

/** Pure helper mirroring Edge container field assembly (no network / no tokens). */
export function buildMediaContainerFields(params: {
  mediaKind: MediaKind;
  format: ContentFormat;
  mediaUrl: string;
  caption: string;
  audioConfiguration?: {
    audio_id: string;
    audio_volume: number;
    video_volume: number;
  } | null;
}): Record<string, string> {
  const product = resolveMediaProduct({
    mediaKind: params.mediaKind,
    format: params.format,
  });
  const fields: Record<string, string> = {};
  if (product.useImageUrl) fields.image_url = params.mediaUrl;
  if (product.useVideoUrl) fields.video_url = params.mediaUrl;
  if (product.mediaType) fields.media_type = product.mediaType;
  if (product.shareToFeed) fields.share_to_feed = 'true';
  if (params.caption && product.mediaType !== 'STORIES') {
    fields.caption = params.caption;
  }
  if (params.audioConfiguration && product.mediaType === 'REELS') {
    fields.audio_configuration = JSON.stringify({
      audio_id: params.audioConfiguration.audio_id,
      audio_volume: params.audioConfiguration.audio_volume,
      video_volume: params.audioConfiguration.video_volume,
    });
  }
  return fields;
}

export function buildPublishCaption(params: {
  caption: string | null | undefined;
  hashtags?: string[] | null;
  cta?: string | null;
}): string {
  const body = (params.caption ?? '').trim();
  const cta = (params.cta ?? '').trim();
  const tags = (params.hashtags ?? [])
    .map((h) => h.trim())
    .filter(Boolean)
    .map((h) => (h.startsWith('#') ? h : `#${h}`))
    .join(' ');
  const parts: string[] = [];
  if (body) parts.push(body);
  if (cta) parts.push(cta);
  if (tags) parts.push(tags);
  return parts.join('\n\n');
}

/** Map Edge error codes to i18n-friendly keys (suffix after contentAssistant.). */
export function publishErrorI18nKey(error: string | undefined): string {
  switch (error) {
    case 'confirm_required':
      return 'igPublishNeedConfirm';
    case 'not_connected':
      return 'igPublishNeedConnect';
    case 'draft_not_ready':
      return 'igPublishNeedPrepare';
    case 'missing_media':
    case 'asset_not_found':
      return 'igPublishNeedMedia';
    case 'missing_caption':
      return 'igPublishNeedCaption';
    case 'missing_publish_permission':
      return 'igPublishNeedPermission';
    case 'already_in_progress':
      return 'igPublishInProgress';
    case 'container_timeout':
      return 'igPublishContainerTimeout';
    case 'container_error':
    case 'container_expired':
    case 'container_failed':
      return 'igPublishContainerFailed';
    case 'publish_failed':
      return 'igPublishFailed';
    case 'missing_token':
      return 'igPublishNeedReconnect';
    case 'signed_url_failed':
      return 'igPublishMediaUrlFailed';
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
    case 'audio_unavailable':
      return 'igAudioUnavailable';
    case 'MUSIC_CONNECTION_REQUIRED':
      return 'igMusicConnectionRequired';
    case 'MUSIC_AUDIO_INVALID':
      return 'igMusicAudioInvalid';
    case 'MUSIC_NOT_SUPPORTED_FOR_FEED':
      return 'igMusicFeedBlocked';
    case 'MUSIC_META_REJECTED':
      return 'igMusicMetaRejected';
    default:
      return 'igPublishFailed';
  }
}
