/**
 * Pure helpers mirroring supabase/functions/_shared/content-generate/vision.ts
 * (video path + OpenRouter error observability). Edge runtime owns fetch/OpenRouter;
 * this module is the Vitest surface.
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
  | 'AI_PROVIDER_AUTH_ERROR'
  | 'AI_PROVIDER_RATE_LIMIT'
  | 'AI_PROVIDER_TIMEOUT'
  | 'AI_PROVIDER_ERROR'
  | 'missing_openrouter_key';

/** Sanitized OpenRouter/upstream diagnostic fields — never secrets, URLs, or media. */
export type ProviderErrorDetails = {
  http_status: number | null;
  content_type: string | null;
  body_length: number;
  error_message?: string | null;
  error_code?: string | number | null;
  error_type?: string | null;
  provider_name?: string | null;
  body_preview?: string | null;
};

export function visionError(code: VisionErrorCode): Error {
  return new Error(code);
}

export class VisionFailureError extends Error {
  readonly code: VisionErrorCode;
  readonly errorDetails: ProviderErrorDetails | undefined;

  constructor(code: VisionErrorCode, errorDetails?: ProviderErrorDetails) {
    super(code);
    this.name = 'VisionFailureError';
    this.code = code;
    this.errorDetails = errorDetails;
  }
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
  if (status === 401 || status === 403) return 'AI_PROVIDER_AUTH_ERROR';
  if (status === 429) return 'AI_PROVIDER_RATE_LIMIT';
  if (status === 408 || status === 504) return 'AI_PROVIDER_TIMEOUT';
  return 'AI_PROVIDER_ERROR';
}

/** Strip secrets, signed URLs, data-URLs, and long base64 from diagnostic text. */
export function sanitizeProviderText(value: unknown, maxLen: number): string | null {
  if (value == null) return null;
  let s = typeof value === 'string' ? value : String(value);
  s = s.replace(/data:[^;\s]+;base64,[A-Za-z0-9+/=\s]+/gi, '[data_url_redacted]');
  s = s.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
  s = s.replace(/sk-[A-Za-z0-9_-]{8,}/g, '[key_redacted]');
  s = s.replace(
    /https?:\/\/[^\s"'<>]+(?:token|sig|signature|apikey|api_key)=[^\s"'<>]+/gi,
    '[signed_url_redacted]'
  );
  s = s.replace(/(?:token|sig|signature|apikey|api_key)=[^\s"'&<>]+/gi, '[token_redacted]');
  // Only redact base64-looking blobs (padding or +/), not long plain words.
  s = s.replace(/[A-Za-z0-9+/]{40,}={1,2}/g, '[base64_redacted]');
  s = s.replace(/[A-Za-z0-9]{16,}[+/][A-Za-z0-9+/=]{40,}/g, '[base64_redacted]');
  s = s.replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function sanitizeErrorCode(value: unknown): string | number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') return sanitizeProviderText(value, 80);
  return null;
}

/**
 * Build persistable OpenRouter diagnostics from status + raw body.
 * Never includes Authorization, keys, data URLs, or full media payloads.
 */
export function extractProviderErrorDetails(
  status: number,
  contentType: string | null | undefined,
  bodyText: string
): ProviderErrorDetails {
  const details: ProviderErrorDetails = {
    http_status: Number.isFinite(status) ? status : null,
    content_type: sanitizeProviderText(contentType ?? null, 120),
    body_length: bodyText.length,
  };

  const trimmed = bodyText.trim();
  if (!trimmed) return details;

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const errRaw = parsed.error ?? parsed;
    if (typeof errRaw === 'string') {
      details.error_message = sanitizeProviderText(errRaw, 500);
      return details;
    }
    if (errRaw && typeof errRaw === 'object') {
      const err = errRaw as Record<string, unknown>;
      details.error_message = sanitizeProviderText(err.message, 500);
      details.error_code = sanitizeErrorCode(err.code);
      details.error_type = sanitizeProviderText(err.type, 120);
      const meta = err.metadata;
      if (meta && typeof meta === 'object') {
        const m = meta as Record<string, unknown>;
        details.provider_name = sanitizeProviderText(m.provider_name ?? m.provider ?? null, 120);
      }
      return details;
    }
    details.error_message = sanitizeProviderText('unrecognized_json_error', 80);
    return details;
  } catch {
    // Sanitize a wider window first, then hard-cap preview length.
    const cleaned = sanitizeProviderText(trimmed.slice(0, 4000), 4000);
    details.body_preview = cleaned ? cleaned.slice(0, 1000) : null;
    return details;
  }
}

/** Ensures error payloads never echo secrets / bearer tokens / long signed URLs. */
export function sanitizeVisionErrorDetail(value: string): string {
  const codes: VisionErrorCode[] = [
    'VIDEO_FETCH_FAILED',
    'VIDEO_TOO_LARGE',
    'VIDEO_UNSUPPORTED_MIME',
    'AI_PROVIDER_BAD_REQUEST',
    'AI_PROVIDER_AUTH_ERROR',
    'AI_PROVIDER_RATE_LIMIT',
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
