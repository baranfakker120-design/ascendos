// AscendOS Edge Function: content-autopilot-run (Dashboard-Version, alles in einer Datei)
// Name der Function MUSS exakt lauten: content-autopilot-run
//
// GENERIERT von scripts/bundle-functions.mjs — NICHT von Hand ändern.
// Quelle: supabase/functions/content-autopilot-run/index.ts

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts';
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

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

// ---- inline: _shared/content-research/curated-catalog.ts ----
/**
 * Curated, evergreen topic → hashtag catalog.
 * NOT a live trend feed. Tags are thematic suggestions only.
 */

export interface CuratedTopic {
  id: string;
  /** Match against theme/category/keywords/summary (lowercase). */
  matchers: string[];
  hashtags: string[];
}

export const CURATED_TOPICS: readonly CuratedTopic[] = [
  {
    id: 'fragrance',
    matchers: ['duft', 'parfum', 'perfume', 'fragrance', 'scent', 'eau de', 'note', 'olfaktor'],
    hashtags: ['parfum', 'duftliebe', 'fragrance', 'scentoftheday', 'perfumelovers'],
  },
  {
    id: 'team_business',
    matchers: [
      'team',
      'network',
      'business',
      'leadership',
      'partner',
      'aufbau',
      'community',
      'mentor',
    ],
    hashtags: ['teamarbeit', 'businessmindset', 'netzwerk', 'leadership', 'community'],
  },
  {
    id: 'lifestyle',
    matchers: ['lifestyle', 'alltag', 'everyday', 'moment', 'leben', 'balance', 'wohlfühl'],
    hashtags: ['lifestyle', 'alltagsmomente', 'mindfulmoments', 'everydaylife'],
  },
  {
    id: 'product_showcase',
    matchers: ['produkt', 'product', 'flasche', 'bottle', 'packaging', 'unboxing', 'neuheit'],
    hashtags: ['productlove', 'newin', 'packagingdesign', 'detailshot'],
  },
  {
    id: 'motivation',
    matchers: ['motivation', 'inspiration', 'ziele', 'focus', 'mindset', 'erfolg'],
    hashtags: ['motivation', 'mindset', 'inspirationdaily', 'fokus'],
  },
  {
    id: 'event_social',
    matchers: ['party', 'event', 'treffen', 'workshop', 'live', 'abend', 'celebration'],
    hashtags: ['eventvibes', 'zusammenkommen', 'workshopday'],
  },
];

export function matchCuratedTopics(blob: string): CuratedTopic[] {
  const text = blob.toLowerCase();
  if (!text.trim()) return [];
  return CURATED_TOPICS.filter((topic) => topic.matchers.some((m) => text.includes(m)));
}

// ---- inline: _shared/content-research/types.ts ----
/**
 * Content hashtag research contracts (policy-safe).
 * No scraping, bots, passwords, or fake “trending” claims.
 */

export type ResearchProviderId = 'llm_analysis' | 'curated_catalog' | 'official_meta_hashtag';

export type ResearchSourceKind = 'asset_llm' | 'curated' | 'official_meta';

/** User-facing reason codes (map to i18n in the client). */
export type HashtagReasonCode =
  | 'theme_match'
  | 'high_relevance'
  | 'curated_catalog'
  | 'live_researched'
  | 'rejected_spam'
  | 'rejected_irrelevant'
  | 'rejected_duplicate'
  | 'low_context';

export interface ResearchProviderInfo {
  id: ResearchProviderId;
  kind: ResearchSourceKind | 'disabled';
  enabled: boolean;
  /** If false, results MUST NOT be labeled as live/trending. */
  claimsLiveTrends: boolean;
  description: string;
}

export interface ResearchInput {
  theme?: string | null;
  contentCategory?: string | null;
  mood?: string | null;
  visualSummary?: string | null;
  keywords?: string[];
  llmHashtags?: string[];
  locale?: string;
}

export interface HashtagCandidate {
  tag: string;
  source: ResearchSourceKind;
  score: number;
  reasonCode: HashtagReasonCode;
  rejected: boolean;
  rejectReason?: string;
}

export interface HashtagResearchResult {
  /** Final recommended tags (not rejected), highest score first. */
  recommended: HashtagCandidate[];
  /** Rejected / not recommended (for UI transparency). */
  rejected: HashtagCandidate[];
  providersUsed: ResearchProviderId[];
  /** True only when an enabled live provider contributed tags. */
  liveResearchActive: boolean;
  mode: 'curated_plus_llm' | 'llm_only' | 'insufficient_context';
  notes: string[];
}

// ---- inline: _shared/content-research/pipeline.ts ----
export const RESEARCH_PROVIDERS: readonly ResearchProviderInfo[] = [
  {
    id: 'llm_analysis',
    kind: 'asset_llm',
    enabled: true,
    claimsLiveTrends: false,
    description: 'Hashtags derived from vision/LLM analysis of the actual asset.',
  },
  {
    id: 'curated_catalog',
    kind: 'curated',
    enabled: true,
    claimsLiveTrends: false,
    description: 'Evergreen curated topic catalog — not a live Instagram trend feed.',
  },
  {
    id: 'official_meta_hashtag',
    kind: 'disabled',
    enabled: false,
    claimsLiveTrends: true,
    description:
      'Reserved for official Meta IG Hashtag Search after App Review. Disabled in Phase 3.',
  },
] as const;

const SPAM_TAGS = new Set([
  'fyp',
  'foryou',
  'foryoupage',
  'viral',
  'viralvideo',
  'explorepage',
  'explore',
  'trending',
  'follow4follow',
  'like4like',
  'l4l',
  'f4f',
  'spam',
  'instagood',
  'photooftheday',
  'love',
  'beautiful',
  'cute',
  'happy',
  'followme',
  'instalike',
]);

const RISKY_TAGS = new Set(['guaranteedincome', 'getrich', 'miraclecure', 'shadowbanproof']);

function normalizeResearchTag(tag: string): string {
  return tag
    .trim()
    .replace(/^#/, '')
    .replace(/\s+/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_]/gu, '');
}

