/**
 * Official Instagram Content Publishing helpers (Instagram Login → graph.instagram.com).
 * Never log access tokens.
 */

import { sanitizeMetaError } from '../instagram-oauth/meta.ts';
import {
  IG_GRAPH_API_VERSION,
  IG_GRAPH_HOST,
  type PublishContentFormat,
  type MediaKind,
} from './types.ts';

/**
 * Meta IG Container `status_code` values (official docs):
 * EXPIRED | ERROR | FINISHED | IN_PROGRESS | PUBLISHED
 * Unknown non-terminal values are treated as pending (keep polling).
 */
export type ContainerStatusCode =
  | 'EXPIRED'
  | 'ERROR'
  | 'FINISHED'
  | 'IN_PROGRESS'
  | 'PUBLISHED'
  | string;

export type ContainerReadiness = 'ready' | 'pending' | 'error' | 'expired';

/** Polling defaults — bounded, no infinite loop. */
export const CONTAINER_POLL_DEFAULTS = {
  /** Wait before first status check (lets Meta start processing / fetch image_url). */
  initialDelayMs: 2000,
  /** Delay between subsequent status checks. */
  intervalMs: 2000,
  /** Max status checks after the initial delay (~2s + 30×2s ≈ 62s). */
  maxAttempts: 30,
} as const;

export function classifyContainerStatus(statusCode: string | null | undefined): ContainerReadiness {
  const code = String(statusCode ?? '')
    .trim()
    .toUpperCase();
  if (code === 'FINISHED' || code === 'PUBLISHED') return 'ready';
  if (code === 'ERROR') return 'error';
  if (code === 'EXPIRED') return 'expired';
  // IN_PROGRESS, empty, or any other non-terminal → keep waiting
  return 'pending';
}

export function pollConfigForMedia(mediaKind: MediaKind): {
  initialDelayMs: number;
  intervalMs: number;
  maxAttempts: number;
} {
  if (mediaKind === 'video') {
    return {
      initialDelayMs: 3000,
      intervalMs: 3000,
      maxAttempts: 40, // ~3s + 40×3s ≈ 123s
    };
  }
  return { ...CONTAINER_POLL_DEFAULTS };
}

