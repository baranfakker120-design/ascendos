// AscendOS Edge Function: ingest-knowledge (Dashboard-Version, alles in einer Datei)
// Name der Function MUSS exakt lauten: ingest-knowledge
//
// GENERIERT von scripts/bundle-functions.mjs — NICHT von Hand ändern.
// Quelle: supabase/functions/ingest-knowledge/index.ts

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { GoogleGenAI, type Content } from 'npm:@google/genai@2.13.0';

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
 * Gemini-Anbindung: Textgenerierung UND Embeddings (ADR-026/ADR-027).
 *
 * Einzige Provider-Schicht des Projekts. API-Schlüssel, Endpunkte und
 * Modellnamen-Semantik existieren NUR hier; die Edge Functions kennen
 * davon nichts (ADR-007).
 *
 * Zuständig: Chat-Antworten, Router, Themen-Anonymisierung UND Embeddings.
 * Seit ADR-027 der einzige KI-Anbieter des Projekts; `llm.ts` ist entfallen.
 *
 * Schlüssel: ausschließlich GEMINI_API_KEY.
 */


/** Aktuelle GA-Modelle (ADR-028). Die 2.5-Flash-Reihe wurde am 9. Juli 2026
 *  abgeschaltet — Wochen VOR dem angekündigten Termin (16.10.2026). */
const GEMINI_DEFAULT_CHAT_MODEL = 'gemini-3.5-flash';
const GEMINI_DEFAULT_FAST_MODEL = 'gemini-3.1-flash-lite';

/** Rolling Alias, zeigt immer auf das aktuelle Flash-Modell und kann daher
 *  nicht abgeschaltet werden. NUR Notfall-Fallback bei 404: ein Alias
 *  wechselt still das Modell und würde Ton und Eval-Ergebnisse unbemerkt
 *  verschieben. */
const GEMINI_FALLBACK_MODEL = 'gemini-flash-latest';

/** Nachweislich abgeschaltete Modelle. Erspart den 404-Roundtrip, falls sie
 *  noch in Env-Variablen oder `agents.model` stehen. Künftige Fälle fängt
 *  der generische 404-Fallback in geminiChat() ab. */
const GEMINI_RETIRED = new Set([
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
]);

const GEMINI_TIMEOUT_MS = 60_000;
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

/**
 * Thinking-Steuerung ist GENERATIONSABHÄNGIG — die Hauptfalle beim Wechsel:
 *
 *   Gemini 3.x : `thinkingLevel` (Enum). `thinkingBudget` wird nur aus
 *                Kompatibilität akzeptiert und kann das Verhalten
 *                verzerren. BEIDE gleichzeitig = API-Fehler.
 *   Gemini 2.5 : `thinkingBudget` (Tokenzahl). `thinkingLevel` erzeugt
 *                hier einen Fehler.
 *
 * Zusätzlich: Gemini 3 Flash und Flash-Lite können Thinking NICHT
 * vollständig abschalten. `effort: 'none'` heißt dort 'minimal', nicht aus.
 */
function usesThinkingLevel(model: string): boolean {
  // Bewusst als Ausschlussliste, nicht als Einschlussliste: nur die
  // 1.x/2.x-Reihe kennt `thinkingBudget`. Alles andere — 3.x, die
  // `-latest`-Aliasse und kuenftige Generationen — bekommt
  // `thinkingLevel`. Eine Einschlussliste auf /^gemini-3/ haette
  // `gemini-flash-latest` (zeigt auf 3.5 Flash) falsch einsortiert und
  // waere bei Gemini 4 wieder falsch.
  return !/^gemini-(1|2)[.-]/i.test(model);
}

const GEMINI_THINKING_LEVEL: Record<GeminiEffort, string> = {
  none: 'minimal', // echtes Off existiert bei 3 Flash nicht
  minimal: 'minimal',
  low: 'low',
  medium: 'medium',
  high: 'high',
};

/** Legacy-Pfad für die 2.5-Reihe. */
const GEMINI_THINKING_BUDGET: Record<GeminiEffort, number> = {
  none: 0,
  minimal: 0,
  low: 1024,
  medium: 4096,
  high: 8192,
};

/**
 * Aufschlag auf `maxOutputTokens` bei Gemini 3.
 *
 * `thinkingLevel` nennt keine Tokenzahl, die Thinking-Token zählen aber
 * weiterhin gegen `maxOutputTokens`. Ohne Reserve bekommt der Router mit
 * 16 Token Budget garantiert eine LEERE Antwort mit
 * `finishReason: MAX_TOKENS`. Anders als bei 2.5 lässt sich das nicht
 * durch Abschalten umgehen.
 */
