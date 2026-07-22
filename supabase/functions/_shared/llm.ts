/**
 * Zentrale LLM-Anbindung — ausschliesslich OpenAI (ADR-024/ADR-025).
 *
 * Architektur-Regel (ADR-007): API-Schluessel und Provider-Details
 * existieren NUR in dieser Datei. Aufrufende Edge Functions kennen
 * weder Endpunkte noch Modellnamen-Semantik.
 *
 * Genutzte Endpunkte:
 *   - POST /v1/responses   (Chat, Responses API — der go-forward Pfad)
 *   - POST /v1/embeddings  (text-embedding-3-small, 1536 Dimensionen)
 *
 * Es gibt bewusst KEINEN Chat-Completions-Pfad und keinen zweiten Provider.
 */

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';

/** Fix verdrahtet: Die Vektordimension in der DB (1536) haengt daran.
 *  Ein Wechsel des Embedding-Modells ist eine Migration, keine Env-Var. */
export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMENSIONS = 1536;

/** Modellwahl ist Daten (agents.model) bzw. Env — diese Werte greifen
 *  nur, wenn nichts konfiguriert ist. */
const DEFAULT_CHAT_MODEL = 'gpt-5.6';
const DEFAULT_FAST_MODEL = 'gpt-5.6-luna';
/** Breit verfuegbares Vorgaenger-Modell. Wird NUR benutzt, wenn OpenAI
 *  meldet, dass das gewuenschte Modell nicht existiert bzw. fuer den
 *  Account nicht freigegeben ist (neue Accounts, gestaffelte Rollouts). */
const FALLBACK_CHAT_MODEL = 'gpt-4.1';

const CHAT_TIMEOUT_MS = 60_000;
const EMBED_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;

/** Reasoning-Modelle verbrauchen unsichtbare Denk-Token aus demselben
 *  max_output_tokens-Budget. Wer hier zu knapp budgetiert, bekommt eine
 *  formal erfolgreiche, aber leere Antwort. */
const REASONING_MODEL_RE = /^(gpt-5|o1|o3|o4)/i;
const REASONING_BUDGET_TOKENS = 2048;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high';

/** Fehler mit maschinenlesbarem Grund — Aufrufer entscheiden damit, ob
 *  sie degradieren (RAG) oder abbrechen (Antwort). */
export class LlmError extends Error {
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
    this.name = 'LlmError';
  }
}

// ============================================================
// Modell-Aufloesung
// ============================================================

/**
 * Mappt Anthropic-/Claude-Modellnamen auf das passende OpenAI-Aequivalent.
 *
 * Hintergrund: `agents.model` ist DATEN. Alt-Installationen und importierte
 * Seeds koennen weiterhin Claude-Namen enthalten. Statt einer 400er-Antwort
 * von OpenAI wird nach Leistungsklasse gemappt.
 *
 * Reine Funktion, absichtlich ohne Deno.env — dadurch testbar.
 * Rueckgabe `null` = kein Claude-Modell, Wert unveraendert uebernehmen.
 */
export function mapClaudeModel(
  model: string,
  defaults: { chat: string; fast: string }
): string | null {
  const m = (model ?? '').trim().toLowerCase();
  if (!m) return defaults.chat;
  // Erfasst auch Praefix-Schreibweisen wie "anthropic/claude-..." oder
  // "anthropic.claude-..." (OpenRouter-/Bedrock-Stil).
  if (!m.includes('claude') && !m.includes('anthropic')) return null;

  if (m.includes('haiku')) return defaults.fast; // schnell/guenstig
  if (m.includes('opus')) return defaults.chat; // Spitzenklasse
  if (m.includes('sonnet')) return defaults.chat; // ausgewogen
  return defaults.chat; // unbekannte Claude-Variante
}

/** Aufloesung inkl. Env-Overrides. */
export function resolveModel(model: string): string {
  const defaults = {
    chat: Deno.env.get('OPENAI_MODEL') ?? DEFAULT_CHAT_MODEL,
    fast: Deno.env.get('OPENAI_FAST_MODEL') ?? DEFAULT_FAST_MODEL,
  };
  return mapClaudeModel(model, defaults) ?? model.trim();
}