function contextBlob(input: ResearchInput): string {
  return [
    input.theme,
    input.contentCategory,
    input.mood,
    input.visualSummary,
    ...(input.keywords ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function keywordHitScore(tag: string, keywords: string[], theme: string): number {
  let score = 0;
  const t = tag.toLowerCase();
  for (const kw of keywords) {
    const k = kw.toLowerCase().replace(/^#/, '');
    if (!k) continue;
    if (t === k || t.includes(k) || k.includes(t)) score += 0.35;
  }
  if (theme) {
    const parts = theme
      .toLowerCase()
      .split(/[\s,/|-]+/)
      .filter((p) => p.length >= 3);
    for (const p of parts) {
      if (t.includes(p) || p.includes(t)) score += 0.25;
    }
  }
  return Math.min(1, score);
}

function upsert(map: Map<string, HashtagCandidate>, next: HashtagCandidate): void {
  const prev = map.get(next.tag);
  if (!prev) {
    map.set(next.tag, next);
    return;
  }
  if (next.rejected && !prev.rejected) return;
  if (!next.rejected && prev.rejected) {
    map.set(next.tag, next);
    return;
  }
  if (next.score > prev.score) map.set(next.tag, next);
}

/**
 * Policy-safe hashtag research pipeline:
 * LLM candidates + curated catalog → score → reject spam/irrelevant.
 * Official Meta provider is wired but disabled (no fake live trends).
 */
export function runHashtagResearch(input: ResearchInput): HashtagResearchResult {
  const blob = contextBlob(input);
  const keywords = (input.keywords ?? []).map((k) => k.trim()).filter(Boolean);
  const theme = (input.theme ?? '').trim();
  const providersUsed: ResearchProviderId[] = [];
  const map = new Map<string, HashtagCandidate>();
  const notes: string[] = [];

  const lowContext =
    blob.replace(/\s+/g, ' ').trim().length < 12 &&
    keywords.length === 0 &&
    (input.llmHashtags ?? []).length === 0;

  if (lowContext) {
    notes.push('Insufficient thematic context for confident hashtag research.');
    return {
      recommended: [],
      rejected: [],
      providersUsed: [],
      liveResearchActive: false,
      mode: 'insufficient_context',
      notes,
    };
  }

  // 1) LLM / asset-derived candidates
  providersUsed.push('llm_analysis');
  for (const raw of input.llmHashtags ?? []) {
    const tag = normalizeResearchTag(raw);
    if (!tag || tag.length < 2) continue;
    if (SPAM_TAGS.has(tag) || RISKY_TAGS.has(tag)) {
      upsert(map, {
        tag,
        source: 'asset_llm',
        score: 0,
        reasonCode: 'rejected_spam',
        rejected: true,
        rejectReason: 'spam_or_generic',
      });
      continue;
    }
    // Vision/LLM tags are kept unless spam — they already come from the asset.
    const hit = keywordHitScore(tag, keywords, theme);
    upsert(map, {
      tag,
      source: 'asset_llm',
      score: 0.5 + hit * 0.45,
      reasonCode: hit >= 0.35 ? 'theme_match' : 'high_relevance',
      rejected: false,
    });
  }

  // 2) Curated evergreen catalog (never labeled as live/trending)
  providersUsed.push('curated_catalog');
  const topics = matchCuratedTopics(blob);
  if (topics.length === 0) {
    notes.push('No curated catalog topic matched; using asset-derived tags only.');
  }
  for (const topic of topics) {
    for (const raw of topic.hashtags) {
      const tag = normalizeResearchTag(raw);
      if (!tag) continue;
      if (SPAM_TAGS.has(tag)) {
        upsert(map, {
          tag,
          source: 'curated',
          score: 0,
          reasonCode: 'rejected_spam',
          rejected: true,
          rejectReason: 'spam_or_generic',
        });
        continue;
      }
      const hit = keywordHitScore(tag, keywords, theme);
      upsert(map, {
        tag,
        source: 'curated',
        score: 0.55 + hit * 0.4,
        reasonCode: 'curated_catalog',
        rejected: false,
      });
    }
  }

  // 3) Official Meta provider — disabled; do not invent live trends
  const meta = RESEARCH_PROVIDERS.find((p) => p.id === 'official_meta_hashtag');
  if (!meta?.enabled) {
    notes.push('Live Meta hashtag research is not enabled (no App Review / no unofficial APIs).');
  }

  // Deduplicate / finalize
  const all = [...map.values()];
  const seen = new Set<string>();
  for (const c of all) {
    if (seen.has(c.tag) && !c.rejected) {
      c.rejected = true;
      c.reasonCode = 'rejected_duplicate';
      c.rejectReason = 'duplicate';
    }
    if (!c.rejected) seen.add(c.tag);
  }

  const recommended = all
    .filter((c) => !c.rejected)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
  const rejected = all
    .filter((c) => c.rejected)
    .sort((a, b) => b.score - a.score)
    .slice(0, 16);

  if (recommended.length === 0) {
    notes.push('No suitable hashtags after scoring — draft may omit hashtags.');
  }

  notes.push('Hashtags are thematic suggestions only — not claimed as currently trending.');

  return {
    recommended,
    rejected,
    providersUsed,
    liveResearchActive: false,
    mode: topics.length > 0 ? 'curated_plus_llm' : 'llm_only',
    notes,
  };
}

export function formatResearchPostingHint(result: HashtagResearchResult): string {
  const parts = result.recommended.slice(0, 8).map((c) => {
    const why =
      c.reasonCode === 'curated_catalog'
        ? 'kuratiert'
        : c.reasonCode === 'theme_match'
          ? 'thema'
          : c.reasonCode === 'live_researched'
            ? 'live'
            : 'relevanz';
    return `#${c.tag} (${why})`;
  });
  const live = result.liveResearchActive
    ? 'Live-Recherche aktiv.'
    : 'Keine Live-Trend-Recherche aktiv.';
  if (parts.length === 0) return `Hashtag-Hinweise: keine sicheren Treffer. ${live}`;
  return `Hashtag-Hinweise: ${parts.join('; ')}. ${live}`;
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
/** Instagram Graph carousel hard max (children). Library capacity stays 25. */
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

// ---- inline: _shared/content-autopilot/types.ts ----
/** Instagram Content Autopilot V1 — shared contracts (no Facebook). */

export const AUTOPILOT_MIN_ELIGIBLE_ASSETS = 10;
export const AUTOPILOT_MAX_FEED_PER_DAY = 3;
export const AUTOPILOT_MAX_STORIES_PER_DAY = 3;
export const AUTOPILOT_DEFAULT_MAX_RETRIES = 3;
export const AUTOPILOT_ASSET_COOLDOWN_DAYS = 3;

export type AutopilotSlotKind = 'feed' | 'story';
export type AutopilotContentFormat = 'story' | 'feed' | 'reel';
export type AutopilotSlotStatus =
  | 'planned'
  | 'ready'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export type AutopilotPlanStatus = 'active' | 'completed' | 'cancelled';

export interface AutopilotEligibleAsset {
  id: string;
  scope: 'personal' | 'central' | string;
  media_kind: 'image' | 'video' | string;
  mime_type: string | null;
  storage_path: string | null;
  theme: string | null;
  keywords: string[] | null;
  suggested_formats: string[] | null;
  analysis_status: string | null;
  last_used_at: string | null;
  usage_count: number;
  created_at: string;
}

export interface AutopilotHistoryItem {
  assetId: string | null;
  category: string | null;
  theme: string | null;
  publishedAt: string;
  slotKind: AutopilotSlotKind | string;
}

export interface ScoredCandidate {
  asset: AutopilotEligibleAsset;
  score: number;
  category: string;
  reasons: string[];
}

// ---- inline: _shared/content-autopilot/eligibility.ts ----
/**
 * Gate eligibility (10-asset gate): images AND videos count.
 * Videos remain in the library and may be used as Video Stories only.
 */
export function isEligibleAutopilotAsset(asset: AutopilotEligibleAsset): boolean {
  if (!asset?.id) return false;
  if (!asset.storage_path || !String(asset.storage_path).trim()) return false;
  if (asset.media_kind !== 'image' && asset.media_kind !== 'video') return false;
  const mime = (asset.mime_type ?? '').toLowerCase();
  if (mime && mime.startsWith('image/') === false && mime.startsWith('video/') === false) {
    return false;
  }
  if (asset.analysis_status === 'failed') return false;
  return true;
}

/** Feed / Carousel pool — images only. Never video/reel/feed-video. */
export function isEligibleAutopilotFeedAsset(asset: AutopilotEligibleAsset): boolean {
  if (!isEligibleAutopilotAsset(asset)) return false;
  return asset.media_kind === 'image';
}

/** Story pool — image story OR video story. */
export function isEligibleAutopilotStoryAsset(asset: AutopilotEligibleAsset): boolean {
  return isEligibleAutopilotAsset(asset);
}

export function isEligibleForSlotKind(
  asset: AutopilotEligibleAsset,
  slotKind: AutopilotSlotKind
): boolean {
  return slotKind === 'feed'
    ? isEligibleAutopilotFeedAsset(asset)
    : isEligibleAutopilotStoryAsset(asset);
}

export function countEligibleAssets(assets: readonly AutopilotEligibleAsset[]): number {
  return assets.filter(isEligibleAutopilotAsset).length;
}

export function countEligibleFeedAssets(assets: readonly AutopilotEligibleAsset[]): number {
  return assets.filter(isEligibleAutopilotFeedAsset).length;
}

export function canActivateAutopilot(
  assets: readonly AutopilotEligibleAsset[],
  minRequired = AUTOPILOT_MIN_ELIGIBLE_ASSETS
): { ok: true; count: number } | { ok: false; count: number; reason: 'below_min_assets' } {
  const count = countEligibleAssets(assets);
  if (count < minRequired) return { ok: false, count, reason: 'below_min_assets' };
  return { ok: true, count };
}

/** Meine + Zentrale together — both scopes count when gate-eligible. */
export function countByScope(assets: readonly AutopilotEligibleAsset[]): {
  personal: number;
  central: number;
  total: number;
} {
  let personal = 0;
  let central = 0;
  for (const a of assets) {
    if (!isEligibleAutopilotAsset(a)) continue;
    if (a.scope === 'central') central += 1;
    else personal += 1;
  }
  return { personal, central, total: personal + central };
}

// ---- inline: _shared/content-autopilot/signals.ts ----
/** Weekday / daypart signals — soft preferences, never hard requirements. */

export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6; // Sun=0 … Sat=6 (JS Date)

export type Daypart = 'morning' | 'midday' | 'afternoon' | 'evening';

const WEEKDAY_CATEGORIES: Record<WeekdayIndex, string[]> = {
  1: ['motivation', 'business', 'goals', 'recruiting', 'weekstart'],
  2: ['education', 'tips', 'product', 'value'],
  3: ['team', 'community', 'storytelling', 'education'],
  4: ['business', 'recruiting', 'product', 'socialproof'],
  5: ['lifestyle', 'personality', 'team', 'community'],
  6: ['lifestyle', 'everyday', 'personality', 'community'],
  0: ['reflection', 'motivation', 'planning', 'personalstory'],
};

const DAYPART_CATEGORIES: Record<Daypart, string[]> = {
  morning: ['motivation', 'daystart', 'personality', 'story'],
  midday: ['education', 'value', 'carousel', 'product'],
  afternoon: ['community', 'lifestyle', 'interaction'],
  evening: ['recruiting', 'storytelling', 'business', 'reel', 'cta'],
};

export function daypartFromHour(hour: number): Daypart {
  if (hour < 11) return 'morning';
  if (hour < 15) return 'midday';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

export function preferredCategoriesForSlot(params: {
  weekday: WeekdayIndex;
  hour: number;
}): string[] {
  const day = WEEKDAY_CATEGORIES[params.weekday] ?? [];
  const part = DAYPART_CATEGORIES[daypartFromHour(params.hour)] ?? [];
  return [...new Set([...day, ...part])];
}

export function inferCategoryFromAsset(params: {
  theme: string | null | undefined;
  keywords: string[] | null | undefined;
  suggestedFormats: string[] | null | undefined;
}): string {
  const blob = [
    params.theme ?? '',
    ...(params.keywords ?? []),
    ...(params.suggestedFormats ?? []),
  ]
    .join(' ')
    .toLowerCase();

  const rules: Array<[string, RegExp]> = [
    ['recruiting', /recruit|team.?aufbau|bewerb|nebenverdienst|network.?market/],
    ['product', /produkt|parfum|duft|fragrance|packaging|product/],
    ['education', /tipp|learn|wissen|howto|erklä|educat|mehrwert/],
    ['lifestyle', /lifestyle|alltag|everyday|leben|mood/],
    ['storytelling', /story|erzähl|journey|weg/],
    ['team', /team|community|zusammen|wir/],
    ['business', /business|umsatz|ziele|fokus|mindset/],
    ['motivation', /motivation|inspiration|start|montag/],
    ['socialproof', /erfolg|proof|testimon|ergebnis|kunden/],
  ];
  for (const [cat, re] of rules) {
    if (re.test(blob)) return cat;
  }
  return 'general';
}

// ---- inline: _shared/content-autopilot/timing.ts ----
/**
 * Default local time windows (Europe/Berlin wall clock as HH:mm).
 * Soft defaults when account insights are unavailable — never invent metrics.
 */

export const DEFAULT_FEED_TIMES = ['09:30', '13:00', '19:00'] as const;
export const DEFAULT_STORY_TIMES = ['08:15', '12:30', '17:45'] as const;

export function parseHm(hm: string): { hour: number; minute: number } {
  const [h, m] = hm.split(':').map((x) => Number(x));
  return {
    hour: Number.isFinite(h) ? h : 12,
    minute: Number.isFinite(m) ? m : 0,
  };
}

/** Build ISO timestamptz for a calendar date + HH:mm in a fixed offset approximation.
 * Autopilot stores timestamptz; planning uses Europe/Berlin civil dates from the client/edge.
 * For V1 we encode as UTC+1/+2 via explicit offset passed by planner (cetOffsetHours).
 */
export function wallTimeToIso(params: {
  dateYmd: string; // YYYY-MM-DD
  hm: string;
  /** CET=1, CEST=2 */
  utcOffsetHours: number;
}): string {
  const { hour, minute } = parseHm(params.hm);
  const [y, mo, d] = params.dateYmd.split('-').map(Number);
  const utcMs = Date.UTC(y, mo - 1, d, hour - params.utcOffsetHours, minute, 0);
  return new Date(utcMs).toISOString();
}

/** Rough Berlin offset for a Y-M-D (CEST last Sunday March→October). Good enough for V1 slots. */
export function berlinUtcOffsetHours(dateYmd: string): number {
  const [y, mo, d] = dateYmd.split('-').map(Number);
  const utc = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
  // Approximate EU DST: last Sunday of March to last Sunday of October
  const marchLastSun = lastSundayUtc(y, 2);
  const octLastSun = lastSundayUtc(y, 9);
  if (utc >= marchLastSun && utc < octLastSun) return 2;
  return 1;
}

function lastSundayUtc(year: number, monthIndex: number): Date {
  const last = new Date(Date.UTC(year, monthIndex + 1, 0, 1, 0, 0));
  const day = last.getUTCDay();
  last.setUTCDate(last.getUTCDate() - day);
  return last;
}

export function enumerateDatesInclusive(startYmd: string, endYmd: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${startYmd}T12:00:00.000Z`);
  const end = new Date(`${endYmd}T12:00:00.000Z`);
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export function weekdayIndexFromYmd(dateYmd: string): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  const d = new Date(`${dateYmd}T12:00:00.000Z`);
  return d.getUTCDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

// ---- inline: _shared/content-autopilot/selection.ts ----
function daysBetween(isoA: string, isoB: string): number {
  const a = new Date(isoA).getTime();
  const b = new Date(isoB).getTime();
  return Math.abs(a - b) / (24 * 60 * 60 * 1000);
}

export function scoreAutopilotCandidate(params: {
  asset: AutopilotEligibleAsset;
  slotKind: AutopilotSlotKind;
  weekday: WeekdayIndex;
  hour: number;
  nowIso: string;
  reservedAssetIds: ReadonlySet<string>;
  history: readonly AutopilotHistoryItem[];
}): ScoredCandidate | null {
  const { asset, slotKind, weekday, hour, nowIso, reservedAssetIds, history } = params;
  // Feed = image only; Story = image|video. Videos never score for feed/carousel.
  if (!isEligibleForSlotKind(asset, slotKind)) return null;
  if (reservedAssetIds.has(asset.id)) return null;

  const category = inferCategoryFromAsset({
    theme: asset.theme,
    keywords: asset.keywords,
    suggestedFormats: asset.suggested_formats,
  });
  const preferred = preferredCategoriesForSlot({ weekday, hour });
  const reasons: string[] = [];
  let score = 50;

  if (preferred.includes(category)) {
    score += 18;
    reasons.push(`Passt zu Wochentag/Uhrzeit (${category}).`);
  } else if (category === 'general') {
    score += 2;
  } else {
    score += 6;
  }

  // Stories: prefer images; video stories allowed but slightly lower.
  if (slotKind === 'story' && asset.media_kind === 'video') {
    score -= 6;
    reasons.push('Video-Story — Bild-Story bevorzugt.');
  }

  const usage = Number(asset.usage_count ?? 0);
  if (usage === 0) {
    score += 20;
    reasons.push('Noch nicht verwendet.');
  } else if (usage <= 2) {
    score += 10;
    reasons.push('Wenige Verwendungen.');
  } else {
    score -= Math.min(15, usage);
  }

  if (asset.last_used_at) {
    const ago = daysBetween(asset.last_used_at, nowIso);
    if (ago < 1) {
      score -= 40;
      reasons.push('Heute bereits verwendet — stark abgewertet.');
    } else if (ago < AUTOPILOT_ASSET_COOLDOWN_DAYS) {
      score -= 25;
      reasons.push('Kürzlich verwendet.');
    } else if (ago > 14) {
      score += 8;
      reasons.push('Lange nicht verwendet.');
    }
  }

  const recentCategories = history
    .filter((h) => daysBetween(h.publishedAt, nowIso) <= 2)
    .map((h) => h.category)
    .filter(Boolean) as string[];
  if (recentCategories.includes(category)) {
    score -= 12;
    reasons.push('Ähnliche Kategorie kürzlich gepostet.');
  }

  const sameAssetRecent = history.some(
    (h) =>
      h.assetId === asset.id && daysBetween(h.publishedAt, nowIso) < AUTOPILOT_ASSET_COOLDOWN_DAYS
  );
  if (sameAssetRecent) {
    score -= 30;
    reasons.push('Asset in Cooldown.');
  }

  // Prefer matching suggested formats (never auto-promote reel/feed-video)
  const formats = asset.suggested_formats ?? [];
  if (slotKind === 'story' && formats.includes('story')) score += 8;
  if (slotKind === 'feed' && (formats.includes('feed') || formats.includes('carousel'))) score += 8;

  if (asset.scope === 'personal') score += 2;

  return { asset, score, category, reasons };
}

/**
 * Pick best candidate; returns null when nothing is good enough
 * (avoids forced low-quality / blind recycling).
 */
export function selectBestAutopilotAsset(params: {
  assets: readonly AutopilotEligibleAsset[];
  slotKind: AutopilotSlotKind;
  weekday: WeekdayIndex;
  hour: number;
  nowIso: string;
  reservedAssetIds: ReadonlySet<string>;
  history: readonly AutopilotHistoryItem[];
  /** Minimum score to accept — below → skip slot. */
  minScore?: number;
}): ScoredCandidate | null {
  const minScore = params.minScore ?? 35;
  const scored: ScoredCandidate[] = [];
  for (const asset of params.assets) {
    const s = scoreAutopilotCandidate({
      asset,
      slotKind: params.slotKind,
      weekday: params.weekday,
      hour: params.hour,
      nowIso: params.nowIso,
      reservedAssetIds: params.reservedAssetIds,
      history: params.history,
    });
    if (s) scored.push(s);
  }
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0] ?? null;
  if (!best || best.score < minScore) return null;
  return best;
}

// ---- inline: _shared/content-autopilot/carouselBundle.ts ----
/**
 * Autopilot feed bundle: 1 image → single feed; 2–10 images → carousel.
 * Images only. No duplicates. Respects reservation set.
 */


export const AUTOPILOT_CAROUSEL_MAX = CAROUSEL_MAX_ASSETS; // Instagram Graph hard max = 10

export interface AutopilotFeedBundle {
  assets: AutopilotEligibleAsset[];
  primary: AutopilotEligibleAsset;
  category: string;
  reasons: string[];
  /** Always 'feed' for image autopilot (never reel). */
  contentFormat: 'feed';
  isCarousel: boolean;
}

/** Target slide count for a feed slot (1–10). Midday prefers multi-image. */
export function targetCarouselSize(params: {
  hour: number;
  availableEligible: number;
}): number {
  const daypart = daypartFromHour(params.hour);
  let target = 1;
  if (daypart === 'midday') target = 5;
  else if (daypart === 'afternoon') target = 3;
  else if (daypart === 'evening') target = 2;
  else target = 1;

  target = Math.min(AUTOPILOT_CAROUSEL_MAX, Math.max(1, target));
  // Never request more than remaining eligible images
  return Math.min(target, Math.max(1, params.availableEligible));
}

export function selectAutopilotFeedBundle(params: {
  assets: readonly AutopilotEligibleAsset[];
  weekday: WeekdayIndex;
  hour: number;
  nowIso: string;
  reservedAssetIds: ReadonlySet<string>;
  history: readonly AutopilotHistoryItem[];
  minScore?: number;
}): AutopilotFeedBundle | null {
  const eligiblePool = params.assets.filter(
    (a) => isEligibleAutopilotFeedAsset(a) && !params.reservedAssetIds.has(a.id)
  );
  const best = selectBestAutopilotAsset({
    assets: params.assets,
    slotKind: 'feed',
    weekday: params.weekday,
    hour: params.hour,
    nowIso: params.nowIso,
    reservedAssetIds: params.reservedAssetIds,
    history: params.history,
    minScore: params.minScore,
  });
  if (!best) return null;

  const target = targetCarouselSize({
    hour: params.hour,
    availableEligible: eligiblePool.length,
  });

  const picked: AutopilotEligibleAsset[] = [best.asset];
  const reserved = new Set(params.reservedAssetIds);
  reserved.add(best.asset.id);

  if (target >= 2) {
    const scored = eligiblePool
      .filter((a) => a.id !== best.asset.id)
      .map((asset) =>
        scoreAutopilotCandidate({
          asset,
          slotKind: 'feed',
          weekday: params.weekday,
          hour: params.hour,
          nowIso: params.nowIso,
          reservedAssetIds: reserved,
          history: params.history,
        })
      )
      .filter((s): s is NonNullable<typeof s> => Boolean(s))
      // Prefer same category / theme cohesion for carousel slides
      .map((s) => {
        let bonus = 0;
        if (s.category === best.category) bonus += 12;
        if (
          best.asset.theme &&
          s.asset.theme &&
          String(s.asset.theme).toLowerCase() === String(best.asset.theme).toLowerCase()
        ) {
          bonus += 8;
        }
        return { ...s, score: s.score + bonus };
      })
      .sort((a, b) => b.score - a.score);

    for (const s of scored) {
      if (picked.length >= target) break;
      if (picked.length >= AUTOPILOT_CAROUSEL_MAX) break;
      if (reserved.has(s.asset.id)) continue;
      if (s.score < (params.minScore ?? 35) - 5) continue;
      picked.push(s.asset);
      reserved.add(s.asset.id);
    }
  }

  // Cap hard at 10; never pack 11+
  const assets = picked.slice(0, AUTOPILOT_CAROUSEL_MAX);
  const isCarousel = assets.length >= 2;
  const reasons = [
    ...best.reasons.slice(0, 2),
    isCarousel
      ? `Image-Carousel mit ${assets.length} Slides (max ${AUTOPILOT_CAROUSEL_MAX}).`
      : 'Single-Image Feed.',
  ];

  return {
    assets,
    primary: assets[0],
    category: best.category,
    reasons,
    contentFormat: 'feed',
    isCarousel,
  };
}

// ---- inline: _shared/content-autopilot/optimize.ts ----
/**
 * Autopilot Content Optimization V1 — pure helpers (no new AI provider).
 * Feed/Carousel only. Stories skip. No invented trends. Max one opt path per slot.
 */


export type AutopilotOptimizeMode = 'skip_story' | 'reuse' | 'refresh_copy' | 'hashtags_only';

export interface AutopilotDraftSnapshot {
  hook: string | null;
  caption: string | null;
  cta: string | null;
  keywords: string[] | null;
  hashtags: string[] | null;
  format: string;
  analysis_json?: Record<string, unknown> | null;
}

export interface AutopilotTimingContext {
  weekday: WeekdayIndex;
  hour: number;
  daypart: Daypart;
  plannedForIso: string;
}

export interface AutopilotPerformanceMetrics {
  reach?: number;
  likes?: number;
  comments?: number;
  saved?: number;
  shares?: number;
}

export interface AutopilotPerformanceContext {
  sampleSize: number;
  averages: AutopilotPerformanceMetrics;
  /** Soft hint only — never invented Instagram insights. */
  hint: string | null;
}

const FILLER_TAG_RE = /^(tag\d+|ascendcontent\d+|ascendos|content|fokus)$/i;
const MIN_PERFORMANCE_SAMPLES = 3;

export function shouldOptimizeAutopilotSlot(params: {
  slotKind: string;
  contentFormat: string;
}): boolean {
  if (params.slotKind === 'story' || params.contentFormat === 'story') return false;
  if (params.contentFormat === 'reel') return false;
  return params.slotKind === 'feed' || params.contentFormat === 'feed';
}

export function buildTimingContext(plannedForIso: string): AutopilotTimingContext {
  const d = new Date(plannedForIso);
  const weekday = d.getUTCDay() as WeekdayIndex;
  // planned_for is stored as timestamptz approximating Berlin wall clock; hour from ISO is fine for daypart.
  const hour = d.getUTCHours();
  return {
    weekday,
    hour,
    daypart: daypartFromHour(hour),
    plannedForIso,
  };
}

/** Aggregate only when enough real samples exist — never invent metrics. */
export function aggregatePerformanceContext(
  rows: ReadonlyArray<{ performance_json?: unknown | null }>
): AutopilotPerformanceContext | null {
  const samples: AutopilotPerformanceMetrics[] = [];
  for (const row of rows) {
    const pj = row.performance_json as { metrics?: Record<string, unknown> } | null;
    const m = pj?.metrics;
    if (!m || typeof m !== 'object') continue;
    const entry: AutopilotPerformanceMetrics = {};
    let any = false;
    for (const key of ['reach', 'likes', 'comments', 'saved', 'shares'] as const) {
      const v = m[key];
      if (typeof v === 'number' && Number.isFinite(v)) {
        entry[key] = v;
        any = true;
      }
    }
    if (any) samples.push(entry);
  }
  if (samples.length < MIN_PERFORMANCE_SAMPLES) return null;

  const sum: Required<AutopilotPerformanceMetrics> = {
    reach: 0,
    likes: 0,
    comments: 0,
    saved: 0,
    shares: 0,
  };
  const counts = { reach: 0, likes: 0, comments: 0, saved: 0, shares: 0 };
  for (const s of samples) {
    for (const key of Object.keys(sum) as Array<keyof typeof sum>) {
      if (typeof s[key] === 'number') {
        sum[key] += s[key]!;
        counts[key] += 1;
      }
    }
  }
  const averages: AutopilotPerformanceMetrics = {};
  for (const key of Object.keys(sum) as Array<keyof typeof sum>) {
    if (counts[key] > 0) averages[key] = Math.round(sum[key] / counts[key]);
  }

  let hint: string | null = null;
  if ((averages.saved ?? 0) >= (averages.likes ?? 0) && (averages.saved ?? 0) > 0) {
    hint = 'Saves are relatively strong — prefer saveable tips / value captions.';
  } else if ((averages.comments ?? 0) > (averages.likes ?? 0) * 0.15) {
    hint = 'Comments are relatively strong — prefer a clear question CTA.';
  } else if ((averages.reach ?? 0) > 0) {
    hint = 'Use varied hooks; avoid repeating recent caption patterns.';
  }

  return { sampleSize: samples.length, averages, hint };
}

/** Keywords from analysis/caption/theme — never filename. */
export function extractAutopilotKeywords(params: {
  theme?: string | null;
  caption?: string | null;
  analysisKeywords?: string[] | null;
  analysisJson?: Record<string, unknown> | null;
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const k = raw.trim().replace(/^#/, '');
    if (k.length < 2) return;
    const key = k.toLowerCase();
    if (seen.has(key)) return;
    // Reject filename-like tokens
    if (/\.(jpe?g|png|webp|heic|mp4|mov)$/i.test(k)) return;
    if (/^[a-f0-9]{8,}$/i.test(k)) return;
    seen.add(key);
    out.push(k);
  };

  for (const k of params.analysisKeywords ?? []) push(String(k));
  const aj = params.analysisJson ?? {};
  if (Array.isArray(aj.keywords)) {
    for (const k of aj.keywords) push(String(k));
  }
  if (params.theme) {
    for (const part of params.theme.split(/[\s,/|·-]+/)) {
      if (part.length >= 3) push(part);
    }
  }
  if (params.caption) {
    const words = params.caption
      .replace(/[#@]/g, ' ')
      .split(/\s+/)
      .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
      .filter((w) => w.length >= 4);
    for (const w of words.slice(0, 8)) push(w);
  }
  return out.slice(0, 12);
}

export function normalizeHashtagList(tags: readonly string[] | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags ?? []) {
    const tag = String(raw).trim().replace(/^#/, '');
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    if (FILLER_TAG_RE.test(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

export function assessAutopilotOptimizeMode(draft: AutopilotDraftSnapshot): AutopilotOptimizeMode {
  if (draft.format === 'story') return 'skip_story';
  const caption = (draft.caption ?? '').trim();
  const hook = (draft.hook ?? '').trim();
  const cta = (draft.cta ?? '').trim();
  const tags = normalizeHashtagList(draft.hashtags);
  const hasGoodCaption = caption.length >= 40 && hook.length >= 8;
  const hasGoodTags = tags.length === REQUIRED_HASHTAG_COUNT;
  const hasCta = cta.length >= 4;

  if (hasGoodCaption && hasGoodTags && hasCta) return 'reuse';
  if (hasGoodCaption && hasCta && !hasGoodTags) return 'hashtags_only';
  return 'refresh_copy';
}

/**
 * Select exactly 5 hashtags. Relevance first; among equals prefer not-recently-used.
 * No trend claims. No tagN fillers — pad only from curated evergreen catalog.
 */
export function selectExactFiveHashtags(params: {
  theme: string | null;
  keywords: string[];
  llmHashtags: string[];
  caption?: string | null;
  contentCategory?: string | null;
  recentHashtags?: readonly string[];
}): { hashtags: string[]; liveResearchActive: false; notes: string[] } {
  const research = runHashtagResearch({
    theme: params.theme ?? undefined,
    keywords: params.keywords,
    llmHashtags: params.llmHashtags,
    contentCategory: params.contentCategory ?? undefined,
    visualSummary: params.caption ?? undefined,
  });

  const recent = new Set(
    (params.recentHashtags ?? []).map((t) => t.replace(/^#/, '').toLowerCase())
  );

  const ranked = [...research.recommended].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aRecent = recent.has(a.tag.toLowerCase()) ? 1 : 0;
    const bRecent = recent.has(b.tag.toLowerCase()) ? 1 : 0;
    return aRecent - bRecent;
  });

  let tags = normalizeHashtagList(ranked.map((c) => c.tag));

  if (tags.length < REQUIRED_HASHTAG_COUNT) {
    const blob = [params.theme, params.contentCategory, ...(params.keywords ?? [])]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const topics = matchCuratedTopics(blob.length >= 3 ? blob : 'business team lifestyle');
    const catalogPads: string[] = [];
    for (const topic of topics) {
      for (const h of topic.hashtags) catalogPads.push(h);
    }
    // Broad evergreen fallbacks (never spam/generic fyp/love)
    catalogPads.push(
      'businessmindset',
      'teamarbeit',
      'alltagsmomente',
      'netzwerk',
      'mindfulmoments',
      'leadership',
      'community'
    );
    tags = normalizeHashtagList([...tags, ...catalogPads]);
  }

  const exact = enforceExactHashtagCount(tags, [], REQUIRED_HASHTAG_COUNT).filter(
    (t) => !FILLER_TAG_RE.test(t)
  );

  // If enforce padded with ascendcontent*, replace from catalog
  if (exact.length < REQUIRED_HASHTAG_COUNT || exact.some((t) => FILLER_TAG_RE.test(t))) {
    const catalogPads = [
      'businessmindset',
      'teamarbeit',
      'alltagsmomente',
      'netzwerk',
      'mindfulmoments',
      'leadership',
      'community',
      'duftliebe',
      'fragrance',
      'scentoftheday',
    ];
    const repaired = enforceExactHashtagCount(
      normalizeHashtagList([...exact, ...catalogPads]),
      [],
      REQUIRED_HASHTAG_COUNT
    );
    return {
      hashtags: repaired.slice(0, REQUIRED_HASHTAG_COUNT),
      liveResearchActive: false,
      notes: [...research.notes, 'Evergreen catalog used to reach exactly 5 hashtags.'],
    };
  }

  return {
    hashtags: exact.slice(0, REQUIRED_HASHTAG_COUNT),
    liveResearchActive: false,
    notes: research.notes,
  };
}

export function runAutopilotQualityCheck(params: {
  hook: string;
  caption: string;
  cta: string;
  keywords: string[];
  hashtags: string[];
}): { ok: boolean; status: 'clean' | 'attention'; notes: string[] } {
  const notes: string[] = [];
  if (!params.caption.trim()) notes.push('Caption missing.');
  if (params.caption.trim().length < 12) notes.push('Caption too short.');
  if (!params.hook.trim()) notes.push('Hook missing.');
  if (!params.cta.trim()) notes.push('CTA missing.');
  const tags = normalizeHashtagList(params.hashtags);
  if (tags.length !== REQUIRED_HASHTAG_COUNT) {
    notes.push(`Expected exactly ${REQUIRED_HASHTAG_COUNT} hashtags, got ${tags.length}.`);
  }
  if (params.hashtags.some((t) => FILLER_TAG_RE.test(String(t).replace(/^#/, '')))) {
    notes.push('Filler hashtags are not allowed.');
  }

  const clean = runHeuristicCleanCheck({
    hook: params.hook,
    caption: params.caption,
    cta: params.cta,
    keywords: params.keywords,
    hashtags: tags,
    llmFlags: [],
  });
  notes.push(...clean.notes);

  const hardFail =
    !params.caption.trim() ||
    tags.length !== REQUIRED_HASHTAG_COUNT ||
    params.hashtags.some((t) => FILLER_TAG_RE.test(String(t).replace(/^#/, '')));

  return {
    ok: !hardFail && clean.status === 'clean',
    status: hardFail ? 'attention' : clean.status,
    notes,
  };
}

/** Light caption touch-up when reuse path — inject timing hint without full rewrite. */
export function lightlyTuneCaption(params: {
  caption: string;
  hook: string;
  cta: string;
  timing: AutopilotTimingContext;
  performance: AutopilotPerformanceContext | null;
  recentCaptions?: readonly string[];
}): { caption: string; hook: string; cta: string; changed: boolean } {
  let caption = params.caption.trim();
  let hook = params.hook.trim();
  let cta = params.cta.trim();
  let changed = false;

  // Avoid near-duplicate of the most recent caption
  const recent = (params.recentCaptions ?? []).map((c) => c.trim().toLowerCase()).filter(Boolean);
  if (recent[0] && caption.toLowerCase() === recent[0] && caption.length > 20) {
    // Soft variation: ensure hook leads if not already
    if (hook && !caption.toLowerCase().startsWith(hook.toLowerCase().slice(0, 12))) {
      caption = `${hook}\n\n${caption}`;
      changed = true;
    }
  }

  if (!cta) {
    cta =
      params.performance?.hint?.includes('question')
        ? 'Was ist deine Erfahrung? Schreib es in die Kommentare.'
        : 'Speichere diesen Beitrag für später.';
    changed = true;
  }

  if (!hook && caption) {
    hook = caption.split(/[.!?\n]/)[0]?.trim().slice(0, 120) || caption.slice(0, 80);
    changed = true;
  }

  // Timing is contextual metadata for AI refresh; light path keeps caption body.
  void params.timing;

  return { caption, hook, cta, changed };
}

// ---- inline: _shared/content-autopilot/optimizeBeforePublish.ts ----
/**
 * Single pre-publish optimization pass for Autopilot feed/carousel.
 * Stories skipped. At most one vision generation per slot.
 */


export type OptimizeBeforePublishResult = {
  optimized: boolean;
  mode: string;
  qualityOk: boolean;
  notes: string[];
  visionUsed: boolean;
};

async function loadRecentHashtags(
  admin: SupabaseClient,
  membershipId: string
): Promise<string[]> {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: slots } = await admin
    .from('content_autopilot_slots')
    .select('draft_id, published_at')
    .eq('membership_id', membershipId)
    .eq('status', 'published')
    .gte('published_at', since)
    .order('published_at', { ascending: false })
    .limit(20);
  const draftIds = (slots ?? []).map((s) => s.draft_id).filter(Boolean) as string[];
  if (draftIds.length === 0) return [];
  const { data: drafts } = await admin
    .from('content_drafts')
    .select('hashtags')
    .in('id', draftIds);
  const out: string[] = [];
  for (const d of drafts ?? []) {
    for (const t of (d.hashtags as string[] | null) ?? []) out.push(String(t));
  }
  return out;
}

async function loadRecentCaptions(
  admin: SupabaseClient,
  membershipId: string
): Promise<string[]> {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: slots } = await admin
    .from('content_autopilot_slots')
    .select('draft_id')
    .eq('membership_id', membershipId)
    .eq('status', 'published')
    .gte('published_at', since)
    .order('published_at', { ascending: false })
    .limit(8);
  const draftIds = (slots ?? []).map((s) => s.draft_id).filter(Boolean) as string[];
  if (draftIds.length === 0) return [];
  const { data: drafts } = await admin.from('content_drafts').select('caption').in('id', draftIds);
  return (drafts ?? []).map((d) => String(d.caption ?? '')).filter(Boolean);
}

async function loadPerformanceRows(
  admin: SupabaseClient,
  membershipId: string
): Promise<Array<{ performance_json?: unknown }>> {
  const since = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await admin
    .from('content_autopilot_slots')
    .select('performance_json')
    .eq('membership_id', membershipId)
    .eq('status', 'published')
    .gte('published_at', since)
    .not('performance_json', 'is', null)
    .limit(30);
  return (data ?? []) as Array<{ performance_json?: unknown }>;
}

/**
 * Optimize draft in place. Max one vision call. Stories → no-op.
 */
export async function optimizeAutopilotDraftBeforePublish(params: {
  admin: SupabaseClient;
  membershipId: string;
  orgId: string;
  draftId: string;
  slotKind: string;
  contentFormat: string;
  plannedFor: string;
  assetIds: string[];
}): Promise<OptimizeBeforePublishResult> {
  if (
    !shouldOptimizeAutopilotSlot({
      slotKind: params.slotKind,
      contentFormat: params.contentFormat,
    })
  ) {
    return {
      optimized: false,
      mode: 'skip_story',
      qualityOk: true,
      notes: ['Stories skip content optimization.'],
      visionUsed: false,
    };
  }

  const { data: draft } = await params.admin
    .from('content_drafts')
    .select(
      'id, org_id, owner_membership_id, asset_id, carousel_asset_ids, format, hook, caption, cta, keywords, hashtags, analysis_json, status'
    )
    .eq('id', params.draftId)
    .maybeSingle();
  if (!draft) {
    return {
      optimized: false,
      mode: 'missing_draft',
      qualityOk: false,
      notes: ['Draft not found.'],
      visionUsed: false,
    };
  }

  const snapshot: AutopilotDraftSnapshot = {
    hook: draft.hook,
    caption: draft.caption,
    cta: draft.cta,
    keywords: draft.keywords,
    hashtags: draft.hashtags,
    format: draft.format,
    analysis_json: (draft.analysis_json as Record<string, unknown> | null) ?? null,
  };

  const mode = assessAutopilotOptimizeMode(snapshot);
  const timing = buildTimingContext(params.plannedFor);
  const performance = aggregatePerformanceContext(
    await loadPerformanceRows(params.admin, params.membershipId)
  );
  const recentHashtags = await loadRecentHashtags(params.admin, params.membershipId);
  const recentCaptions = await loadRecentCaptions(params.admin, params.membershipId);

  let hook = String(draft.hook ?? '');
  let caption = String(draft.caption ?? '');
  let cta = String(draft.cta ?? '');
  let keywords = extractAutopilotKeywords({
    theme: null,
    caption,
    analysisKeywords: Array.isArray(draft.keywords) ? draft.keywords.map(String) : [],
    analysisJson: (draft.analysis_json as Record<string, unknown>) ?? null,
  });
  let hashtags = Array.isArray(draft.hashtags) ? draft.hashtags.map(String) : [];
  let visionUsed = false;
  const notes: string[] = [`mode=${mode}`];
  if (performance?.hint) notes.push(`performance_hint=${performance.hint}`);
  notes.push(`timing=${timing.daypart}/weekday${timing.weekday}`);

  if (mode === 'refresh_copy') {
    try {
      const ids = params.assetIds.filter(Boolean).slice(0, 10);
      const { data: assets } = await params.admin
        .from('content_assets')
        .select(
          'id, org_id, owner_membership_id, scope, media_kind, mime_type, storage_path, file_name, title, theme, keywords, suggested_formats, aspect_ratio, analysis_status, analysis_json, detected_summary, audience_hint'
        )
        .in('id', ids);
      const ordered = ids
        .map((id) => (assets ?? []).find((a) => a.id === id))
        .filter(Boolean) as AssetRow[];
      if (ordered.length > 0) {
        const membership: MembershipRow = {
          id: params.membershipId,
          org_id: params.orgId,
          role: 'member',
          status: 'active',
        };
        const generated = await generateDraftFromAssets({
          db: params.admin,
          assets: ordered,
          membership,
          format: 'feed',
          locale: 'de',
          forcePersistAsset: false,
        });
        visionUsed = true;
        const g = generated.draft;
        hook = String(g.hook ?? hook);
        caption = String(g.caption ?? caption);
        cta = String(g.cta ?? cta);
        keywords = Array.isArray(g.keywords) ? g.keywords.map(String) : keywords;
        hashtags = Array.isArray(g.hashtags) ? g.hashtags.map(String) : hashtags;
        notes.push('vision_refresh_applied');
        // Soft-cancel the extra draft insert — keep publishing the original draft id
        if (g.id && g.id !== params.draftId) {
          await params.admin
            .from('content_drafts')
            .update({ status: 'archived', posting_hint: 'autopilot_opt_temp' })
            .eq('id', g.id);
        }
      }
    } catch (e) {
      notes.push(`vision_refresh_failed:${e instanceof Error ? e.message : 'error'}`);
    }
  }

  if (mode === 'reuse' || mode === 'hashtags_only' || mode === 'refresh_copy') {
    const tuned = lightlyTuneCaption({
      caption,
      hook,
      cta,
      timing,
      performance,
      recentCaptions,
    });
    caption = tuned.caption;
    hook = tuned.hook;
    cta = tuned.cta;
    if (tuned.changed) notes.push('light_caption_tune');

    const analysisHashtags = Array.isArray(
      (draft.analysis_json as Record<string, unknown> | null)?.hashtags
    )
      ? ((draft.analysis_json as Record<string, unknown>).hashtags as unknown[]).map(String)
      : [];
    const selected = selectExactFiveHashtags({
      theme: null,
      keywords,
      llmHashtags: [...hashtags, ...analysisHashtags],
      caption,
      contentCategory: null,
      recentHashtags,
    });
    hashtags = selected.hashtags;
    notes.push(...selected.notes.slice(0, 2));
  }

  let quality = runAutopilotQualityCheck({ hook, caption, cta, keywords, hashtags });
  // One correction attempt if quality fails (hashtag/catalog repair only — no second vision)
  if (!quality.ok) {
    const repaired = selectExactFiveHashtags({
      theme: null,
      keywords,
      llmHashtags: hashtags,
      caption,
      recentHashtags,
    });
    hashtags = repaired.hashtags;
    if (!cta.trim()) cta = 'Speichere diesen Beitrag für später.';
    if (!hook.trim() && caption) hook = caption.slice(0, 80);
    quality = runAutopilotQualityCheck({ hook, caption, cta, keywords, hashtags });
    notes.push('quality_repair_attempt');
  }

  await params.admin
    .from('content_drafts')
    .update({
      hook,
      caption,
      cta,
      keywords,
      hashtags,
      clean_check_status: quality.status,
      clean_check_notes: quality.notes.slice(0, 6).join(' | ') || 'ok',
      status: 'ready',
      analysis_json: {
        ...((draft.analysis_json as Record<string, unknown>) ?? {}),
        autopilot_optimization: {
          mode,
          timing,
          performance,
          visionUsed,
          qualityOk: quality.ok,
          notes: notes.slice(0, 8),
          optimized_at: new Date().toISOString(),
        },
      },
    })
    .eq('id', params.draftId);

  return {
    optimized: true,
    mode,
    qualityOk: quality.ok,
    notes,
    visionUsed,
  };
}

// ---- inline: _shared/content-autopilot/reconcile.ts ----
/**
 * Dynamic plan reconciliation — replace invalid ready/planned slots only.
 * Never rewrite published history. Never full plan reset.
 */


export type ReconcileSlotStatus =
  | 'planned'
  | 'ready'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export interface ReconcileSlotInput {
  id: string;
  status: ReconcileSlotStatus;
  slotKind: AutopilotSlotKind | string;
  assetId: string | null;
  carouselAssetIds: string[];
  plannedFor: string;
  category: string | null;
}

export type ReconcileDecision =
  | { action: 'keep' }
  | { action: 'ignore_published' }
  | { action: 'ignore_terminal' }
  | { action: 'replace'; reason: string }
  | { action: 'repair_carousel'; reason: string; keepPrimary: boolean };

/** Asset still usable for this slot kind? */
export function assetValidForSlot(
  asset: AutopilotEligibleAsset | null | undefined,
  slotKind: AutopilotSlotKind | string
): boolean {
  if (!asset) return false;
  if (!isEligibleAutopilotAsset(asset)) return false;
  if (slotKind === 'feed' || slotKind === 'story') {
    return isEligibleForSlotKind(asset, slotKind);
  }
  return false;
}

/**
 * Decide whether a slot needs reconciliation.
 * Published / publishing / failed / skipped / cancelled → leave alone (failed keeps retry path).
 */
export function decideSlotReconcile(params: {
  slot: ReconcileSlotInput;
  /** Map of currently existing assets by id (missing = deleted). */
  assetsById: ReadonlyMap<string, AutopilotEligibleAsset>;
}): ReconcileDecision {
  const { slot, assetsById } = params;
  if (slot.status === 'published') return { action: 'ignore_published' };
  if (slot.status === 'publishing') return { action: 'ignore_terminal' };
  if (slot.status === 'failed' || slot.status === 'skipped' || slot.status === 'cancelled') {
    return { action: 'ignore_terminal' };
  }
  if (slot.status !== 'planned' && slot.status !== 'ready') {
    return { action: 'ignore_terminal' };
  }

  const kind = (slot.slotKind === 'story' ? 'story' : 'feed') as AutopilotSlotKind;
  const primary = slot.assetId ? assetsById.get(slot.assetId) : null;

  if (!slot.assetId || !assetValidForSlot(primary, kind)) {
    return { action: 'replace', reason: 'asset_missing_or_ineligible' };
  }

  // Feed carousel: any missing/non-image child → repair (may shrink or replace)
  if (kind === 'feed' && slot.carouselAssetIds.length >= 2) {
    for (const id of slot.carouselAssetIds) {
      const a = assetsById.get(id);
      if (!assetValidForSlot(a, 'feed')) {
        return { action: 'repair_carousel', reason: 'carousel_child_invalid', keepPrimary: true };
      }
    }
  }

  // Video must never sit on a feed slot (defense in depth)
  if (kind === 'feed' && primary?.media_kind === 'video') {
    return { action: 'replace', reason: 'video_not_allowed_on_feed' };
  }

  return { action: 'keep' };
}

export function pickReplacementAsset(params: {
  slotKind: AutopilotSlotKind;
  plannedFor: string;
  assets: readonly AutopilotEligibleAsset[];
  reservedAssetIds: ReadonlySet<string>;
  history: readonly AutopilotHistoryItem[];
}): AutopilotEligibleAsset | null {
  const d = new Date(params.plannedFor);
  const weekday = d.getUTCDay() as WeekdayIndex;
  const hour = d.getUTCHours();
  void daypartFromHour(hour);
  const best = selectBestAutopilotAsset({
    assets: params.assets,
    slotKind: params.slotKind,
    weekday,
    hour,
    nowIso: params.plannedFor,
    reservedAssetIds: params.reservedAssetIds,
    history: params.history,
  });
  return best?.asset ?? null;
}

/** Filter carousel ids to still-valid images; drop dups; cap 10. */
export function repairCarouselAssetIds(params: {
  primaryId: string;
  carouselAssetIds: string[];
  assetsById: ReadonlyMap<string, AutopilotEligibleAsset>;
  max: number;
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of [params.primaryId, ...params.carouselAssetIds]) {
    if (!id || seen.has(id)) continue;
    const a = params.assetsById.get(id);
    if (!assetValidForSlot(a, 'feed')) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= params.max) break;
  }
  return out;
}

/** Pure multi-slot plan: which slot ids need replace vs keep. */
export function planReconcileActions(params: {
  slots: readonly ReconcileSlotInput[];
  assetsById: ReadonlyMap<string, AutopilotEligibleAsset>;
}): Array<{ slotId: string; decision: ReconcileDecision }> {
  return params.slots.map((slot) => ({
    slotId: slot.id,
    decision: decideSlotReconcile({ slot, assetsById: params.assetsById }),
  }));
}

// ---- inline: _shared/content-autopilot/planner.ts ----
export interface PlannedSlotDraft {
  plannedFor: string;
  slotKind: AutopilotSlotKind;
  contentFormat: AutopilotContentFormat;
  assetId: string;
  /** Additional image IDs for carousel (excludes primary). Empty for single/story. */
  carouselAssetIds: string[];
  theme: string | null;
  category: string;
  selectionReason: string;
  status: 'planned' | 'skipped';
  skipReason?: string;
}

/** Autopilot V2: feed is always image feed; story is always story (image or video). Never reel. */
export function resolveAutopilotFormat(
  slotKind: AutopilotSlotKind,
  _asset?: AutopilotEligibleAsset
): AutopilotContentFormat {
  return slotKind === 'story' ? 'story' : 'feed';
}

/**
 * Build a week of slots (max 3 feed + 3 stories / day).
 * Feed: image single or image carousel (2–10). Stories: image or video story.
 * Never plans reel / video feed / video carousel.
 */
export function buildAutopilotWeekPlan(params: {
  periodStart: string;
  periodEnd: string;
  assets: readonly AutopilotEligibleAsset[];
  history: readonly AutopilotHistoryItem[];
  nowIso?: string;
  maxFeedPerDay?: number;
  maxStoriesPerDay?: number;
}): PlannedSlotDraft[] {
  const nowIso = params.nowIso ?? new Date().toISOString();
  const maxFeed = Math.min(
    AUTOPILOT_MAX_FEED_PER_DAY,
    params.maxFeedPerDay ?? AUTOPILOT_MAX_FEED_PER_DAY
  );
  const maxStories = Math.min(
    AUTOPILOT_MAX_STORIES_PER_DAY,
    params.maxStoriesPerDay ?? AUTOPILOT_MAX_STORIES_PER_DAY
  );
  const reserved = new Set<string>();
  const history = [...params.history];
  const slots: PlannedSlotDraft[] = [];

  for (const dateYmd of enumerateDatesInclusive(params.periodStart, params.periodEnd)) {
    const offset = berlinUtcOffsetHours(dateYmd);
    const weekday = weekdayIndexFromYmd(dateYmd);

    const feedTimes = DEFAULT_FEED_TIMES.slice(0, maxFeed);
    const storyTimes = DEFAULT_STORY_TIMES.slice(0, maxStories);

    const daySlots: Array<{ kind: AutopilotSlotKind; hm: string }> = [
      ...storyTimes.map((hm) => ({ kind: 'story' as const, hm })),
      ...feedTimes.map((hm) => ({ kind: 'feed' as const, hm })),
    ];

    for (const { kind, hm } of daySlots) {
      const { hour } = parseHm(hm);
      const plannedFor = wallTimeToIso({ dateYmd, hm, utcOffsetHours: offset });
      // Skip past slots when activating mid-week
      if (new Date(plannedFor).getTime() < new Date(nowIso).getTime() - 60_000) {
        continue;
      }

      if (kind === 'feed') {
        const bundle = selectAutopilotFeedBundle({
          assets: params.assets,
          weekday,
          hour,
          nowIso: plannedFor,
          reservedAssetIds: reserved,
          history,
        });

        if (!bundle) {
          slots.push({
            plannedFor,
            slotKind: kind,
            contentFormat: 'feed',
            assetId: '',
            carouselAssetIds: [],
            theme: null,
            category: 'none',
            selectionReason: 'Kein ausreichend neuer und geeigneter Content verfügbar.',
            status: 'skipped',
            skipReason: 'no_suitable_asset',
          });
          continue;
        }

        for (const a of bundle.assets) {
          reserved.add(a.id);
          history.push({
            assetId: a.id,
            category: bundle.category,
            theme: a.theme,
            publishedAt: plannedFor,
            slotKind: kind,
          });
        }

        slots.push({
          plannedFor,
          slotKind: kind,
          contentFormat: 'feed',
          assetId: bundle.primary.id,
          carouselAssetIds: bundle.assets.slice(1).map((a) => a.id),
          theme: bundle.primary.theme,
          category: bundle.category,
          selectionReason: bundle.reasons.slice(0, 3).join(' ') || 'Beste Passung für diesen Slot.',
          status: 'planned',
        });
        continue;
      }

      // Story — image or video story (never reel)
      const best = selectBestAutopilotAsset({
        assets: params.assets,
        slotKind: kind,
        weekday,
        hour,
        nowIso: plannedFor,
        reservedAssetIds: reserved,
        history,
      });

      if (!best) {
        slots.push({
          plannedFor,
          slotKind: kind,
          contentFormat: 'story',
          assetId: '',
          carouselAssetIds: [],
          theme: null,
          category: 'none',
          selectionReason: 'Kein ausreichend neuer und geeigneter Content verfügbar.',
          status: 'skipped',
          skipReason: 'no_suitable_asset',
        });
        continue;
      }

      reserved.add(best.asset.id);
      history.push({
        assetId: best.asset.id,
        category: best.category,
        theme: best.asset.theme,
        publishedAt: plannedFor,
        slotKind: kind,
      });

      slots.push({
        plannedFor,
        slotKind: kind,
        contentFormat: 'story',
        assetId: best.asset.id,
        carouselAssetIds: [],
        theme: best.asset.theme,
        category: best.category,
        selectionReason: best.reasons.slice(0, 3).join(' ') || 'Beste Passung für diesen Slot.',
        status: 'planned',
      });
    }
  }

  return slots;
}

// ---- inline: _shared/content-autopilot/persistPlan.ts ----
/**
 * Persist an Autopilot week plan (shared by user activate/replan + cron auto-continue).
 * Instagram-only. No Facebook.
 *
 * Drafts are lightweight placeholders; feed/carousel copy is optimized once
 * immediately before publish (see optimize.ts + content-autopilot-run).
 */


/** Minimal DB surface — avoids importing jsr types into the shared group. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AutopilotDb = any;

export interface AutopilotMembershipRef {
  id: string;
  org_id: string;
}

export async function createAutopilotDraftForSlot(
  db: AutopilotDb,
  membership: AutopilotMembershipRef,
  assetId: string,
  format: 'story' | 'feed' | 'reel',
  category: string,
  carouselAssetIds: string[] = []
): Promise<string | null> {
  const carouselIds = [...new Set([assetId, ...carouselAssetIds.filter(Boolean)])];
  const isCarousel = format === 'feed' && carouselIds.length >= 2;

  // Reuse existing ready draft for same primary + format when not a carousel.
  if (!isCarousel) {
    const { data: existing } = await db
      .from('content_drafts')
      .select('id, status, format')
      .eq('asset_id', assetId)
      .eq('owner_membership_id', membership.id)
      .eq('format', format)
      .in('status', ['draft', 'ready'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing?.id) {
      if (existing.status !== 'ready') {
        await db.from('content_drafts').update({ status: 'ready' }).eq('id', existing.id);
      }
      return existing.id as string;
    }
  }

  const { data: asset } = await db
    .from('content_assets')
    .select(
      'id, title, theme, keywords, detected_summary, audience_hint, analysis_json, mime_type, media_kind'
    )
    .eq('id', assetId)
    .maybeSingle();
  if (!asset) return null;

  const analysis = (asset.analysis_json ?? {}) as Record<string, unknown>;
  const hook =
    (typeof analysis.hook === 'string' && analysis.hook) ||
    (asset.theme ? String(asset.theme).slice(0, 120) : null) ||
    (asset.title ? String(asset.title).slice(0, 120) : 'AscendOS Update');
  const caption =
    (typeof analysis.caption === 'string' && analysis.caption) ||
    (asset.detected_summary ? String(asset.detected_summary).slice(0, 1800) : null) ||
    `${hook}`;
  const cta =
    (typeof analysis.cta === 'string' && analysis.cta) ||
    (format === 'story' ? '' : 'Speichere diesen Beitrag für später.');

  const keywords = extractAutopilotKeywords({
    theme: asset.theme,
    caption: typeof caption === 'string' ? caption : null,
    analysisKeywords: Array.isArray(asset.keywords) ? asset.keywords.map(String) : [],
    analysisJson: analysis,
  });

  const llmHashtags = Array.isArray(analysis.hashtags)
    ? analysis.hashtags.map(String)
    : [];
  const { hashtags } = selectExactFiveHashtags({
    theme: asset.theme ? String(asset.theme) : null,
    keywords,
    llmHashtags,
    caption: typeof caption === 'string' ? caption : null,
    contentCategory: category,
  });

  const { data: draft, error } = await db
    .from('content_drafts')
    .insert({
      org_id: membership.org_id,
      asset_id: assetId,
      owner_membership_id: membership.id,
      format: format === 'reel' ? 'feed' : format,
      hook,
      caption: format === 'story' ? String(caption).slice(0, 400) : caption,
      cta,
      keywords,
      hashtags,
      clean_check_status: 'clean',
      clean_check_notes: 'Autopilot draft placeholder — feed/carousel optimized before publish.',
      target_audience: asset.audience_hint,
      posting_hint: `Autopilot · ${category}`,
      status: 'ready',
      carousel_asset_ids: isCarousel ? carouselIds : [],
      analysis_json: {
        source: 'autopilot_v1',
        category,
        reused_analysis: Boolean(analysis && Object.keys(analysis).length),
        is_carousel: isCarousel,
        optimization_pending: format !== 'story',
      },
    })
    .select('id')
    .single();
  if (error) {
    console.error('autopilot_draft_insert_failed', error.message);
    return null;
  }
  return draft.id as string;
}

export async function buildAndInsertAutopilotPlan(
  db: AutopilotDb,
  membership: AutopilotMembershipRef,
  periodStart: string,
  periodEnd: string,
  assets: readonly AutopilotEligibleAsset[],
  history: readonly AutopilotHistoryItem[]
): Promise<{ planId: string; slotCount: number; skipped: number }> {
  const planned = buildAutopilotWeekPlan({
    periodStart,
    periodEnd,
    assets,
    history,
    maxFeedPerDay: AUTOPILOT_MAX_FEED_PER_DAY,
    maxStoriesPerDay: AUTOPILOT_MAX_STORIES_PER_DAY,
  });

  const { data: activePlans } = await db
    .from('content_autopilot_plans')
    .select('id')
    .eq('membership_id', membership.id)
    .eq('status', 'active');
  for (const p of activePlans ?? []) {
    await db
      .from('content_autopilot_slots')
      .update({ status: 'cancelled' })
      .eq('plan_id', p.id)
      .in('status', ['planned', 'ready', 'failed']);
    await db.from('content_autopilot_plans').update({ status: 'cancelled' }).eq('id', p.id);
  }

  const { data: plan, error: planErr } = await db
    .from('content_autopilot_plans')
    .insert({
      org_id: membership.org_id,
      membership_id: membership.id,
      period_start: periodStart,
      period_end: periodEnd,
      status: 'active',
      summary: `Autopilot ${periodStart} → ${periodEnd}`,
    })
    .select('id')
    .single();
  if (planErr) throw planErr;

  let slotCount = 0;
  let skipped = 0;
  for (const s of planned) {
    if (s.status === 'skipped' || !s.assetId) {
      skipped += 1;
      await db.from('content_autopilot_slots').insert({
        org_id: membership.org_id,
        membership_id: membership.id,
        plan_id: plan.id,
        asset_id: null,
        carousel_asset_ids: [],
        planned_for: s.plannedFor,
        slot_kind: s.slotKind,
        content_format: s.contentFormat,
        theme: s.theme,
        category: s.category,
        selection_reason: s.selectionReason,
        status: 'skipped',
        error_message: s.skipReason ?? 'no_suitable_asset',
      });
      continue;
    }

    const allCarousel = [s.assetId, ...s.carouselAssetIds];
    const draftId = await createAutopilotDraftForSlot(
      db,
      membership,
      s.assetId,
      s.contentFormat === 'reel' ? 'feed' : s.contentFormat,
      s.category,
      s.carouselAssetIds
    );
    if (!draftId) {
      skipped += 1;
      await db.from('content_autopilot_slots').insert({
        org_id: membership.org_id,
        membership_id: membership.id,
        plan_id: plan.id,
        asset_id: s.assetId,
        carousel_asset_ids: s.carouselAssetIds,
        planned_for: s.plannedFor,
        slot_kind: s.slotKind,
        content_format: s.contentFormat,
        theme: s.theme,
        category: s.category,
        selection_reason: s.selectionReason,
        status: 'skipped',
        error_message: 'draft_create_failed',
      });
      continue;
    }

    const { error: slotErr } = await db.from('content_autopilot_slots').insert({
      org_id: membership.org_id,
      membership_id: membership.id,
      plan_id: plan.id,
      draft_id: draftId,
      asset_id: s.assetId,
      carousel_asset_ids: allCarousel.length >= 2 ? allCarousel : [],
      planned_for: s.plannedFor,
      slot_kind: s.slotKind,
      content_format: s.contentFormat,
      theme: s.theme,
      category: s.category,
      selection_reason: s.selectionReason,
      status: 'ready',
    });
    if (slotErr) {
      skipped += 1;
      continue;
    }
    slotCount += 1;
  }

  return { planId: plan.id as string, slotCount, skipped };
}

// ---- inline: _shared/content-autopilot/reconcilePlan.ts ----
/**
 * Server-side incremental plan reconciliation (used by content-autopilot-run).
 * Reuses existing selection / reservation rules. No frontend timers. No new cron.
 */


export type ReconcileRunSummary = {
  examined: number;
  kept: number;
  replaced: number;
  repairedCarousel: number;
  skippedNoReplacement: number;
  ignored: number;
};

function reservedFromSlots(
  slots: Array<{ id: string; asset_id: string | null; carousel_asset_ids: string[] | null; status: string }>
): Set<string> {
  const reserved = new Set<string>();
  for (const s of slots) {
    if (!['planned', 'ready', 'publishing'].includes(s.status)) continue;
    if (s.asset_id) reserved.add(s.asset_id);
    for (const id of s.carousel_asset_ids ?? []) if (id) reserved.add(id);
  }
  return reserved;
}

/**
 * Reconcile ready/planned slots for one membership's active plan.
 * Published slots untouched. Partial updates only.
 */
export async function reconcileActivePlanForMembership(params: {
  admin: SupabaseClient;
  orgId: string;
  membershipId: string;
  assets: readonly AutopilotEligibleAsset[];
  history: readonly AutopilotHistoryItem[];
}): Promise<ReconcileRunSummary> {
  const summary: ReconcileRunSummary = {
    examined: 0,
    kept: 0,
    replaced: 0,
    repairedCarousel: 0,
    skippedNoReplacement: 0,
    ignored: 0,
  };

  const { data: plan } = await params.admin
    .from('content_autopilot_plans')
    .select('id')
    .eq('membership_id', params.membershipId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!plan?.id) return summary;

  const { data: slotRows } = await params.admin
    .from('content_autopilot_slots')
    .select(
      'id, status, slot_kind, asset_id, carousel_asset_ids, planned_for, category, draft_id, content_format'
    )
    .eq('plan_id', plan.id)
    .order('planned_for', { ascending: true });

  const slots = slotRows ?? [];
  const assetsById = new Map(params.assets.map((a) => [a.id, a]));
  let reserved = reservedFromSlots(
    slots.map((s) => ({
      id: s.id,
      asset_id: s.asset_id,
      carousel_asset_ids: s.carousel_asset_ids,
      status: s.status,
    }))
  );

  for (const raw of slots) {
    summary.examined += 1;
    const slot: ReconcileSlotInput = {
      id: raw.id,
      status: raw.status,
      slotKind: raw.slot_kind,
      assetId: raw.asset_id,
      carouselAssetIds: (raw.carousel_asset_ids as string[] | null) ?? [],
      plannedFor: raw.planned_for,
      category: raw.category,
    };
    const decision = decideSlotReconcile({ slot, assetsById });

    if (decision.action === 'keep') {
      summary.kept += 1;
      continue;
    }
    if (
      decision.action === 'ignore_published' ||
      decision.action === 'ignore_terminal'
    ) {
      summary.ignored += 1;
      continue;
    }

    const kind = (slot.slotKind === 'story' ? 'story' : 'feed') as AutopilotSlotKind;

    if (decision.action === 'repair_carousel') {
      const repaired = repairCarouselAssetIds({
        primaryId: slot.assetId ?? '',
        carouselAssetIds: slot.carouselAssetIds,
        assetsById,
        max: AUTOPILOT_CAROUSEL_MAX,
      });
      if (repaired.length === 0) {
        // fall through to full replace
      } else if (repaired.length === 1) {
        await params.admin
          .from('content_autopilot_slots')
          .update({
            asset_id: repaired[0],
            carousel_asset_ids: [],
            content_format: 'feed',
            selection_reason: 'Carousel repaired → single image after asset delete.',
            error_message: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', slot.id)
          .in('status', ['planned', 'ready']);
        if (raw.draft_id) {
          await params.admin
            .from('content_drafts')
            .update({
              asset_id: repaired[0],
              carousel_asset_ids: [],
              status: 'ready',
            })
            .eq('id', raw.draft_id);
        }
        summary.repairedCarousel += 1;
        reserved = reservedFromSlots(
          (
            await params.admin
              .from('content_autopilot_slots')
              .select('id, asset_id, carousel_asset_ids, status')
              .eq('plan_id', plan.id)
          ).data ?? []
        );
        continue;
      } else {
        await params.admin
          .from('content_autopilot_slots')
          .update({
            asset_id: repaired[0],
            carousel_asset_ids: repaired,
            content_format: 'feed',
            selection_reason: 'Carousel repaired after invalid child asset.',
            error_message: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', slot.id)
          .in('status', ['planned', 'ready']);
        if (raw.draft_id) {
          await params.admin
            .from('content_drafts')
            .update({
              asset_id: repaired[0],
              carousel_asset_ids: repaired,
              status: 'ready',
            })
            .eq('id', raw.draft_id);
        }
        summary.repairedCarousel += 1;
        reserved = reservedFromSlots(
          (
            await params.admin
              .from('content_autopilot_slots')
              .select('id, asset_id, carousel_asset_ids, status')
              .eq('plan_id', plan.id)
          ).data ?? []
        );
        continue;
      }
    }

    // replace primary (and clear old reservation by swapping asset_id)
    if (slot.assetId) reserved.delete(slot.assetId);
    for (const id of slot.carouselAssetIds) reserved.delete(id);

    const replacement = pickReplacementAsset({
      slotKind: kind,
      plannedFor: slot.plannedFor,
      assets: params.assets,
      reservedAssetIds: reserved,
      history: params.history,
    });

    if (!replacement) {
      await params.admin
        .from('content_autopilot_slots')
        .update({
          status: 'skipped',
          asset_id: null,
          carousel_asset_ids: [],
          draft_id: null,
          error_message: 'reconcile_no_replacement',
          selection_reason: 'Asset missing — no eligible replacement available.',
          updated_at: new Date().toISOString(),
        })
        .eq('id', slot.id)
        .in('status', ['planned', 'ready']);
      summary.skippedNoReplacement += 1;
      continue;
    }

    const draftId = await createAutopilotDraftForSlot(
      params.admin,
      { id: params.membershipId, org_id: params.orgId },
      replacement.id,
      kind === 'story' ? 'story' : 'feed',
      slot.category ?? 'general',
      []
    );

    const { error: updErr } = await params.admin
      .from('content_autopilot_slots')
      .update({
        asset_id: replacement.id,
        carousel_asset_ids: [],
        draft_id: draftId,
        content_format: kind === 'story' ? 'story' : 'feed',
        theme: replacement.theme,
        selection_reason: 'Slot reconciled — asset replaced after delete/ineligible.',
        error_message: null,
        status: 'ready',
        updated_at: new Date().toISOString(),
      })
      .eq('id', slot.id)
      .in('status', ['planned', 'ready']);

    if (updErr) {
      // Unique reservation conflict — leave for next cron tick
      reserved.add(replacement.id);
      summary.skippedNoReplacement += 1;
      continue;
    }

    reserved.add(replacement.id);
    summary.replaced += 1;
  }

  return summary;
}

// ---- inline: _shared/content-autopilot/continuation.ts ----
/** Pure helpers: when to auto-continue Autopilot without user confirmation. */

export const AUTOPILOT_OPEN_SLOT_STATUSES = [
  'planned',
  'ready',
  'publishing',
] as const;

export const AUTOPILOT_TERMINAL_SLOT_STATUSES = [
  'published',
  'skipped',
  'failed',
  'cancelled',
] as const;

export type AutopilotOpenSlotStatus = (typeof AUTOPILOT_OPEN_SLOT_STATUSES)[number];

/**
 * A plan is exhausted when nothing remains to publish/claim.
 * Used by cron to start the next period without daily user confirmation.
 */
export function isAutopilotPlanExhausted(params: {
  periodEnd: string; // YYYY-MM-DD
  todayYmd: string;
  slots: ReadonlyArray<{ status: string }>;
}): boolean {
  const hasOpen = params.slots.some((s) =>
    (AUTOPILOT_OPEN_SLOT_STATUSES as readonly string[]).includes(s.status)
  );
  if (hasOpen) return false;
  if (params.slots.length === 0) {
    // Empty active plan past end → continue; empty future plan → wait
    return params.periodEnd < params.todayYmd;
  }
  return true;
}

/** Next 7-day window starting at `fromYmd` (inclusive). */
export function nextAutopilotPeriod(fromYmd: string): { start: string; end: string } {
  const start = fromYmd.slice(0, 10);
  const endDate = new Date(`${start}T12:00:00.000Z`);
  endDate.setUTCDate(endDate.getUTCDate() + 6);
  return { start, end: endDate.toISOString().slice(0, 10) };
}

/** Permanent publish errors — do not infinite-retry; release claim to failed. */
export function isPermanentAutopilotPublishError(error: string): boolean {
  return [
    'draft_not_ready',
    'asset_not_found',
    'missing_caption',
    'missing_publish_permission',
    'missing_token',
    'token_decrypt_failed',
    'video_not_allowed_on_feed',
    'reel_not_allowed_in_autopilot',
    // Legacy #99 / image-only error code — keep permanent so old failed slots do not infinite-retry
    'video_not_allowed_in_autopilot',
  ].includes(error);
}

// ---- inline: _shared/content-autopilot/index.ts ----


// ---- inline: _shared/instagram-oauth/types.ts ----
/** Instagram OAuth (Phase 5A — connect only). Official Meta Business Login path. */

/** Connect + publish scopes for Business Login for Instagram (Phase 5C). */
export const IG_CONNECT_SCOPES = [
  'instagram_business_basic',
  'instagram_business_content_publish',
] as const;

/** DB CHECK values on content_instagram_connections.status */
export type IgConnectionDbStatus = 'disconnected' | 'pending_review' | 'connected' | 'error';

/** UI / API-facing status (maps pending_review → connecting) */
export type IgConnectionUiStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface OAuthStatePayload {
  mid: string; // membership_id
  oid: string; // org_id
  nonce: string;
  exp: number; // unix seconds
  /**
   * Exact redirect_uri used in the authorize dialog (after normalizeRedirectUri).
   * Callback must reuse this byte-for-byte for the token exchange.
   * Optional only to tolerate in-flight states during deploy.
   */
  ruri?: string;
}

export interface SafeConnectionView {
  status: IgConnectionUiStatus;
  igUserId: string | null;
  igUsername: string | null;
  scopes: string[];
  connectedAt: string | null;
  lastError: string | null;
  /** True when META_* secrets are present server-side. Never exposes secret values. */
  oauthConfigured: boolean;
}

export function dbStatusToUi(status: string | null | undefined): IgConnectionUiStatus {
  if (status === 'connected') return 'connected';
  if (status === 'error') return 'error';
  if (status === 'pending_review') return 'connecting';
  return 'disconnected';
}

export function uiStatusToDb(status: IgConnectionUiStatus): IgConnectionDbStatus {
  if (status === 'connecting') return 'pending_review';
  return status;
}

export function isOAuthUserCancel(error: string | null | undefined): boolean {
  const e = (error ?? '').toLowerCase();
  return (
    e === 'access_denied' ||
    e.includes('user_denied') ||
    e.includes('user denied') ||
    e.includes('cancelled') ||
    e.includes('canceled')
  );
}

// ---- inline: _shared/instagram-oauth/crypto.ts ----
/**
 * Token encryption + OAuth state HMAC (Web Crypto).
 * Never log plaintext tokens or keys.
 */


const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importAesKey(secret: string): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest('SHA-256', textEncoder.encode(secret));
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/** Encrypt access token → `v1.<iv>.<ciphertext>` (base64url). */
export async function encryptToken(plaintext: string, secret: string): Promise<string> {
  if (!plaintext) throw new Error('empty_token');
  if (!secret) throw new Error('missing_encryption_secret');
  const key = await importAesKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    textEncoder.encode(plaintext)
  );
  return `v1.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(cipher))}`;
}

export async function decryptToken(blob: string, secret: string): Promise<string> {
  if (!blob?.startsWith('v1.')) throw new Error('invalid_token_blob');
  if (!secret) throw new Error('missing_encryption_secret');
  const parts = blob.split('.');
  if (parts.length !== 3) throw new Error('invalid_token_blob');
  const iv = fromBase64Url(parts[1]);
  const data = fromBase64Url(parts[2]);
  const key = await importAesKey(secret);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return textDecoder.decode(plain);
}

export async function signOAuthState(
  payload: OAuthStatePayload,
  secret: string
): Promise<string> {
  const body = toBase64Url(textEncoder.encode(JSON.stringify(payload)));
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, textEncoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(sig))}`;
}

export async function verifyOAuthState(
  state: string,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000)
): Promise<OAuthStatePayload | null> {
  if (!state || !secret) return null;
  const i = state.lastIndexOf('.');
  if (i <= 0) return null;
  const body = state.slice(0, i);
  const sigPart = state.slice(i + 1);
  const key = await importHmacKey(secret);
  const ok = await crypto.subtle.verify(
    'HMAC',
    key,
    fromBase64Url(sigPart),
    textEncoder.encode(body)
  );
  if (!ok) return null;
  try {
    const payload = JSON.parse(textDecoder.decode(fromBase64Url(body))) as OAuthStatePayload;
    if (!payload?.mid || !payload?.oid || !payload?.nonce || !payload?.exp) return null;
    if (payload.exp < nowSec) return null;
    // New flows always set ruri; tolerate missing on in-flight states mid-deploy.
    if (typeof payload.ruri === 'string') {
      payload.ruri = payload.ruri.trim();
    } else {
      delete payload.ruri;
    }
    return payload;
  } catch {
    return null;
  }
}

export function randomNonce(bytes = 16): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

// ---- inline: _shared/instagram-oauth/meta.ts ----
/** Official Meta / Instagram Login HTTP helpers (Phase 5A connect only). */


const AUTH_URL = 'https://www.instagram.com/oauth/authorize';
const TOKEN_URL = 'https://api.instagram.com/oauth/access_token';
const GRAPH = 'https://graph.instagram.com';

/**
 * Normalize META_REDIRECT_URI for authorize + token exchange.
 * Trim + strip wrapping quotes only — preserve trailing slash exactly as configured
 * (Meta App Dashboard often auto-appends `/` and compares strings character-for-character).
 */
export function normalizeRedirectUri(raw: string): string {
  let value = raw.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  return value;
}

/** Instagram appends `#_` to the redirect; strip if it ever lands in `code`. */
export function normalizeOAuthCode(raw: string): string {
  return raw.trim().split('#')[0]!.trim();
}

/** Safe redirect_uri diagnostics — never includes secrets or auth codes. */
export function describeRedirectUri(uri: string): {
  redirectUri: string;
  length: number;
  endsWithSlash: boolean;
  hasQuery: boolean;
  hasSpace: boolean;
  scheme: 'https' | 'http' | 'other';
} {
  const redirectUri = normalizeRedirectUri(uri);
  let scheme: 'https' | 'http' | 'other' = 'other';
  if (redirectUri.startsWith('https://')) scheme = 'https';
  else if (redirectUri.startsWith('http://')) scheme = 'http';
  return {
    redirectUri,
    length: redirectUri.length,
    endsWithSlash: redirectUri.endsWith('/'),
    hasQuery: redirectUri.includes('?'),
    hasSpace: /\s/.test(redirectUri),
    scheme,
  };
}

export function buildAuthorizeUrl(params: {
  appId: string;
  redirectUri: string;
  state: string;
  scopes?: readonly string[];
}): string {
  const scope = (params.scopes ?? IG_CONNECT_SCOPES).join(',');
  const redirectUri = normalizeRedirectUri(params.redirectUri);
  const q = new URLSearchParams({
    client_id: params.appId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope,
    state: params.state,
  });
  return `${AUTH_URL}?${q.toString()}`;
}

export interface ShortLivedTokenResult {
  accessToken: string;
  userId: string;
  permissions: string[];
}

function readTokenExchangeRow(json: Record<string, unknown>): Record<string, unknown> {
  // Meta may return a flat object or `{ data: [ { access_token, user_id, ... } ] }`.
  if (Array.isArray(json.data) && json.data[0] && typeof json.data[0] === 'object') {
    return json.data[0] as Record<string, unknown>;
  }
  return json;
}

export async function exchangeCodeForShortLivedToken(params: {
  appId: string;
  appSecret: string;
  redirectUri: string;
  code: string;
  fetchFn?: typeof fetch;
}): Promise<ShortLivedTokenResult> {
  const fetchFn = params.fetchFn ?? fetch;
  const redirectUri = normalizeRedirectUri(params.redirectUri);
  const code = normalizeOAuthCode(params.code);

  // Meta accepts form-urlencoded; URLSearchParams matches working IG Business Login clients
  // and avoids Deno FormData multipart quirks that can surface as redirect_uri mismatches.
  const body = new URLSearchParams({
    client_id: params.appId,
    client_secret: params.appSecret,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    code,
  });

  const res = await fetchFn(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(String(json.error_message ?? json.error ?? `token_exchange_${res.status}`));
  }
  const row = readTokenExchangeRow(json);
  const accessToken = String(row.access_token ?? '');
  const userId = String(row.user_id ?? '');
  if (!accessToken) throw new Error('token_exchange_missing_access_token');
  const permissionsRaw = row.permissions ?? json.permissions;
  const permissions = Array.isArray(permissionsRaw)
    ? permissionsRaw.map(String)
    : typeof permissionsRaw === 'string' && permissionsRaw
      ? permissionsRaw.split(',').map((s) => s.trim()).filter(Boolean)
      : [...IG_CONNECT_SCOPES];
  return { accessToken, userId, permissions };
}

export async function exchangeForLongLivedToken(params: {
  appSecret: string;
  shortLivedToken: string;
  fetchFn?: typeof fetch;
}): Promise<{ accessToken: string; expiresIn: number }> {
  const fetchFn = params.fetchFn ?? fetch;
  const q = new URLSearchParams({
    grant_type: 'ig_exchange_token',
    client_secret: params.appSecret,
    access_token: params.shortLivedToken,
  });
  const res = await fetchFn(`${GRAPH}/access_token?${q.toString()}`);
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(String(json.error_message ?? json.error ?? `long_lived_${res.status}`));
  }
  const accessToken = String(json.access_token ?? '');
  if (!accessToken) throw new Error('long_lived_missing_access_token');
  return {
    accessToken,
    expiresIn: Number(json.expires_in ?? 0) || 0,
  };
}

export async function fetchIgProfile(params: {
  accessToken: string;
  fetchFn?: typeof fetch;
}): Promise<{ userId: string; username: string }> {
  const fetchFn = params.fetchFn ?? fetch;
  const q = new URLSearchParams({
    fields: 'user_id,username',
    access_token: params.accessToken,
  });
  const res = await fetchFn(`${GRAPH}/v25.0/me?${q.toString()}`);
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const errObj = json.error as { message?: string } | undefined;
    throw new Error(String(errObj?.message ?? json.error ?? `profile_${res.status}`));
  }
  const userId = String(json.user_id ?? json.id ?? '');
  const username = String(json.username ?? '');
  if (!userId || !username) throw new Error('profile_incomplete');
  return { userId, username };
}

/** Strip secrets from error strings before persisting/returning. */
export function sanitizeMetaError(message: string, maxLen = 280): string {
  return message
    .replace(/EAA[A-Za-z0-9]+/g, '[redacted]')
    .replace(/IGAA[A-Za-z0-9]+/g, '[redacted]')
    .replace(/access_token=[^&\s]+/gi, 'access_token=[redacted]')
    .slice(0, maxLen);
}

/** Append safe OAuth debug suffix to a sanitized error (no secrets/codes). */
export function appendOAuthDebug(
  message: string,
  debug: Record<string, string | number | boolean>
): string {
  const parts = Object.entries(debug).map(([k, v]) => `${k}=${String(v)}`);
  // Allow room for redirect_uri diagnostics in last_error.
  return sanitizeMetaError(`${message} | ${parts.join(' ')}`, 480);
}

// ---- inline: _shared/instagram-oauth/index.ts ----


// ---- inline: _shared/instagram-publish/types.ts ----
/** Instagram Content Publishing (Phase 5C) — official Graph path only. */

export const IG_PUBLISH_SCOPE = 'instagram_business_content_publish' as const;

/** Same Graph version as Phase 5A profile fetch. */
export const IG_GRAPH_API_VERSION = 'v25.0' as const;

export const IG_GRAPH_HOST = 'https://graph.instagram.com' as const;

export type PublishAttemptStatus =
  | 'queued'
  | 'submitted'
  | 'published'
  | 'failed'
  | 'cancelled';

/** Named distinctly from content-generate ContentFormat — setup bundles share one scope. */
export type PublishContentFormat = 'story' | 'feed' | 'reel';

export type MediaKind = 'image' | 'video';

export type PublishErrorCode =
  | 'not_authenticated'
  | 'no_active_membership'
  | 'confirm_required'
  | 'draft_not_found'
  | 'draft_not_ready'
  | 'asset_not_found'
  | 'not_connected'
  | 'missing_token'
  | 'missing_publish_permission'
  | 'missing_media'
  | 'missing_caption'
  | 'signed_url_failed'
  | 'container_failed'
  | 'container_timeout'
  | 'container_error'
  | 'publish_failed'
  | 'already_in_progress'
  | 'unsupported_video_format'
  | 'video_file_too_large'
  | 'video_too_short'
  | 'video_too_long'
  | 'video_resolution_invalid'
  | 'video_aspect_invalid'
  | 'video_not_ready'
  | 'audio_unavailable'
  | 'internal_error';

// ---- inline: _shared/instagram-publish/caption.ts ----
/** Caption assembly for Graph media containers (no secrets). */

export function formatHashtagsForPublish(hashtags: string[] | null | undefined): string {
  return (hashtags ?? [])
    .map((h) => h.trim())
    .filter(Boolean)
    .map((h) => (h.startsWith('#') ? h : `#${h}`))
    .join(' ');
}

/**
 * Build the Instagram caption sent to Meta.
 * CTA is appended as plain text (organic posts have no separate CTA Graph field).
 */
export function buildPublishCaption(params: {
  caption: string | null | undefined;
  hashtags?: string[] | null;
  cta?: string | null;
}): string {
  const body = (params.caption ?? '').trim();
  const cta = (params.cta ?? '').trim();
  const tags = formatHashtagsForPublish(params.hashtags);
  const parts: string[] = [];
  if (body) parts.push(body);
  if (cta) parts.push(cta);
  if (tags) parts.push(tags);
  return parts.join('\n\n');
}

// ---- inline: _shared/instagram-publish/graph.ts ----
/**
 * Official Instagram Content Publishing helpers (Instagram Login → graph.instagram.com).
 * Never log access tokens.
 */


/**
 * Meta IG Container `status_code` values (official docs):
 * EXPIRED | ERROR | FINISHED | IN_PROGRESS | PUBLISHED
 * Unknown non-terminal values are treated as pending (keep polling).
 */
export type ContainerStatusCode =
  | 'EXPIRED'
  | 'ERROR'
  | 'FINISHED'
  | 'IN_PROGRESS'
  | 'PUBLISHED'
  | string;

export type ContainerReadiness = 'ready' | 'pending' | 'error' | 'expired';

/** Polling defaults — bounded, no infinite loop. */
export const CONTAINER_POLL_DEFAULTS = {
  /** Wait before first status check (lets Meta start processing / fetch image_url). */
  initialDelayMs: 2000,
  /** Delay between subsequent status checks. */
  intervalMs: 2000,
  /** Max status checks after the initial delay (~2s + 30×2s ≈ 62s). */
  maxAttempts: 30,
} as const;

export function classifyContainerStatus(statusCode: string | null | undefined): ContainerReadiness {
  const code = String(statusCode ?? '')
    .trim()
    .toUpperCase();
  if (code === 'FINISHED' || code === 'PUBLISHED') return 'ready';
  if (code === 'ERROR') return 'error';
  if (code === 'EXPIRED') return 'expired';
  // IN_PROGRESS, empty, or any other non-terminal → keep waiting
  return 'pending';
}

export function pollConfigForMedia(mediaKind: MediaKind): {
  initialDelayMs: number;
  intervalMs: number;
  maxAttempts: number;
} {
  if (mediaKind === 'video') {
    return {
      initialDelayMs: 3000,
      intervalMs: 3000,
      maxAttempts: 40, // ~3s + 40×3s ≈ 123s
    };
  }
  return { ...CONTAINER_POLL_DEFAULTS };
}

function graphUrl(path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${IG_GRAPH_HOST}/${IG_GRAPH_API_VERSION}${clean}`;
}

function readGraphError(json: Record<string, unknown>, fallback: string): string {
  const err = json.error as
    | { message?: string; error_user_msg?: string; code?: number; error_subcode?: number }
    | undefined;
  const msg = err?.error_user_msg || err?.message || json.error_message || json.error || fallback;
  return sanitizeMetaError(String(msg));
}

export function resolveMediaProduct(params: {
  mediaKind: MediaKind;
  format: PublishContentFormat;
}): {
  mediaType: 'IMAGE' | 'REELS' | 'STORIES' | null;
  useImageUrl: boolean;
  useVideoUrl: boolean;
  shareToFeed: boolean;
} {
  const { mediaKind, format } = params;
  if (format === 'story') {
    return {
      mediaType: 'STORIES',
      useImageUrl: mediaKind === 'image',
      useVideoUrl: mediaKind === 'video',
      shareToFeed: false,
    };
  }
  if (mediaKind === 'video' || format === 'reel') {
    return {
      mediaType: 'REELS',
      useImageUrl: false,
      useVideoUrl: true,
      shareToFeed: true,
    };
  }
  // Feed image — Meta accepts image_url without media_type.
  return { mediaType: null, useImageUrl: true, useVideoUrl: false, shareToFeed: false };
}

export async function createMediaContainer(params: {
  igUserId: string;
  accessToken: string;
  mediaKind: MediaKind;
  format: PublishContentFormat;
  mediaUrl: string;
  caption: string;
  /** When true, creates a carousel child item (no caption on child). */
  isCarouselItem?: boolean;
  fetchFn?: typeof fetch;
}): Promise<{ containerId: string }> {
  const fetchFn = params.fetchFn ?? fetch;
  const product = resolveMediaProduct({
    mediaKind: params.mediaKind,
    format: params.format,
  });

  if (product.useVideoUrl && params.mediaKind !== 'video') {
    throw new Error('container_requires_video');
  }
  if (product.useImageUrl && params.mediaKind !== 'image') {
    throw new Error('container_requires_image');
  }

  const body = new URLSearchParams();
  body.set('access_token', params.accessToken);
  if (product.useImageUrl) body.set('image_url', params.mediaUrl);
  if (product.useVideoUrl) body.set('video_url', params.mediaUrl);
  if (params.isCarouselItem) {
    body.set('is_carousel_item', 'true');
  } else if (product.mediaType) {
    body.set('media_type', product.mediaType);
  }
  // Official Reels param — also surfaces the Reel on the profile feed when supported.
  if (!params.isCarouselItem && product.mediaType === 'REELS') {
    body.set('share_to_feed', 'true');
  }
  // Feed/Reels captions; Stories omit caption (not a feed caption field).
  // Carousel children never carry the feed caption — parent does.
  if (params.caption && !params.isCarouselItem && product.mediaType !== 'STORIES') {
    body.set('caption', params.caption);
  }

  const res = await fetchFn(graphUrl(`/${params.igUserId}/media`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(readGraphError(json, `container_${res.status}`));
  }
  const containerId = String(json.id ?? '');
  if (!containerId) throw new Error('container_missing_id');
  return { containerId };
}

/** Parent carousel container — children must already be FINISHED. */
export async function createCarouselContainer(params: {
  igUserId: string;
  accessToken: string;
  childContainerIds: string[];
  caption: string;
  fetchFn?: typeof fetch;
}): Promise<{ containerId: string }> {
  const fetchFn = params.fetchFn ?? fetch;
  if (params.childContainerIds.length < 2 || params.childContainerIds.length > 10) {
    throw new Error('carousel_child_count_invalid');
  }
  const body = new URLSearchParams();
  body.set('access_token', params.accessToken);
  body.set('media_type', 'CAROUSEL');
  body.set('children', params.childContainerIds.join(','));
  if (params.caption) body.set('caption', params.caption);

  const res = await fetchFn(graphUrl(`/${params.igUserId}/media`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(readGraphError(json, `carousel_container_${res.status}`));
  }
  const containerId = String(json.id ?? '');
  if (!containerId) throw new Error('container_missing_id');
  return { containerId };
}

export async function getContainerStatus(params: {
  containerId: string;
  accessToken: string;
  fetchFn?: typeof fetch;
}): Promise<{ statusCode: ContainerStatusCode; status?: string }> {
  const fetchFn = params.fetchFn ?? fetch;
  const q = new URLSearchParams({
    fields: 'status_code,status',
    access_token: params.accessToken,
  });
  const res = await fetchFn(graphUrl(`/${params.containerId}?${q.toString()}`));
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(readGraphError(json, `container_status_${res.status}`));
  }
  return {
    statusCode: String(json.status_code ?? 'IN_PROGRESS') as ContainerStatusCode,
    status: json.status != null ? String(json.status) : undefined,
  };
}

/**
 * Poll Meta until the container is publishable.
 * Always used — including feed images (Meta may still return 9007/2207027 if rushed).
 */
export async function waitForContainerReady(params: {
  containerId: string;
  accessToken: string;
  fetchFn?: typeof fetch;
  mediaKind?: MediaKind;
  initialDelayMs?: number;
  intervalMs?: number;
  maxAttempts?: number;
  sleepFn?: (ms: number) => Promise<void>;
}): Promise<{ statusCode: ContainerStatusCode; attempts: number }> {
  const defaults = pollConfigForMedia(params.mediaKind ?? 'image');
  const initialDelayMs = params.initialDelayMs ?? defaults.initialDelayMs;
  const intervalMs = params.intervalMs ?? defaults.intervalMs;
  const maxAttempts = params.maxAttempts ?? defaults.maxAttempts;
  const sleepFn =
    params.sleepFn ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  if (initialDelayMs > 0) {
    await sleepFn(initialDelayMs);
  }

  for (let i = 0; i < maxAttempts; i++) {
    const { statusCode } = await getContainerStatus({
      containerId: params.containerId,
      accessToken: params.accessToken,
      fetchFn: params.fetchFn,
    });
    const readiness = classifyContainerStatus(statusCode);
    if (readiness === 'ready') {
      return { statusCode, attempts: i + 1 };
    }
    if (readiness === 'error') {
      throw new Error('container_error');
    }
    if (readiness === 'expired') {
      throw new Error('container_expired');
    }
    // pending (IN_PROGRESS or unknown) — wait and retry
    if (i < maxAttempts - 1) {
      await sleepFn(intervalMs);
    }
  }
  throw new Error('container_timeout');
}

export async function publishMediaContainer(params: {
  igUserId: string;
  accessToken: string;
  containerId: string;
  fetchFn?: typeof fetch;
}): Promise<{ mediaId: string }> {
  const fetchFn = params.fetchFn ?? fetch;
  const body = new URLSearchParams({
    creation_id: params.containerId,
    access_token: params.accessToken,
  });
  const res = await fetchFn(graphUrl(`/${params.igUserId}/media_publish`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(readGraphError(json, `media_publish_${res.status}`));
  }
  const mediaId = String(json.id ?? '');
  if (!mediaId) throw new Error('media_publish_missing_id');
  return { mediaId };
}

export function connectionHasPublishScope(scopes: string[] | null | undefined): boolean {
  return (scopes ?? []).includes('instagram_business_content_publish');
}

// ---- inline: _shared/instagram-publish/reelVideo.ts ----
/**
 * Official Instagram Reels video requirements (IG User Media Reel Specifications).
 * Used server-side before creating a Graph media container.
 */

export type ReelValidationCode =
  | 'ok'
  | 'missing_media'
  | 'unsupported_video_format'
  | 'video_file_too_large'
  | 'video_too_short'
  | 'video_too_long'
  | 'video_resolution_invalid'
  | 'video_aspect_invalid'
  | 'video_not_ready';

/** Meta Reel specs — Instagram Graph / IG User Media. */
export const IG_REEL_VIDEO_SPECS = {
  allowedMimeTypes: ['video/mp4', 'video/quicktime'] as const,
  maxBytes: 300 * 1024 * 1024,
  minDurationSec: 3,
  maxDurationSec: 15 * 60,
  maxWidthPx: 1920,
  minAspectRatio: 0.01,
  maxAspectRatio: 10,
} as const;

/**
 * Instagram Audio API requires Facebook Login (Meta changelog).
 * AscendOS uses Business Login for Instagram → not available without OAuth redesign.
 */
export const IG_OFFICIAL_AUDIO_CAPABILITY = {
  availableWithCurrentOAuth: false as const,
  currentLoginPath: 'instagram_business_login',
  requiredLoginPath: 'facebook_login_for_business',
  endpoints: ['GET /ig_audio', 'GET /{ig_audio_id}'] as const,
} as const;

export function isInstagramPublishableVideoMime(mime: string | null | undefined): boolean {
  const m = (mime ?? '').trim().toLowerCase();
  return (IG_REEL_VIDEO_SPECS.allowedMimeTypes as readonly string[]).includes(m);
}

export function validateReelAssetForPublish(input: {
  mediaKind: 'image' | 'video' | null | undefined;
  /** Draft format — Stories use a shorter Meta duration/size cap. */
  format?: 'story' | 'feed' | 'reel' | null;
  mimeType?: string | null;
  byteSize?: number | null;
  widthPx?: number | null;
  heightPx?: number | null;
  durationSec?: number | null;
  requireDuration?: boolean;
}): ReelValidationCode {
  if (!input.mediaKind) return 'missing_media';
  if (input.format === 'reel' && input.mediaKind !== 'video') return 'missing_media';
  if (input.mediaKind !== 'video') return 'ok';

  const mime = (input.mimeType ?? '').trim().toLowerCase();
  if (!mime || !isInstagramPublishableVideoMime(mime)) return 'unsupported_video_format';

  // Story video: 100 MB / 60 s (Meta Story Video Specifications).
  // Reels / feed video as REELS: 300 MB / 15 min (Meta Reel Specifications).
  const isStory = input.format === 'story';
  const maxBytes = isStory ? 100 * 1024 * 1024 : IG_REEL_VIDEO_SPECS.maxBytes;
  const maxDuration = isStory ? 60 : IG_REEL_VIDEO_SPECS.maxDurationSec;

  const bytes = input.byteSize ?? null;
  if (bytes != null && (bytes <= 0 || bytes > maxBytes)) {
    return 'video_file_too_large';
  }

  const w = input.widthPx ?? null;
  const h = input.heightPx ?? null;
  if (w != null && h != null && w > 0 && h > 0) {
    if (w > IG_REEL_VIDEO_SPECS.maxWidthPx) return 'video_resolution_invalid';
    const ratio = w / h;
    if (
      ratio < IG_REEL_VIDEO_SPECS.minAspectRatio ||
      ratio > IG_REEL_VIDEO_SPECS.maxAspectRatio
    ) {
      return 'video_aspect_invalid';
    }
  }

  const duration = input.durationSec;
  if (input.requireDuration && (duration == null || !Number.isFinite(duration))) {
    return 'video_not_ready';
  }
  if (duration != null && Number.isFinite(duration)) {
    if (duration < IG_REEL_VIDEO_SPECS.minDurationSec) return 'video_too_short';
    if (duration > maxDuration) return 'video_too_long';
  }

  return 'ok';
}

export function reelValidationErrorMessage(code: ReelValidationCode): string {
  switch (code) {
    case 'unsupported_video_format':
      return 'Videoformat nicht unterstützt. Instagram Reels benötigen MP4 (oder MOV).';
    case 'video_file_too_large':
      return 'Videodatei zu groß (max. 300 MB laut Meta).';
    case 'video_too_short':
      return 'Video zu kurz (mindestens 3 Sekunden laut Meta).';
    case 'video_too_long':
      return 'Video zu lang (maximal 15 Minuten laut Meta).';
    case 'video_resolution_invalid':
      return 'Videoauflösung nicht unterstützt (max. 1920 px Breite laut Meta).';
    case 'video_aspect_invalid':
      return 'Seitenverhältnis nicht unterstützt (zwischen 0,01:1 und 10:1 laut Meta).';
    case 'video_not_ready':
      return 'Video-Metadaten noch nicht bereit. Bitte kurz warten und erneut versuchen.';
    case 'missing_media':
      return 'Kein Medium ausgewählt.';
    default:
      return 'Video-Validierung fehlgeschlagen.';
  }
}

// ---- inline: _shared/instagram-publish/feedImageFit.ts ----
/**
 * Instagram Content Publishing — feed image aspect fit (official Meta range).
 * Docs: JPEG; aspect ratio within 4:5 … 1.91:1; width 320–1440.
 */

export const IG_FEED_IMAGE_SPECS = {
  /** Tallest allowed: 4:5 */
  minAspectRatio: 4 / 5,
  /** Widest allowed: 1.91:1 */
  maxAspectRatio: 1.91,
  minWidthPx: 320,
  maxWidthPx: 1440,
} as const;

export type FeedImageCropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** True when width/height already fall inside Meta's feed aspect window. */
export function isFeedImageAspectAllowed(width: number, height: number): boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return false;
  }
  const ratio = width / height;
  return (
    ratio + 1e-9 >= IG_FEED_IMAGE_SPECS.minAspectRatio &&
    ratio - 1e-9 <= IG_FEED_IMAGE_SPECS.maxAspectRatio
  );
}

/**
 * Center-crop rectangle so the result ratio is within Meta's feed window.
 * If already valid, returns the full frame.
 */
export function computeFeedImageCrop(width: number, height: number): FeedImageCropRect {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const ratio = w / h;
  const { minAspectRatio, maxAspectRatio } = IG_FEED_IMAGE_SPECS;

  if (ratio < minAspectRatio) {
    // Too tall → crop height (keep width).
    const cropH = Math.max(1, Math.floor(w / minAspectRatio));
    const y = Math.max(0, Math.floor((h - cropH) / 2));
    return { x: 0, y, width: w, height: Math.min(cropH, h - y) };
  }

  if (ratio > maxAspectRatio) {
    // Too wide → crop width (keep height).
    const cropW = Math.max(1, Math.floor(h * maxAspectRatio));
    const x = Math.max(0, Math.floor((w - cropW) / 2));
    return { x, y: 0, width: Math.min(cropW, w - x), height: h };
  }

  return { x: 0, y: 0, width: w, height: h };
}

/** Target encode width after crop (Meta 320–1440; upscale tiny, downscale huge). */
export function feedImageEncodeWidth(croppedWidth: number): number {
  const w = Math.max(1, Math.floor(croppedWidth));
  if (w < IG_FEED_IMAGE_SPECS.minWidthPx) return IG_FEED_IMAGE_SPECS.minWidthPx;
  return Math.min(IG_FEED_IMAGE_SPECS.maxWidthPx, w);
}

/** Detect Meta error 2207009 / aspect-ratio rejection in sanitized messages. */
export function isMetaFeedImageAspectError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('aspect ratio') ||
    m.includes('seitenverhältnis') ||
    m.includes('2207009') ||
    (m.includes('valid aspect') && m.includes('image'))
  );
}

export const FEED_IMAGE_ASPECT_ERROR_MESSAGE =
  'Feed-Bilder brauchen ein Seitenverhältnis zwischen 4:5 und 1,91:1 (Instagram/Meta). Das Bild wurde angepasst bzw. bitte ein anderes Format wählen.';

// ---- inline: _shared/instagram-publish/index.ts ----


/**
 * content-autopilot-run — CRON_SECRET + service role.
 * Publishes due Instagram Autopilot slots + auto-continues exhausted plans.
 * No Facebook. No browser timers. No daily user confirmation.
 *
 * Auth: x-cron-secret / Bearer CRON_SECRET (same pattern as content-daily-prepare).
 */


/** Local name — must not collide with content-generate CONTENT_ASSETS_BUCKET in setup bundles. */
const AUTOPILOT_RUN_ASSETS_BUCKET = 'content-assets';
/** Slots stuck in `publishing` longer than this are released back to ready. */
const STALE_PUBLISHING_MS = 20 * 60 * 1000;

function authorizeCron(req: Request): Response | null {
  const expected = Deno.env.get('CRON_SECRET');
  if (!expected) return json({ ok: false, error: 'cron_secret_not_configured' }, 503);
  const header =
    req.headers.get('x-cron-secret') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    '';
  if (!header || header !== expected) return json({ ok: false, error: 'unauthorized' }, 401);
  return null;
}

function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

function tokenSecret(): string {
  return (
    Deno.env.get('META_TOKEN_ENCRYPTION_KEY')?.trim() ||
    Deno.env.get('META_APP_SECRET')?.trim() ||
    ''
  );
}

type SlotRow = {
  id: string;
  org_id: string;
  membership_id: string;
  draft_id: string;
  asset_id: string | null;
  carousel_asset_ids: string[] | null;
  content_format: PublishContentFormat;
  slot_kind: string;
  planned_for: string;
  retry_count: number;
  max_retries: number;
};

async function releaseSlotAfterError(
  admin: SupabaseClient,
  slot: SlotRow,
  error: string,
  permanent?: boolean
): Promise<{ ok: false; status: string; error: string }> {
  const forceFail = permanent ?? isPermanentAutopilotPublishError(error);
  const retries = slot.retry_count + 1;
  const giveUp = forceFail || retries >= slot.max_retries;
  await admin
    .from('content_autopilot_slots')
    .update({
      status: giveUp ? 'failed' : 'ready',
      retry_count: retries,
      error_message: error,
    })
    .eq('id', slot.id);
  return { ok: false, status: giveUp ? 'failed' : 'retry', error };
}

async function prepareFeedImageUrlForMeta(params: {
  admin: SupabaseClient;
  sourceSignedUrl: string;
  orgId: string;
  slotId: string;
  mimeType: string | null | undefined;
}): Promise<string> {
  const res = await fetch(params.sourceSignedUrl);
  if (!res.ok) throw new Error('feed_image_fetch_failed');
  const bytes = new Uint8Array(await res.arrayBuffer());
  const image = await Image.decode(bytes);
  const crop = computeFeedImageCrop(image.width, image.height);
  const needsCrop =
    crop.x !== 0 || crop.y !== 0 || crop.width !== image.width || crop.height !== image.height;
  const mime = (params.mimeType ?? '').toLowerCase();
  const needsJpeg = mime !== 'image/jpeg' && mime !== 'image/jpg';
  const targetW = feedImageEncodeWidth(crop.width);
  const needsResize = targetW !== crop.width;
  if (
    !needsCrop &&
    !needsJpeg &&
    !needsResize &&
    isFeedImageAspectAllowed(image.width, image.height)
  ) {
    return params.sourceSignedUrl;
  }
  let fitted = image;
  if (needsCrop) fitted = image.clone().crop(crop.x, crop.y, crop.width, crop.height);
  const encodeW = feedImageEncodeWidth(fitted.width);
  if (encodeW !== fitted.width) {
    const encodeH = Math.max(1, Math.round((fitted.height * encodeW) / fitted.width));
    fitted.resize(encodeW, encodeH);
  }
  const jpeg = await fitted.encodeJPEG(85);
  const path = `${params.orgId}/publish-fit/autopilot-${params.slotId}.jpg`;
  const { error: upErr } = await params.admin.storage.from(AUTOPILOT_RUN_ASSETS_BUCKET).upload(path, jpeg, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (upErr) throw new Error('feed_image_fit_failed');
  const { data: fittedSigned, error: fitSignErr } = await params.admin.storage
    .from(AUTOPILOT_RUN_ASSETS_BUCKET)
    .createSignedUrl(path, 7200);
  if (fitSignErr || !fittedSigned?.signedUrl) throw new Error('feed_image_fit_failed');
  return fittedSigned.signedUrl;
}

async function publishOneSlot(
  admin: SupabaseClient,
  slot: SlotRow
): Promise<{ ok: boolean; status: string; error?: string; mediaId?: string }> {
  // Duplicate protection: already published attempt for this draft
  const { data: publishedRows } = await admin
    .from('content_publish_attempts')
    .select('id, meta_media_id')
    .eq('draft_id', slot.draft_id)
    .eq('status', 'published')
    .limit(1);
  if (publishedRows?.[0]?.meta_media_id) {
    await admin
      .from('content_autopilot_slots')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
        publish_attempt_id: publishedRows[0].id,
        error_message: null,
      })
      .eq('id', slot.id);
    return { ok: true, status: 'published', mediaId: publishedRows[0].meta_media_id };
  }

  const { data: draftPre } = await admin
    .from('content_drafts')
    .select(
      'id, org_id, owner_membership_id, asset_id, carousel_asset_ids, format, caption, cta, hashtags, status'
    )
    .eq('id', slot.draft_id)
    .maybeSingle();
  if (!draftPre || (draftPre.status !== 'ready' && draftPre.status !== 'draft')) {
    return releaseSlotAfterError(admin, slot, 'draft_not_ready', true);
  }

  // Never auto-publish reels / video feed. Video is Story-only.
  if (draftPre.format === 'reel' || slot.content_format === 'reel') {
    return releaseSlotAfterError(admin, slot, 'reel_not_allowed_in_autopilot', true);
  }

  const isStory = slot.slot_kind === 'story' || draftPre.format === 'story';
  const carouselFromSlot = (slot.carousel_asset_ids ?? []).filter(Boolean);
  const carouselFromDraft = (draftPre.carousel_asset_ids ?? []).filter(Boolean);
  const primaryId = slot.asset_id ?? draftPre.asset_id;
  const publishAssetIds = [
    ...new Set(
      [
        primaryId,
        ...(!isStory && carouselFromSlot.length >= 2 ? carouselFromSlot : []),
        ...(!isStory && carouselFromDraft.length >= 2 ? carouselFromDraft : []),
      ].filter(Boolean) as string[]
    ),
  ].slice(0, 10);
  const isCarousel = !isStory && publishAssetIds.length >= 2;

  // Feed/Carousel only: one optimization pass. Image Story + Video Story skip (no extra AI).
  if (!isStory) {
    try {
      await optimizeAutopilotDraftBeforePublish({
        admin,
        membershipId: slot.membership_id,
        orgId: slot.org_id,
        draftId: slot.draft_id,
        slotKind: slot.slot_kind,
        contentFormat: slot.content_format || draftPre.format,
        plannedFor: slot.planned_for,
        assetIds: publishAssetIds,
      });
    } catch (optErr) {
      console.error(
        'autopilot_optimize_failed',
        optErr instanceof Error ? optErr.message : optErr
      );
      // Continue with existing draft — do not block publish on optimize soft failure
    }
  }

  const { data: draft } = await admin
    .from('content_drafts')
    .select(
      'id, org_id, owner_membership_id, asset_id, carousel_asset_ids, format, caption, cta, hashtags, status'
    )
    .eq('id', slot.draft_id)
    .maybeSingle();
  if (!draft || draft.status !== 'ready') {
    return releaseSlotAfterError(admin, slot, 'draft_not_ready', true);
  }

  const { data: assets } = await admin
    .from('content_assets')
    .select('id, org_id, storage_path, media_kind, mime_type, byte_size, width_px, height_px')
    .in('id', publishAssetIds.length ? publishAssetIds : ['00000000-0000-0000-0000-000000000000']);
  const orderedAssets = publishAssetIds
    .map((id) => (assets ?? []).find((a) => a.id === id))
    .filter(Boolean) as Array<{
    id: string;
    org_id: string;
    storage_path: string;
    media_kind: string;
    mime_type: string | null;
  }>;
  if (orderedAssets.length === 0 || !orderedAssets[0]?.storage_path) {
    return releaseSlotAfterError(admin, slot, 'asset_not_found', true);
  }

  // Feed/Carousel: images only. Story: image or video.
  if (!isStory) {
    if (orderedAssets.some((a) => a.media_kind !== 'image')) {
      return releaseSlotAfterError(admin, slot, 'video_not_allowed_on_feed', true);
    }
  } else if (orderedAssets[0].media_kind !== 'image' && orderedAssets[0].media_kind !== 'video') {
    return releaseSlotAfterError(admin, slot, 'asset_not_found', true);
  }

  const caption = buildPublishCaption({
    caption: draft.caption,
    hashtags: draft.hashtags,
    cta: draft.cta,
  });
  if (!caption && draft.format !== 'story') {
    return releaseSlotAfterError(admin, slot, 'missing_caption', true);
  }

  const { data: connection } = await admin
    .from('content_instagram_connections')
    .select('id, ig_user_id, ig_username, status, scopes, token_ref')
    .eq('org_id', slot.org_id)
    .eq('membership_id', slot.membership_id)
    .maybeSingle();
  if (
    !connection ||
    connection.status !== 'connected' ||
    !connection.ig_user_id ||
    !connection.token_ref
  ) {
    return releaseSlotAfterError(admin, slot, 'not_connected', false);
  }
  if (!connectionHasPublishScope(connection.scopes)) {
    return releaseSlotAfterError(admin, slot, 'missing_publish_permission', true);
  }

  const secret = tokenSecret();
  if (!secret) return releaseSlotAfterError(admin, slot, 'missing_token', true);
  let accessToken: string;
  try {
    accessToken = await decryptToken(connection.token_ref, secret);
  } catch {
    return releaseSlotAfterError(admin, slot, 'token_decrypt_failed', true);
  }

  const { data: attempt, error: attemptErr } = await admin
    .from('content_publish_attempts')
    .insert({
      org_id: slot.org_id,
      membership_id: slot.membership_id,
      draft_id: draft.id,
      connection_id: connection.id,
      status: 'queued',
      // Standing consent was recorded at Autopilot activate (consent_confirmed_at).
      user_confirmed_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (attemptErr) {
    if (attemptErr.code === '23505') {
      return releaseSlotAfterError(admin, slot, 'already_in_progress', false);
    }
    throw attemptErr;
  }

  try {
    let containerId: string;

    if (isCarousel) {
      const childIds: string[] = [];
      for (let i = 0; i < orderedAssets.length; i += 1) {
        const slide = orderedAssets[i];
        const { data: signed, error: signErr } = await admin.storage
          .from(AUTOPILOT_RUN_ASSETS_BUCKET)
          .createSignedUrl(slide.storage_path, 7200);
        if (signErr || !signed?.signedUrl) throw new Error('signed_url_failed');
        const mediaUrl = await prepareFeedImageUrlForMeta({
          admin,
          sourceSignedUrl: signed.signedUrl,
          orgId: slot.org_id,
          slotId: `${slot.id}-c${i}`,
          mimeType: slide.mime_type,
        });
        const child = await createMediaContainer({
          igUserId: connection.ig_user_id,
          accessToken,
          mediaKind: 'image',
          format: 'feed',
          mediaUrl,
          caption: '',
          isCarouselItem: true,
        });
        await waitForContainerReady({
          containerId: child.containerId,
          accessToken,
          mediaKind: 'image',
        });
        childIds.push(child.containerId);
      }
      const parent = await createCarouselContainer({
        igUserId: connection.ig_user_id,
        accessToken,
        childContainerIds: childIds,
        caption: caption ?? '',
      });
      containerId = parent.containerId;
    } else {
      const asset = orderedAssets[0];
      const mediaKind = (asset.media_kind === 'video' ? 'video' : 'image') as MediaKind;
      // Defense: video only allowed on story path
      if (mediaKind === 'video' && !isStory) {
        throw new Error('video_not_allowed_on_feed');
      }
      const { data: signed, error: signErr } = await admin.storage
        .from(AUTOPILOT_RUN_ASSETS_BUCKET)
        .createSignedUrl(asset.storage_path, 7200);
      if (signErr || !signed?.signedUrl) throw new Error('signed_url_failed');

      let mediaUrl = signed.signedUrl;
      if (!isStory && mediaKind === 'image') {
        mediaUrl = await prepareFeedImageUrlForMeta({
          admin,
          sourceSignedUrl: signed.signedUrl,
          orgId: slot.org_id,
          slotId: slot.id,
          mimeType: asset.mime_type,
        });
      }

      const created = await createMediaContainer({
        igUserId: connection.ig_user_id,
        accessToken,
        mediaKind,
        format: isStory ? 'story' : 'feed',
        mediaUrl,
        caption: isStory ? '' : caption,
      });
      containerId = created.containerId;

      await admin
        .from('content_publish_attempts')
        .update({ status: 'submitted', meta_container_id: containerId })
        .eq('id', attempt.id);

      await waitForContainerReady({
        containerId,
        accessToken,
        mediaKind,
      });
    }

    if (isCarousel) {
      await admin
        .from('content_publish_attempts')
        .update({ status: 'submitted', meta_container_id: containerId })
        .eq('id', attempt.id);

      await waitForContainerReady({
        containerId,
        accessToken,
        mediaKind: 'image',
      });
    }

    const published = await publishMediaContainer({
      igUserId: connection.ig_user_id,
      accessToken,
      containerId,
    });

    await admin
      .from('content_publish_attempts')
      .update({
        status: 'published',
        meta_container_id: containerId,
        meta_media_id: published.mediaId,
        error_message: null,
      })
      .eq('id', attempt.id);

    await admin
      .from('content_autopilot_slots')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
        publish_attempt_id: attempt.id,
        error_message: null,
        performance_json: {
          meta_media_id: published.mediaId,
          captured_at: new Date().toISOString(),
          metrics: {},
        },
      })
      .eq('id', slot.id);

    // Best-effort Instagram Graph insights only — never invent metrics.
    try {
      const metrics = ['reach', 'likes', 'comments', 'saved', 'shares'];
      const insightUrl = new URL(`https://graph.instagram.com/v21.0/${published.mediaId}/insights`);
      insightUrl.searchParams.set('metric', metrics.join(','));
      insightUrl.searchParams.set('access_token', accessToken);
      const insightRes = await fetch(insightUrl);
      if (insightRes.ok) {
        const insightBody = (await insightRes.json()) as {
          data?: Array<{ name?: string; values?: Array<{ value?: number }> }>;
        };
        const metricsMap: Record<string, number> = {};
        for (const row of insightBody.data ?? []) {
          const name = row.name;
          const value = row.values?.[0]?.value;
          if (name && typeof value === 'number') metricsMap[name] = value;
        }
        if (Object.keys(metricsMap).length > 0) {
          await admin
            .from('content_autopilot_slots')
            .update({
              performance_json: {
                meta_media_id: published.mediaId,
                captured_at: new Date().toISOString(),
                metrics: metricsMap,
              },
            })
            .eq('id', slot.id);
        }
      }
    } catch {
      /* insights optional */
    }

    for (const asset of orderedAssets) {
      const { data: usageRow } = await admin
        .from('content_assets')
        .select('usage_count')
        .eq('id', asset.id)
        .maybeSingle();
      await admin
        .from('content_assets')
        .update({
          last_used_at: new Date().toISOString(),
          usage_count: Number(usageRow?.usage_count ?? 0) + 1,
        })
        .eq('id', asset.id);
    }

    return { ok: true, status: 'published', mediaId: published.mediaId };
  } catch (e) {
    const msg = sanitizeMetaError(e instanceof Error ? e.message : 'publish_failed');
    await admin
      .from('content_publish_attempts')
      .update({ status: 'failed', error_message: msg })
      .eq('id', attempt.id)
      .in('status', ['queued', 'submitted']);
    const released = await releaseSlotAfterError(admin, slot, msg, false);
    if (isMetaFeedImageAspectError(msg)) {
      return { ok: false, status: 'failed', error: FEED_IMAGE_ASPECT_ERROR_MESSAGE };
    }
    return released;
  }
}

