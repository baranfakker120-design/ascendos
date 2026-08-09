import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  VISION_VIDEO_MAX_BYTES,
  VISION_VIDEO_MIMES,
  buildVideoDataUrl,
  buildVisionMediaPart,
  extractProviderErrorDetails,
  fetchVideoForVision,
  isVisionVideoMime,
  mapHttpStatusToVisionCode,
  resolveVisionVideoMime,
  sanitizeProviderText,
  sanitizeVisionErrorDetail,
} from './visionVideoInput';

describe('visionVideoInput — MIME support', () => {
  it('A) accepts video/mp4', () => {
    expect(isVisionVideoMime('video/mp4')).toBe(true);
    expect(resolveVisionVideoMime('video/mp4', 'application/octet-stream')).toBe('video/mp4');
  });

  it('B) accepts video/webm', () => {
    expect(isVisionVideoMime('video/webm')).toBe(true);
    expect(resolveVisionVideoMime('video/webm', null)).toBe('video/webm');
  });

  it('C) accepts video/quicktime (iPhone MOV)', () => {
    expect(isVisionVideoMime('video/quicktime')).toBe(true);
    expect(resolveVisionVideoMime('video/quicktime', 'video/quicktime')).toBe('video/quicktime');
    expect(VISION_VIDEO_MIMES).toContain('video/quicktime');
  });

  it('rejects non-video mime', () => {
    expect(() => resolveVisionVideoMime('image/jpeg', 'image/jpeg')).toThrow(
      'VIDEO_UNSUPPORTED_MIME'
    );
  });
});