/** Modell fuer billige Hilfs-Calls (Router, Anonymisierung).
 *  ROUTER_MODEL bleibt als expliziter Override erhalten. */
export function fastModel(): string {
  return Deno.env.get('ROUTER_MODEL') ?? Deno.env.get('OPENAI_FAST_MODEL') ?? DEFAULT_FAST_MODEL;
}

function isReasoningModel(model: string): boolean {
  return REASONING_MODEL_RE.test(model);
}

// ============================================================
// HTTP-Basis: Key-Guard, Timeout, Retry
// ============================================================

function apiKey(): string {
  const key = Deno.env.get('OPENAI_API_KEY');
  if (!key || key.trim().length === 0) {
    // Klare Ursache statt eines kryptischen 401 aus dem Upstream.
    throw new LlmError(
      'OPENAI_API_KEY ist nicht gesetzt (Supabase -> Edge Functions -> Secrets).',
      'missing_api_key'
    );
  }
  return key.trim();
}

const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Ein POST inkl. Timeout, Backoff-Retry und Retry-After-Respekt. */
async function postJson(
  url: string,
  payload: unknown,
  timeoutMs: number
): Promise<Record<string, unknown>> {
  const key = apiKey();
  let lastStatus = 0;
  let lastBody = '';

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      // Netzwerk-/Timeout-Fehler sind wiederholbar.
      if (attempt < MAX_RETRIES) {
        await sleep(500 * 2 ** attempt + Math.random() * 250);
        continue;
      }
      const aborted = e instanceof DOMException && e.name === 'TimeoutError';
      throw new LlmError(
        aborted ? `Zeitüberschreitung nach ${timeoutMs} ms.` : 'Netzwerkfehler zur OpenAI-API.',
        aborted ? 'timeout' : 'upstream'
      );
    }

    if (res.ok) return (await res.json()) as Record<string, unknown>;

    lastStatus = res.status;
    lastBody = (await res.text()).slice(0, 500);

    if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get('retry-after'));
      const waitMs =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 10_000)
          : 500 * 2 ** attempt + Math.random() * 250;
      await sleep(waitMs);
      continue;
    }
    break;
  }

  throw new LlmError(
    `OpenAI-Fehler ${lastStatus}: ${lastBody}`,
    lastStatus === 429 ? 'rate_limited' : 'upstream',
    lastStatus
  );
}

/** Erkennt "Modell existiert nicht / nicht freigegeben". */
function isModelUnavailable(err: unknown): boolean {
  if (!(err instanceof LlmError)) return false;
  if (err.status !== 400 && err.status !== 403 && err.status !== 404) return false;
  const m = err.message.toLowerCase();
  return (
    m.includes('model_not_found') ||
    m.includes('does not exist') ||
    m.includes('do not have access') ||
    m.includes('does not have access')
  );
}

// ============================================================
// Antwort-Extraktion (Responses API)
// ============================================================

interface ResponsesPayload {
  status?: string;
  incomplete_details?: { reason?: string };
  output_text?: unknown;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string; refusal?: string }>;
  }>;
}

/** Sammelt den Text aus der Responses-Struktur. `reasoning`-Items werden
 *  uebersprungen, `refusal`-Items getrennt zurueckgegeben. */
function extractText(data: ResponsesPayload): { text: string; refusal: string | null } {
  if (typeof data.output_text === 'string' && data.output_text.length > 0) {
    return { text: data.output_text, refusal: null };
  }
  const parts: string[] = [];
  let refusal: string | null = null;
  for (const item of data.output ?? []) {
    if (item?.type !== 'message') continue; // z. B. reasoning-Items
    for (const c of item.content ?? []) {
      if (c?.type === 'output_text' && typeof c.text === 'string') parts.push(c.text);
      else if (c?.type === 'refusal' && typeof c.refusal === 'string') refusal = c.refusal;
    }
  }
  return { text: parts.join('\n').trim(), refusal };
}

// ============================================================
// Öffentliche API
// ============================================================

export interface ChatInput {
  system: string;
  messages: ChatMessage[];
  model: string;
  /** Budget fuer den SICHTBAREN Text. Reasoning-Token werden separat
   *  aufgeschlagen — Aufrufer muessen das nicht wissen. */
  maxTokens?: number;
  /** Nur fuer Reasoning-Modelle relevant; sonst ignoriert. */
  effort?: ReasoningEffort;
}