async function recoverStalePublishing(admin: SupabaseClient): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_PUBLISHING_MS).toISOString();
  const { data, error } = await admin
    .from('content_autopilot_slots')
    .update({
      status: 'ready',
      error_message: 'stale_publishing_recovered',
    })
    .eq('status', 'publishing')
    .lt('updated_at', cutoff)
    .select('id');
  if (error) {
    console.error('stale_publishing_recover_failed', error.message);
    return 0;
  }
  return data?.length ?? 0;
}

async function loadEligibleAssets(
  admin: SupabaseClient,
  orgId: string,
  membershipId: string
): Promise<AutopilotEligibleAsset[]> {
  const { data, error } = await admin
    .from('content_assets')
    .select(
      'id, scope, media_kind, mime_type, storage_path, theme, keywords, suggested_formats, analysis_status, last_used_at, usage_count, created_at, owner_membership_id'
    )
    .eq('org_id', orgId)
    .or(`owner_membership_id.eq.${membershipId},scope.eq.central`);
  if (error) throw error;
  return (data ?? []) as AutopilotEligibleAsset[];
}

async function loadHistory(
  admin: SupabaseClient,
  membershipId: string
): Promise<AutopilotHistoryItem[]> {
  const since = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from('content_autopilot_slots')
    .select(
      'asset_id, carousel_asset_ids, category, theme, published_at, planned_for, slot_kind, status'
    )
    .eq('membership_id', membershipId)
    .in('status', ['published', 'ready', 'planned', 'publishing'])
    .gte('planned_for', since)
    .order('planned_for', { ascending: false })
    .limit(80);
  if (error) throw error;
  const items: AutopilotHistoryItem[] = [];
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const base = {
      category: (row.category as string) ?? null,
      theme: (row.theme as string) ?? null,
      publishedAt: String(row.published_at ?? row.planned_for),
      slotKind: String(row.slot_kind ?? 'feed'),
    };
    const carousel = (row.carousel_asset_ids as string[] | null) ?? [];
    const ids =
      carousel.length >= 2
        ? carousel
        : [row.asset_id as string | null].filter(Boolean);
    if (ids.length === 0) {
      items.push({ assetId: null, ...base });
    } else {
      for (const id of ids) {
        items.push({ assetId: String(id), ...base });
      }
    }
  }
  return items.slice(0, 120);
}

