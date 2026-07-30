import type { ChatInput, ChatProvider, ChatResult } from './types.ts';
import {
  buildOpenAiBody,
  classifyHttpStatus,
  fetchWithTimeout,
  missingKeyError,
  parseOpenAiResponse,
} from './openai-format.ts';

/**
 * openai/gpt-oss-120b, nicht llama-3.3-70b-versatile.
 *
 * Groq hat llama-3.3-70b-versatile am 17. Juni 2026 als abgekuendigt
 * markiert und empfiehlt genau dieses Modell als Ersatz. Es ist
 * zugleich auf Cerebras verfuegbar, dort allerdings OHNE Praefix
 * (siehe cerebras.ts) — bewusst dasselbe zugrunde liegende Modell,
 * damit ein Wechsel zwischen den Anbietern den Charakter der
 * Antworten nicht veraendert.
 *
 * BESTAETIGT am 30. Juli 2026 gegen Groqs eigene Dokumentation
 * (console.groq.com/docs, mehrere unabhaengige Beispiele: Chat
 * Completions, Responses API, Reasoning-Leitfaden): das Feld lautet
 * durchgaengig "model": "openai/gpt-oss-120b", MIT Praefix.
 */
const GROQ_MODEL = 'openai/gpt-oss-120b';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export const groqProvider: ChatProvider = {
  name: 'groq',

  async chat(input: ChatInput): Promise<ChatResult> {
    const apiKey = Deno.env.get('GROQ_API_KEY');
    if (!apiKey) throw missingKeyError('groq', 'GROQ_API_KEY');

    const start = Date.now();
    const res = await fetchWithTimeout('groq', GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: buildOpenAiBody(GROQ_MODEL, input),
    });

    const httpError = classifyHttpStatus('groq', res.status, res.statusText);
    if (httpError) throw httpError;

    const { text, usage } = await parseOpenAiResponse('groq', res);

    return { text, provider: 'groq', model: GROQ_MODEL, latencyMs: Date.now() - start, usage };
  },
};
