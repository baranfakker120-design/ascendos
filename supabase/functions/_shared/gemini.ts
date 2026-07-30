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

import { GoogleGenAI } from 'npm:@google/genai@2.13.0';

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
