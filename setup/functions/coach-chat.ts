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
  // x-ascendos-org: org selector from the shared Supabase client (additive; required for browser preflight).
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-ascendos-org',
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
 *
 * Ascent ist kein Chatbot. Ascent ist der persönliche Business-Mentor.
 */
export type CoachLocale = 'de' | 'tr' | 'fr' | 'en' | 'it' | 'pl';

const COACH_LOCALES: readonly CoachLocale[] = ['de', 'tr', 'fr', 'en', 'it', 'pl'];

export function normalizeCoachLocale(value: unknown): CoachLocale {
  return typeof value === 'string' && COACH_LOCALES.includes(value as CoachLocale)
    ? (value as CoachLocale)
    : 'de';
}

export type MentorCardLabels = {
  mistake: string;
  tip: string;
  why: string;
  action: string;
};

const MENTOR_CARD_LABELS: Record<CoachLocale, MentorCardLabels> = {
  de: {
    mistake: 'Häufigster Fehler',
    tip: 'Profi-Tipp',
    why: 'Warum das wichtig ist',
    action: 'Dein nächster Schritt',
  },
  tr: {
    mistake: 'En büyük hata',
    tip: 'Uzman ipucu',
    why: 'Neden önemli',
    action: 'Bir sonraki adımın',
  },
  fr: {
    mistake: 'La plus grande erreur',
    tip: 'Conseil de pro',
    why: "Pourquoi c'est important",
    action: 'Votre prochaine étape',
  },
  en: {
    mistake: 'Biggest mistake',
    tip: 'Pro tip',
    why: 'Why it matters',
    action: 'Your next step',
  },
  it: {
    mistake: 'Errore più grande',
    tip: 'Consiglio da professionista',
    why: 'Perché è importante',
    action: 'Il tuo prossimo passo',
  },
  pl: {
    mistake: 'Najczęstszy błąd',
    tip: 'Wskazówka eksperta',
    why: 'Dlaczego to ważne',
    action: 'Twój następny krok',
  },
};

export function mentorCardLabels(locale: CoachLocale): MentorCardLabels {
  return MENTOR_CARD_LABELS[locale];
}

const LANGUAGE_NAMES: Record<CoachLocale, string> = {
  de: 'GERMAN (Deutsch)',
  tr: 'TURKISH (Türkçe)',
  fr: 'FRENCH (français)',
  en: 'ENGLISH',
  it: 'ITALIAN (italiano)',
  pl: 'POLISH (polski)',
};

/**
 * Kept separate and appended after every other system-prompt block. This is
 * the final authority even when an agent prompt, conversation, or knowledge
 * document uses a different language.
 */
export function languageDirective(locale: CoachLocale): string {
  const labels = mentorCardLabels(locale);
  return `
LANGUAGE — ABSOLUTE, HIGHEST-PRIORITY OUTPUT RULE:
- The user's selected language is ${LANGUAGE_NAMES[locale]}.
- Answer ONLY in ${LANGUAGE_NAMES[locale]}. Never mix in words, labels, headings, closings, or sentences from another language.
- The conversation history and knowledge documents may be written in ANY language. Understand and use them, but ALWAYS write the answer in ${LANGUAGE_NAMES[locale]}.
- A language used in a quoted source, prior message, contact note, or knowledge article NEVER changes the answer language.
- Keep names, product names, and URLs unchanged. Translate all surrounding explanation.
- Mentor-card labels MUST be written exactly as follows:
  - "${labels.mistake}: ..."
  - "${labels.tip}: ..."
  - "${labels.why}: ..."
  - "${labels.action}: ..."
- These exact labels override every card-label example elsewhere in the prompt.
`.trim();
}