const GEMINI_THINKING_RESERVE: Record<GeminiEffort, number> = {
  none: 1024,
  minimal: 1024,
  low: 2048,
  medium: 4096,
  high: 8192,
};

export type GeminiEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high';

export interface GeminiChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

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
// Modell-Auflösung — ohne Datenbankänderung
// ============================================================

/**
 * Mappt die in `agents.model` GESPEICHERTEN Werte auf Gemini-Modelle.
 *
 * Kritisch für die Vorgabe "Datenbank nicht ändern": In der Tabelle stehen
 * weiterhin `gpt-5.6` bzw. `gpt-5.6-luna` (und in Alt-Installationen
 * Claude-Namen). Diese Werte werden zur LAUFZEIT übersetzt, statt sie per
 * Migration zu überschreiben. `agents` bleibt damit unangetastet.
 *
 * Reine Funktion ohne Deno.env — testbar.
 */
export function mapToGeminiModel(
  model: string,
  defaults: { chat: string; fast: string }
): string {
  const m = (model ?? '').trim().toLowerCase();
  if (!m) return defaults.chat;
  // Abgeschaltetes Modell: nach Leistungsklasse auf ein aktuelles umlenken,
  // statt in den 404 zu laufen.
  if (GEMINI_RETIRED.has(m)) {
    return /(lite|flash-8b)/.test(m) ? defaults.fast : defaults.chat;
  }
  // Bereits ein aktuelles Gemini-Modell? Unverändert übernehmen.
  if (m.startsWith('gemini')) return m;

  // Kleine/schnelle Klasse eines Fremdanbieters -> Flash-Lite.
  if (/(mini|nano|luna|lite|haiku|small)/.test(m)) return defaults.fast;
  // Alles andere (gpt-*, o1/o3/o4-*, claude-*, unbekannt) -> Flash.
  return defaults.chat;
}

function resolveGeminiModel(model: string): string {
  return mapToGeminiModel(model, {
    chat: Deno.env.get('GEMINI_MODEL') ?? GEMINI_DEFAULT_CHAT_MODEL,
    fast: Deno.env.get('GEMINI_FAST_MODEL') ?? GEMINI_DEFAULT_FAST_MODEL,
  });
}

/** Modell für billige Hilfs-Calls (Router, Anonymisierung). */
export function geminiFastModel(): string {
  return Deno.env.get('GEMINI_FAST_MODEL') ?? GEMINI_DEFAULT_FAST_MODEL;
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

/**
 * Erkennt "Modell existiert nicht mehr / kein Zugriff".
 *
 * Anlass: `gemini-2.5-flash` lieferte am 9. Juli 2026 ohne Vorwarnung 404,
 * Wochen vor dem angekündigten Abschalttermin. Ein gepinntes Modell allein
 * ist deshalb kein ausreichender Schutz — es braucht einen Notausgang.
 */
function isGeminiModelUnavailable(err: unknown): boolean {
  if (!(err instanceof GeminiError)) return false;
  if (err.status !== 404 && err.status !== 403 && err.status !== 400) return false;
  const m = err.message.toLowerCase();
  return (
    m.includes('no longer available') ||
    m.includes('not found') ||
    m.includes('is not supported') ||
    m.includes('do not have access') ||
    m.includes('does not have access')
  );
}

/** Free Tier liegt bei wenigen Requests pro Minute — 429 ist hier der
 *  Normalfall, nicht die Ausnahme. Deshalb Backoff statt Sofortabbruch. */
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
// Antwort-Extraktion
// ============================================================

interface GeminiResponseLike {
  text?: string;
  promptFeedback?: { blockReason?: string };
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
  }>;
}

/**
 * Holt den sichtbaren Text heraus. `response.text` allein genügt nicht:
 * bei Safety-Blocks und bei abgeschnittenen Antworten ist es `undefined`,
 * und Thinking-Parts (`thought: true`) dürfen nicht in die Antwort geraten.
 */
function extractGeminiText(res: GeminiResponseLike): string {
  if (typeof res.text === 'string' && res.text.trim().length > 0) {
    return res.text.trim();
  }
  const parts = res.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((p) => p?.thought !== true && typeof p?.text === 'string')
    .map((p) => p.text as string)
    .join('')
    .trim();
}

// ============================================================
// Öffentliche API
// ============================================================

export interface GeminiChatInput {
  /** Wird als `systemInstruction` übergeben — 1:1 die Rolle, die bei
   *  OpenAI `instructions` hatte. Prompts bleiben unverändert. */
  system: string;
  messages: GeminiChatMessage[];
  model: string;
  /** Budget für den SICHTBAREN Text. Thinking wird separat aufgeschlagen. */
  maxTokens?: number;
  effort?: GeminiEffort;
}

