import type { ChatInput, ChatProvider, ChatResult } from './types.ts';
import {
  buildOpenAiBody,
  classifyHttpStatus,
  fetchWithTimeout,
  missingKeyError,
  parseOpenAiResponse,
} from './openai-format.ts';

/**
 * Dasselbe Modell wie bei Groq und Cerebras, ueber eine DRITTE,
 * unabhaengige Infrastruktur. OpenRouter reicht die Anfrage an einen
 * hinterlegten Unteranbieter durch; welcher das im Einzelfall ist,
 * entscheidet OpenRouter selbst.
 *
 * BESTAETIGT am 30. Juli 2026 gegen OpenRouters eigene Modelldokumentation
 * und mehrere unabhaengige Quellen: das Feld lautet "openai/gpt-oss-120b"
 * fuer die BEZAHLTE Variante.
 *
 * ENTSCHEIDUNG zur Variante, bewusst getroffen statt offengelassen:
 * OpenRouter fuehrt "openai/gpt-oss-120b" zusaetzlich als
 * "openai/gpt-oss-120b:free" mit nur 20 Anfragen/Minute und 200/Tag.
 * OpenRouter ist hier das MITTLERE Glied der Kette. Bei einem laengeren
 * Groq-Ausfall waere die kostenlose Variante binnen weniger Dutzend
 * Anfragen selbst der Engpass, noch bevor Cerebras ueberhaupt gebraucht
 * wird. Gewaehlt ist deshalb die bezahlte Variante ohne ":free". Das
 * erfordert Guthaben auf dem OpenRouter-Konto -- ohne Guthaben scheitert
 * dieser Anbieter mit einem regulaeren Fehler, und die Kette faellt
 * korrekt auf Cerebras durch.
 */
const OPENROUTER_MODEL = 'openai/gpt-oss-120b';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export const openrouterProvider: ChatProvider = {
  name: 'openrouter',

  async chat(input: ChatInput): Promise<ChatResult> {
    const apiKey = Deno.env.get('OPENROUTER_API_KEY');
    if (!apiKey) throw missingKeyError('openrouter', 'OPENROUTER_API_KEY');

    const start = Date.now();
    const res = await fetchWithTimeout('openrouter', OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // Von OpenRouter empfohlen, nicht sicherheitsrelevant: identifiziert
        // die aufrufende Anwendung in deren eigenen Auswertungen.
        'HTTP-Referer': 'https://ascendos.app',
        'X-Title': 'AscendOS Ascent Coach',
      },
      body: buildOpenAiBody(OPENROUTER_MODEL, input),
    });

    const httpError = classifyHttpStatus('openrouter', res.status, res.statusText);
    if (httpError) throw httpError;

    const { text, usage } = await parseOpenAiResponse('openrouter', res);

    return { text, provider: 'openrouter', model: OPENROUTER_MODEL, latencyMs: Date.now() - start, usage };
  },
};
