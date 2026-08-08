import {
  classifyHttpStatus,
  fetchWithTimeout,
  parseOpenAiResponse,
} from '../ai-providers/openai-format.ts';
import { OPENROUTER_URL, VISION_MODEL, VISION_TIMEOUT_MS } from './types.ts';

export async function callVisionModel(params: {
  system: string;
  userText: string;
  mediaKind: 'image' | 'video';
  mimeType: string;
  signedUrl: string;
}): Promise<{ text: string; model: string; provider: string }> {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!apiKey) {
    throw new Error('missing_openrouter_key');
  }

  const mediaPart =
    params.mediaKind === 'video'
      ? {
          type: 'video_url',
          video_url: { url: params.signedUrl },
        }
      : {
          type: 'image_url',
          image_url: { url: params.signedUrl },
        };

  const attempts: unknown[][] = [
    [
      { type: 'text', text: params.userText },
      mediaPart,
    ],
  ];
  if (params.mediaKind === 'video') {
    attempts.push([
      { type: 'text', text: params.userText },
      { type: 'image_url', image_url: { url: params.signedUrl } },
    ]);
  }

  let lastErr: Error | null = null;
  for (const content of attempts) {
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
      const httpError = classifyHttpStatus('openrouter', res.status, res.statusText);
      if (httpError) throw httpError;
      const { text } = await parseOpenAiResponse('openrouter', res);
      return { text, model: VISION_MODEL, provider: 'openrouter' };
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastErr ?? new Error('vision_failed');
}
