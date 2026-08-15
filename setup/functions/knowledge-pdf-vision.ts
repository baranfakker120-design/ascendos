// AscendOS Edge Function: knowledge-pdf-vision (Dashboard-Version, alles in einer Datei)
// Name der Function MUSS exakt lauten: knowledge-pdf-vision
//
// GENERIERT von scripts/bundle-functions.mjs — NICHT von Hand ändern.
// Quelle: supabase/functions/knowledge-pdf-vision/index.ts

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

// ---- inline: _shared/cors.ts ----
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  // x-ascendos-org: org selector from the shared Supabase client (additive; required for browser preflight).
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-ascendos-org, x-cron-secret',
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

// ---- inline: _shared/tenant.ts ----
/**
 * Phase 5 — Edge tenant discipline helpers.
 *
 * Canonical authority: memberships + x-ascendos-org (same rules as
 * active_membership_id() / content-assistant / instagram-oauth).
 * Never treat profiles.org_id as authorization.
 *
 * Keep pure resolve logic in sync with:
 *   src/shared/auth/tenantResolve.ts
 */


export interface ActiveMembership {
  id: string;
  org_id: string;
  role: string;
  status: string;
}

/** Forward Authorization + x-ascendos-org so PostgREST RLS sees current_org_id(). */
export function userClientFromRequest(req: Request): SupabaseClient {
  const forwardHeaders: Record<string, string> = {
    Authorization: req.headers.get('Authorization') ?? '',
  };
  const orgSelector = req.headers.get('x-ascendos-org');
  if (orgSelector) forwardHeaders['x-ascendos-org'] = orgSelector;
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: forwardHeaders },
  });
}

/**
 * Pure membership pick (header preferred; single active auto-resolves;
 * multi without header → null). Mirrors DB Fall 1–4 without profiles mirror.
 */
export function pickActiveMembershipFromList(
  memberships: ActiveMembership[],
  orgHeader: string | null
): ActiveMembership | null {
  const active = memberships.filter((m) => m.status === 'active');
  if (active.length === 0) return null;
  if (orgHeader) {
    return active.find((m) => m.org_id === orgHeader) ?? null;
  }
  if (active.length === 1) return active[0];
  return null;
}

export type ResolveMembershipResult =
  | { ok: true; userId: string; membership: ActiveMembership }
  | { ok: false; status: 401 | 403; error: 'not_authenticated' | 'no_active_membership' };

export async function resolveActiveMembership(
  db: SupabaseClient,
  req: Request
): Promise<ResolveMembershipResult> {
  const { data: userData, error: authError } = await db.auth.getUser();
  if (authError || !userData.user) {
    return { ok: false, status: 401, error: 'not_authenticated' };
  }

  const { data: memberships, error: membershipError } = await db
    .from('memberships')
    .select('id, org_id, role, status')
    .eq('identity_id', userData.user.id)
    .eq('status', 'active');
  if (membershipError) throw membershipError;

  const orgHeader = req.headers.get('x-ascendos-org');
  const list = (memberships as ActiveMembership[] | null) ?? [];
  const membership = pickActiveMembershipFromList(list, orgHeader);
  if (!membership) {
    return { ok: false, status: 403, error: 'no_active_membership' };
  }
  return { ok: true, userId: userData.user.id, membership };
}

/** Deny client-supplied org ids that do not match the server-resolved org. */
export function assertClientOrgMatches(
  bodyOrgId: unknown,
  serverOrgId: string
): { ok: true } | { ok: false; error: 'org_mismatch' } {
  if (bodyOrgId === undefined || bodyOrgId === null || bodyOrgId === '') {
    return { ok: true };
  }
  if (String(bodyOrgId) !== serverOrgId) {
    return { ok: false, error: 'org_mismatch' };
  }
  return { ok: true };
}

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

// ---- inline: _shared/content-generate/types.ts ----
export type ContentFormat = 'story' | 'feed' | 'reel';

export interface MembershipRow {
  id: string;
  org_id: string;
  role: string;
  status: string;
}

export interface AssetRow {
  id: string;
  org_id: string;
  owner_membership_id: string;
  scope: string;
  media_kind: 'image' | 'video';
  storage_path: string;
  file_name: string;
  mime_type: string;
  title: string | null;
  aspect_ratio: string | null;
  suggested_formats: string[] | null;
}

