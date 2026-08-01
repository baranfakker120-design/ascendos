// AscendOS Edge Function: coach-chat (Dashboard-Version, alles in einer Datei)
// Name der Function MUSS exakt lauten: coach-chat
//
// GENERIERT von scripts/bundle-functions.mjs — NICHT von Hand ändern.
// Quelle: supabase/functions/coach-chat/index.ts

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { GoogleGenAI } from 'npm:@google/genai@2.13.0';

// ---- inline: _shared/cors.ts ----
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function handleOptions(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  return null;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ---- inline: _shared/gemini.ts ----
/**
 * Gemini-Anbindung: AUSSCHLIESSLICH Embeddings.
 *
 * Aenderung vom 30. Juli 2026: Chat-Antworten laufen ab jetzt ueber die
 * Provider-Abstraktion in _shared/ai-providers/ (Groq -> OpenRouter ->
 * Cerebras mit automatischem Fallback). Gemini bleibt gezielt fuer
 * Embeddings bestehen, weil `knowledge_chunks.embedding` fest auf
 * `vector(1536)` mit `gemini-embedding-001` gebaut ist. Ein Wechsel des
 * Embedding-Modells wuerde eine andere Dimension bedeuten und damit eine
 * Neuberechnung des gesamten Wissenskorpus erzwingen — das war
 * ausdruecklich NICHT Teil dieses Auftrags.
 *
 * `geminiChat`, `mapToGeminiModel` und `geminiFastModel` sind entfallen.
 * `GeminiError` und `ai()` bleiben: `geminiWithRetry` wird von den
 * Embedding-Funktionen mitgenutzt, und `ingest-knowledge.ts` faengt
 * `GeminiError` direkt ab.
 *
 * Schlüssel: ausschließlich GEMINI_API_KEY.
 */


const GEMINI_EMBED_TIMEOUT_MS = 30_000;
const GEMINI_MAX_RETRIES = 2;

/** Fix verdrahtet, NICHT konfigurierbar: `knowledge_chunks.embedding` ist
 *  `vector(1536)` und der HNSW-Index ist auf diesen Raum gebaut. Ein
 *  anderer Wert hier bedeutet Schemamigration plus Neu-Ingestion. */
export const EMBEDDING_MODEL = 'gemini-embedding-001';
export const EMBEDDING_DIMENSIONS = 1536;

/** gemini-embedding-001 akzeptiert 2048 Token Eingabe. 4000 Zeichen sind
 *  auch für deutsche Texte (~3 Zeichen/Token) sicher darunter. Chunks sind
 *  ohnehin auf 1600 Zeichen begrenzt — das greift nur auf dem Query-Pfad. */
const EMBED_MAX_CHARS = 4000;

/**
 * Gemini-Embeddings sind ASYMMETRISCH: Dokument und Frage werden
 * unterschiedlich kodiert. Denselben Task-Type für beides zu verwenden
 * kostet messbar Trefferqualität — deshalb ist der Parameter Pflicht und
 * hat bewusst KEINEN Default. OpenAI kannte dieses Konzept nicht.
 */
export type EmbedTask = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

/** Fehler mit maschinenlesbarem Grund: die Aufrufer entscheiden damit, ob
 *  sie degradieren (Retrieval) oder abbrechen (Antwort). */
export class GeminiError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'missing_api_key'
      | 'rate_limited'
      | 'timeout'
      | 'upstream'
      | 'empty_response'
      | 'refused',
    readonly status?: number
  ) {
    super(message);
    this.name = 'GeminiError';
  }
}

// ============================================================
// Client
// ============================================================

let client: GoogleGenAI | null = null;

function ai(): GoogleGenAI {
  if (client) return client;
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key || key.trim().length === 0) {
    // Klare Ursache statt eines kryptischen 401/403 aus dem Upstream.
    throw new GeminiError(
      'GEMINI_API_KEY ist nicht gesetzt (Supabase -> Edge Functions -> Secrets).',
      'missing_api_key'
    );
  }
  client = new GoogleGenAI({ apiKey: key.trim() });
  return client;
}

// ============================================================
// Fehler-Klassifikation und Retry
// ============================================================

function geminiSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Das SDK wirft keine typisierten Fehler — Status muss aus dem Objekt
 *  bzw. der Meldung gelesen werden. */
function geminiStatusOf(err: unknown): number | undefined {
  const e = err as { status?: unknown; code?: unknown; message?: unknown };
  for (const candidate of [e?.status, e?.code]) {
    const n = Number(candidate);
    if (Number.isFinite(n) && n >= 400) return n;
  }
  const m = typeof e?.message === 'string' ? e.message : '';
  const match = m.match(/\b(4\d{2}|5\d{2})\b/);
  return match ? Number(match[1]) : undefined;
}

const GEMINI_RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

/** Free Tier liegt bei wenigen Requests pro Minute — 429 ist hier der
 *  Normalfall, nicht die Ausnahme. Deshalb Backoff statt Sofortabbruch.
 *
 *  WIEDERHERGESTELLT beim Trennen von Chat und Embeddings am 30. Juli
 *  2026: diese Funktion wurde beim ersten Schnitt versehentlich mit
 *  entfernt, obwohl geminiEmbedBatch sie braucht. Der anschliessende
 *  TypeScript-Check hat die Luecke sofort gezeigt (unbekannter Bezeichner
 *  geminiWithRetry), deshalb wortgetreu aus der Originaldatei
 *  wiederhergestellt, keine Verhaltensaenderung. */
async function geminiWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const status = geminiStatusOf(e);
      const retryable = status === undefined || GEMINI_RETRYABLE.has(status);
      if (!retryable || attempt === GEMINI_MAX_RETRIES) break;
      await geminiSleep(600 * 2 ** attempt + Math.random() * 300);
    }
  }
  const status = geminiStatusOf(last);
  const message = last instanceof Error ? last.message : String(last);
  throw new GeminiError(
    `Gemini-Fehler${status ? ` ${status}` : ''}: ${message.slice(0, 400)}`,
    status === 429 ? 'rate_limited' : 'upstream',
    status
  );
}

// ============================================================
// Embeddings
// ============================================================

interface EmbedResponseLike {
  embeddings?: Array<{ values?: number[] }>;
}

/**
 * L2-Normalisierung. Google normalisiert bei `gemini-embedding-001` nur die
 * volle 3072-Dimension automatisch; bei 1536 muss es der Aufrufer tun.
 *
 * Für die Suche in AscendOS ist das mathematisch irrelevant — pgvector
 * rechnet mit `<=>` (Cosine) und Cosine ist skaleninvariant. Es passiert
 * trotzdem, damit die gespeicherten Vektoren korrekt sind, falls je auf
 * L2-Distanz oder Inneres Produkt gewechselt wird.
 */
function normalize(vec: number[]): number[] {
  let sum = 0;
  for (const v of vec) sum += v * v;
  const norm = Math.sqrt(sum);
  // Nullvektor kann nicht normalisiert werden — unverändert zurückgeben.
  if (!Number.isFinite(norm) || norm === 0) return vec;
  return vec.map((v) => v / norm);
}

function assertDimensions(vec: unknown): number[] {
  if (!Array.isArray(vec) || vec.length !== EMBEDDING_DIMENSIONS) {
    throw new GeminiError(
      `Unerwartete Embedding-Dimension (${
        Array.isArray(vec) ? vec.length : 0
      } statt ${EMBEDDING_DIMENSIONS}).`,
      'upstream'
    );
  }
  return vec as number[];
}

/**
 * Embeddings für mehrere Texte. Die Reihenfolge der Ausgabe entspricht der
 * Eingabe. Leere Texte werden verworfen — Gemini lehnt leere Parts ab.
 *
 * Bewusst EIN Request pro Text: die Vertex-Dokumentation nennt für
 * `gemini-embedding-001` genau einen Eingabetext pro Aufruf. Sequenziell
 * mit Backoff ist hier korrekt statt schnell; die Free-Tier-Grenze liegt
 * bei etwa 100 Requests/Minute und `ingest-knowledge` ist der einzige
 * Aufrufer mit größeren Mengen.
 */
export async function geminiEmbedBatch(
  texts: string[],
  task: EmbedTask
): Promise<number[][]> {
  const inputs = texts
    .map((t) => (t ?? '').slice(0, EMBED_MAX_CHARS))
    .filter((t) => t.trim().length > 0);
  if (inputs.length === 0) return [];

  const out: number[][] = [];
  for (const text of inputs) {
    const res = (await geminiWithRetry(() =>
      Promise.race([
        ai().models.embedContent({
          model: EMBEDDING_MODEL,
          contents: text,
          config: {
            taskType: task,
            // Muss exakt zur Spalte vector(1536) passen.
            outputDimensionality: EMBEDDING_DIMENSIONS,
          },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new GeminiError(
                  `Embedding-Zeitüberschreitung nach ${GEMINI_EMBED_TIMEOUT_MS} ms.`,
                  'timeout'
                )
              ),
            GEMINI_EMBED_TIMEOUT_MS
          )
        ),
      ])
    )) as EmbedResponseLike;

    const values = res.embeddings?.[0]?.values;
    out.push(normalize(assertDimensions(values)));
  }
  return out;
}

