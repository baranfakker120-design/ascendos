import {
  classifyHttpStatus,
  fetchWithTimeout,
  parseOpenAiResponse,
} from '../ai-providers/openai-format.ts';
import { ProviderError } from '../ai-providers/types.ts';
import {
  OPENROUTER_URL,
  VISION_MODEL,
  VISION_TIMEOUT_MS,
  VISION_VIDEO_FETCH_TIMEOUT_MS,
  VISION_VIDEO_MAX_BYTES,
  VISION_VIDEO_MIMES,
  type VisionErrorCode,
  type VisionVideoMime,
} from './types.ts';

export {
  VISION_VIDEO_FETCH_TIMEOUT_MS,
  VISION_VIDEO_MAX_BYTES,
  VISION_VIDEO_MIMES,
} from './types.ts';

/** Stable error codes for edge + frontend (never API keys / secrets). */
export function visionError(code: VisionErrorCode): Error {
  return new Error(code);
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

export function mapProviderFailureToVisionCode(err: unknown): VisionErrorCode {
  if (err instanceof ProviderError) {
    if (err.code === 'timeout') return 'AI_PROVIDER_TIMEOUT';
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
      msg === 'AI_PROVIDER_TIMEOUT' ||
      msg === 'AI_PROVIDER_ERROR' ||
      msg === 'missing_openrouter_key'
    ) {
      return msg;
    }
    if (msg.includes('timeout') || msg.includes('Zeitüberschreitung')) {
      return 'AI_PROVIDER_TIMEOUT';
    }
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

export async function callVisionModel(params: {
  system: string;
  userText: string;
  mediaKind: 'image' | 'video';
  mimeType: string;
  signedUrl: string;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}): Promise<{ text: string; model: string; provider: string }> {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!apiKey) {
    throw visionError('missing_openrouter_key');
  }

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
          max_tokens: 2200,
          messages: [
            { role: 'system', content: params.system },
            { role: 'user', content },
          ],
        }),
      },
      VISION_TIMEOUT_MS
    );

    if (res.status === 400) {
      // Drain body so the connection closes; do not forward provider text (may leak paths).
      try {
        await res.text();
      } catch {
        /* ignore */
      }
      throw visionError('AI_PROVIDER_BAD_REQUEST');
    }

    const httpError = classifyHttpStatus('openrouter', res.status, res.statusText);
    if (httpError) throw httpError;

    const { text } = await parseOpenAiResponse('openrouter', res);
    return { text, model: VISION_MODEL, provider: 'openrouter' };
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('VIDEO_')) throw e;
    if (e instanceof Error && e.message.startsWith('AI_PROVIDER_')) throw e;
    if (e instanceof Error && e.message === 'missing_openrouter_key') throw e;
    throw visionError(mapProviderFailureToVisionCode(e));
  }
}
