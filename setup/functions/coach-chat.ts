// AscendOS Edge Function: coach-chat (Dashboard-Version, alles in einer Datei)
// Name der Function MUSS exakt lauten: coach-chat
//
// GENERIERT von scripts/bundle-functions.mjs — NICHT von Hand ändern.
// Quelle: supabase/functions/coach-chat/index.ts

import { createClient } from 'jsr:@supabase/supabase-js@2';

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

// ---- inline: _shared/llm.ts ----
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
`.trim();

export const ROUTER_PROMPT = `
Du bist ein Klassifikator. Ordne die Nutzerfrage GENAU EINEM Spezialisten zu.
Antworte NUR mit einem dieser Wörter: recruiting | sales | knowledge
- recruiting: Interessenten, Einwände, Präsentation, Fit Check, 3-Way-Call, neue Partner
- sales: Produkte verkaufen, Kunden, Duftpartys, Empfehlungen
- knowledge: Faktenfragen zu Produkten, Vergütungsplan, Abläufen, Schulung
Im Zweifel: knowledge.
`.trim();

// ============================================================
// coach-chat: Der eine Coach mit Spezialisten dahinter (ADR-011).
// Ablauf: Auth -> Limit -> Kontext laden (unter RLS des Nutzers!)
// -> Router -> Retrieval (pgvector) -> Antwort -> persistieren.
// Der Client schickt nur contactId + Nachricht; allen Kontext
// baut der Server selbst (Sprint-4-Prinzip: Kontext-first).
// ============================================================


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
          await chatCompletion({
            system: ROUTER_PROMPT,
            messages: [{ role: 'user', content: message }],
            model: fastModel(),
            maxTokens: 16,
            effort: 'none',
          })
        )
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

    // ---------- Retrieval: Teamdokumente (unter RLS des Nutzers) ----------
    const tRag = Date.now();
    let knowledgeBlock = '';
    let hadKnowledge = false;
    try {
      const queryEmbedding = await embed(message);
      const { data: matches } = await db.rpc('match_knowledge', {
        query_embedding: queryEmbedding,
        p_org_id: profile.org_id,
        match_categories: agent.retrieval_categories?.length
          ? agent.retrieval_categories : null,
        match_count: 5,
      });
      if (matches && matches.length > 0) {
        hadKnowledge = true;
        knowledgeBlock =
          'AUSZÜGE AUS DEN TEAMDOKUMENTEN (oberste Wahrheit):\n' +
          matches.map((m: { doc_title: string; content: string }) =>
            `[${m.doc_title}]\n${m.content}`).join('\n---\n');
      }
    } catch (_e) {
      // Embedding-Ausfall darf den Coach nicht stoppen: er antwortet
      // dann ohne Dokumente und behandelt Teamfragen als Wissenslücke.
    }
    if (!hadKnowledge) {
      // [K-1] Datenschutz: NIE die Rohfrage loggen — sie kann private
      // Kontaktdaten enthalten, und Admins lesen diese Tabelle. Die
      // Frage wird erst zu einem anonymen Wissensthema generalisiert;
      // schlägt das fehl, wird NICHT geloggt (Privacy vor Metrik).
      try {
        const topic = (await chatCompletion({
          system:
            'Fasse die Nutzerfrage als allgemeines Wissensthema zusammen: max. 12 Wörter, ' +
            'Deutsch, OHNE Namen, Zahlen zu Personen oder persönliche Details. ' +
            'Beispiel: "Wie überzeuge ich Mehmet mit 200€ Schulden?" -> ' +
            '"Einwandbehandlung bei finanziellen Bedenken". Antworte NUR mit dem Thema.',
          messages: [{ role: 'user', content: message.slice(0, 500) }],
          model: fastModel(),
          maxTokens: 60,
          effort: 'none',
        })).trim().slice(0, 200);
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
    const reply = (
      await chatCompletion({
        system,
        messages: [...history, { role: 'user', content: message }],
        model: agent.model,
        maxTokens: 1024,
        effort: 'low',
      })
    ).trim();
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
    // Strukturierte Metriken in die Function-Logs (ohne Inhalte, ADR-019):
    console.log(JSON.stringify({ metric: 'coach_chat', agentKey, hadKnowledge, ...timings }));
    return json({ conversationId: convoId, agentKey, reply, timings });
  } catch (e) {
    // LlmError traegt den Grund maschinenlesbar — im Log steht damit sofort,
    // ob es am fehlenden Secret, am Rate-Limit oder am Modell lag.
    if (e instanceof LlmError) {
      console.error(`coach-chat llm error [${e.code}]`, e.message);
    } else {
      console.error('coach-chat error', e instanceof Error ? e.message : e);
    }
    return new Response(
      JSON.stringify({ error: 'Der Coach ist gerade nicht erreichbar. Versuche es gleich noch einmal.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