describe('visionVideoInput — server fetch + data URL', () => {
  it('D) fetches video server-side via injected fetch', async () => {
    const payload = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]);
    const fetchImpl = vi.fn(
      async () =>
        new Response(payload, {
          status: 200,
          headers: {
            'Content-Type': 'video/quicktime',
            'Content-Length': String(payload.byteLength),
          },
        })
    );

    const result = await fetchVideoForVision({
      signedUrl: 'https://example.test/storage/v1/object/sign/content-assets/x?token=secret',
      assetMimeType: 'video/quicktime',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.mimeType).toBe('video/quicktime');
    expect(result.bytes.byteLength).toBe(payload.byteLength);
  });

  it('E) builds data URL video input (not a bare storage URL)', async () => {
    const payload = new Uint8Array([1, 2, 3, 4]);
    const fetchImpl = vi.fn(
      async () =>
        new Response(payload, {
          status: 200,
          headers: { 'Content-Type': 'video/mp4', 'Content-Length': '4' },
        })
    );
    const { dataUrl, mimeType } = await fetchVideoForVision({
      signedUrl: 'https://example.test/private.mov?token=abc',
      assetMimeType: 'video/mp4',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(mimeType).toBe('video/mp4');
    expect(dataUrl.startsWith('data:video/mp4;base64,')).toBe(true);
    expect(dataUrl.includes('token=')).toBe(false);
    expect(dataUrl.includes('example.test')).toBe(false);

    const part = buildVisionMediaPart({
      mediaKind: 'video',
      signedUrl: 'https://example.test/private.mov?token=abc',
      videoDataUrl: dataUrl,
    });
    expect(part.type).toBe('video_url');
    expect(part.video_url?.url).toBe(dataUrl);
    expect(part.image_url).toBeUndefined();
  });

  it('F) never uses image_url for MOV / video', () => {
    const dataUrl = buildVideoDataUrl('video/quicktime', new Uint8Array([9]));
    const part = buildVisionMediaPart({
      mediaKind: 'video',
      signedUrl: 'https://signed.example/original.mov',
      videoDataUrl: dataUrl,
    });
    expect(part.type).toBe('video_url');
    expect(part.image_url).toBeUndefined();
    expect(JSON.stringify(part)).not.toContain('image_url');
  });

  it('G) image path still uses image_url + signed URL', () => {
    const signed = 'https://signed.example/photo.jpg?token=t';
    const part = buildVisionMediaPart({ mediaKind: 'image', signedUrl: signed });
    expect(part.type).toBe('image_url');
    expect(part.image_url?.url).toBe(signed);
    expect(part.video_url).toBeUndefined();
  });

  it('H) video too large → VIDEO_TOO_LARGE (content-length)', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(null, {
          status: 200,
          headers: {
            'Content-Type': 'video/mp4',
            'Content-Length': String(VISION_VIDEO_MAX_BYTES + 1),
          },
        })
    );
    await expect(
      fetchVideoForVision({
        signedUrl: 'https://example.test/big.mp4',
        assetMimeType: 'video/mp4',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).rejects.toThrow('VIDEO_TOO_LARGE');
  });

  it('H2) video too large → VIDEO_TOO_LARGE (body size)', async () => {
    const big = new Uint8Array(16);
    const fetchImpl = vi.fn(
      async () =>
        new Response(big, {
          status: 200,
          headers: { 'Content-Type': 'video/webm' },
        })
    );
    await expect(
      fetchVideoForVision({
        signedUrl: 'https://example.test/big.webm',
        assetMimeType: 'video/webm',
        maxBytes: 8,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).rejects.toThrow('VIDEO_TOO_LARGE');
  });

  it('I) provider HTTP status → stable vision codes', () => {
    expect(mapHttpStatusToVisionCode(400)).toBe('AI_PROVIDER_BAD_REQUEST');
    expect(mapHttpStatusToVisionCode(401)).toBe('AI_PROVIDER_AUTH_ERROR');
    expect(mapHttpStatusToVisionCode(403)).toBe('AI_PROVIDER_AUTH_ERROR');
    expect(mapHttpStatusToVisionCode(429)).toBe('AI_PROVIDER_RATE_LIMIT');
    expect(mapHttpStatusToVisionCode(500)).toBe('AI_PROVIDER_ERROR');
    expect(mapHttpStatusToVisionCode(502)).toBe('AI_PROVIDER_ERROR');
  });

  it('J) sanitize strips secrets from error detail', () => {
    expect(sanitizeVisionErrorDetail('VIDEO_TOO_LARGE')).toBe('VIDEO_TOO_LARGE');
    expect(sanitizeVisionErrorDetail('Bearer sk-or-v1-secret')).toBe('AI_PROVIDER_ERROR');
    expect(
      sanitizeVisionErrorDetail('https://x.supabase.co/storage/v1/object/sign/a?token=abc')
    ).toBe('AI_PROVIDER_ERROR');
  });
});

describe('visionVideoInput — OpenRouter response observability', () => {
  it('extracts sanitized JSON error fields', () => {
    const body = JSON.stringify({
      error: {
        message: 'Provider returned error',
        code: 400,
        type: 'invalid_request_error',
        metadata: { provider_name: 'Google', raw: 'data:video/mp4;base64,AAAA' },
      },
    });
    const details = extractProviderErrorDetails(400, 'application/json', body);
    expect(details.http_status).toBe(400);
    expect(details.content_type).toBe('application/json');
    expect(details.body_length).toBe(body.length);
    expect(details.error_message).toBe('Provider returned error');
    expect(details.error_code).toBe(400);
    expect(details.error_type).toBe('invalid_request_error');
    expect(details.provider_name).toBe('Google');
    expect(details.body_preview).toBeUndefined();
    expect(JSON.stringify(details)).not.toContain('data:video');
    expect(JSON.stringify(details)).not.toContain('AAAA');
  });

  it('keeps non-JSON preview ≤1000 chars and redacts secrets/data URLs', () => {
    const secretChunk = 'Bearer sk-or-v1-supersecretkeyvalue123456';
    const dataUrl = `data:video/mp4;base64,${'A'.repeat(200)}`;
    const body = `upstream failed ${secretChunk} ${dataUrl} ${'x'.repeat(1200)}`;
    const details = extractProviderErrorDetails(502, 'text/plain', body);
    expect(details.http_status).toBe(502);
    expect(details.body_length).toBe(body.length);
    expect(details.body_preview).toBeTruthy();
    expect(details.body_preview!.length).toBeLessThanOrEqual(1000);
    expect(details.body_preview).not.toContain('sk-or-v1-supersecret');
    expect(details.body_preview).not.toContain('data:video/mp4;base64');
    expect(details.body_preview).toContain('[data_url_redacted]');
    expect(details.body_preview).toContain('Bearer [redacted]');
  });

  it('sanitizeProviderText redacts signed URLs and padded base64', () => {
    const signed = 'see https://x.supabase.co/storage/v1/object/sign/a?token=abc123 for media';
    expect(sanitizeProviderText(signed, 200)).toBe('see [signed_url_redacted] for media');
    const b64 = `${'A'.repeat(60)}==`;
    expect(sanitizeProviderText(`blob ${b64}`, 200)).toContain('[base64_redacted]');
  });

  it('does not persist metadata.raw or Authorization material', () => {
    const body = JSON.stringify({
      error: {
        message: 'Auth failed Authorization: Bearer sk-or-v1-hiddenkey',
        code: 401,
        metadata: {
          provider_name: 'Google AI Studio',
          raw: 'Authorization: Bearer sk-or-v1-hiddenkey data:video/mp4;base64,ZZZZ',
        },
      },
    });
    const details = extractProviderErrorDetails(401, 'application/json; charset=utf-8', body);
    expect(details.error_code).toBe(401);
    expect(mapHttpStatusToVisionCode(details.http_status!)).toBe('AI_PROVIDER_AUTH_ERROR');
    expect(details.provider_name).toBe('Google AI Studio');
    const serialized = JSON.stringify(details);
    expect(serialized).not.toContain('sk-or-v1-hiddenkey');
    expect(serialized).not.toContain('ZZZZ');
    expect(serialized).not.toMatch(/"raw"/);
    expect(details.error_message).toContain('Bearer [redacted]');
  });
});

describe('edge vision.ts contract (source)', () => {
  const edgeVision = readFileSync(
    join(process.cwd(), 'supabase/functions/_shared/content-generate/vision.ts'),
    'utf8'
  );
  const edgeTypes = readFileSync(
    join(process.cwd(), 'supabase/functions/_shared/content-generate/types.ts'),
    'utf8'
  );

  it('fetches video server-side and builds data:video data URLs', () => {
    expect(edgeVision).toMatch(/fetchVideoForVision/);
    expect(edgeVision).toMatch(/data:\$\{mimeType\};base64/);
    expect(edgeVision).toMatch(/video_url/);
  });

  it('does not fall back to image_url for video/MOV', () => {
    // Old bug: attempts.push({ type: 'image_url', ... signedUrl })
    expect(edgeVision).not.toMatch(/attempts\.push/);
    expect(edgeVision).toMatch(/no image_url fallback/i);
  });

  it('supports quicktime/mp4/webm and size limit', () => {
    expect(edgeTypes).toMatch(/video\/mp4/);
    expect(edgeTypes).toMatch(/video\/webm/);
    expect(edgeTypes).toMatch(/video\/quicktime/);
    expect(edgeTypes).toMatch(/VISION_VIDEO_MAX_BYTES/);
    expect(edgeVision).toMatch(/VIDEO_TOO_LARGE/);
    expect(edgeVision).toMatch(/VIDEO_UNSUPPORTED_MIME/);
    expect(edgeVision).toMatch(/AI_PROVIDER_BAD_REQUEST/);
  });

  it('captures sanitized OpenRouter status/body diagnostics', () => {
    const edgeAssistant = readFileSync(
      join(process.cwd(), 'supabase/functions/content-assistant/index.ts'),
      'utf8'
    );
    expect(edgeVision).toMatch(/extractProviderErrorDetails/);
    expect(edgeVision).toMatch(/VisionFailureError/);
    expect(edgeVision).toMatch(/AI_PROVIDER_AUTH_ERROR/);
    expect(edgeVision).toMatch(/AI_PROVIDER_RATE_LIMIT/);
    expect(edgeVision).toMatch(/openrouter_vision_upstream/);
    expect(edgeTypes).toMatch(/ProviderErrorDetails/);
    expect(edgeAssistant).toMatch(/error_details/);
    // Must not log Authorization header values
    expect(edgeVision).not.toMatch(/console\.error\([^)]*Authorization/);
  });
});