export interface KeywordDetail {
  keyword: string;
  why: string;
}

export interface HashtagDetail {
  tag: string;
  why: string;
}

export interface SlideAnalysis {
  index: number;
  summary: string;
  role: string;
  issue: string | null;
  fix: string | null;
}

export interface GenerationPayload {
  visual_summary: string;
  theme: string | null;
  audience_hint: string | null;
  mood: string | null;
  content_category: string | null;
  message: string | null;
  product_hint: string | null;
  uncertain: string[];
  content_type: ContentFormat;
  content_intent: string | null;
  core_message: string | null;
  problem: string | null;
  emotion: string | null;
  why_swipe: string | null;
  why_save: string | null;
  why_share: string | null;
  hook: string;
  hook_strength: 'strong' | 'ok' | 'weak' | null;
  hook_alternatives: string[];
  caption: string;
  keywords: string[];
  keyword_details: KeywordDetail[];
  hashtags: string[];
  hashtag_details: HashtagDetail[];
  cta: string;
  target_audience: string | null;
  posting_hint: string | null;
  optimization: string | null;
  slides: SlideAnalysis[];
  llm_clean_flags: string[];
}

/** Hard product rule: Instagram Content Assistant always returns exactly 5 hashtags. */
export const REQUIRED_HASHTAG_COUNT = 5;
/** Instagram Graph carousel hard max (children). Not the library or Autopilot pool size. */
export const CAROUSEL_MAX_ASSETS = 10;

export const CONTENT_ASSETS_BUCKET = 'content-assets';
export const DEFAULT_DAILY_GENERATION_LIMIT = 25;
export const VISION_MODEL = 'google/gemini-2.5-flash';
export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
/** OpenRouter call budget (after video bytes are already in memory). */
export const VISION_TIMEOUT_MS = 45_000;
/** Server-side download of the private storage object. */
export const VISION_VIDEO_FETCH_TIMEOUT_MS = 25_000;
/**
 * Max video size for AI analysis (base64 expands ~4/3).
 * Storage assets allow up to 50 MB; vision stays below that for edge memory.
 * ~30 MB iPhone MOVs (current production sample) must fit.
 */
export const VISION_VIDEO_MAX_BYTES = 35 * 1024 * 1024;
export const VISION_VIDEO_MIMES = ['video/mp4', 'video/webm', 'video/quicktime'] as const;

export type VisionVideoMime = (typeof VISION_VIDEO_MIMES)[number];

export type VisionErrorCode =
  | 'VIDEO_FETCH_FAILED'
  | 'VIDEO_TOO_LARGE'
  | 'VIDEO_UNSUPPORTED_MIME'
  | 'AI_PROVIDER_BAD_REQUEST'
  | 'AI_PROVIDER_AUTH_ERROR'
  | 'AI_PROVIDER_RATE_LIMIT'
  | 'AI_PROVIDER_TIMEOUT'
  | 'AI_PROVIDER_CREDITS_EXHAUSTED'
  | 'AI_PROVIDER_ERROR'
  | 'missing_openrouter_key';

/** Sanitized OpenRouter/upstream diagnostic fields — never secrets, URLs, or media. */
export type ProviderErrorDetails = {
  http_status: number | null;
  content_type: string | null;
  body_length: number;
  error_message?: string | null;
  error_code?: string | number | null;
  error_type?: string | null;
  provider_name?: string | null;
  /** Non-JSON bodies only; max 1000 chars, already sanitized. */
  body_preview?: string | null;
};

// ============================================================
// knowledge-pdf-vision: analyze one PDF page image via OpenRouter
// Model: google/gemini-2.5-flash (existing content vision stack).
// Tenant: membership + x-ascendos-org; forged org denied.
// Does NOT write production knowledge rows — returns structured JSON only.
// ============================================================


