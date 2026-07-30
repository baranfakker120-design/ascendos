import type { ChatInput, ChatProvider, ChatResult } from './types.ts';
import {
  buildOpenAiBody,
  classifyHttpStatus,
  fetchWithTimeout,
  missingKeyError,
  parseOpenAiResponse,
} from './openai-format.ts';

/**
 * Letztes Glied der Kette. Cerebras dient hier auch als Mengenpuffer:
 * das grosszuegigste Tageskontingent der drei Anbieter (siehe
 * docs/ki-infrastruktur-analyse.md, Teil 6).
 *
 * KORRIGIERT am 30. Juli 2026 gegen Cerebras' eigene Dokumentation
 * (inference-docs.cerebras.ai/api-reference/chat-completions): dort
 * lautet das Feld durchgaengig "model": "gpt-oss-120b", OHNE
 * "openai/"-Praefix. Die erste Fassung dieser Datei uebernahm faelschlich
 * die Schreibweise von Groq und OpenRouter, wo das Praefix tatsaechlich
 * verlangt wird. Cerebras ist hier die Ausnahme, nicht die Regel --
 * genau der Punkt, der beim ersten Entwurf als zu pruefen markiert war.
 */
const CEREBRAS_MODEL = 'gpt-oss-120b';
const CEREBRAS_URL = 'https://api.cerebras.ai/v1/chat/completions';

export const cerebrasProvider: ChatProvider = {
  name: 'cerebras',

  async chat(input: ChatInput): Promise<ChatResult> {
    const apiKey = Deno.env.get('CEREBRAS_API_KEY');
    if (!apiKey) throw missingKeyError('cerebras', 'CEREBRAS_API_KEY');

    const start = Date.now();
    const res = await fetchWithTimeout('cerebras', CEREBRAS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: buildOpenAiBody(CEREBRAS_MODEL, input),
    });

    const httpError = classifyHttpStatus('cerebras', res.status, res.statusText);
    if (httpError) throw httpError;

    const { text, usage } = await parseOpenAiResponse('cerebras', res);

    return { text, provider: 'cerebras', model: CEREBRAS_MODEL, latencyMs: Date.now() - start, usage };
  },
};