/** Embedding für einen einzelnen Text. */
export async function geminiEmbed(text: string, task: EmbedTask): Promise<number[]> {
  const [vector] = await geminiEmbedBatch([text], task);
  if (!vector) throw new GeminiError('Kein Embedding erhalten.', 'empty_response');
  return vector;
}

// ---- inline: _shared/prompts.ts ----
/**
 * Zentrale Verhaltensregeln aller Agenten. Versioniert im Repo
 * (ADR-008/ADR-015: Änderungen laufen vorher durchs Eval-Set).
 */
export const CORE_RULES = `
Du bist Ascent, der persönliche KI-Coach in AscendOS, für Network Marketer im deutschsprachigen Raum.

ARBEITSWEISE:
- Arbeite IMMER mit dem mitgelieferten Kontext. Wiederhole nie Fragen, deren
  Antwort im Kontext steht, und lass dir nichts erneut erklären.
- Beginne deine Antwort damit, den relevanten Kontext in einem Satz zu
  spiegeln (z. B. "Mehmet hat die Präsentation vor 3 Tagen gesehen, seitdem
  Funkstille."), damit klar ist, worauf du dich beziehst.
- Fehlt eine entscheidende Information, stelle GENAU EINE gezielte Rückfrage.
- Sei konkret und knapp. Keine Motivationsfloskeln, keine Vorträge.
- Formuliere Nachrichtenentwürfe in natürlicher, persönlicher Du-Sprache,
  bereit zum Kopieren.

HANDLUNGSORIENTIERUNG (Pflicht):
- Beende jede Antwort mit genau einem konkreten nächsten Schritt, den der
  Nutzer HEUTE umsetzen kann, im Format: "Nächster Schritt: ..."
- Ausnahme: Wenn du eine Rückfrage stellst, ist die Rückfrage das Ende.
- Du führst zur Aktion. Du unterhältst nicht.

STRUKTUR (Sprint 3):
- Eine vollständige Antwort hat gedanklich vier Teile: die eigentliche
  Antwort, eine kurze Erklärung, ein praktischer Tipp, ein nächster
  Schritt. Das ist eine gedankliche Reihenfolge, KEINE Pflicht zu vier
  sichtbaren Abschnitten oder Überschriften.
- Die Länge richtet sich nach der Frage, nicht nach der Struktur: Bei
  einer knappen Faktenfrage (z. B. einer Duftnummer, einer Definition)
  genügen die Antwort selbst und der nächste Schritt, in ein bis zwei
  Sätzen. Erklärung und Tipp entfallen dort, wenn sie nichts Sinnvolles
  hinzufügen würden.
- Bei einer offenen oder komplexen Frage werden alle vier Teile
  ausformuliert, weiterhin als Fließtext, nicht als Liste mit
  Zwischenüberschriften.
- Erfinde niemals einen Tipp oder eine Erklärung nur um die Struktur zu
  füllen. Eine kurze, korrekte Antwort ist besser als eine lange mit
  erfundenem Zusatzinhalt.

WISSENSBASIS:
- Ausschnitte aus den Teamdokumenten (falls vorhanden) sind deine oberste
  Wahrheit. Sie überschreiben dein Allgemeinwissen.
- Bei Fragen zu Chogan, Team Seyda, Produkten, Vergütung oder internen
  Abläufen OHNE passende Dokumente: Sage klar, dass dir dazu keine
  Teaminformation vorliegt, und rate NICHT. Allgemeine Prinzipien darfst
  du als solche gekennzeichnet anbieten.

GRENZEN (nicht verhandelbar):
- Keine Einkommensversprechen oder -prognosen, keine "finanzielle Freiheit"-
  Versprechen. Keine Heil- oder Gesundheitswirkungen von Produkten.
- Kein Druck, keine Manipulation, keine Tricks gegenüber Interessenten.
  Ehrlichkeit und Freiwilligkeit sind Teil des Systems.
- Wünscht der Nutzer solche Aussagen, erkläre kurz warum nicht und biete
  die seriöse Alternative an.
- Du versendest niemals selbst Nachrichten und führst keine Aktionen aus.
  Du bereitest vor - der Mensch entscheidet und handelt.

FORMAT (nicht verhandelbar, Sprint 3.1/3):
- AscendOS ist eine Business-App, kein Chat-Werkzeug für Entwickler.
  Schreibe reinen Fließtext ohne Markdown.
- Erlaubt: . , : ; ? ! ( ) " ' sowie nummerierte Listen (1. 2. 3.) und
  Aufzählungspunkte (• Punkt).
- Verboten: **fett**, __fett__, *kursiv*, # Überschriften, Backticks,
  Codeblöcke, Tabellen mit |, Zitatzeichen >, Trennlinien ---, eckige
  Klammern für Links, HTML.
- Enthält eine Antwort eine Internetadresse, schreibe sie als reinen Text
  genau wie im Kontext angegeben (z. B. https://duftparty.netlify.app),
  ohne eckige Klammern, ohne sie zu verändern oder zu verkürzen. Die App
  macht daraus automatisch einen anklickbaren Link.
- Der Nutzer darf nie erkennen, dass intern Wissensdokumente oder
  Formatierungssyntax verwendet werden.
`.trim();

export const ROUTER_PROMPT = `
Du bist ein Klassifikator. Ordne die Nutzerfrage GENAU EINEM Spezialisten zu.
Antworte NUR mit einem dieser Wörter: recruiting | sales | knowledge
- recruiting: Interessenten, Einwände, Präsentation, Fit Check, 3-Way-Call, neue Partner
- sales: Produkte verkaufen, Kunden, Duftpartys, Empfehlungen
- knowledge: Faktenfragen zu Produkten, Vergütungsplan, Abläufen, Schulung
Im Zweifel: knowledge.
`.trim();

// ---- inline: _shared/ai-providers/types.ts ----
/**
 * Gemeinsame Schnittstelle aller Chat-Anbieter.
 *
 * Diese Datei ist bewusst der einzige Ort, an dem sich alles ändert,
 * wenn ein neuer Anbieter hinzukommt (Gemini Tier 1, OpenAI, Anthropic,
 * Cloudflare). Router und coach-chat kennen nur diese Typen, nie einen
 * konkreten Anbieter.
 *
 * WICHTIGE ABGRENZUNG: Diese Datei betrifft ausschliesslich CHAT.
 * Embeddings bleiben bei Gemini und sind in _shared/gemini.ts
 * unveraendert. Der Betreiber hat das am 29. Juli 2026 ausdruecklich so
 * bestaetigt: eine Aenderung der Embedding-Dimension wuerde RAG
 * veraendern, was ausserhalb dieses Auftrags liegt.
 */

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatInput {
  system: string;
  messages: ChatMessage[];
  maxTokens: number;
}

export interface ChatUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface ChatResult {
  text: string;
  provider: string;
  model: string;
  latencyMs: number;
  usage?: ChatUsage;
}

/**
 * Ursachencodes, ausschliesslich fuer PROTOKOLLIERUNG. Sie steuern NICHT,
 * ob der Router wechselt — das tut jeder Fehler, den ein Adapter wirft,
 * weil ein Adapter per Konstruktion nur Anbieterfehler wirft. SQL-,
 * Supabase-, Auth-, RLS- und Geschaeftslogikfehler entstehen an anderer
 * Stelle in coach-chat und durchlaufen den Router nie. Die Trennung
 * "wechseln oder nicht" ist damit strukturell gesichert, nicht durch
 * eine Fallunterscheidung, die vergessen werden koennte.
 */
export type ProviderErrorCode =
  | 'missing_api_key'
  | 'rate_limited'
  | 'timeout'
  | 'upstream'
  | 'invalid_response';

export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    readonly provider: string,
    message: string,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export interface ChatProvider {
  readonly name: string;
  chat(input: ChatInput): Promise<ChatResult>;
}

export interface AttemptLog {
  provider: string;
  ok: boolean;
  model?: string;
  code?: ProviderErrorCode;
  message?: string;
  latencyMs: number;
}

/**
 * Wird geworfen, wenn JEDER Anbieter in der Kette gescheitert ist.
 * Traegt die vollstaendige Versuchsliste, damit coach-chat die Meldung
 * aus dem LETZTEN Versuch ableiten kann — die relevanteste, weil sie am
 * naechsten an "gerade jetzt" liegt.
 */
export class AllProvidersFailedError extends Error {
  constructor(readonly attempts: AttemptLog[]) {
    super(`AscendOS: Alle ${attempts.length} Anbieter sind gescheitert.`);
    this.name = 'AllProvidersFailedError';
  }

  /** Code des letzten Versuchs, fuer die Wahl der Nutzermeldung. */
  get lastCode(): ProviderErrorCode {
    return this.attempts.at(-1)?.code ?? 'upstream';
  }
}

// ---- inline: _shared/ai-providers/openai-format.ts ----
/**
 * Groq, OpenRouter und Cerebras sprechen alle das OpenAI-kompatible
 * Format unter /v1/chat/completions. Diese Datei buendelt die Logik,
 * die sonst dreimal fast identisch entstuende — und die bei einem
 * kuenftigen Anbieter im selben Format (z.B. Fireworks, SambaNova)
 * unveraendert wiederverwendbar ist.
 */


export const DEFAULT_TIMEOUT_MS = 20_000;

export function buildOpenAiBody(model: string, input: ChatInput): string {
  return JSON.stringify({
    model,
    messages: [
      { role: 'system', content: input.system },
      ...input.messages,
    ],
    max_tokens: input.maxTokens,
    temperature: 0.4,
  });
}