function graphUrl(path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${IG_GRAPH_HOST}/${IG_GRAPH_API_VERSION}${clean}`;
}

function readGraphError(json: Record<string, unknown>, fallback: string): string {
  const err = json.error as
    | { message?: string; error_user_msg?: string; code?: number; error_subcode?: number }
    | undefined;
  const msg = err?.error_user_msg || err?.message || json.error_message || json.error || fallback;
  return sanitizeMetaError(String(msg));
}

export function resolveMediaProduct(params: {
  mediaKind: MediaKind;
  format: PublishContentFormat;
}): {
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
  // Feed image — Meta accepts image_url without media_type.
  return { mediaType: null, useImageUrl: true, useVideoUrl: false, shareToFeed: false };
}

export async function createMediaContainer(params: {
  igUserId: string;
  accessToken: string;
  mediaKind: MediaKind;
  format: PublishContentFormat;
  mediaUrl: string;
  caption: string;
  /** When true, creates a carousel child item (no caption on child). */
  isCarouselItem?: boolean;
  fetchFn?: typeof fetch;
}): Promise<{ containerId: string }> {
  const fetchFn = params.fetchFn ?? fetch;
  const product = resolveMediaProduct({
    mediaKind: params.mediaKind,
    format: params.format,
  });

  if (product.useVideoUrl && params.mediaKind !== 'video') {
    throw new Error('container_requires_video');
  }
  if (product.useImageUrl && params.mediaKind !== 'image') {
    throw new Error('container_requires_image');
  }

  const body = new URLSearchParams();
  body.set('access_token', params.accessToken);
  if (product.useImageUrl) body.set('image_url', params.mediaUrl);
  if (product.useVideoUrl) body.set('video_url', params.mediaUrl);
  if (params.isCarouselItem) {
    body.set('is_carousel_item', 'true');
  } else if (product.mediaType) {
    body.set('media_type', product.mediaType);
  }
  // Official Reels param — also surfaces the Reel on the profile feed when supported.
  if (!params.isCarouselItem && product.mediaType === 'REELS') {
    body.set('share_to_feed', 'true');
  }
  // Feed/Reels captions; Stories omit caption (not a feed caption field).
  // Carousel children never carry the feed caption — parent does.
  if (params.caption && !params.isCarouselItem && product.mediaType !== 'STORIES') {
    body.set('caption', params.caption);
  }

  const res = await fetchFn(graphUrl(`/${params.igUserId}/media`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(readGraphError(json, `container_${res.status}`));
  }
  const containerId = String(json.id ?? '');
  if (!containerId) throw new Error('container_missing_id');
  return { containerId };
}

/** Parent carousel container — children must already be FINISHED. */
export async function createCarouselContainer(params: {
  igUserId: string;
  accessToken: string;
  childContainerIds: string[];
  caption: string;
  fetchFn?: typeof fetch;
}): Promise<{ containerId: string }> {
  const fetchFn = params.fetchFn ?? fetch;
  if (params.childContainerIds.length < 2 || params.childContainerIds.length > 10) {
    throw new Error('carousel_child_count_invalid');
  }
  const body = new URLSearchParams();
  body.set('access_token', params.accessToken);
  body.set('media_type', 'CAROUSEL');
  body.set('children', params.childContainerIds.join(','));
  if (params.caption) body.set('caption', params.caption);

  const res = await fetchFn(graphUrl(`/${params.igUserId}/media`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(readGraphError(json, `carousel_container_${res.status}`));
  }
  const containerId = String(json.id ?? '');
  if (!containerId) throw new Error('container_missing_id');
  return { containerId };
}

export async function getContainerStatus(params: {
  containerId: string;
  accessToken: string;
  fetchFn?: typeof fetch;
}): Promise<{ statusCode: ContainerStatusCode; status?: string }> {
  const fetchFn = params.fetchFn ?? fetch;
  const q = new URLSearchParams({
    fields: 'status_code,status',
    access_token: params.accessToken,
  });
  const res = await fetchFn(graphUrl(`/${params.containerId}?${q.toString()}`));
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(readGraphError(json, `container_status_${res.status}`));
  }
  return {
    statusCode: String(json.status_code ?? 'IN_PROGRESS') as ContainerStatusCode,
    status: json.status != null ? String(json.status) : undefined,
  };
}

/**
 * Poll Meta until the container is publishable.
 * Always used — including feed images (Meta may still return 9007/2207027 if rushed).
 */
export async function waitForContainerReady(params: {
  containerId: string;
  accessToken: string;
  fetchFn?: typeof fetch;
  mediaKind?: MediaKind;
  initialDelayMs?: number;
  intervalMs?: number;
  maxAttempts?: number;
  sleepFn?: (ms: number) => Promise<void>;
}): Promise<{ statusCode: ContainerStatusCode; attempts: number }> {
  const defaults = pollConfigForMedia(params.mediaKind ?? 'image');
  const initialDelayMs = params.initialDelayMs ?? defaults.initialDelayMs;
  const intervalMs = params.intervalMs ?? defaults.intervalMs;
  const maxAttempts = params.maxAttempts ?? defaults.maxAttempts;
  const sleepFn =
    params.sleepFn ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  if (initialDelayMs > 0) {
    await sleepFn(initialDelayMs);
  }

  for (let i = 0; i < maxAttempts; i++) {
    const { statusCode } = await getContainerStatus({
      containerId: params.containerId,
      accessToken: params.accessToken,
      fetchFn: params.fetchFn,
    });
    const readiness = classifyContainerStatus(statusCode);
    if (readiness === 'ready') {
      return { statusCode, attempts: i + 1 };
    }
    if (readiness === 'error') {
      throw new Error('container_error');
    }
    if (readiness === 'expired') {
      throw new Error('container_expired');
    }
    // pending (IN_PROGRESS or unknown) — wait and retry
    if (i < maxAttempts - 1) {
      await sleepFn(intervalMs);
    }
  }
  throw new Error('container_timeout');
}

export async function publishMediaContainer(params: {
  igUserId: string;
  accessToken: string;
  containerId: string;
  fetchFn?: typeof fetch;
}): Promise<{ mediaId: string }> {
  const fetchFn = params.fetchFn ?? fetch;
  const body = new URLSearchParams({
    creation_id: params.containerId,
    access_token: params.accessToken,
  });
  const res = await fetchFn(graphUrl(`/${params.igUserId}/media_publish`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(readGraphError(json, `media_publish_${res.status}`));
  }
  const mediaId = String(json.id ?? '');
  if (!mediaId) throw new Error('media_publish_missing_id');
  return { mediaId };
}

export function connectionHasPublishScope(scopes: string[] | null | undefined): boolean {
  return (scopes ?? []).includes('instagram_business_content_publish');
}