export const CORE_RULES = `
Du bist Ascent — der persönliche Business-Mentor in AscendOS.
Du bist kein Chatbot, kein Assistent und kein ChatGPT-Ersatz.
Du bist der Mentor, dem der Nutzer vertraut, weil du ruhig, klar und
umsetzungsstark führst — wie jemand, der bereits mehrere Organisationen
erfolgreich aufgebaut hat.

PERSÖNLICHKEIT (immer, ohne Ausnahme):
- Ruhig. Sicher. Erfahren. Motivierend.
- Nie arrogant. Nie robotisch. Nie überdreht. Nie generisch.
- Du sprichst auf Augenhöhe: klar, warm, bestimmt — ohne Hype.
- Keine Floskeln ("Du schaffst das!", "Amazing!", "Lass uns brainstormen").
- Keine Corporate-Sprache. Keine Bullet-Orgie ohne Substanz.
- Feiere Erfolge knapp und echt ("Sauber.", "Das war der richtige Move.").
- Erkenne Ausreden freundlich, aber klar — ohne zu demütigen.
- Stelle falsches Denken höflich infrage ("Ich sehe das anders — und zwar deshalb: …").

PRIORITÄT JEDER ANTWORT (in dieser Reihenfolge):
1. Die wichtigste Einsicht (ein Gedanke, der zählt)
2. Warum das wichtig ist (Business-Hebel in 1 Satz)
3. Der nächste konkrete Schritt (heute umsetzbar)
4. Kurze Motivation nur wenn sie echt sitzt — sonst weglassen

ARBEITSWEISE:
- Nutze IMMER den mitgelieferten Kontext und den Gesprächsverlauf.
  Baue darauf auf. Starte nie bei null, wenn Vorgeschichte da ist.
- Wiederhole keine Fragen, deren Antwort schon im Kontext steht.
- Öffne mit einem kurzen Lage-Satz (1–2 Sätze), der zeigt: du bist
  im Thema — dann die Einsicht.
- Fehlt eine entscheidende Info: stelle GENAU EINE gezielte Rückfrage
  und stoppe dort. Keine Mehrfachfragen.
- Erkläre WARUM etwas wirkt, nicht nur WAS zu tun ist.
- Optimiere immer auf Ausführung. Theorie nur, wenn sie die Aktion
  schärft.
- Nachrichtenentwürfe: natürliche Du-Sprache, kopierfertig.

GESPRÄCHSFÜHRUNG:
- Beziehe dich natürlich auf frühere Aussagen des Nutzers.
- Wenn der Nutzer Ausweichen oder Aufschieben zeigt: benenne es ruhig
  und führe zurück zur kleinsten machbaren Aktion.
- Wenn der Nutzer einen Win meldet: anerkennen, dann den nächsten Hebel.
- Führe. Unterhalte nicht.

ABSCHLUSS (nicht verhandelbar):
- Beende NIEMALS mit "Noch Fragen?", "Anything else?", "Kann ich sonst
  noch helfen?" oder ähnlichen Chatbot-Floskeln.
- Schließe natürlich und handlungsorientiert, z. B.:
  • "Nächster Schritt: …"
  • "Wenn ich neben dir säße, würde ich genau das als Nächstes tun: …"
  • "Mach das zuerst. Danach kommen wir zurück und schärfen es."
- Bei voller Antwort: immer mit "Nächster Schritt: …" enden
  (heute umsetzbar). Ausnahme: reine Rückfrage.

LESEFLUSS (Premium Reading):
- In unter 3 Sekunden scannbar.
- Absätze: max. 2–3 kurze Sätze (~3–5 Zeilen). Leerzeile dazwischen.
- Prozesse als 1. 2. 3. — Prinzipien als kurze - Bullets.
- **Fettschrift** nur für Schlüsselbegriffe — sparsam, nie ganze Sätze.
- Kurze ## Überschriften nur bei längeren Antworten (max. 2).
- Lieber eine knappe, starke Antwort als eine lange, weiche.

MENTOR-KARTEN (bei offenen / komplexen Fragen, 1–3 Stück):
Eigene Zeile — die App rendert Premium-Karten.
Verwende dafür ausschließlich die exakten Labels aus dem LANGUAGE-Block unten.
Das dort angegebene Action-Label ist Pflicht am Ende voller Antworten.

Karten-Regeln:
- Lieber 1–2 starke Karten als vier schwache.
- Reine Faktenfragen: nur Antwort + "Nächster Schritt:".
- Nie Karten erfinden, nur um Struktur zu füllen.
- Kein Emoji in den Labels.

WISSENSBASIS:
- Teamdokumente (falls vorhanden) sind oberste Wahrheit.
- Fehlt Wissen zu Chogan / Team Seyda / Produkt / Vergütung: sage klar,
  dass dir keine Teaminformation vorliegt — und rate nicht.
- Allgemeine Prinzipien darfst du als solche gekennzeichnet anbieten.

GRENZEN (nicht verhandelbar):
- Keine Einkommensversprechen, keine "finanzielle Freiheit"-Prognosen.
- Keine Heil- oder Gesundheitswirkungen von Produkten.
- Kein Druck, keine Manipulation, keine Tricks.
- Du versendest keine Nachrichten und führst keine Aktionen aus.
  Du bereitest vor — der Mensch entscheidet.

FORMAT:
- Leichtes Markdown. Der Nutzer sieht nie rohe Syntax.
- Erlaubt: **fett**, kurze ##, - Listen, 1. 2. 3., > für
  Nachrichtenentwürfe, Mentor-Karten wie oben.
- Verboten: HTML, Tabellen |, unnötige Codeblöcke, ---, Emoji-Spam.
- URLs als reinen Text (https://...), unverändert.
- Nie verraten, dass intern Wissensdokumente geladen wurden.
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
 * Normalisiert Coach-Antworten für die Premium-Markdown-UI.
 *
 * Früher: stripMarkdown entfernte ** und # mechanisch (Sprint 3.1),
 * weil die App Plaintext erwartete. Jetzt rendert die UI Markdown —
 * wir erhalten Struktur und entfernen nur XSS-/Rauschquellen.
 *
 * Behält: **fett**, Überschriften, Listen, Zitate, Links.
 * Entfernt: Roh-HTML, überzählige Leerzeilen.
 */
export function sanitizeCoachReply(text: string): string {
  let s = text;

  // Roh-HTML entfernen (XSS / Modell-Leak aus Dokumenten).
  s = s.replace(/<\/?[a-zA-Z][^>]*>/g, '');

  // Halb kaputte HTML-Entities, die Modelle manchmal aus Docs übernehmen.
  s = s.replace(/&nbsp;/gi, ' ');
  s = s.replace(/&amp;/gi, '&');
  s = s.replace(/&lt;/gi, '<');
  s = s.replace(/&gt;/gi, '>');

  // Überzählige Leerzeichen / Leerzeilen einsammeln.
  s = s.replace(/[ \t]+\n/g, '\n');
  s = s.replace(/\n{3,}/g, '\n\n');
  s = s
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n');

  return s.trim();
}

/** @deprecated Alias — bestehende Imports / Tests. */
export function stripMarkdown(text: string): string {
  return sanitizeCoachReply(text);
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

const PHASE_LABELS: Record<CoachLocale, Record<string, string>> = {
  de: {
    lead: 'Lead',
    im_gespraech: 'Im Gespräch',
    praesentation_offen: 'Präsentation gesendet',
    praesentation: 'Präsentation gesehen',
    fit_check: 'Fit Check abgeschlossen',
    three_way_call: '3-Way-Call durchgeführt',
    kunde: 'Kunde',
    partner: 'Partner',
  },
  tr: {
    lead: 'Potansiyel kişi',
    im_gespraech: 'Görüşme aşamasında',
    praesentation_offen: 'Sunum gönderildi',
    praesentation: 'Sunum görüntülendi',
    fit_check: 'Fit Check tamamlandı',
    three_way_call: '3-Way-Call yapıldı',
    kunde: 'Müşteri',
    partner: 'İş ortağı',
  },
  fr: {
    lead: 'Prospect',
    im_gespraech: 'En conversation',
    praesentation_offen: 'Présentation envoyée',
    praesentation: 'Présentation consultée',
    fit_check: 'Fit Check terminé',
    three_way_call: '3-Way-Call effectué',
    kunde: 'Client',
    partner: 'Partenaire',
  },
  en: {
    lead: 'Lead',
    im_gespraech: 'In conversation',
    praesentation_offen: 'Presentation sent',
    praesentation: 'Presentation viewed',
    fit_check: 'Fit Check completed',
    three_way_call: '3-Way Call completed',
    kunde: 'Customer',
    partner: 'Partner',
  },
  it: {
    lead: 'Contatto potenziale',
    im_gespraech: 'In conversazione',
    praesentation_offen: 'Presentazione inviata',
    praesentation: 'Presentazione visualizzata',
    fit_check: 'Fit Check completato',
    three_way_call: '3-Way-Call effettuata',
    kunde: 'Cliente',
    partner: 'Partner',
  },
  pl: {
    lead: 'Lead',
    im_gespraech: 'W rozmowie',
    praesentation_offen: 'Prezentacja wysłana',
    praesentation: 'Prezentacja obejrzana',
    fit_check: 'Fit Check ukończony',
    three_way_call: '3-Way-Call przeprowadzony',
    kunde: 'Klient',
    partner: 'Partner',
  },
};

const EVENT_LABELS: Record<CoachLocale, Record<string, string>> = {
  de: {
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
  },
  tr: {
    contact_created: 'Kişi oluşturuldu',
    first_touch: 'İlk görüşme',
    follow_up: 'Takip',
    presentation_sent: 'Sunum gönderildi',
    presentation_viewed: 'Sunum görüntülendi',
    fit_check_sent: 'Fit Check gönderildi',
    fit_check_completed: 'Fit Check tamamlandı',
    waytomoon_sent: 'WayToMoon gönderildi',
    three_way_call_done: '3-Way-Call yapıldı',
    party_scheduled: 'Parfüm partisi planlandı',
    party_done: 'Parfüm partisi yapıldı',
    became_customer: 'Müşteri oldu',
    registered: 'İş ortağı olarak kaydoldu',
  },
  fr: {
    contact_created: 'Contact créé',
    first_touch: 'Premier échange',
    follow_up: 'Relance',
    presentation_sent: 'Présentation envoyée',
    presentation_viewed: 'Présentation consultée',
    fit_check_sent: 'Fit Check envoyé',
    fit_check_completed: 'Fit Check terminé',
    waytomoon_sent: 'WayToMoon envoyé',
    three_way_call_done: '3-Way-Call effectué',
    party_scheduled: 'Soirée parfum planifiée',
    party_done: 'Soirée parfum réalisée',
    became_customer: 'Devenu client',
    registered: 'Inscrit comme partenaire',
  },
  en: {
    contact_created: 'Contact created',
    first_touch: 'First conversation',
    follow_up: 'Follow-up',
    presentation_sent: 'Presentation sent',
    presentation_viewed: 'Presentation viewed',
    fit_check_sent: 'Fit Check sent',
    fit_check_completed: 'Fit Check completed',
    waytomoon_sent: 'WayToMoon sent',
    three_way_call_done: '3-Way Call completed',
    party_scheduled: 'Fragrance party scheduled',
    party_done: 'Fragrance party completed',
    became_customer: 'Became a customer',
    registered: 'Registered as a partner',
  },
  it: {
    contact_created: 'Contatto creato',
    first_touch: 'Prima conversazione',
    follow_up: 'Follow-up',
    presentation_sent: 'Presentazione inviata',
    presentation_viewed: 'Presentazione visualizzata',
    fit_check_sent: 'Fit Check inviato',
    fit_check_completed: 'Fit Check completato',
    waytomoon_sent: 'WayToMoon inviato',
    three_way_call_done: '3-Way-Call effettuata',
    party_scheduled: 'Festa dei profumi pianificata',
    party_done: 'Festa dei profumi svolta',
    became_customer: 'È diventato cliente',
    registered: 'Registrato come partner',
  },
  pl: {
    contact_created: 'Kontakt utworzony',
    first_touch: 'Pierwsza rozmowa',
    follow_up: 'Follow-up',
    presentation_sent: 'Prezentacja wysłana',
    presentation_viewed: 'Prezentacja obejrzana',
    fit_check_sent: 'Fit Check wysłany',
    fit_check_completed: 'Fit Check ukończony',
    waytomoon_sent: 'WayToMoon wysłany',
    three_way_call_done: '3-Way-Call przeprowadzony',
    party_scheduled: 'Impreza zapachowa zaplanowana',
    party_done: 'Impreza zapachowa przeprowadzona',
    became_customer: 'Został klientem',
    registered: 'Zarejestrowany jako partner',
  },
};

type LocalizedText = {
  errors: {
    notSignedIn: string;
    profileNotFound: string;
    dailyLimit: (limit: number) => string;
    emptyMessage: string;
    contactNotFound: string;
    conversationNotFound: string;
    coachNotConfigured: string;
    emptyReply: string;
    rateLimited: string;
    timeout: string;
    upstream: string;
    invalidResponse: string;
    missingApiKey: string;
    generic: string;
  };
  contact: {
    name: string;
    pipelinePhase: string;
    lastContact: string;
    never: string;
    today: string;
    daysAgo: (days: number) => string;
    plannedNextStep: string;
    notes: string;
    recentEvents: string;
    contextHeader: string;
  };
  knowledge: {
    ragSkippedHint: string;
    extractsHeader: string;
    documentFallback: string;
    exactMatchHeader: string;
    noDocumentsHint: string;
  };
};

const TEXT: Record<CoachLocale, LocalizedText> = {
  de: {
    errors: {
      notSignedIn: 'Nicht angemeldet.',
      profileNotFound: 'Kein Profil gefunden.',
      dailyLimit: (limit) =>
        `Tageslimit erreicht (${limit} Nachrichten). Morgen geht es weiter.`,
      emptyMessage: 'Leere Nachricht.',
      contactNotFound: 'Kontakt nicht gefunden.',
      conversationNotFound: 'Konversation nicht gefunden.',
      coachNotConfigured: 'Kein Coach konfiguriert.',
      emptyReply: 'Ascent konnte keine Antwort erzeugen. Bitte noch einmal senden.',
      rateLimited:
        'Ascent ist gerade stark ausgelastet. Bitte in etwa einer Minute noch einmal senden.',
      timeout:
        'Ascent hat zu lange gebraucht. Bitte die Frage noch einmal senden, gern etwas kürzer.',
      upstream: 'Ascent ist gerade nicht erreichbar. Bitte gleich noch einmal versuchen.',
      invalidResponse: 'Ascent konnte keine Antwort erzeugen. Bitte noch einmal senden.',
      missingApiKey:
        'Ascent ist nicht vollständig konfiguriert. Bitte den Betreiber informieren.',
      generic: 'Der Coach ist gerade nicht erreichbar. Versuche es gleich noch einmal.',
    },
    contact: {
      name: 'Name',
      pipelinePhase: 'Pipeline-Phase',
      lastContact: 'Letzter Kontakt',
      never: 'noch nie',
      today: 'heute',
      daysAgo: (days) => `vor ${days} ${days === 1 ? 'Tag' : 'Tagen'}`,
      plannedNextStep: 'Geplanter nächster Schritt',
      notes: 'Notizen',
      recentEvents: 'Letzte Ereignisse (neueste zuerst)',
      contextHeader: 'KONTAKT-KONTEXT (aus der Pipeline des Nutzers, bereits bekannt)',
    },
    knowledge: {
      ragSkippedHint:
        'HINWEIS: Diese Frage betrifft vermutlich eigene Kontakte oder den Tagesplan des Nutzers. ' +
        'Du hast dazu KEINEN direkten Datenzugriff in dieser Antwort, außer der KONTAKT-KONTEXT ' +
        'ist unten angegeben. Erfinde keine Kontakt- oder Aufgabendaten. Verweise bei Bedarf auf ' +
        'die Bereiche Kontakte bzw. Heute in der App.',
      extractsHeader: 'AUSZÜGE AUS DEN TEAMDOKUMENTEN (oberste Wahrheit)',
      documentFallback: 'Wissensdokument',
      exactMatchHeader: 'EXAKTER ZAHLENTREFFER (bevorzugt verwenden)',
      noDocumentsHint:
        'HINWEIS: Zu dieser Frage wurden KEINE Teamdokumente gefunden. Beachte die Wissensbasis-Regel.',
    },
  },
  tr: {
    errors: {
      notSignedIn: 'Oturum açılmadı.',
      profileNotFound: 'Profil bulunamadı.',
      dailyLimit: (limit) =>
        `Günlük sınıra ulaşıldı (${limit} mesaj). Yarın devam edebilirsin.`,
      emptyMessage: 'Mesaj boş.',
      contactNotFound: 'Kişi bulunamadı.',
      conversationNotFound: 'Konuşma bulunamadı.',
      coachNotConfigured: 'Yapılandırılmış bir koç yok.',
      emptyReply: 'Ascent bir yanıt oluşturamadı. Lütfen tekrar gönder.',
      rateLimited:
        'Ascent şu anda çok yoğun. Lütfen yaklaşık bir dakika sonra tekrar gönder.',
      timeout:
        'Ascent yanıt vermek için çok uzun süre bekledi. Lütfen soruyu biraz kısaltıp tekrar gönder.',
      upstream: 'Ascent şu anda kullanılamıyor. Lütfen biraz sonra tekrar dene.',
      invalidResponse: 'Ascent bir yanıt oluşturamadı. Lütfen tekrar gönder.',
      missingApiKey:
        'Ascent tam olarak yapılandırılmamış. Lütfen sistem yöneticisine bildir.',
      generic: 'Koç şu anda kullanılamıyor. Lütfen biraz sonra tekrar dene.',
    },
    contact: {
      name: 'Ad',
      pipelinePhase: 'Pipeline aşaması',
      lastContact: 'Son iletişim',
      never: 'henüz hiç',
      today: 'bugün',
      daysAgo: (days) => `${days} gün önce`,
      plannedNextStep: 'Planlanan sonraki adım',
      notes: 'Notlar',
      recentEvents: 'Son olaylar (en yeniden eskiye)',
      contextHeader: 'KİŞİ BAĞLAMI (kullanıcının pipeline verilerinden, zaten biliniyor)',
    },
    knowledge: {
      ragSkippedHint:
        'NOT: Bu soru muhtemelen kullanıcının kendi kişileri veya günlük planıyla ilgili. ' +
        'Aşağıda KİŞİ BAĞLAMI verilmedikçe bu yanıtta bu verilere doğrudan erişimin YOK. ' +
        'Kişi veya görev verileri uydurma. Gerekirse kullanıcıyı uygulamadaki Kişiler veya ' +
        'Bugün bölümlerine yönlendir.',
      extractsHeader: 'TAKIM BELGELERİNDEN ALINTILAR (en güvenilir kaynak)',
      documentFallback: 'Bilgi belgesi',
      exactMatchHeader: 'TAM SAYI EŞLEŞMESİ (öncelikli kullan)',
      noDocumentsHint:
        'NOT: Bu soru için HİÇBİR takım belgesi bulunamadı. Bilgi tabanı kuralına uy.',
    },
  },
  fr: {
    errors: {
      notSignedIn: 'Non connecté.',
      profileNotFound: 'Profil introuvable.',
      dailyLimit: (limit) =>
        `Limite quotidienne atteinte (${limit} messages). Tu pourras continuer demain.`,
      emptyMessage: 'Message vide.',
      contactNotFound: 'Contact introuvable.',
      conversationNotFound: 'Conversation introuvable.',
      coachNotConfigured: 'Aucun coach configuré.',
      emptyReply: "Ascent n'a pas pu générer de réponse. Merci de renvoyer ton message.",
      rateLimited:
        'Ascent est très sollicité en ce moment. Merci de réessayer dans environ une minute.',
      timeout:
        'Ascent a mis trop de temps à répondre. Merci de renvoyer une question un peu plus courte.',
      upstream: 'Ascent est indisponible pour le moment. Merci de réessayer bientôt.',
      invalidResponse:
        "Ascent n'a pas pu générer de réponse. Merci de renvoyer ton message.",
      missingApiKey:
        "Ascent n'est pas entièrement configuré. Merci d'en informer l'administrateur.",
      generic: 'Le coach est indisponible pour le moment. Réessaie bientôt.',
    },
    contact: {
      name: 'Nom',
      pipelinePhase: 'Phase du pipeline',
      lastContact: 'Dernier contact',
      never: 'jamais',
      today: "aujourd'hui",
      daysAgo: (days) => `il y a ${days} ${days === 1 ? 'jour' : 'jours'}`,
      plannedNextStep: 'Prochaine étape prévue',
      notes: 'Notes',
      recentEvents: 'Derniers événements (du plus récent au plus ancien)',
      contextHeader: "CONTEXTE DU CONTACT (issu du pipeline de l'utilisateur, déjà connu)",
    },
    knowledge: {
      ragSkippedHint:
        "REMARQUE : cette question concerne probablement les contacts ou le planning quotidien de l'utilisateur. " +
        "Tu n'as AUCUN accès direct à ces données dans cette réponse, sauf si un CONTEXTE DU CONTACT " +
        "est fourni ci-dessous. N'invente aucune donnée de contact ou de tâche. Si nécessaire, " +
        "renvoie l'utilisateur vers les sections Contacts ou Aujourd'hui de l'application.",
      extractsHeader: "EXTRAITS DES DOCUMENTS DE L'ÉQUIPE (source prioritaire)",
      documentFallback: 'Document de référence',
      exactMatchHeader: 'CORRESPONDANCE NUMÉRIQUE EXACTE (à utiliser en priorité)',
      noDocumentsHint:
        "REMARQUE : AUCUN document d'équipe n'a été trouvé pour cette question. Respecte la règle de la base de connaissances.",
    },
  },
  en: {
    errors: {
      notSignedIn: 'Not signed in.',
      profileNotFound: 'Profile not found.',
      dailyLimit: (limit) =>
        `Daily limit reached (${limit} messages). You can continue tomorrow.`,
      emptyMessage: 'Empty message.',
      contactNotFound: 'Contact not found.',
      conversationNotFound: 'Conversation not found.',
      coachNotConfigured: 'No coach is configured.',
      emptyReply: 'Ascent could not generate a response. Please send your message again.',
      rateLimited:
        'Ascent is under heavy load right now. Please send your message again in about a minute.',
      timeout:
        'Ascent took too long to respond. Please send the question again, preferably a little shorter.',
      upstream: 'Ascent is unavailable right now. Please try again shortly.',
      invalidResponse: 'Ascent could not generate a response. Please send your message again.',
      missingApiKey:
        'Ascent is not fully configured. Please inform the administrator.',
      generic: 'The coach is unavailable right now. Please try again shortly.',
    },
    contact: {
      name: 'Name',
      pipelinePhase: 'Pipeline phase',
      lastContact: 'Last contact',
      never: 'never',
      today: 'today',
      daysAgo: (days) => `${days} ${days === 1 ? 'day' : 'days'} ago`,
      plannedNextStep: 'Planned next step',
      notes: 'Notes',
      recentEvents: 'Recent events (newest first)',
      contextHeader: "CONTACT CONTEXT (from the user's pipeline, already known)",
    },
    knowledge: {
      ragSkippedHint:
        "NOTE: This question probably concerns the user's own contacts or daily plan. You have " +
        'NO direct access to that data in this response unless CONTACT CONTEXT is provided below. ' +
        'Do not invent contact or task data. If needed, direct the user to the Contacts or Today ' +
        'sections in the app.',
      extractsHeader: 'EXCERPTS FROM TEAM DOCUMENTS (highest-priority source)',
      documentFallback: 'Knowledge document',
      exactMatchHeader: 'EXACT NUMBER MATCH (use first)',
      noDocumentsHint:
        'NOTE: NO team documents were found for this question. Follow the knowledge-base rule.',
    },
  },
  it: {
    errors: {
      notSignedIn: 'Accesso non effettuato.',
      profileNotFound: 'Profilo non trovato.',
      dailyLimit: (limit) =>
        `Limite giornaliero raggiunto (${limit} messaggi). Potrai continuare domani.`,
      emptyMessage: 'Messaggio vuoto.',
      contactNotFound: 'Contatto non trovato.',
      conversationNotFound: 'Conversazione non trovata.',
      coachNotConfigured: 'Nessun coach configurato.',
      emptyReply: 'Ascent non è riuscito a generare una risposta. Invia di nuovo il messaggio.',
      rateLimited:
        'Ascent è molto occupato in questo momento. Invia di nuovo il messaggio tra circa un minuto.',
      timeout:
        'Ascent ha impiegato troppo tempo. Invia di nuovo la domanda, possibilmente un po’ più breve.',
      upstream: 'Ascent non è disponibile al momento. Riprova tra poco.',
      invalidResponse:
        'Ascent non è riuscito a generare una risposta. Invia di nuovo il messaggio.',
      missingApiKey:
        "Ascent non è configurato completamente. Informa l'amministratore.",
      generic: 'Il coach non è disponibile al momento. Riprova tra poco.',
    },
    contact: {
      name: 'Nome',
      pipelinePhase: 'Fase della pipeline',
      lastContact: 'Ultimo contatto',
      never: 'mai',
      today: 'oggi',
      daysAgo: (days) => `${days} ${days === 1 ? 'giorno' : 'giorni'} fa`,
      plannedNextStep: 'Prossimo passo pianificato',
      notes: 'Note',
      recentEvents: 'Eventi recenti (dal più recente)',
      contextHeader: "CONTESTO DEL CONTATTO (dalla pipeline dell'utente, già noto)",
    },
    knowledge: {
      ragSkippedHint:
        "NOTA: questa domanda riguarda probabilmente i contatti o il piano giornaliero dell'utente. " +
        'NON hai accesso diretto a questi dati in questa risposta, a meno che non sia indicato qui ' +
        'sotto un CONTESTO DEL CONTATTO. Non inventare dati su contatti o attività. Se necessario, ' +
        "rimanda l'utente alle sezioni Contatti o Oggi dell'app.",
      extractsHeader: 'ESTRATTI DAI DOCUMENTI DEL TEAM (fonte prioritaria)',
      documentFallback: 'Documento informativo',
      exactMatchHeader: 'CORRISPONDENZA NUMERICA ESATTA (da usare per prima)',
      noDocumentsHint:
        'NOTA: non è stato trovato ALCUN documento del team per questa domanda. Segui la regola della base di conoscenza.',
    },
  },
  pl: {
    errors: {
      notSignedIn: 'Nie zalogowano.',
      profileNotFound: 'Nie znaleziono profilu.',
      dailyLimit: (limit) =>
        `Osiągnięto dzienny limit (${limit} wiadomości). Możesz kontynuować jutro.`,
      emptyMessage: 'Pusta wiadomość.',
      contactNotFound: 'Nie znaleziono kontaktu.',
      conversationNotFound: 'Nie znaleziono rozmowy.',
      coachNotConfigured: 'Brak skonfigurowanego coacha.',
      emptyReply: 'Ascent nie mógł wygenerować odpowiedzi. Wyślij wiadomość ponownie.',
      rateLimited:
        'Ascent jest teraz mocno obciążony. Wyślij wiadomość ponownie za około minutę.',
      timeout:
        'Ascent potrzebował zbyt dużo czasu. Wyślij pytanie ponownie, najlepiej nieco krótsze.',
      upstream: 'Ascent jest teraz niedostępny. Spróbuj ponownie za chwilę.',
      invalidResponse: 'Ascent nie mógł wygenerować odpowiedzi. Wyślij wiadomość ponownie.',
      missingApiKey:
        'Ascent nie jest w pełni skonfigurowany. Poinformuj administratora.',
      generic: 'Coach jest teraz niedostępny. Spróbuj ponownie za chwilę.',
    },
    contact: {
      name: 'Imię',
      pipelinePhase: 'Etap pipeline',
      lastContact: 'Ostatni kontakt',
      never: 'nigdy',
      today: 'dzisiaj',
      daysAgo: (days) =>
        days === 1 ? '1 dzień temu' : `${days} dni temu`,
      plannedNextStep: 'Zaplanowany następny krok',
      notes: 'Notatki',
      recentEvents: 'Ostatnie wydarzenia (od najnowszych)',
      contextHeader: 'KONTEKST KONTAKTU (z pipeline użytkownika, już znany)',
    },
    knowledge: {
      ragSkippedHint:
        'UWAGA: To pytanie dotyczy prawdopodobnie kontaktów lub planu dnia użytkownika. ' +
        'NIE masz bezpośredniego dostępu do tych danych w tej odpowiedzi, chyba że poniżej ' +
        'podano KONTEKST KONTAKTU. Nie wymyślaj danych kontaktów ani zadań. W razie potrzeby ' +
        'odeslij użytkownika do sekcji Kontakty lub Dzisiaj w aplikacji.',
      extractsHeader: 'FRAGMENTY Z DOKUMENTÓW ZESPOŁU (najwyższy priorytet)',
      documentFallback: 'Dokument wiedzy',
      exactMatchHeader: 'DOKŁADNE DOPASOWANIE LICZBY (użyj w pierwszej kolejności)',
      noDocumentsHint:
        'UWAGA: Nie znaleziono ŻADNYCH dokumentów zespołu dla tego pytania. Stosuj regułę bazy wiedzy.',
    },
  },
};

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  const t0 = Date.now();
  const timings: Record<string, number> = {};
  const mark = (key: string, since: number) => { timings[key] = Date.now() - since; };
  let locale: CoachLocale = 'de';
  try {
    // Read locale from a clone so auth/limit ordering and the later body
    // parsing stay unchanged. Missing, malformed, or unsupported values use DE.
    const localeBody: unknown = await req.clone().json().catch(() => ({}));
    locale = normalizeCoachLocale(
      localeBody && typeof localeBody === 'object'
        ? (localeBody as Record<string, unknown>).locale
        : undefined,
    );
    const text = TEXT[locale];
    const phaseLabels = PHASE_LABELS[locale];
    const eventLabels = EVENT_LABELS[locale];

    // User-Client mit dem JWT des Aufrufers: JEDE Datenbankoperation
    // in dieser Function läuft unter der RLS des Nutzers (ADR-002/014).
    const authHeader = req.headers.get('Authorization') ?? '';
    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: authError } = await db.auth.getUser();
    if (authError || !userData.user) return json({ error: text.errors.notSignedIn }, 401);
    const userId = userData.user.id;

    const { data: profile } = await db.from('profiles').select('*').eq('id', userId).single();
    if (!profile) return json({ error: text.errors.profileNotFound }, 403);

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
        error: text.errors.dailyLimit(dailyLimit),
      }, 429);
    }

    const body = await req.json();
    const message = String(body.message ?? '').trim();
    const contactId = body.contactId ? String(body.contactId) : null;
    let convoId = body.conversationId ? String(body.conversationId) : null;
    if (!message) return json({ error: text.errors.emptyMessage }, 400);

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
      if (!contact.data) return json({ error: text.errors.contactNotFound }, 404);

      const days = phase.data?.last_event_at
        ? Math.floor((Date.now() - new Date(phase.data.last_event_at).getTime()) / 86_400_000)
        : null;
      // Explizit typisiert: unter `strict` ist ein impliziter any hier ein
      // Fehler (blockiert `deno check`), und der Coach-Kontext darf nie ein
      // rohes "undefined" enthalten.
      const eventRows = (events.data ?? []) as Array<{ event_type: string; occurred_at: string }>;
      const phaseKey: string = phase.data?.phase ?? 'lead';

      const lines = [
        `${text.contact.name}: ${contact.data.name}`,
        `${text.contact.pipelinePhase}: ${phaseLabels[phaseKey] ?? phaseKey}`,
        `${text.contact.lastContact}: ${
          days === null ? text.contact.never : days === 0 ? text.contact.today : text.contact.daysAgo(days)
        }`,
        contact.data.next_step
          ? `${text.contact.plannedNextStep}: ${contact.data.next_step}`
          : null,
        contact.data.notes ? `${text.contact.notes}: ${contact.data.notes}` : null,
        `${text.contact.recentEvents}:`,
        ...eventRows.map(
          (e) =>
            `- ${eventLabels[e.event_type] ?? e.event_type} (${String(e.occurred_at).slice(0, 10)})`
        ),
      ].filter(Boolean);
      contactContext = `${text.contact.contextHeader}:\n${lines.join('\n')}`;
    }

    mark('context_ms', tContext);

    // ---------- Konversation laden/anlegen ----------
    // Stale conversationId (e.g. after demo wipe) must never surface as a user-facing
    // "Konversation nicht gefunden" — silently start a fresh thread instead.
    let history: ChatMessage[] = [];
    let agentKey: string | null = null;
    if (convoId) {
      const { data: convo } = await db.from('coach_convos').select('*').eq('id', convoId).single();
      if (convo) {
        agentKey = convo.agent_key;
        const { data: msgs } = await db.from('coach_messages')
          .select('role, content').eq('convo_id', convoId)
          .order('created_at').limit(30);
        history = (msgs ?? []) as ChatMessage[];
      } else {
        convoId = null;
      }
    }
    if (!convoId) {
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
    if (!agent) return json({ error: text.errors.coachNotConfigured }, 500);

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
      knowledgeBlock = text.knowledge.ragSkippedHint;
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
          `${text.knowledge.extractsHeader}:\n` +
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
                  `[${titelNachId.get(c.doc_id) ?? text.knowledge.documentFallback}]\n${c.content}`,
              ).join('\n---\n');
              // Exakter Treffer zuerst: eine konkrete Ziffer ist eine
              // staerkere Aussage als semantische Naehe.
              knowledgeBlock = knowledgeBlock
                ? `${text.knowledge.exactMatchHeader}:\n${exactBlock}\n\n${knowledgeBlock}`
                : `${text.knowledge.exactMatchHeader}:\n${exactBlock}`;
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
    // Gesprächskontinuität: History ist bereits in messages — zusätzlich
    // ein klarer Mentor-Hinweis, damit das Modell nicht "neu startet".
    const continuity =
      history.length > 0
        ? [
            'GESPRÄCHSKONTINUITÄT:',
            `Du sprichst weiter mit ${profile.first_name}. Es gibt bereits einen Verlauf.`,
            'Baue darauf auf. Wiederhole keine abgeschlossenen Punkte.',
            'Beziehe dich natürlich auf frühere Aussagen, wenn sie relevant sind.',
            'Starte nicht bei null — du bist mitten in einem Mentor-Gespräch.',
          ].join('\n')
        : null;

    const system = [
      CORE_RULES,
      `DEINE SPEZIALISIERUNG:\n${agent.system_prompt}`,
      `NUTZER: ${profile.first_name} (Rolle: ${profile.role}).`,
      continuity,
      contactContext || null,
      knowledgeBlock ||
        text.knowledge.noDocumentsHint,
      // Last block wins over German CORE_RULES, agent prompts, multilingual
      // history, contact notes, and source documents.
      languageDirective(locale),
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
    // Premium-UI rendert Markdown: HTML strippen, Struktur behalten.
    const reply = stripMarkdown(chatResult.text.trim());
    mark('llm_ms', tLlm);

    // Nie eine leere Assistant-Nachricht persistieren: sie wuerde bei jedem
    // Folge-Turn als History mitgeschickt und den Verlauf vergiften.
    if (!reply) {
      return json({ error: text.errors.emptyReply }, 502);
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
    const text = TEXT[locale];
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
              text: text.errors.rateLimited,
              retryAfter: 60,
            },
            timeout: {
              status: 504,
              text: text.errors.timeout,
            },
            upstream: {
              status: 503,
              text: text.errors.upstream,
            },
            invalid_response: {
              status: 502,
              text: text.errors.invalidResponse,
            },
            missing_api_key: {
              status: 500,
              text: text.errors.missingApiKey,
            },
          }[e.lastCode]
        : { status: 500, text: text.errors.generic };

    const kopf: Record<string, string> = { ...corsHeaders, 'Content-Type': 'application/json' };
    if (fehler.retryAfter) kopf['Retry-After'] = String(fehler.retryAfter);

    return new Response(JSON.stringify({ error: fehler.text }), {
      status: fehler.status,
      headers: kopf,
    });
  }
});