async function igConnectedForMember(
  admin: SupabaseClient,
  orgId: string,
  membershipId: string
): Promise<boolean> {
  const { data } = await admin
    .from('content_instagram_connections')
    .select('status, ig_user_id, token_ref, scopes')
    .eq('org_id', orgId)
    .eq('membership_id', membershipId)
    .maybeSingle();
  if (!data || data.status !== 'connected' || !data.ig_user_id || !data.token_ref) return false;
  const scopes = (data.scopes as string[] | null) ?? [];
  return scopes.includes('instagram_business_content_publish');
}

/**
 * When Autopilot stays enabled and the current plan has nothing left to do,
 * automatically create the next 7-day plan — no daily user confirmation.
 */
async function continueExhaustedPlans(
  admin: SupabaseClient,
  membershipFilter?: string
): Promise<unknown[]> {
  const today = new Date().toISOString().slice(0, 10);
  let settingsQuery = admin
    .from('content_autopilot_settings')
    .select('org_id, membership_id, enabled, paused, min_eligible_assets')
    .eq('enabled', true)
    .eq('paused', false);
  if (membershipFilter) settingsQuery = settingsQuery.eq('membership_id', membershipFilter);

  const { data: settingsRows, error } = await settingsQuery.limit(50);
  if (error) throw error;

  const outcomes: unknown[] = [];
  for (const settings of settingsRows ?? []) {
    const membershipId = settings.membership_id as string;
    const orgId = settings.org_id as string;

    const { data: plan } = await admin
      .from('content_autopilot_plans')
      .select('id, period_start, period_end, status')
      .eq('membership_id', membershipId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (plan?.id) {
      const { data: slots } = await admin
        .from('content_autopilot_slots')
        .select('status')
        .eq('plan_id', plan.id);
      const exhausted = isAutopilotPlanExhausted({
        periodEnd: String(plan.period_end),
        todayYmd: today,
        slots: slots ?? [],
      });
      if (!exhausted) {
        outcomes.push({ membershipId, status: 'plan_still_active' });
        continue;
      }
      await admin
        .from('content_autopilot_plans')
        .update({ status: 'completed' })
        .eq('id', plan.id);
    }

    if (!(await igConnectedForMember(admin, orgId, membershipId))) {
      outcomes.push({ membershipId, status: 'skipped', reason: 'instagram_not_connected' });
      continue;
    }

    const assets = await loadEligibleAssets(admin, orgId, membershipId);
    const minRequired = Number(settings.min_eligible_assets ?? AUTOPILOT_MIN_ELIGIBLE_ASSETS);
    const gate = canActivateAutopilot(assets, minRequired);
    if (!gate.ok) {
      outcomes.push({
        membershipId,
        status: 'skipped',
        reason: 'below_min_assets',
        count: gate.count,
      });
      continue;
    }

    const period = nextAutopilotPeriod(today);
    const history = await loadHistory(admin, membershipId);
    const built = await buildAndInsertAutopilotPlan(
      admin,
      { id: membershipId, org_id: orgId },
      period.start,
      period.end,
      assets,
      history
    );
    outcomes.push({
      membershipId,
      status: 'continued',
      planId: built.planId,
      slotCount: built.slotCount,
      skipped: built.skipped,
      period,
    });
  }
  return outcomes;
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  const denied = authorizeCron(req);
  if (denied) return denied;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      limit?: number;
      membershipId?: string;
      force?: boolean;
      skipContinue?: boolean;
    };
    const limit = Math.min(20, Math.max(1, Number(body.limit) || 5));
    const admin = adminClient();
    const now = new Date().toISOString();

    const staleRecovered = await recoverStalePublishing(admin);

    // Incremental plan reconciliation (deleted/ineligible assets) before claim/publish.
    // Reuses existing server cron — no frontend timers, no second cron infra.
    const reconcileSummaries: unknown[] = [];
    {
      let settingsQuery = admin
        .from('content_autopilot_settings')
        .select('org_id, membership_id, enabled, paused')
        .eq('enabled', true)
        .eq('paused', false)
        .limit(50);
      if (body.membershipId) {
        settingsQuery = settingsQuery.eq('membership_id', body.membershipId);
      }
      const { data: enabledSettings } = await settingsQuery;
      for (const s of enabledSettings ?? []) {
        const membershipId = s.membership_id as string;
        const orgId = s.org_id as string;
        const assets = await loadEligibleAssets(admin, orgId, membershipId);
        const history = await loadHistory(admin, membershipId);
        const summary = await reconcileActivePlanForMembership({
          admin,
          orgId,
          membershipId,
          assets,
          history,
        });
        reconcileSummaries.push({ membershipId, ...summary });
      }
    }

    let dueQuery = admin
      .from('content_autopilot_slots')
      .select(
        'id, org_id, membership_id, draft_id, asset_id, carousel_asset_ids, content_format, slot_kind, retry_count, max_retries, planned_for, status'
      )
      .in('status', ['ready', 'planned'])
      .lte('planned_for', now)
      .not('draft_id', 'is', null)
      .order('planned_for', { ascending: true })
      .limit(limit);

    if (body.membershipId) {
      dueQuery = dueQuery.eq('membership_id', body.membershipId);
    }

    const { data: dueSlots, error } = await dueQuery;
    if (error) throw error;

    const results: unknown[] = [];
    for (const raw of dueSlots ?? []) {
      const slot = raw as SlotRow;

      const { data: settings } = await admin
        .from('content_autopilot_settings')
        .select('enabled, paused')
        .eq('membership_id', slot.membership_id)
        .maybeSingle();
      if (!settings?.enabled || settings.paused) {
        results.push({ slotId: slot.id, status: 'skipped', reason: 'autopilot_paused_or_off' });
        continue;
      }

      // Atomic claim — parallel cron loses if status already moved
      const { data: claimed } = await admin
        .from('content_autopilot_slots')
        .update({ status: 'publishing' })
        .eq('id', slot.id)
        .in('status', ['ready', 'planned'])
        .select('id')
        .maybeSingle();
      if (!claimed) {
        results.push({ slotId: slot.id, status: 'noop', reason: 'already_claimed' });
        continue;
      }

      const outcome = await publishOneSlot(admin, slot);
      results.push({ slotId: slot.id, ...outcome });
    }

    const continued = body.skipContinue
      ? []
      : await continueExhaustedPlans(admin, body.membershipId);

    return json({
      ok: true,
      job: 'content-autopilot-run',
      processed: results.length,
      results,
      staleRecovered,
      reconciled: reconcileSummaries,
      continued,
      facebook: 'not_used',
    });
  } catch (e) {
    console.error('content_autopilot_run_error', e instanceof Error ? e.message : e);
    return json({ ok: false, error: 'internal_error' }, 500);
  }
});