const SYSTEM = `You analyze one PDF page image for an organization knowledge base.
Return ONLY a JSON object (no markdown prose) with this shape:
{
  "page_number": <number>,
  "detected_type": "photo|screenshot|diagram|chart|table_image|infographic|scanned_document|logo|other",
  "extracted_text": "<OCR / readable text; empty if none>",
  "visual_summary": "<factual description of visuals; no invented numbers>",
  "tables": [{ "headers": [], "rows": [[]], "caption": null, "page_number": <n>, "confidence": "high|medium|low|needs_review" }],
  "key_facts": ["..."],
  "important_terms": ["..."],
  "confidence": "high|medium|low|needs_review",
  "needs_review": <boolean>
}
Rules:
- Never invent table values you cannot read.
- If unsure, set confidence to needs_review and needs_review true.
- Prefer empty arrays over fabricated content.`;

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fence ? fence[1].trim() : trimmed;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('vision_json_missing');
  return JSON.parse(raw.slice(start, end + 1));
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const db = userClientFromRequest(req);
    const resolved = await resolveActiveMembership(db, req);
    if (!resolved.ok) {
      if (resolved.status === 401) return json({ error: 'Nicht angemeldet.' }, 401);
      return json({ error: 'Keine aktive Organisationsmitgliedschaft.' }, 403);
    }

    const { membership: active } = resolved;
    if (active.role !== 'super_admin' && active.role !== 'developer') {
      return json({ error: 'Nur Content-Manager können PDF-Vision nutzen.' }, 403);
    }

    const body = await req.json();
    const bodyOrg =
      body.organization_id ?? body.org_id ?? body.organizationId ?? body.orgId ?? null;
    const orgCheck = assertClientOrgMatches(bodyOrg, active.org_id);
    if (!orgCheck.ok) {
      return json({ error: 'organisation_mismatch' }, 403);
    }

    const pageNumber = Number(body.page_number ?? body.pageNumber ?? 0);
    const imageDataUrl = String(body.image_data_url ?? body.imageDataUrl ?? '').trim();
    if (!pageNumber || pageNumber < 1) {
      return json({ error: 'page_number_required' }, 400);
    }
    if (!imageDataUrl.startsWith('data:image/')) {
      return json({ error: 'image_data_url_required' }, 400);
    }
    // Hard size guard (~4MB base64 payload) — cost + edge memory.
    if (imageDataUrl.length > 5_500_000) {
      return json({ error: 'image_too_large' }, 413);
    }

    const apiKey = Deno.env.get('OPENROUTER_API_KEY');
    if (!apiKey) {
      return json({ error: 'VISION_FAILED', detail: 'missing_openrouter_key' }, 503);
    }

    let upstreamText = '';
    try {
      const res = await fetchWithTimeout(
        'openrouter',
        OPENROUTER_URL,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://ascendos.app',
            'X-Title': 'AscendOS Knowledge PDF Vision',
          },
          body: JSON.stringify({
            model: VISION_MODEL,
            temperature: 0.2,
            max_tokens: 2200,
            messages: [
              { role: 'system', content: SYSTEM },
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: `Analyze PDF page ${pageNumber}. Return structured JSON only.`,
                  },
                  { type: 'image_url', image_url: { url: imageDataUrl } },
                ],
              },
            ],
          }),
        },
        45_000
      );
      const text = await res.text();
      if (!res.ok) {
        console.error('knowledge_pdf_vision_upstream', res.status, text.slice(0, 400));
        return json(
          { error: 'VISION_FAILED', detail: `upstream_${res.status}`, model: VISION_MODEL },
          502
        );
      }
      const parsed = JSON.parse(text) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      upstreamText = parsed.choices?.[0]?.message?.content?.trim() ?? '';
      if (!upstreamText) {
        return json({ error: 'VISION_FAILED', detail: 'empty_vision_content' }, 502);
      }
    } catch (e) {
      console.error('knowledge_pdf_vision_error', e instanceof Error ? e.message : e);
      return json(
        {
          error: 'VISION_FAILED',
          detail: e instanceof Error ? e.message : 'vision_error',
        },
        502
      );
    }

    let structured: unknown;
    try {
      structured = extractJsonObject(upstreamText);
    } catch {
      return json({ error: 'VISION_FAILED', detail: 'vision_json_missing' }, 502);
    }

    return json({
      ok: true,
      org_id: active.org_id,
      model: VISION_MODEL,
      provider: 'openrouter',
      page_number: pageNumber,
      result: structured,
    });
  } catch (e) {
    console.error('knowledge-pdf-vision fatal', e instanceof Error ? e.message : e);
    return json({ error: 'VISION_FAILED', detail: 'internal' }, 500);
  }
});
