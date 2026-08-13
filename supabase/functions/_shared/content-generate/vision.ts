import { fetchWithTimeout } from '../ai-providers/openai-format.ts';
import { ProviderError } from '../ai-providers/types.ts';
import {
  OPENROUTER_URL,
  VISION_MODEL,
  VISION_TIMEOUT_MS,
  VISION_VIDEO_FETCH_TIMEOUT_MS,
  VISION_VIDEO_MAX_BYTES,
  VISION_VIDEO_MIMES,
  type ProviderErrorDetails,
  type VisionErrorCode,
  type VisionVideoMime,
} from './types.ts';

export {
  VISION_VIDEO_FETCH_TIMEOUT_MS,
  VISION_VIDEO_MAX_BYTES,
  VISION_VIDEO_MIMES,
} from './types.ts';

export type { ProviderErrorDetails } from './types.ts';

/** Stable error codes for edge + frontend (never API keys / secrets). */
export function visionError(code: VisionErrorCode): Error {
  return new Error(code);
}

/** Carrier for sanitized OpenRouter diagnostics (message stays the stable code). */
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

/**
 * Prefer asset mime when Content-Type is generic/missing; never invent image/*.
 */
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
  // Chunked to avoid call-stack / argument limits on large videos.
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

/** OpenRouter multimodal part — video uses data URL, never image_url. */
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
  if (status === 402) return 'AI_PROVIDER_CREDITS_EXHAUSTED';
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
        details.provider_name = sanitizeProviderText(
          m.provider_name ?? m.provider ?? null,
          120
        );
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

export function mapProviderFailureToVisionCode(err: unknown): VisionErrorCode {
  if (err instanceof VisionFailureError) return err.code;
  if (err instanceof ProviderError) {
    if (err.code === 'timeout') return 'AI_PROVIDER_TIMEOUT';
    if (err.code === 'rate_limited') return 'AI_PROVIDER_RATE_LIMIT';
    if (err.message.includes('401') || err.message.includes('403')) {
      return 'AI_PROVIDER_AUTH_ERROR';
    }
    if (err.message.includes('402') || /credits|afford/i.test(err.message)) {
      return 'AI_PROVIDER_CREDITS_EXHAUSTED';
    }
    if (err.message.includes('429')) return 'AI_PROVIDER_RATE_LIMIT';
    if (err.message.includes('400') || err.message.includes('Bad Request')) {
      return 'AI_PROVIDER_BAD_REQUEST';
    }
    return 'AI_PROVIDER_ERROR';
  }
  if (err instanceof Error) {
    const msg = err.message;
    if (
      msg === 'VIDEO_FETCH_FAILED' ||
      msg === 'VIDEO_TOO_LARGE' ||
      msg === 'VIDEO_UNSUPPORTED_MIME' ||
      msg === 'AI_PROVIDER_BAD_REQUEST' ||
      msg === 'AI_PROVIDER_AUTH_ERROR' ||
      msg === 'AI_PROVIDER_RATE_LIMIT' ||
      msg === 'AI_PROVIDER_TIMEOUT' ||
      msg === 'AI_PROVIDER_CREDITS_EXHAUSTED' ||
      msg === 'AI_PROVIDER_ERROR' ||
      msg === 'missing_openrouter_key'
    ) {
      return msg;
    }
    if (msg.includes('timeout') || msg.includes('Zeitüberschreitung')) {
      return 'AI_PROVIDER_TIMEOUT';
    }
    if (msg.includes('401') || msg.includes('403')) return 'AI_PROVIDER_AUTH_ERROR';
    if (msg.includes('402') || /credits|afford/i.test(msg)) {
      return 'AI_PROVIDER_CREDITS_EXHAUSTED';
    }
    if (msg.includes('429')) return 'AI_PROVIDER_RATE_LIMIT';
    if (msg.includes('400') || msg.includes('Bad Request')) {
      return 'AI_PROVIDER_BAD_REQUEST';
    }
  }
  return 'AI_PROVIDER_ERROR';
}

/**
 * Download private storage object server-side. Checks size before buffering.
 * Does not log URL query tokens.
 */
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

  if (!res.ok) {
    throw visionError('VIDEO_FETCH_FAILED');
  }

  const lenHeader = res.headers.get('content-length');
  if (lenHeader) {
    const n = Number(lenHeader);
    if (Number.isFinite(n) && n > maxBytes) {
      throw visionError('VIDEO_TOO_LARGE');
    }
  }

  const mimeType = resolveVisionVideoMime(
    params.assetMimeType,
    res.headers.get('content-type')
  );

  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength === 0) {
    throw visionError('VIDEO_FETCH_FAILED');
  }
  if (buf.byteLength > maxBytes) {
    throw visionError('VIDEO_TOO_LARGE');
  }

  return {
    mimeType,
    bytes: buf,
    dataUrl: buildVideoDataUrl(mimeType, buf),
  };
}