/**
 * Fuehrt den HTTP-Aufruf aus und bildet Netzwerk-, DNS-, Verbindungs-
 * und Zeitueberschreitungsfehler auf ProviderError ab.
 *
 * fetch() wirft Netzwerk-, DNS- und Verbindungsfehler als TypeError,
 * nicht als HTTP-Status — sie landen deshalb alle im catch-Zweig, nicht
 * in der Statuspruefung danach.
 */
export async function fetchWithTimeout(
  provider: string,
  url: string,
  init: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ProviderError('timeout', provider, `Zeitüberschreitung nach ${timeoutMs}ms.`);
    }
    throw new ProviderError(
      'upstream',
      provider,
      `Netzwerk-, DNS- oder Verbindungsfehler: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Bildet einen HTTP-Status auf ProviderError ab. Deckt die vollstaendige
 * Liste aus dem Auftrag ab: 429, 5xx, "provider nicht erreichbar" (alles
 * >=500 und nicht 2xx/4xx-Sonderfaelle).
 */
export function classifyHttpStatus(provider: string, status: number, statusText: string): ProviderError | null {
  if (status >= 200 && status < 300) return null;
  if (status === 429) {
    return new ProviderError('rate_limited', provider, `Kontingent erschöpft (429 ${statusText}).`);
  }
  if (status >= 500) {
    return new ProviderError('upstream', provider, `Serverfehler (${status} ${statusText}).`);
  }
  // 4xx ausserhalb 429: falscher Schluessel, falsches Modell, ungueltige
  // Anfrage an DIESEN Anbieter. Kein Nutzerfehler, also trotzdem
  // fallback-faehig — der naechste Anbieter bekommt eine neue Chance.
  return new ProviderError('upstream', provider, `Unerwarteter Status ${status} ${statusText}.`);
}

interface OpenAiChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export async function parseOpenAiResponse(provider: string, res: Response): Promise<{ text: string; usage?: ChatUsage }> {
  let json: OpenAiChatResponse;
  try {
    json = await res.json();
  } catch {
    throw new ProviderError('invalid_response', provider, 'Antwort ist kein gültiges JSON.');
  }

  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new ProviderError('invalid_response', provider, 'Antwort enthält keinen Text in choices[0].message.content.');
  }

  const usage: ChatUsage | undefined = json.usage
    ? { inputTokens: json.usage.prompt_tokens, outputTokens: json.usage.completion_tokens }
    : undefined;

  return { text, usage };
}

export function missingKeyError(provider: string, envVar: string): ProviderError {
  return new ProviderError('missing_api_key', provider, `${envVar} ist nicht gesetzt.`);
}

/** Fuer Tests: erlaubt, einen beliebigen Code direkt zu erzeugen. */
export function errorOf(code: ProviderErrorCode, provider: string, message: string): ProviderError {
  return new ProviderError(code, provider, message);
}

// ---- inline: _shared/ai-providers/cerebras.ts ----
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

// ---- inline: _shared/ai-providers/groq.ts ----
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

// ---- inline: _shared/ai-providers/openrouter.ts ----
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

// ---- inline: _shared/ai-providers/router.ts ----
/**
 * Durchlaeuft die Anbieterkette in Reihenfolge und gibt das erste
 * erfolgreiche Ergebnis zurueck. Wirft AllProvidersFailedError, wenn
 * jeder Anbieter gescheitert ist.
 *
 * WARUM DAS DIE VORGABE "SQL-, Auth- und RLS-Fehler loesen NIE einen
 * Wechsel aus" bereits strukturell erfuellt: providers[i].chat() ruft
 * ausschliesslich fetch() gegen einen externen Anbieter auf. Es gibt in
 * diesem Pfad keinen Zugriff auf Supabase, keine Authentifizierung,
 * keine RLS. Ein Fehler, der hier ankommt, KANN also nur ein
 * Anbieterfehler sein. Es braucht deshalb keine Fallunterscheidung "ist
 * das ein Fehler, bei dem gewechselt werden darf" — jeder Fehler, den
 * diese Funktion sieht, ist per Konstruktion einer.
 *
 * Der vollstaendige Gespraechskontext (system, messages) wird bei jedem
 * Versuch UNVERAENDERT an den naechsten Anbieter weitergereicht. Aus
 * Sicht des Beraters ist ein Wechsel dadurch nicht bemerkbar, ausser an
 * der Antwortzeit.
 */
export async function chatWithFallback(
  input: ChatInput,
  providers: readonly ChatProvider[],
): Promise<ChatResult> {
  const attempts: AttemptLog[] = [];

  for (const provider of providers) {
    const attemptStart = Date.now();
    try {
      const result = await provider.chat(input);
      attempts.push({
        provider: provider.name,
        ok: true,
        model: result.model,
        latencyMs: Date.now() - attemptStart,
      });
      logAttempts(attempts, provider.name);
      return result;
    } catch (err) {
      const providerError =
        err instanceof ProviderError
          ? err
          : new ProviderError('upstream', provider.name, err instanceof Error ? err.message : String(err));

      attempts.push({
        provider: provider.name,
        ok: false,
        code: providerError.code,
        message: providerError.message,
        latencyMs: Date.now() - attemptStart,
      });

      const naechster = providers[providers.indexOf(provider) + 1]?.name;
      console.error(
        `ASCENDOS Providerwechsel: ${provider.name} fehlgeschlagen [${providerError.code}] ` +
          `${providerError.message}${naechster ? ` -> naechster Versuch: ${naechster}` : ' -> keine weiteren Anbieter'}`,
      );
      // kein return, kein throw: die Schleife faehrt mit dem naechsten
      // Anbieter fort. Das IST der Fallback.
    }
  }

  logAttempts(attempts, null);
  throw new AllProvidersFailedError(attempts);
}

function logAttempts(attempts: AttemptLog[], erfolgreich: string | null): void {
  // Strukturiert statt Fliesstext, damit es maschinell auswertbar
  // bleibt, wie ADR-019 es fuer Coach-Metriken bereits vorschreibt.
  // Enthaelt bewusst keine Gespraechsinhalte, nur Betriebsdaten.
  console.log(
    JSON.stringify({
      metric: 'ai_provider_chain',
      attempts,
      successfulProvider: erfolgreich,
      totalLatencyMs: attempts.reduce((sum, a) => sum + a.latencyMs, 0),
    }),
  );
}

// ---- inline: _shared/ai-providers/index.ts ----
/**
 * Oeffentliche Schnittstelle der Chat-Provider-Abstraktion.
 *
 * coach-chat kennt ausschliesslich diese Datei. Ein neuer Anbieter
 * (Gemini Tier 1, OpenAI, Anthropic, Cloudflare) braucht:
 *   1. eine neue Datei nach dem Muster von groq.ts,
 *   2. einen Eintrag in CHAT_PROVIDER_CHAIN unten.
 * Kein Eingriff im Router, kein Eingriff in coach-chat.
 */



/**
 * Reihenfolge verbindlich aus dem Auftrag vom 30. Juli 2026:
 * Groq vor OpenRouter vor Cerebras.
 */
export const CHAT_PROVIDER_CHAIN: readonly ChatProvider[] = [
  groqProvider,
  openrouterProvider,
  cerebrasProvider,
];

export async function chat(input: ChatInput): Promise<ChatResult> {
  return chatWithFallback(input, CHAT_PROVIDER_CHAIN);
}

// ---- inline: _shared/intent-router/types.ts ----
/**
 * Intent-Router: erkennt PRO NACHRICHT, welche Wissenskategorie
 * durchsucht werden soll. Sprint 3.1, 30. Juli 2026.
 *
 * ABGRENZUNG zum bestehenden Router (prompts.ts, ROUTER_PROMPT):
 * Jener laeuft EINMAL pro Konversation und waehlt einen von drei
 * Spezialisten (recruiting/sales/knowledge) fuer die TONALITAET der
 * ganzen Unterhaltung. Dieser Router hier laeuft bei JEDER Nachricht
 * neu und bestimmt nur, WELCHE Kategorien fuer DIESEN einen Turn
 * durchsucht werden. Eine Unterhaltung kann mit einer
 * Recruiting-Frage beginnen und mitten drin nach einer Duftnummer
 * fragen -- der alte Router wuerde das nicht bemerken, weil er nur
 * beim ersten Turn entscheidet. Beide Mechanismen bestehen
 * nebeneinander, keiner ersetzt den anderen.
 *
 * BEWUSST REGELBASIERT, kein weiterer KI-Aufruf: Der Auftrag verlangt
 * "keine Vermutungen, keine Halluzinationen". Ein deterministischer
 * Klassifikator kann per Konstruktion nicht halluzinieren, kostet
 * keine zusaetzliche Anbieteranfrage (kein weiterer Punkt, an dem
 * Groq/OpenRouter/Cerebras ausfallen koennten) und ist mit
 * gewoehnlichen Tests beweisbar, nicht nur behauptbar.
 */

export type IntentId =
  | 'duft_nummer'
  | 'duft_name'
  | 'produkte'
  | 'business'
  | 'recruiting'
  | 'duftparty'
  | 'kontakte'
  | 'aufgaben';

export interface IntentMatch {
  /** null, falls dieser Intent nicht zutrifft. */
  confidence: number;
}

export interface IntentDefinition {
  id: IntentId;
  /** Kurze Bezeichnung fuers Log, nicht fuer den Nutzer bestimmt. */
  label: string;
  /**
   * Prueft die Nachricht. Gibt eine Konfidenz zwischen 0 und 1 zurueck,
   * oder null, wenn der Intent nicht zutrifft. Rein, ohne Seiteneffekt
   * -- deshalb ohne Weiteres einzeln testbar.
   */
  test(message: string): number | null;
  /**
   * Wissenskategorien fuer match_knowledge. Leeres Array bedeutet:
   * dieser Intent hat KEINE Wissenskategorie (siehe skipRag).
   * Namen decken sich bewusst mit den bereits vorhandenen Werten in
   * agents.retrieval_categories, keine neue Kategorie erfunden.
   */
  categories: string[];
  /**
   * true bei Intents, die keine Wissensfrage sind, sondern
   * strukturierte Nutzerdaten betreffen (Kontakte, Aufgaben). Diese
   * Daten liegen NICHT in knowledge_docs, sondern in eigenen Tabellen.
   * match_knowledge dafuer aufzurufen wuerde in der falschen Quelle
   * suchen und koennte eine falsche Antwort erzeugen. Stattdessen wird
   * RAG uebersprungen und dem Modell ein kurzer Hinweis mitgegeben,
   * ehrlich zu sagen, dass es diese Daten nicht direkt einsehen kann.
   */
  skipRag?: boolean;
  /**
   * Optionale Umschreibung der Suchanfrage vor dem Einbetten. Ein
   * bloßes "129" liefert als Einbettung kaum brauchbare Naehe zu
   * einem Dokument, das "Duftnummer 129: ..." sagt. Mit Kontext
   * angereichert trifft die Vektorsuche deutlich zuverlaessiger.
   */
  rewriteQuery?: (message: string) => string;
}

export interface IntentResult {
  intent: IntentId | 'unbekannt';
  confidence: number;
  categories: string[];
  skipRag: boolean;
  searchQuery: string;
  /** true, wenn kein Intent mit ausreichender Konfidenz traf und auf
   *  die bestehende, agentengebundene Kategorie zurueckgefallen wurde. */
  fallbackToAgent: boolean;
}

// ---- inline: _shared/intent-router/intents.ts ----
/**
 * Ein Eintrag je Intent. Ein neuer Intent bedeutet: ein neues Objekt
 * an dieses Array anhaengen. Kein Eingriff in index.ts oder in andere
 * Intents noetig -- das ist die geforderte Erweiterbarkeit.
 *
 * Kategorienamen sind bewusst identisch mit den bereits vorhandenen
 * Werten in agents.retrieval_categories (produkte, verguetung,
 * recruiting, einwaende, duftparty, prozess, schulung, faq, verkauf).
 * Es wird keine neue Kategorie erfunden, keine Migration noetig.
 */

/**
 * Wortgrenzen-Matching (`\b...\b`), NICHT Teilstring-Suche.
 *
 * Ein Zwischenstand dieser Datei hatte versucht, das Kompositum-Problem
 * (siehe RECRUITING_KEYWORD unten) generell durch reine Teilstring-Suche
 * zu loesen. Der Testlauf zeigte sofort zwei neue Fehler: "WhatsApp"
 * enthaelt zufaellig die Buchstabenfolge "ap" und waere faelschlich als
 * "business" erkannt worden (BUSINESS_KEYWORD enthaelt die kurze
 * Abkuerzung "ap"), und "Erba Pura" scheiterte an einem fuer
 * Teilstring-Suche sinnlos gewordenen Regex-Escaping. Kurze
 * Abkuerzungen wie "AP"/"ICP" sind fuer Teilstring-Matching
 * grundsaetzlich zu riskant -- zurueckgesetzt auf Wortgrenzen.
 *
 * Das eigentliche Kompositum-Problem ("Preiseinwände") wird stattdessen
 * gezielt geloest: durch explizite zusammengesetzte Formen in der
 * jeweiligen Liste, nicht durch eine globale Aenderung der
 * Matching-Strategie. Ein neu entdecktes Kompositum ist damit eine
 * Zeile Ergaenzung in der Liste, kein Eingriff in diese Funktion.
 */
const wordBoundary = (words: string[]) =>
  new RegExp(`\\b(${words.join('|')})\\b`, 'i');

// ------------------------------------------------------------
// 1. Duftnummer -- reiner Zahlenmuster-Treffer, hoechste Praezision.
// ------------------------------------------------------------
const NUR_ZAHL = /^\s*#?\s*(\d{1,4})\s*[.?!]?\s*$/;
const ZAHL_MIT_KONTEXT = /\b(duft|parfum|nummer|nr\.?)\b[^\d]{0,20}(\d{1,4})\b|\b(\d{1,4})\b[^\d]{0,20}\b(duft|parfum|nummer)\b/i;

export const duftNummer: IntentDefinition = {
  id: 'duft_nummer',
  label: 'Duftnummer',
  // KORRIGIERT, Sprint 3, 30. Juli 2026: Die erste Fassung suchte
  // ausschliesslich 'produkte'. Verifiziert gegen den tatsaechlichen
  // Wissensbestand: die vollstaendigen Duftnummer-Tabellen (Nr., Name,
  // Original-Inspiration, Geschlecht, Familie, UVP) liegen im Dokument
  // "Duftparty Coach Knowledge", Kategorie 'duftparty'. In 'produkte'
  // existiert KEINE einzige solche Tabelle (per SQL-Abfrage gegen
  // knowledge_chunks/knowledge_docs bestaetigt). Ohne diese Korrektur
  // fand die Suche fuer "129" strukturell nichts, unabhaengig von der
  // Qualitaet der Einbettung oder der Suchanfrage.
  categories: ['duftparty', 'produkte'],
  test(message) {
    if (NUR_ZAHL.test(message)) return 0.95;
    if (ZAHL_MIT_KONTEXT.test(message)) return 0.9;
    return null;
  },
  rewriteQuery(message) {
    const num = message.match(/\d{1,4}/)?.[0] ?? message;
    return `Chogan Parfum Duftnummer ${num}`;
  },
};

// ------------------------------------------------------------
// 2. Duftname -- bekannte Referenzduefte aus dem Auftrag.
//
//    WICHTIG, ehrlich benannt: Diese Liste ist eine Startliste aus
//    den vier vom Betreiber genannten Beispielen, KEINE vollstaendige
//    Duftdatenbank. Sie waechst durch Ergaenzen der Liste unten, ohne
//    Codeaenderung an der Logik.
//
//    KEINE Kurznachrichten-Heuristik ("kurze Nachricht = wahrscheinlich
//    ein Duftname"): eine erste Fassung hatte das versucht und dabei
//    per Testlauf nachgewiesen bekommen, dass sie einen blossen
//    Vornamen wie "Sarah" faelschlich als Duftname einordnete --
//    genau die Art Vermutung, die der Auftrag ausdruecklich
//    ausschliesst ("keine Vermutungen"). Ohne verlaessliches Merkmal,
//    das einen Duftnamen von jedem anderen kurzen Wort unterscheidet,
//    ist der einzige tragfaehige Weg die explizite Liste.
// ------------------------------------------------------------
const BEKANNTE_DUEFTE = ['hypnose', 'libre', 'erba pura', 'alien'];
const DUFT_KEYWORD = wordBoundary(BEKANNTE_DUEFTE.map((d) => d.replace(' ', '\\s+')));

export const duftName: IntentDefinition = {
  id: 'duft_name',
  label: 'Duftname',
  // Gleiche Korrektur wie bei duft_nummer: die Tabellen mit Duftnamen
  // liegen in 'duftparty'.
  categories: ['duftparty', 'produkte'],
  test(message) {
    return DUFT_KEYWORD.test(message) ? 0.85 : null;
  },
  rewriteQuery(message) {
    return `Chogan Parfum Duft ${message.trim()}`;
  },
};

// ------------------------------------------------------------
// 3. Produkte -- konkrete Produktlinien-Namen aus dem Auftrag.
// ------------------------------------------------------------
const PRODUKTLINIEN = ['aurodhea', 'peptilux', 'brilhome', 'lolüm', 'lolum', 'kleyes'];
const PRODUKT_KEYWORD = wordBoundary(PRODUKTLINIEN);

export const produkte: IntentDefinition = {
  id: 'produkte',
  label: 'Produkte',
  categories: ['produkte'],
  test(message) {
    return PRODUKT_KEYWORD.test(message) ? 0.9 : null;
  },
};

// ------------------------------------------------------------
// 4. Business -- Verguetungsplan und Kennzahlen.
// ------------------------------------------------------------
const BUSINESS_KEYWORD = wordBoundary([
  'vergütungsplan', 'verguetungsplan', 'ap', 'icp', 'provision', 'aktivpunkte', 'aktivpunkt',
]);

export const business: IntentDefinition = {
  id: 'business',
  label: 'Business',
  categories: ['verguetung', 'faq'],
  test(message) {
    return BUSINESS_KEYWORD.test(message) ? 0.85 : null;
  },
};

// ------------------------------------------------------------
// 5. Recruiting -- deckt sich mit den Kategorien des bestehenden
//    recruiting-Agenten (agents.retrieval_categories).
//
//    ENTHAELT explizite Kompositum-Formen ("preiseinwand" usw.):
//    "Preiseinwände" ist EIN zusammengeschriebenes deutsches Wort ohne
//    Trennzeichen. \b...\b findet weder "preis" (rechte Wortgrenze
//    fehlt) noch "einwand" (linke Wortgrenze fehlt) darin -- bestaetigt
//    durch einen Testlauf mit der Qualitaetspruefungsliste aus dem
//    Auftrag. Die zusammengeschriebene Form deshalb als EIGENER
//    Listeneintrag, statt die Matching-Strategie fuer alle Woerter zu
//    aendern (das haette an anderer Stelle neue Fehler erzeugt, siehe
//    Kopfkommentar zu wordBoundary). Ein weiteres entdecktes Kompositum
//    ist damit eine Zeile Ergaenzung hier, kein Eingriff im Code.
// ------------------------------------------------------------
const RECRUITING_KEYWORD = wordBoundary([
  'einwand', 'einwände', 'einwaende', 'preis', 'nachfassen', 'einladung', 'kein interesse',
  'preiseinwand', 'preiseinwände', 'preiseinwaende',
]);

export const recruiting: IntentDefinition = {
  id: 'recruiting',
  label: 'Recruiting',
  categories: ['recruiting', 'einwaende', 'prozess'],
  test(message) {
    return RECRUITING_KEYWORD.test(message) ? 0.85 : null;
  },
};

// ------------------------------------------------------------
// 6. Duftparty.
// ------------------------------------------------------------
const DUFTPARTY_KEYWORD = wordBoundary([
  'duftparty', 'gastgeber', 'gastgeberin', 'bestellformular', 'vorbereitung',
]);

export const duftparty: IntentDefinition = {
  id: 'duftparty',
  label: 'Duftparty',
  categories: ['duftparty'],
  test(message) {
    return DUFTPARTY_KEYWORD.test(message) ? 0.85 : null;
  },
};

// ------------------------------------------------------------
// 7. Kontakte -- KEINE Wissenskategorie. Kontaktdaten liegen in
//    public.contacts, nicht in knowledge_docs. Erkennung beschraenkt
//    sich auf die vom Auftrag genannten CRM-Begriffe; beliebige
//    Vornamen (Beispiel "Sarah") lassen sich ohne Namensdatenbank oder
//    einen weiteren KI-Aufruf nicht zuverlaessig erkennen und werden
//    hier bewusst NICHT geraten. Ist ein Kontakt bereits ueber
//    contactId ausgewaehlt, liefert der bestehende Mechanismus
//    (KONTAKT-KONTEXT) ohnehin unabhaengig von diesem Intent die
//    Kontaktdaten.
// ------------------------------------------------------------
const KONTAKTE_KEYWORD = wordBoundary(['whatsapp', 'kunde', 'kundin', 'follow-up', 'followup']);

export const kontakte: IntentDefinition = {
  id: 'kontakte',
  label: 'Kontakte',
  categories: [],
  skipRag: true,
  test(message) {
    return KONTAKTE_KEYWORD.test(message) ? 0.7 : null;
  },
};

// ------------------------------------------------------------
// 8. Aufgaben -- KEINE Wissenskategorie. Der Tagesplan liegt in
//    daily_plan_items, nicht in knowledge_docs. Diese Tabelle wird
//    hier bewusst NICHT gelesen (Auftrag: "Heute" nicht aendern).
//    Stattdessen RAG ueberspringen und das Modell ehrlich sagen
//    lassen, dass es den Tagesplan nicht direkt einsehen kann, statt
//    einen zu erfinden.
// ------------------------------------------------------------
const AUFGABEN_KEYWORD = wordBoundary([
  'heute', 'meine aufgaben', 'was soll ich heute', 'was soll ich tun', 'tagesplan',
]);

export const aufgaben: IntentDefinition = {
  id: 'aufgaben',
  label: 'Aufgaben',
  categories: [],
  skipRag: true,
  test(message) {
    return AUFGABEN_KEYWORD.test(message) ? 0.75 : null;
  },
};

/**
 * Reihenfolge hier ist nur die Fallback-Reihenfolge bei exakten
 * Konfidenz-Gleichstaenden. Die eigentliche Auswahl in classify()
 * nimmt immer den hoechsten Konfidenzwert ueber ALLE Definitionen,
 * nicht die erste Übereinstimmung -- ein neuer Intent unten anhaengen
 * aendert daher nie das Verhalten bestehender Intents.
 */
export const INTENTS: IntentDefinition[] = [
  duftNummer,
  produkte,
  business,
  recruiting,
  duftparty,
  kontakte,
  aufgaben,
  duftName, // zuletzt: enthaelt die unspezifischste Fallback-Heuristik
];

// ---- inline: _shared/intent-router/index.ts ----
/**
 * Ab dieser Konfidenz wird die agentengebundene Kategorie
 * (agent.retrieval_categories) fuer DIESEN Turn ueberschrieben. Darunter
 * bleibt das bestehende Verhalten unangetastet (fallbackToAgent=true) --
 * das ist die Absicherung gegen Regression: ein unsicherer Treffer
 * darf niemals schlechter sein als der bisherige, ungeaenderte Weg.
 */
const MIN_CONFIDENCE = 0.5;

export function classifyIntent(message: string): IntentResult {
  const trimmed = message.trim();
  let best: { id: (typeof INTENTS)[number]['id']; confidence: number; def: (typeof INTENTS)[number] } | null = null;

  for (const def of INTENTS) {
    const confidence = def.test(trimmed);
    if (confidence === null) continue;
    if (!best || confidence > best.confidence) {
      best = { id: def.id, confidence, def };
    }
  }

  if (!best || best.confidence < MIN_CONFIDENCE) {
    return {
      intent: 'unbekannt',
      confidence: best?.confidence ?? 0,
      categories: [],
      skipRag: false,
      searchQuery: trimmed,
      fallbackToAgent: true,
    };
  }

  return {
    intent: best.id,
    confidence: best.confidence,
    categories: best.def.categories,
    skipRag: best.def.skipRag ?? false,
    searchQuery: best.def.rewriteQuery ? best.def.rewriteQuery(trimmed) : trimmed,
    fallbackToAgent: false,
  };
}

// ---- inline: _shared/format/strip-markdown.ts ----
/**
 * Entfernt Markdown und normalisiert die Ausgabe auf das im Auftrag
 * erlaubte Zeichenrepertoire. Sprint 3.1, 30. Juli 2026.
 *
 * WARUM MECHANISCH statt nur eine Promptanweisung: Sprachmodelle folgen
 * Formatierungsanweisungen zuverlaessig, aber nicht garantiert -- und
 * die eingebetteten Wissensausschnitte (aus echten Dokumenten) koennen
 * selbst Markdown enthalten, das wortwoertlich in die Antwort
 * uebernommen wird. Eine Anweisung allein wuerde das nicht sicher
 * verhindern. Diese Funktion laeuft NACH der Antwortgenerierung, auf
 * dem tatsaechlichen Text, unabhaengig davon, ob das Modell sich an die
 * Anweisung gehalten hat.
 *
 * Erlaubt bleiben, wie im Auftrag festgelegt: . , : ; ? ! ( ) " ' sowie
 * nummerierte Listen (1. 2. 3.) und Aufzaehlungspunkte (• Punkt).
 */
export function stripMarkdown(text: string): string {
  let s = text;

  // Codebloecke zuerst, bevor einzelne Backticks behandelt werden.
  s = s.replace(/```[\s\S]*?```/g, (block) => block.replace(/```/g, '').trim());
  // Einzelne Inline-Backticks: Zeichen entfernen, Inhalt behalten.
  s = s.replace(/`([^`]+)`/g, '$1');

  // Ueberschriften: fuehrende Rauten entfernen, Text behalten.
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, '');

  // Fett/kursiv: **text**, __text__, *text*, _text_ -> text.
  // Reihenfolge wichtig: doppelte Marker vor einfachen behandeln, sonst
  // bleiben einzelne Sternchen uebrig.
  s = s.replace(/\*\*\*([^*]+)\*\*\*/g, '$1');
  s = s.replace(/___([^_]+)___/g, '$1');
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1');
  s = s.replace(/__([^_]+)__/g, '$1');
  s = s.replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, '$1');
  s = s.replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, '$1');

  // Markdown-Links: [Text](url) -> Text. Bilder: ![Alt](url) -> Alt.
  s = s.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1');

  // Zitatzeichen am Zeilenanfang.
  s = s.replace(/^\s{0,3}>\s?/gm, '');

  // Horizontale Trenner: eine Zeile aus nur -, * oder _ (mind. 3).
  s = s.replace(/^\s*([-*_])\1{2,}\s*$/gm, '');

  // Tabellen-Pipes: durch ein Leerzeichen ersetzen, kein Zeichen aus
  // der Verbotsliste beibehalten.
  s = s.replace(/\|/g, ' ');

  // Aufzaehlungszeichen -, * am Zeilenanfang auf den erlaubten
  // Aufzaehlungspunkt "•" vereinheitlichen. Numerierte Listen ("1. ")
  // bleiben unveraendert, sie sind bereits im erlaubten Format.
  s = s.replace(/^\s*[-*]\s+/gm, '• ');

  // Rohes HTML entfernen.
  s = s.replace(/<\/?[a-zA-Z][^>]*>/g, '');

  // Ueberzaehlige Leerzeichen und Leerzeilen, die durch das Entfernen
  // entstanden sind, wieder einsammeln.
  s = s.replace(/[ \t]{2,}/g, ' ');
  s = s.replace(/\n{3,}/g, '\n\n');
  s = s.split('\n').map((line) => line.trimEnd()).join('\n');

  return s.trim();
}

// ============================================================
// coach-chat: Der eine Coach mit Spezialisten dahinter (ADR-011).
// Ablauf: Auth -> Limit -> Kontext laden (unter RLS des Nutzers!)
// -> Router -> Retrieval (pgvector) -> Antwort -> persistieren.
// Der Client schickt nur contactId + Nachricht; allen Kontext
// baut der Server selbst (Sprint-4-Prinzip: Kontext-first).
// ============================================================

// Embeddings: ausschliesslich Gemini, unveraendert (Betreiberentscheidung
// vom 29. Juli 2026 -- eine andere Dimension wuerde RAG veraendern).
// Chat: Provider-Abstraktion vom 30. Juli 2026. Reihenfolge Groq ->
// OpenRouter -> Cerebras mit automatischem Fallback, siehe die
// Provider-Abstraktion unter _shared (Ordner ai-providers).
// Intent-Router, Sprint 3.1: pro-Nachricht-Klassifikation der
// Wissenskategorie, unabhaengig vom bestehenden Einmal-pro-Konversation-
// Router oben (ROUTER_PROMPT). Siehe intent-router/types.ts fuer die
// Abgrenzung der beiden Mechanismen.

const PHASE_LABELS: Record<string, string> = {
  lead: 'Lead',
  im_gespraech: 'Im Gespräch',
  praesentation_offen: 'Präsentation gesendet',
  praesentation: 'Präsentation gesehen',
  fit_check: 'Fit Check abgeschlossen',
  three_way_call: '3-Way-Call durchgeführt',
  kunde: 'Kunde',
  partner: 'Partner',
};

const EVENT_LABELS: Record<string, string> = {
  contact_created: 'Kontakt erstellt',
  first_touch: 'Erstes Gespräch',
  follow_up: 'Follow-up',
  presentation_sent: 'Präsentation gesendet',
  presentation_viewed: 'Präsentation angesehen',
  fit_check_sent: 'Fit Check gesendet',
  fit_check_completed: 'Fit Check abgeschlossen',
  waytomoon_sent: 'WayToMoon gesendet',
  three_way_call_done: '3-Way-Call durchgeführt',
  party_scheduled: 'Duftparty geplant',
  party_done: 'Duftparty durchgeführt',
  became_customer: 'Kunde geworden',
  registered: 'Als Partner registriert',
};

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  const t0 = Date.now();
  const timings: Record<string, number> = {};
  const mark = (key: string, since: number) => { timings[key] = Date.now() - since; };
  try {
    // User-Client mit dem JWT des Aufrufers: JEDE Datenbankoperation
    // in dieser Function läuft unter der RLS des Nutzers (ADR-002/014).
    const authHeader = req.headers.get('Authorization') ?? '';
    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: authError } = await db.auth.getUser();
    if (authError || !userData.user) return json({ error: 'Nicht angemeldet.' }, 401);
    const userId = userData.user.id;

    const { data: profile } = await db.from('profiles').select('*').eq('id', userId).single();
    if (!profile) return json({ error: 'Kein Profil gefunden.' }, 403);

    // Kostenkontrolle: Tageslimit aus den Org-Einstellungen (ADR-007).
    const { data: org } = await db
      .from('organizations')
      .select('settings')
      .eq('id', profile.org_id)
      .single();
    const dailyLimit = Number(org?.settings?.coach_daily_message_limit ?? 50);
    // Schwellwert für die Wissenssuche. Default bewusst niedriger als der
    // alte OpenAI-Wert (0.25): Gemini-Cosine-Werte liegen im Schnitt
    // niedriger, ein zu hoher Wert liefert schlicht keine Dokumente.
    const rawMinSim = Number(org?.settings?.coach_min_similarity);
    const minSimilarity =
      Number.isFinite(rawMinSim) && rawMinSim >= 0 && rawMinSim <= 1 ? rawMinSim : 0.2;
    const { data: usedToday } = await db.rpc('coach_messages_today', { p_user: userId });
    if ((usedToday ?? 0) >= dailyLimit) {
      return json({
        error: `Tageslimit erreicht (${dailyLimit} Nachrichten). Morgen geht es weiter.`,
      }, 429);
    }

    const body = await req.json();
    const message = String(body.message ?? '').trim();
    const contactId = body.contactId ? String(body.contactId) : null;
    let convoId = body.conversationId ? String(body.conversationId) : null;
    if (!message) return json({ error: 'Leere Nachricht.' }, 400);

    // ---------- Kontext: Kontakt + Phase + letzte Events ----------
    const tContext = Date.now();
    let contactContext = '';
    if (contactId) {
      const [contact, phase, events] = await Promise.all([
        db.from('contacts').select('*').eq('id', contactId).single(),
        db.from('contact_phases').select('*').eq('contact_id', contactId).single(),
        // [N-1] Wirksame Events (Korrekturen herausgerechnet) — der Coach
        // sieht dieselbe Wahrheit wie Phase-Ableitung und Regel-Engine.
        db.from('effective_pipeline_events').select('event_type, occurred_at')
          .eq('contact_id', contactId).order('occurred_at', { ascending: false }).limit(6),
      ]);
      if (!contact.data) return json({ error: 'Kontakt nicht gefunden.' }, 404);

      const days = phase.data?.last_event_at
        ? Math.floor((Date.now() - new Date(phase.data.last_event_at).getTime()) / 86_400_000)
        : null;
      // Explizit typisiert: unter `strict` ist ein impliziter any hier ein
      // Fehler (blockiert `deno check`), und der Coach-Kontext darf nie ein
      // rohes "undefined" enthalten.
      const eventRows = (events.data ?? []) as Array<{ event_type: string; occurred_at: string }>;
      const phaseKey: string = phase.data?.phase ?? 'lead';

      const lines = [
        `Name: ${contact.data.name}`,
        `Pipeline-Phase: ${PHASE_LABELS[phaseKey] ?? phaseKey}`,
        `Letzter Kontakt: ${days === null ? 'noch nie' : days === 0 ? 'heute' : `vor ${days} Tag(en)`}`,
        contact.data.next_step ? `Geplanter nächster Schritt: ${contact.data.next_step}` : null,
        contact.data.notes ? `Notizen: ${contact.data.notes}` : null,
        'Letzte Ereignisse (neueste zuerst):',
        ...eventRows.map(
          (e) =>
            `- ${EVENT_LABELS[e.event_type] ?? e.event_type} (${String(e.occurred_at).slice(0, 10)})`
        ),
      ].filter(Boolean);
      contactContext = `KONTAKT-KONTEXT (aus der Pipeline des Nutzers, bereits bekannt):\n${lines.join('\n')}`;
    }

    mark('context_ms', tContext);

    // ---------- Konversation laden/anlegen ----------
    let history: ChatMessage[] = [];
    let agentKey: string | null = null;
    if (convoId) {
      const { data: convo } = await db.from('coach_convos').select('*').eq('id', convoId).single();
      if (!convo) return json({ error: 'Konversation nicht gefunden.' }, 404);
      agentKey = convo.agent_key;
      const { data: msgs } = await db.from('coach_messages')
        .select('role, content').eq('convo_id', convoId)
        .order('created_at').limit(20);
      history = (msgs ?? []) as ChatMessage[];
    } else {
      const { data: convo, error } = await db.from('coach_convos')
        .insert({ user_id: userId, org_id: profile.org_id, contact_id: contactId })
        .select().single();
      if (error) throw error;
      convoId = convo.id;
    }

    // ---------- Router: einmal pro Konversation (ADR-011) ----------
    const tRouter = Date.now();
    if (!agentKey) {
      // Der Router darf den Coach nie blockieren: faellt die Klassifikation
      // aus, greift der sichere Default 'knowledge'.
      let routed = '';
      try {
        routed = (
          await chat({
            system: ROUTER_PROMPT,
            messages: [{ role: 'user', content: message }],
            maxTokens: 16,
          })
        ).text
          .trim()
          .toLowerCase();
      } catch (e) {
        console.warn('router fallback', e instanceof Error ? e.message : e);
      }
      agentKey = ['recruiting', 'sales', 'knowledge'].includes(routed) ? routed : 'knowledge';
      await db.from('coach_convos').update({ agent_key: agentKey }).eq('id', convoId);
    }

    mark('router_ms', tRouter);

    const { data: agent } = await db.from('agents')
      .select('*').eq('org_id', profile.org_id).eq('key', agentKey).single();
    if (!agent) return json({ error: 'Kein Coach konfiguriert.' }, 500);

    // ---------- Intent-Router (Sprint 3.1): pro Nachricht neu ----------
    // Bestimmt NUR die Wissenskategorie fuer DIESEN Turn. Bei niedriger
    // Konfidenz (fallbackToAgent=true) bleibt das bestehende Verhalten
    // ueber agent.retrieval_categories unveraendert -- keine Regression.
    const tIntent = Date.now();
    const intentResult = classifyIntent(message);

    // Kontext-Kontinuitaet bei Anschlussfragen (Sprint 3, Punkt 4).
    // Beispiel aus dem Auftrag: "129" -> "Wie riecht er?" -> "Wie lange
    // haelt er?". Die Anschlussfrage traegt fuer sich genommen kein
    // erkennbares Schluesselwort und wuerde auf den Agenten-Standard
    // zurueckfallen -- das wuerde die Kategorie mitten im Thema
    // faelschlich zuruecksetzen. Abhilfe: faellt die AKTUELLE Nachricht
    // auf 'unbekannt' zurueck UND es gibt eine vorherige Nutzernachricht
    // in der Historie, wird DIESE testweise klassifiziert. Traf sie mit
    // ausreichender Konfidenz, uebernimmt der aktuelle Turn ihre
    // KATEGORIEN. Die Suchanfrage selbst bleibt die aktuelle Frage --
    // nur die Kategorie "erbt" sich, nicht der Suchtext. Kein Schema,
    // keine neue Tabelle: die Historie liegt ohnehin schon im Speicher.
    let effectiveIntent = intentResult;
    let intentSource: 'aktuelle_nachricht' | 'vorherige_nachricht' | 'agent_default' =
      intentResult.fallbackToAgent ? 'agent_default' : 'aktuelle_nachricht';
    if (intentResult.fallbackToAgent) {
      const lastUserMsg = [...history].reverse().find((m) => m.role === 'user');
      if (lastUserMsg) {
        const priorIntent = classifyIntent(lastUserMsg.content);
        if (!priorIntent.fallbackToAgent) {
          effectiveIntent = { ...priorIntent, searchQuery: message };
          intentSource = 'vorherige_nachricht';
        }
      }
    }
    mark('intent_ms', tIntent);

    // ---------- Retrieval: Teamdokumente (unter RLS des Nutzers) ----------
    const tRag = Date.now();
    let knowledgeBlock = '';
    let hadKnowledge = false;
    let ragSkipped = false;
    // Fuer die Protokollierung (Sprint 3, Punkt 6): welche Dokumente und
    // wie viele Treffer tatsaechlich verwendet wurden.
    let matchedDocs: Array<{ doc_id: string; doc_title: string; similarity: number }> = [];
    let exactMatchChunkIds: string[] = [];
    if (effectiveIntent.skipRag) {
      // Intent betrifft strukturierte Nutzerdaten (Kontakte, Aufgaben),
      // nicht die Wissensdatenbank. match_knowledge wuerde in der
      // falschen Quelle suchen. Stattdessen ein kurzer, ehrlicher
      // Hinweis: das Modell soll NICHT so tun, als saehe es Kontakt-
      // oder Tagesplandaten, die es hier nicht bekommen hat.
      ragSkipped = true;
      knowledgeBlock =
        'HINWEIS: Diese Frage betrifft vermutlich eigene Kontakte oder den ' +
        'Tagesplan des Nutzers. Du hast dazu KEINEN direkten Datenzugriff ' +
        'in dieser Antwort, außer der KONTAKT-KONTEXT ist unten angegeben. ' +
        'Erfinde keine Kontakt- oder Aufgabendaten. Verweise bei Bedarf auf ' +
        'die Bereiche Kontakte bzw. Heute in der App.';
    } else {
    try {
      // RETRIEVAL_QUERY, nicht RETRIEVAL_DOCUMENT: Gemini kodiert Fragen
      // anders als Dokumente. Verwechslung kostet Trefferqualität, ohne
      // einen Fehler zu erzeugen.
      //
      // effectiveIntent.searchQuery statt der rohen Nachricht: bei Intent
      // "Duftnummer" waere die Einbettung von blossem "129" kaum nah an
      // einem Dokument, das "Duftnummer 129: ..." sagt. Ohne erkannten
      // Intent (fallbackToAgent) ist searchQuery identisch zur rohen
      // Nachricht, unveraendertes Verhalten.
      const queryEmbedding = await geminiEmbed(effectiveIntent.searchQuery, 'RETRIEVAL_QUERY');
      const { data: matches } = await db.rpc('match_knowledge', {
        query_embedding: queryEmbedding,
        p_org_id: profile.org_id,
        // Erkannter Intent ueberschreibt NUR fuer diesen Aufruf die
        // Kategorien des Agenten -- agents.retrieval_categories selbst
        // bleibt unangetastet (Auftrag: Datenbank nicht aendern).
        match_categories: !effectiveIntent.fallbackToAgent && effectiveIntent.categories.length
          ? effectiveIntent.categories
          : (agent.retrieval_categories?.length ? agent.retrieval_categories : null),
        match_count: 5,
        // Wird jetzt EXPLIZIT übergeben statt den DB-Default (0.25) zu
        // nutzen: der Wert war auf den OpenAI-Vektorraum getunt und muss
        // für Gemini neu vermessen werden. Über organizations.settings
        // justierbar — dieselbe Mechanik wie coach_daily_message_limit,
        // also ohne Schemaänderung.
        min_similarity: minSimilarity,
      });
      if (matches && matches.length > 0) {
        hadKnowledge = true;
        matchedDocs = matches.map(
          (m: { doc_id: string; doc_title: string; similarity: number }) => ({
            doc_id: m.doc_id, doc_title: m.doc_title, similarity: m.similarity,
          }),
        );
        knowledgeBlock =
          'AUSZÜGE AUS DEN TEAMDOKUMENTEN (oberste Wahrheit):\n' +
          matches.map((m: { doc_title: string; content: string }) =>
            `[${m.doc_title}]\n${m.content}`).join('\n---\n');
      }
    } catch (_e) {
      // Embedding-Ausfall darf den Coach nicht stoppen: er antwortet
      // dann ohne Dokumente und behandelt Teamfragen als Wissenslücke.
    }

    // Exakter Zahlentreffer als Ergaenzung zur Vektorsuche (Sprint 3,
    // Bugfix Punkt 1). Verifiziert gegen den echten Wissensbestand: eine
    // blanke Zahl wie "129" traegt fuer ein Einbettungsmodell kaum
    // eigenes Bedeutungsgewicht, benachbarte Nummern (128/129/130) liegen
    // im Vektorraum praktisch gleich nah beieinander. Eine exakte
    // Textsuche nach der Ziffernfolge, mit Wortgrenze (kein Teiltreffer
    // wie "1290"), ist fuer GENAU DIESEN Fall zuverlaessiger als
    // semantische Naehe. Ergaenzt die Vektorsuche, ersetzt sie nicht, und
    // nutzt ausschliesslich vorhandene Tabellen -- keine neue Funktion,
    // keine Migration. RLS greift identisch zu match_knowledge, weil
    // derselbe `db`-Client mit demselben Nutzer-JWT verwendet wird.
    if (effectiveIntent.intent === 'duft_nummer') {
      const zahl = message.match(/\d{1,4}/)?.[0];
      if (zahl) {
        try {
          const { data: kategorieDocs } = await db.from('knowledge_docs')
            .select('id, title')
            .eq('org_id', profile.org_id)
            .in('category', effectiveIntent.categories);
          const docIds = (kategorieDocs ?? []).map((d: { id: string }) => d.id);
          if (docIds.length > 0) {
            const { data: kandidaten } = await db.from('knowledge_chunks')
              .select('id, doc_id, content')
              .in('doc_id', docIds)
              .ilike('content', `%${zahl}%`)
              .limit(5);
            const wortgrenze = new RegExp(`\\b${zahl}\\b`);
            const treffer = (kandidaten ?? []).filter(
              (c: { content: string }) => wortgrenze.test(c.content),
            );
            if (treffer.length > 0) {
              hadKnowledge = true;
              exactMatchChunkIds = treffer.map((c: { id: string }) => c.id);
              const titelNachId = new Map(
                (kategorieDocs ?? []).map((d: { id: string; title: string }) => [d.id, d.title]),
              );
              const exactBlock = treffer.map(
                (c: { doc_id: string; content: string }) =>
                  `[${titelNachId.get(c.doc_id) ?? 'Wissensdokument'}]\n${c.content}`,
              ).join('\n---\n');
              // Exakter Treffer zuerst: eine konkrete Ziffer ist eine
              // staerkere Aussage als semantische Naehe.
              knowledgeBlock = knowledgeBlock
                ? `EXAKTER ZAHLENTREFFER (bevorzugt verwenden):\n${exactBlock}\n\n${knowledgeBlock}`
                : `EXAKTER ZAHLENTREFFER (bevorzugt verwenden):\n${exactBlock}`;
            }
          }
        } catch (_e) {
          // Exakte Suche darf den Coach nie stoppen; die Vektorsuche
          // bleibt dann die alleinige Quelle.
        }
      }
    }
    }
    if (!hadKnowledge && !ragSkipped) {
      // [K-1] Datenschutz: NIE die Rohfrage loggen — sie kann private
      // Kontaktdaten enthalten, und Admins lesen diese Tabelle. Die
      // Frage wird erst zu einem anonymen Wissensthema generalisiert;
      // schlägt das fehl, wird NICHT geloggt (Privacy vor Metrik).
      //
      // Nicht ausgeloest bei ragSkipped: das ist keine Wissensluecke,
      // sondern ein Intent (Kontakte/Aufgaben), der bewusst keine
      // Wissenssuche durchlaeuft. Ihn hier zu loggen wuerde die
      // Luecken-Auswertung mit Faellen verwaessern, die gar keine sind.
      try {
        const topic = (await chat({
          system:
            'Fasse die Nutzerfrage als allgemeines Wissensthema zusammen: max. 12 Wörter, ' +
            'Deutsch, OHNE Namen, Zahlen zu Personen oder persönliche Details. ' +
            'Beispiel: "Wie überzeuge ich Mehmet mit 200€ Schulden?" -> ' +
            '"Einwandbehandlung bei finanziellen Bedenken". Antworte NUR mit dem Thema.',
          messages: [{ role: 'user', content: message.slice(0, 500) }],
          maxTokens: 60,
        })).text.trim().slice(0, 200);
        if (topic.length >= 5) {
          await db.from('knowledge_gaps').insert({
            org_id: profile.org_id, user_id: userId, agent_key: agentKey, question: topic,
          });
        }
      } catch (_e) {
        // bewusst kein Fallback auf die Rohfrage
      }
    }

    mark('rag_ms', tRag);

    // ---------- Antwort ----------
    const system = [
      CORE_RULES,
      `DEINE SPEZIALISIERUNG:\n${agent.system_prompt}`,
      `NUTZER: ${profile.first_name} (Rolle: ${profile.role}).`,
      contactContext || null,
      knowledgeBlock ||
        'HINWEIS: Zu dieser Frage wurden KEINE Teamdokumente gefunden. Beachte die Wissensbasis-Regel.',
    ].filter(Boolean).join('\n\n');

    const tLlm = Date.now();
    // agent.model wird hier bewusst NICHT gelesen: das Feld diente der
    // Uebersetzung auf eine Gemini-Modellklasse (mapToGeminiModel), ein
    // Konzept, das mit der Provider-Abstraktion entfaellt. Jeder Anbieter
    // verwendet sein eigenes fest gewaehltes Modell, siehe die Adapter
    // groq.ts, openrouter.ts und cerebras.ts unter _shared (Ordner
    // ai-providers). Das Datenbankfeld bleibt unveraendert bestehen,
    // nur ungenutzt fuer diesen Zweck -- Migration 15 verlangt, die
    // Datenbank hier nicht anzufassen.
    const chatResult = await chat({
      system,
      messages: [...history, { role: 'user', content: message }],
      maxTokens: 1024,
    });
    // Sprint 3.1: mechanische Bereinigung NACH der Generierung, siehe
    // Kopfkommentar in strip-markdown.ts. Laeuft immer, unabhaengig
    // davon, ob das Modell der Formatanweisung in CORE_RULES gefolgt
    // ist -- die Wissensausschnitte selbst koennen Markdown enthalten.
    const reply = stripMarkdown(chatResult.text.trim());
    mark('llm_ms', tLlm);

    // Nie eine leere Assistant-Nachricht persistieren: sie wuerde bei jedem
    // Folge-Turn als History mitgeschickt und den Verlauf vergiften.
    if (!reply) {
      return json({ error: 'Ascent konnte keine Antwort erzeugen. Bitte noch einmal senden.' }, 502);
    }

    await db.from('coach_messages').insert([
      { convo_id: convoId, role: 'user', content: message },
      { convo_id: convoId, role: 'assistant', content: reply },
    ]);
    await db.from('usage_events').insert({
      user_id: userId, org_id: profile.org_id, event_type: 'coach_message_sent',
      metadata: { agent_key: agentKey, had_knowledge: hadKnowledge },
    }).then(() => {}, () => {}); // Tracking bricht nie den Coach

    mark('total_ms', t0);
    // Strukturierte Metriken in die Function-Logs (ohne Inhalte, ADR-019).
    // Sprint 3 ergaenzt gegenueber 3.1: Dokumenttitel und Aehnlichkeit
    // der Vektortreffer, Chunk-IDs des exakten Zahlentreffers,
    // Gesamttrefferzahl, und ob der verwendete Intent von der aktuellen
    // Nachricht, der vorherigen Nachricht (Kontext-Kontinuitaet) oder
    // dem Agenten-Standard stammt. Dient ausschliesslich der
    // Fehlersuche, wie im Auftrag festgelegt -- keine Nutzerinhalte,
    // nur Metadaten.
    console.log(JSON.stringify({
      metric: 'coach_chat', agentKey, hadKnowledge,
      provider: chatResult.provider, providerModel: chatResult.model,
      intent: intentResult.intent,
      intentConfidence: intentResult.confidence,
      intentSource,
      effectiveIntent: effectiveIntent.intent,
      // KORRIGIERT gegenueber der ersten Fassung: hier stand faelschlich
      // intentResult statt effectiveIntent. Bei einer Anschlussfrage
      // (intentSource='vorherige_nachricht') haette die Logzeile sonst
      // eine andere Kategorie angezeigt als die, die tatsaechlich
      // durchsucht wurde -- irrefuehrend genau fuer die Faelle, die
      // dieses Feld nachvollziehbar machen soll.
      knowledgeCategories: ragSkipped ? [] :
        (!effectiveIntent.fallbackToAgent && effectiveIntent.categories.length
          ? effectiveIntent.categories
          : (agent.retrieval_categories ?? [])),
      intentFallbackToAgent: intentResult.fallbackToAgent,
      ragSkipped,
      matchedDocuments: matchedDocs.map((m) => ({ doc_id: m.doc_id, title: m.doc_title, similarity: m.similarity })),
      exactMatchChunkIds,
      hitCount: matchedDocs.length + exactMatchChunkIds.length,
      ...timings,
    }));
    return json({ conversationId: convoId, agentKey, reply, timings });
  } catch (e) {
    // AllProvidersFailedError traegt die vollstaendige Versuchsliste --
    // im Log steht damit, welcher Anbieter wann aus welchem Grund
    // gescheitert ist, nicht nur der letzte. Jeder einzelne Versuch wurde
    // bereits vom Router selbst protokolliert (ai-providers/router.ts);
    // diese Zeile ordnet den GESAMTAUSFALL dem Coach-Aufruf zu.
    if (e instanceof AllProvidersFailedError) {
      console.error(
        `coach-chat: alle Anbieter gescheitert, letzter Grund [${e.lastCode}]`,
        JSON.stringify(e.attempts),
      );
    } else {
      console.error('coach-chat error', e instanceof Error ? e.message : e);
    }

    // Antwort nach Grund unterscheiden. Vorher ging JEDER Fehler als
    // HTTP 500 mit demselben Text hinaus, auch ein Kontingentlimit.
    // Das war doppelt falsch: 500 bedeutet Serverfehler, ein 429 der
    // Gegenseite ist keiner, und "nicht erreichbar" stimmte nicht.
    //
    // Wiederholungen erfolgen bereits in gemini.ts: GEMINI_MAX_RETRIES = 2
    // mit exponentiellem Backoff fuer 408, 429, 500, 502, 503, 504.
    // Was hier ankommt, ist also ein Fehler NACH zwei Versuchen.
    //
    // Das Frontend liest das Feld `error` aus dem Rumpf (coachApi.ts)
    // und zeigt es unveraendert an. Der Text ist damit die Meldung,
    // die der Nutzer liest.
    // Fuenf Ursachencodes statt vorher sechs: 'refused' und
    // 'empty_response' waren Gemini-spezifische Sicherheitskonzepte
    // (Prompt- bzw. Antwortblockade), die es bei den drei neuen Anbietern
    // in dieser Form nicht gibt. Beide Faelle laufen jetzt unter
    // 'invalid_response' zusammen, mit einer Meldung, die beide Ursachen
    // deckt.
    //
    // Diese Meldung erscheint nur, wenn ALLE DREI Anbieter gescheitert
    // sind -- kein einzelner Ausfall mehr, sondern ein gleichzeitiger
    // Ausfall dreier unabhaengiger Anbieter. Entsprechend seltener als
    // zuvor, und der Text spiegelt das wider.
    const fehler: { status: number; text: string; retryAfter?: number } =
      e instanceof AllProvidersFailedError
        ? {
            rate_limited: {
              status: 429,
              text: 'Ascent ist gerade stark ausgelastet. Bitte in etwa einer Minute ' +
                    'noch einmal senden.',
              retryAfter: 60,
            },
            timeout: {
              status: 504,
              text: 'Ascent hat zu lange gebraucht. Bitte die Frage noch einmal senden, ' +
                    'gern etwas kuerzer.',
            },
            upstream: {
              status: 503,
              text: 'Ascent ist gerade nicht erreichbar. Bitte gleich noch einmal versuchen.',
            },
            invalid_response: {
              status: 502,
              text: 'Ascent konnte keine Antwort erzeugen. Bitte noch einmal senden.',
            },
            missing_api_key: {
              status: 500,
              text: 'Ascent ist nicht vollstaendig konfiguriert. Bitte den Betreiber informieren.',
            },
          }[e.lastCode]
        : { status: 500, text: 'Der Coach ist gerade nicht erreichbar. Versuche es gleich noch einmal.' };

    const kopf: Record<string, string> = { ...corsHeaders, 'Content-Type': 'application/json' };
    if (fehler.retryAfter) kopf['Retry-After'] = String(fehler.retryAfter);

    return new Response(JSON.stringify({ error: fehler.text }), {
      status: fehler.status,
      headers: kopf,
    });
  }
});
