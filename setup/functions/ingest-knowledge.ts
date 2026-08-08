// AscendOS Edge Function: ingest-knowledge (Dashboard-Version, alles in einer Datei)
// Name der Function MUSS exakt lauten: ingest-knowledge
//
// GENERIERT von scripts/bundle-functions.mjs — NICHT von Hand ändern.
// Quelle: supabase/functions/ingest-knowledge/index.ts

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

    // Canonical authority: memberships.role (not profiles.role mirror).
    const { data: memberships, error: membershipError } = await db
      .from('memberships')
      .select('id, org_id, role, status')
      .eq('identity_id', userData.user.id)
      .eq('status', 'active');
    if (membershipError) throw membershipError;

    const orgHeader = req.headers.get('x-ascendos-org');
    const active =
      memberships?.find((m) => orgHeader && m.org_id === orgHeader) ??
      (memberships?.length === 1 ? memberships[0] : null);

    if (!active || active.role !== 'super_admin') {
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
        org_id: active.org_id,
        team_id: teamId,
        title,
        category,
        author_id: userData.user.id,
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
          org_id: active.org_id,
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