function parseVisionSuccessText(
  status: number,
  contentType: string | null,
  bodyText: string
): string {
  const details = extractProviderErrorDetails(status, contentType, bodyText);
  let json: { choices?: Array<{ message?: { content?: string } }> };
  try {
    json = JSON.parse(bodyText) as typeof json;
  } catch {
    throw new VisionFailureError('AI_PROVIDER_ERROR', details);
  }
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new VisionFailureError('AI_PROVIDER_ERROR', {
      ...details,
      error_message: details.error_message ?? 'empty_vision_content',
    });
  }
  return text;
}

async function requestVisionCompletion(params: {
  system: string;
  content: Array<Record<string, unknown>>;
  maxTokens?: number;
}): Promise<{ text: string; model: string; provider: string }> {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!apiKey) {
    throw visionError('missing_openrouter_key');
  }

  try {
    const res = await fetchWithTimeout(
      'openrouter',
      OPENROUTER_URL,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://ascendos.app',
          'X-Title': 'AscendOS Content Assistant',
        },
        body: JSON.stringify({
          model: VISION_MODEL,
          temperature: 0.35,
          max_tokens: params.maxTokens ?? 2200,
          messages: [
            { role: 'system', content: params.system },
            { role: 'user', content: params.content },
          ],
        }),
      },
      VISION_TIMEOUT_MS
    );

    const contentType = res.headers.get('content-type');
    let bodyText = '';
    try {
      bodyText = await res.text();
    } catch {
      bodyText = '';
    }

    const errorDetails = extractProviderErrorDetails(res.status, contentType, bodyText);

    if (!res.ok) {
      const code = mapHttpStatusToVisionCode(res.status);
      // Sanitized only — never Authorization, data URLs, or media bytes.
      console.error('openrouter_vision_upstream', { code, ...errorDetails });
      throw new VisionFailureError(code, errorDetails);
    }

    const text = parseVisionSuccessText(res.status, contentType, bodyText);
    return { text, model: VISION_MODEL, provider: 'openrouter' };
  } catch (e) {
    if (e instanceof VisionFailureError) throw e;
    if (e instanceof Error && e.message.startsWith('VIDEO_')) throw e;
    if (e instanceof Error && e.message.startsWith('AI_PROVIDER_')) throw e;
    if (e instanceof Error && e.message === 'missing_openrouter_key') throw e;
    const code = mapProviderFailureToVisionCode(e);
    throw new VisionFailureError(code);
  }
}

export async function callVisionModel(params: {
  system: string;
  userText: string;
  mediaKind: 'image' | 'video';
  mimeType: string;
  signedUrl: string;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}): Promise<{ text: string; model: string; provider: string }> {
  let videoDataUrl: string | undefined;
  if (params.mediaKind === 'video') {
    if (!isVisionVideoMime(params.mimeType.split(';')[0]?.trim().toLowerCase() ?? '')) {
      throw visionError('VIDEO_UNSUPPORTED_MIME');
    }
    const fetched = await fetchVideoForVision({
      signedUrl: params.signedUrl,
      assetMimeType: params.mimeType,
      fetchImpl: params.fetchImpl,
    });
    videoDataUrl = fetched.dataUrl;
  }

  const mediaPart = buildVisionMediaPart({
    mediaKind: params.mediaKind,
    signedUrl: params.signedUrl,
    videoDataUrl,
  });

  // Single attempt — no image_url fallback for MOV/mp4/webm (Gemini rejects that).
  const content = [{ type: 'text', text: params.userText }, mediaPart];
  return requestVisionCompletion({ system: params.system, content });
}

/**
 * Multi-image carousel analysis — all slides in one multimodal request.
 * Images only (signed URLs). Order of imageUrls is publish order.
 */
export async function callVisionModelCarousel(params: {
  system: string;
  userText: string;
  imageUrls: string[];
}): Promise<{ text: string; model: string; provider: string }> {
  if (params.imageUrls.length < 2) {
    throw new Error('carousel_requires_multiple_images');
  }
  const content: Array<Record<string, unknown>> = [
    { type: 'text', text: params.userText },
  ];
  for (let i = 0; i < params.imageUrls.length; i++) {
    content.push({ type: 'text', text: `Slide ${i + 1}:` });
    content.push(
      buildVisionMediaPart({
        mediaKind: 'image',
        signedUrl: params.imageUrls[i],
      })
    );
  }
  return requestVisionCompletion({
    system: params.system,
    content,
    maxTokens: 3200,
  });
}
