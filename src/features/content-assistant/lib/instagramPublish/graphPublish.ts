/** Client mirrors of Phase 5C Graph publish helpers (no secrets, no network). */

export const IG_PUBLISH_SCOPE = 'instagram_business_content_publish';
export const IG_GRAPH_API_VERSION = 'v25.0';

export type ContentFormat = 'story' | 'feed' | 'reel';
export type MediaKind = 'image' | 'video';

export function connectionHasPublishScope(scopes: string[] | null | undefined): boolean {
  return (scopes ?? []).includes(IG_PUBLISH_SCOPE);
}

export function resolveMediaProduct(params: { mediaKind: MediaKind; format: ContentFormat }): {
  mediaType: 'IMAGE' | 'REELS' | 'STORIES' | null;
  useImageUrl: boolean;
  useVideoUrl: boolean;
} {
  const { mediaKind, format } = params;
  if (format === 'story') {
    return {
      mediaType: 'STORIES',
      useImageUrl: mediaKind === 'image',
      useVideoUrl: mediaKind === 'video',
    };
  }
  if (mediaKind === 'video' || format === 'reel') {
    return { mediaType: 'REELS', useImageUrl: false, useVideoUrl: true };
  }
  return { mediaType: null, useImageUrl: true, useVideoUrl: false };
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
    case 'container_failed':
      return 'igPublishContainerFailed';
    case 'publish_failed':
      return 'igPublishFailed';
    case 'missing_token':
      return 'igPublishNeedReconnect';
    case 'signed_url_failed':
      return 'igPublishMediaUrlFailed';
    default:
      return 'igPublishFailed';
  }
}