/**
 * Erzeugt eine Antwort. Signatur und Rückgabe (ein `string`) sind
 * identisch zu `chatCompletion()` aus `llm.ts`, damit die Aufrufstellen
 * in coach-chat unverändert bleiben können.
 */
export async function geminiChat(input: GeminiChatInput): Promise<string> {
  const model = resolveGeminiModel(input.model);
  const effort = input.effort ?? 'low';
  const answerTokens = Math.max(16, input.maxTokens ?? 1024);

  // Rollen-Mapping: Gemini kennt 'user' und 'model', nicht 'assistant'.
  // Leere Inhalte werden verworfen — Gemini lehnt leere Parts ab.
  const contents: Content[] = input.messages
    .filter((m) => m && typeof m.content === 'string' && m.content.trim().length > 0)
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  if (contents.length === 0) {
    throw new GeminiError('Keine Nachricht zum Senden.', 'empty_response');
  }

  const buildConfig = (m: string) => {
    // Genau EINE der beiden Thinking-Optionen setzen: zusammen sind sie
    // ein API-Fehler, und die falsche Generation lehnt die andere ab.
    const gen3 = usesThinkingLevel(m);
    const reserve = gen3
      ? GEMINI_THINKING_RESERVE[effort]
      : GEMINI_THINKING_BUDGET[effort];
    return {
      systemInstruction: input.system,
      maxOutputTokens: answerTokens + reserve,
      thinkingConfig: gen3
        ? { thinkingLevel: GEMINI_THINKING_LEVEL[effort] }
        : { thinkingBudget: GEMINI_THINKING_BUDGET[effort] },
      // Die Standardschwelle blockiert im Vertriebskontext gelegentlich
      // harmlose Formulierungen (Einwandbehandlung, Geld, Gesundheit).
      // BLOCK_ONLY_HIGH ist die lockerste Stufe, die ohne Sonderfreigabe
      // universell akzeptiert wird.
      safetySettings: [
        'HARM_CATEGORY_HARASSMENT',
        'HARM_CATEGORY_HATE_SPEECH',
        'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        'HARM_CATEGORY_DANGEROUS_CONTENT',
      ].map((category) => ({ category, threshold: 'BLOCK_ONLY_HIGH' })),
      // temperature/top_p/top_k werden bewusst NICHT gesetzt: Google
      // empfiehlt für Gemini 3 ausdrücklich die Defaults.
    };
  };

  const send = (m: string) =>
    ai().models.generateContent({ model: m, contents, config: buildConfig(m) });

  // Timeout über Promise.race statt über SDK-Optionen: funktioniert
  // unabhängig davon, welche httpOptions die SDK-Version unterstützt.
  const withTimeout = (m: string) =>
    geminiWithRetry(() =>
      Promise.race([
        send(m),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(new GeminiError(`Zeitüberschreitung nach ${GEMINI_TIMEOUT_MS} ms.`, 'timeout')),
            GEMINI_TIMEOUT_MS
          )
        ),
      ])
    );

  let res: GeminiResponseLike;
  try {
    res = (await withTimeout(model)) as GeminiResponseLike;
  } catch (e) {
    // Abgeschaltetes Modell: einmalig auf den Rolling Alias ausweichen,
    // damit eine Abschaltung den Coach nicht komplett lahmlegt. Laut
    // protokolliert — ein stiller Modellwechsel wäre schlimmer als der
    // Ausfall, weil niemand die Qualitätsänderung bemerkt.
    if (isGeminiModelUnavailable(e) && model !== GEMINI_FALLBACK_MODEL) {
      console.warn(
        `Modell "${model}" nicht verfügbar — Fallback auf ${GEMINI_FALLBACK_MODEL}. ` +
          'GEMINI_MODEL bitte auf ein aktuelles Modell setzen.'
      );
      res = (await withTimeout(GEMINI_FALLBACK_MODEL)) as GeminiResponseLike;
    } else {
      throw e;
    }
  }

  // Prompt komplett abgewiesen (Safety-Filter vor der Generierung).
  const blocked = res.promptFeedback?.blockReason;
  if (blocked) {
    throw new GeminiError(`Anfrage wurde blockiert (${blocked}).`, 'refused');
  }

  const text = extractGeminiText(res);
  if (text) return text;

  const finish = res.candidates?.[0]?.finishReason;
  if (finish === 'SAFETY' || finish === 'PROHIBITED_CONTENT' || finish === 'RECITATION') {
    throw new GeminiError(`Antwort wurde blockiert (${finish}).`, 'refused');
  }
  throw new GeminiError(
    `Leere Antwort vom Modell (finishReason: ${finish ?? 'unbekannt'}).`,
    'empty_response'
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

// ============================================================
// ingest-knowledge: Text-Dokument in die Wissensbasis aufnehmen.
// Nur super_admin. Dokument startet als DRAFT — Freigabe ist ein
// bewusster menschlicher Schritt (ADR-010), aktuell via Studio,
// Admin-UI folgt in Sprint 5.
// ============================================================


const CHUNK_SIZE = 1600; // Zeichen (~400 Token), mit Überlappung
const CHUNK_OVERLAP = 200;
/** Chunks pro Verarbeitungsschritt. gemini-embedding-001 nimmt einen Text
 *  pro Request, `geminiEmbedBatch` arbeitet also sequenziell mit Backoff.
 *  Kleinere Schritte heißen: häufigere DB-Inserts, aber bei einem Abbruch
 *  weniger verlorene Arbeit und weniger Druck auf das Free-Tier-Limit. */
const EMBED_BATCH = 16;
/** Schutz vor versehentlichen Riesen-Uploads (Kosten + Laufzeit). */
const MAX_CONTENT_CHARS = 400_000;

function chunkText(text: string): string[] {
  const clean = text.replace(/\r\n/g, '\n').trim();
  if (clean.length <= CHUNK_SIZE) return [clean];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + CHUNK_SIZE, clean.length);
    // möglichst an Absatz-/Satzgrenze schneiden
    const slice = clean.slice(start, end);
    const cut = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('. '));
    if (end < clean.length && cut > CHUNK_SIZE * 0.5) end = start + cut + 1;
    chunks.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = end - CHUNK_OVERLAP;
  }
  return chunks.filter((c) => c.length > 0);
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
    );

    const { data: userData } = await db.auth.getUser();
    if (!userData.user) return json({ error: 'Nicht angemeldet.' }, 401);

    const { data: profile } = await db.from('profiles')
      .select('*').eq('id', userData.user.id).single();
    if (profile?.role !== 'super_admin') {
      return json({ error: 'Nur Super-Admins können Wissen aufnehmen.' }, 403);
    }

    const body = await req.json();
    const title = String(body.title ?? '').trim();
    const category = String(body.category ?? '').trim();
    const content = String(body.content ?? '').trim();
    const teamId = body.teamId ? String(body.teamId) : null;
    if (!title || !category || !content) {
      return json({ error: 'title, category und content sind erforderlich.' }, 400);
    }
    if (content.length > MAX_CONTENT_CHARS) {
      return json(
        {
          error: `Dokument zu groß (${content.length} Zeichen, max. ${MAX_CONTENT_CHARS}). Bitte aufteilen.`,
        },
        413
      );
    }

    const { data: doc, error: docError } = await db.from('knowledge_docs')
      .insert({
        org_id: profile.org_id,
        team_id: teamId,
        title,
        category,
        author_id: profile.id,
        source_type: body.sourceType ?? 'document',
        status: 'draft',
      })
      .select().single();
    if (docError) throw docError;

    const chunks = chunkText(content);

    // Schlägt die Einbettung mitten im Dokument fehl, bliebe ein Doc mit
    // halber Wissensbasis zurück — schlimmer als kein Doc, weil der Coach
    // es später als vollständig behandelt. Deshalb aufräumen.
    try {
      for (let start = 0; start < chunks.length; start += EMBED_BATCH) {
        const slice = chunks.slice(start, start + EMBED_BATCH);
        // RETRIEVAL_DOCUMENT: Gegenstück zu RETRIEVAL_QUERY in coach-chat.
        const vectors = await geminiEmbedBatch(slice, 'RETRIEVAL_DOCUMENT');
        const rows = slice.map((text, i) => ({
          doc_id: doc.id,
          org_id: profile.org_id,
          chunk_index: start + i,
          content: text,
          embedding: vectors[i],
        }));
        const { error } = await db.from('knowledge_chunks').insert(rows);
        if (error) throw error;
      }
    } catch (e) {
      await db.from('knowledge_docs').delete().eq('id', doc.id);
      throw e;
    }

    return json({
      docId: doc.id,
      chunks: chunks.length,
      status: 'draft',
      hint: 'Dokument ist als Entwurf gespeichert. Erst nach Freigabe (status = approved) nutzt der Coach es.',
    });
  } catch (e) {
    // super_admin-only: hier hilft die konkrete Ursache mehr als eine
    // generische Meldung.
    if (e instanceof GeminiError) {
      console.error(`ingest-knowledge llm error [${e.code}]`, e.message);
      return json({ error: `Einbettung fehlgeschlagen (${e.code}).` },
        e.code === 'missing_api_key' ? 503 : 502);
    }
    console.error('ingest-knowledge error', e instanceof Error ? e.message : e);
    return json({ error: 'Aufnahme fehlgeschlagen.' }, 500);
  }
});
