/**
 * Pure helpers mirroring supabase/functions/_shared/content-generate/vision.ts
 * (video path). Edge runtime owns fetch/OpenRouter; this module is the Vitest surface.
 */

export const VISION_VIDEO_MAX_BYTES = 35 * 1024 * 1024;
export const VISION_VIDEO_FETCH_TIMEOUT_MS = 25_000;
export const VISION_VIDEO_MIMES = ['video/mp4', 'video/webm', 'video/quicktime'] as const;

export type VisionVideoMime = (typeof VISION_VIDEO_MIMES)[number];

export type VisionErrorCode =
  | 'VIDEO_FETCH_FAILED'
  | 'VIDEO_TOO_LARGE'
  | 'VIDEO_UNSUPPORTED_MIME'
  | 'AI_PROVIDER_BAD_REQUEST'
  | 'AI_PROVIDER_TIMEOUT'
  | 'AI_PROVIDER_ERROR'
  | 'missing_openrouter_key';

export function visionError(code: VisionErrorCode): Error {
  return new Error(code);
}

export function isVisionVideoMime(mime: string): mime is VisionVideoMime {
  return (VISION_VIDEO_MIMES as readonly string[]).includes(mime);
}

export function resolveVisionVideoMime(
  assetMimeType: string,
  responseContentType: string | null | undefined
): VisionVideoMime {
  const asset = assetMimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  const header = (responseContentType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';

  if (isVisionVideoMime(asset)) return asset;
  if (isVisionVideoMime(header)) return header;
  throw visionError('VIDEO_UNSUPPORTED_MIME');
}

export function bytesToBase64(bytes: Uint8Array): string {
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
}

export function buildVideoDataUrl(mimeType: VisionVideoMime, bytes: Uint8Array): string {
  return `data:${mimeType};base64,${bytesToBase64(bytes)}`;
}

export function buildVisionMediaPart(params: {
  mediaKind: 'image' | 'video';
  signedUrl: string;
  videoDataUrl?: string;
}): { type: string; image_url?: { url: string }; video_url?: { url: string } } {
  if (params.mediaKind === 'video') {
    if (!params.videoDataUrl?.startsWith('data:video/')) {
      throw visionError('VIDEO_FETCH_FAILED');
    }
    return {
      type: 'video_url',
      video_url: { url: params.videoDataUrl },
    };
  }
  return {
    type: 'image_url',
    image_url: { url: params.signedUrl },
  };
}

export function mapHttpStatusToVisionCode(status: number): VisionErrorCode {
  if (status === 400) return 'AI_PROVIDER_BAD_REQUEST';
  if (status === 408 || status === 504) return 'AI_PROVIDER_TIMEOUT';
  return 'AI_PROVIDER_ERROR';
}

/** Ensures error payloads never echo secrets / bearer tokens / long signed URLs. */
export function sanitizeVisionErrorDetail(value: string): string {
  const codes: VisionErrorCode[] = [
    'VIDEO_FETCH_FAILED',
    'VIDEO_TOO_LARGE',
    'VIDEO_UNSUPPORTED_MIME',
    'AI_PROVIDER_BAD_REQUEST',
    'AI_PROVIDER_TIMEOUT',
    'AI_PROVIDER_ERROR',
    'missing_openrouter_key',
  ];
  if ((codes as string[]).includes(value)) return value;
  if (/sk-|Bearer\s|apikey|api_key|token=/i.test(value)) return 'AI_PROVIDER_ERROR';
  return 'AI_PROVIDER_ERROR';
}

export async function fetchVideoForVision(params: {
  signedUrl: string;
  assetMimeType: string;
  maxBytes?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<{ mimeType: VisionVideoMime; bytes: Uint8Array; dataUrl: string }> {
  const maxBytes = params.maxBytes ?? VISION_VIDEO_MAX_BYTES;
  const timeoutMs = params.timeoutMs ?? VISION_VIDEO_FETCH_TIMEOUT_MS;
  const fetchImpl = params.fetchImpl ?? fetch;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetchImpl(params.signedUrl, { method: 'GET', signal: controller.signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw visionError('AI_PROVIDER_TIMEOUT');
    }
    throw visionError('VIDEO_FETCH_FAILED');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw visionError('VIDEO_FETCH_FAILED');

  const lenHeader = res.headers.get('content-length');
  if (lenHeader) {
    const n = Number(lenHeader);
    if (Number.isFinite(n) && n > maxBytes) throw visionError('VIDEO_TOO_LARGE');
  }

  const mimeType = resolveVisionVideoMime(params.assetMimeType, res.headers.get('content-type'));
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength === 0) throw visionError('VIDEO_FETCH_FAILED');
  if (buf.byteLength > maxBytes) throw visionError('VIDEO_TOO_LARGE');

  return { mimeType, bytes: buf, dataUrl: buildVideoDataUrl(mimeType, buf) };
}