export async function chatCompletion(input: ChatInput): Promise<string> {
  const model = resolveModel(input.model);
  const answerTokens = Math.max(16, input.maxTokens ?? 1024);

  const build = (m: string) => {
    const reasoning = isReasoningModel(m);
    const payload: Record<string, unknown> = {
      model: m,
      instructions: input.system,
      input: input.messages
        .filter((msg) => msg && typeof msg.content === 'string' && msg.content.trim().length > 0)
        .map((msg) => ({ role: msg.role, content: msg.content })),
      // Reasoning-Token zaehlen mit — sonst kommt eine leere Antwort zurueck.
      max_output_tokens: reasoning ? answerTokens + REASONING_BUDGET_TOKENS : answerTokens,
      // Datenschutz: Coach-Prompts enthalten personenbezogene Kontaktdaten
      // und werden nicht beim Anbieter gespeichert (ADR-025).
      store: false,
    };
    // `reasoning` an ein Nicht-Reasoning-Modell zu schicken, ist ein 400er.
    if (reasoning) payload.reasoning = { effort: input.effort ?? 'low' };
    return payload;
  };

  let data: ResponsesPayload;
  try {
    data = (await postJson(OPENAI_RESPONSES_URL, build(model), CHAT_TIMEOUT_MS)) as ResponsesPayload;
  } catch (e) {
    if (isModelUnavailable(e) && model !== FALLBACK_CHAT_MODEL) {
      console.warn(`Modell "${model}" nicht verfügbar — Fallback auf ${FALLBACK_CHAT_MODEL}.`);
      data = (await postJson(
        OPENAI_RESPONSES_URL,
        build(FALLBACK_CHAT_MODEL),
        CHAT_TIMEOUT_MS
      )) as ResponsesPayload;
    } else {
      throw e;
    }
  }

  const { text, refusal } = extractText(data);
  if (refusal && !text) {
    throw new LlmError(`Modell hat die Antwort verweigert: ${refusal}`, 'refused');
  }
  if (!text) {
    const reason = data.incomplete_details?.reason ?? data.status ?? 'unbekannt';
    throw new LlmError(`Leere Antwort vom Modell (Grund: ${reason}).`, 'empty_response');
  }
  return text;
}

/** Embedding fuer einen einzelnen Text. */
export async function embed(text: string): Promise<number[]> {
  const [vector] = await embedBatch([text]);
  if (!vector) throw new LlmError('Kein Embedding erhalten.', 'empty_response');
  return vector;
}

/**
 * Embeddings fuer mehrere Texte in EINEM Call.
 * Wichtig fuer die Ingestion: 40 Chunks = 1 Roundtrip statt 40, damit
 * die Function nicht in die Laufzeitgrenze laeuft.
 * Die Reihenfolge der Ausgabe entspricht der Eingabe.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const inputs = texts.map((t) => (t ?? '').slice(0, 8000)).filter((t) => t.length > 0);
  if (inputs.length === 0) return [];

  const data = (await postJson(
    OPENAI_EMBEDDINGS_URL,
    { model: EMBEDDING_MODEL, input: inputs },
    EMBED_TIMEOUT_MS
  )) as { data?: Array<{ index?: number; embedding?: number[] }> };

  const rows = data.data ?? [];
  if (rows.length !== inputs.length) {
    throw new LlmError(
      `Embedding-Anzahl stimmt nicht (${rows.length} statt ${inputs.length}).`,
      'upstream'
    );
  }
  // Die Reihenfolge ist nicht zugesichert — deshalb ueber `index` einsortieren.
  const out: number[][] = new Array(inputs.length);
  rows.forEach((row, i) => {
    const target = typeof row.index === 'number' ? row.index : i;
    const vec = row.embedding;
    if (!Array.isArray(vec) || vec.length !== EMBEDDING_DIMENSIONS) {
      throw new LlmError(
        `Unerwartete Embedding-Dimension (${vec?.length ?? 0} statt ${EMBEDDING_DIMENSIONS}).`,
        'upstream'
      );
    }
    out[target] = vec;
  });
  return out;
}
