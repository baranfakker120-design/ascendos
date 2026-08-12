// AscendOS Edge Function: content-autopilot (Dashboard-Version, alles in einer Datei)
// Name der Function MUSS exakt lauten: content-autopilot
//
// GENERIERT von scripts/bundle-functions.mjs — NICHT von Hand ändern.
// Quelle: supabase/functions/content-autopilot/index.ts

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
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
 * Autopilot feed bundle: ALWAYS exactly 1 image.
 *
 * Hard rule (2026-08): Autopilot must never plan, reserve, or publish carousels.
 * Manual Content Assistant carousel (lib/carousel/*) is unrelated and untouched.
 */


/** Kept for Instagram Graph max reference — Autopilot never uses multi-slide. */
export const AUTOPILOT_CAROUSEL_MAX = CAROUSEL_MAX_ASSETS; // 10

export interface AutopilotFeedBundle {
  assets: AutopilotEligibleAsset[];
  primary: AutopilotEligibleAsset;
  category: string;
  reasons: string[];
  /** Always 'feed' for image autopilot (never reel). */
  contentFormat: 'feed';
  /** Always false — Autopilot feed is single-image only. */
  isCarousel: false;
}

/**
 * Autopilot hard block: feed target size is always exactly 1.
 * Daypart no longer expands to 2/3/5.
 */
export function targetCarouselSize(_params: {
  hour: number;
  availableEligible: number;
}): number {
  return 1;
}

/** Autopilot feed ids: keep only the primary (first) asset. */
export function clampAutopilotFeedAssetIds(ids: readonly string[]): string[] {
  for (const id of ids) {
    if (id) return [id];
  }
  return [];
}

/**
 * Collapse a legacy Autopilot multi-asset feed slot to single-image.
 * Preserves primary; clears companions. Does not touch caption/hashtags/cta.
 */
export function collapseAutopilotFeedToSingle(params: {
  assetId: string | null;
  carouselAssetIds: readonly string[];
}): {
  assetId: string | null;
  carouselAssetIds: [];
  isCarousel: false;
  contentFormat: 'feed';
  collapsed: boolean;
} {
  const companions = params.carouselAssetIds.filter((id) => Boolean(id));
  const primary = params.assetId || companions[0] || null;
  const hasExtra =
    companions.length >= 2 || companions.some((id) => id && id !== params.assetId);
  return {
    assetId: primary,
    carouselAssetIds: [],
    isCarousel: false,
    contentFormat: 'feed',
    collapsed: hasExtra,
  };
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
  void isEligibleAutopilotFeedAsset;
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

  // Hard block: never pick additional slides, regardless of hour / pool size.
  void targetCarouselSize({
    hour: params.hour,
    availableEligible: params.assets.length,
  });

  return {
    assets: [best.asset],
    primary: best.asset,
    category: best.category,
    reasons: [...best.reasons.slice(0, 2), 'Single-Image Feed (Autopilot — kein Carousel).'],
    contentFormat: 'feed',
    isCarousel: false,
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

  // AUTOPILOT HARD RULE: any multi-asset feed → collapse to single image (never re-expand).
  // Manual Content Assistant carousels are not stored as autopilot slots.
  if (kind === 'feed' && slot.carouselAssetIds.length >= 2) {
    return {
      action: 'repair_carousel',
      reason: 'autopilot_collapse_to_single',
      keepPrimary: true,
    };
  }
  // Also collapse if companions remain even when length check used primary+children shape
  if (
    kind === 'feed' &&
    slot.carouselAssetIds.length >= 1 &&
    slot.carouselAssetIds.some((id) => id && id !== slot.assetId)
  ) {
    return {
      action: 'repair_carousel',
      reason: 'autopilot_collapse_to_single',
      keepPrimary: true,
    };
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

/**
 * Autopilot repair: always collapse to the primary image only.
 * Never rebuild multi-slide carousels. `max` is ignored (hard max = 1).
 */
export function repairCarouselAssetIds(params: {
  primaryId: string;
  carouselAssetIds: string[];
  assetsById: ReadonlyMap<string, AutopilotEligibleAsset>;
  max: number;
}): string[] {
  void params.max;
  void params.carouselAssetIds;
  if (!params.primaryId) return [];
  const primary = params.assetsById.get(params.primaryId);
  if (!assetValidForSlot(primary, 'feed')) return [];
  return [params.primaryId];
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
  /** Always empty — Autopilot feed never carries carousel children. */
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
 * Feed: ALWAYS exactly 1 image (never carousel).
 * Stories: image or video story.
 * Never plans reel / video feed / image carousel / video carousel.
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
          // Hard block: Autopilot feed never carries carousel children.
          carouselAssetIds: [],
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
  /** Ignored — Autopilot never persists carousel companions. */
  _carouselAssetIds: string[] = []
): Promise<string | null> {
  void _carouselAssetIds;
  // AUTOPILOT HARD RULE: never create carousel drafts (manual carousel is separate).

  // Reuse existing ready draft for same primary + format.
  {
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
      clean_check_notes: 'Autopilot draft placeholder — feed optimized before publish.',
      target_audience: asset.audience_hint,
      posting_hint: `Autopilot · ${category}`,
      status: 'ready',
      carousel_asset_ids: [],
      analysis_json: {
        source: 'autopilot_v1',
        category,
        reused_analysis: Boolean(analysis && Object.keys(analysis).length),
        is_carousel: false,
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

    // AUTOPILOT HARD RULE: feed slots persist exactly 1 asset; carousel_asset_ids always [].
    const draftId = await createAutopilotDraftForSlot(
      db,
      membership,
      s.assetId,
      s.contentFormat === 'reel' ? 'feed' : s.contentFormat,
      s.category,
      []
    );
    if (!draftId) {
      skipped += 1;
      await db.from('content_autopilot_slots').insert({
        org_id: membership.org_id,
        membership_id: membership.id,
        plan_id: plan.id,
        asset_id: s.assetId,
        carousel_asset_ids: [],
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
      carousel_asset_ids: [],
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
      // AUTOPILOT HARD RULE: always collapse to primary single-image feed.
      // Never re-expand. Caption / hashtags / CTA on the draft are preserved
      // (draft update only clears carousel_asset_ids + may align asset_id).
      const repaired = repairCarouselAssetIds({
        primaryId: slot.assetId ?? '',
        carouselAssetIds: slot.carouselAssetIds,
        assetsById,
        max: 1,
      });
      if (repaired.length === 0) {
        // fall through to full replace
      } else {
        await params.admin
          .from('content_autopilot_slots')
          .update({
            asset_id: repaired[0],
            carousel_asset_ids: [],
            content_format: 'feed',
            selection_reason:
              'Autopilot Carousel → Single-Image Feed (Hard Rule: 1 Image only).',
            error_message: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', slot.id)
          .in('status', ['planned', 'ready']);
        if (raw.draft_id) {
          // Preserve caption, hashtags, cta, hook — only clear carousel companions.
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


/**
 * content-autopilot — user JWT actions for Instagram Content Autopilot V1.
 *
 * Actions: get_state | activate | pause | resume | deactivate | replan
 * Instagram-only. No Facebook. Never touches OAuth start/callback.
 */


/** Local auth membership shape — must not collide with content-generate MembershipRow in setup bundles. */
interface AutopilotMembershipRow {
  id: string;
  org_id: string;
  role: string;
  status: string;
}

function userClient(req: Request): SupabaseClient {
  const forwardHeaders: Record<string, string> = {
    Authorization: req.headers.get('Authorization') ?? '',
  };
  const orgSelector = req.headers.get('x-ascendos-org');
  if (orgSelector) forwardHeaders['x-ascendos-org'] = orgSelector;
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: forwardHeaders },
  });
}

async function resolveMembership(
  db: SupabaseClient,
  req: Request
): Promise<{ membership: AutopilotMembershipRow } | Response> {
  const { data: userData, error: authError } = await db.auth.getUser();
  if (authError || !userData.user) return json({ ok: false, error: 'not_authenticated' }, 401);

  const { data: memberships, error } = await db
    .from('memberships')
    .select('id, org_id, role, status')
    .eq('identity_id', userData.user.id)
    .eq('status', 'active');
  if (error) throw error;
  const orgHeader = req.headers.get('x-ascendos-org');
  const list = (memberships as AutopilotMembershipRow[] | null) ?? [];
  const active =
    list.find((m) => orgHeader && m.org_id === orgHeader) ?? (list.length === 1 ? list[0] : null);
  if (!active) return json({ ok: false, error: 'no_active_membership' }, 403);
  return { membership: active };
}

async function loadEligibleAssets(
  db: SupabaseClient,
  orgId: string,
  membershipId: string
): Promise<AutopilotEligibleAsset[]> {
  const { data, error } = await db
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
  db: SupabaseClient,
  membershipId: string
): Promise<AutopilotHistoryItem[]> {
  const since = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
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
    if (ids.length === 0) items.push({ assetId: null, ...base });
    else for (const id of ids) items.push({ assetId: String(id), ...base });
  }
  return items.slice(0, 120);
}

function defaultPeriod(): { start: string; end: string } {
  const now = new Date();
  const start = now.toISOString().slice(0, 10);
  const endDate = new Date(now);
  endDate.setUTCDate(endDate.getUTCDate() + 6);
  const end = endDate.toISOString().slice(0, 10);
  return { start, end };
}

async function ensureSettings(
  db: SupabaseClient,
  membership: AutopilotMembershipRow
): Promise<Record<string, unknown>> {
  const { data: existing } = await db
    .from('content_autopilot_settings')
    .select('*')
    .eq('org_id', membership.org_id)
    .eq('membership_id', membership.id)
    .maybeSingle();
  if (existing) return existing as Record<string, unknown>;
  const { data, error } = await db
    .from('content_autopilot_settings')
    .insert({
      org_id: membership.org_id,
      membership_id: membership.id,
      enabled: false,
      paused: false,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as Record<string, unknown>;
}

async function igConnected(db: SupabaseClient, membership: AutopilotMembershipRow): Promise<boolean> {
  const { data } = await db
    .from('content_instagram_connections')
    .select('status, ig_user_id, token_ref, scopes')
    .eq('org_id', membership.org_id)
    .eq('membership_id', membership.id)
    .maybeSingle();
  if (!data || data.status !== 'connected' || !data.ig_user_id || !data.token_ref) return false;
  const scopes = (data.scopes as string[] | null) ?? [];
  return scopes.includes('instagram_business_content_publish');
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  try {
    const db = userClient(req);
    const resolved = await resolveMembership(db, req);
    if (resolved instanceof Response) return resolved;
    const { membership } = resolved;
    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      periodStart?: string;
      periodEnd?: string;
    };
    const action = String(body.action ?? 'get_state');

    const settings = await ensureSettings(db, membership);
    const assets = await loadEligibleAssets(db, membership.org_id, membership.id);
    const scopeCounts = countByScope(assets);
    const gate = canActivateAutopilot(assets, AUTOPILOT_MIN_ELIGIBLE_ASSETS);
    const connected = await igConnected(db, membership);

    if (action === 'get_state') {
      const { data: plan } = await db
        .from('content_autopilot_plans')
        .select('id, period_start, period_end, status, summary, created_at')
        .eq('membership_id', membership.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let slots: unknown[] = [];
      if (plan?.id) {
        const { data: slotRows } = await db
          .from('content_autopilot_slots')
          .select(
            'id, draft_id, asset_id, planned_for, slot_kind, content_format, theme, category, selection_reason, status, error_message, published_at, retry_count'
          )
          .eq('plan_id', plan.id)
          .order('planned_for', { ascending: true });
        slots = slotRows ?? [];
      }

      const today = new Date().toISOString().slice(0, 10);
      const weekSlots = (slots as Array<Record<string, unknown>>) ?? [];
      const stats = {
        feedPlanned: weekSlots.filter((s) => s.slot_kind === 'feed' && s.status !== 'cancelled')
          .length,
        feedPublished: weekSlots.filter(
          (s) => s.slot_kind === 'feed' && s.status === 'published'
        ).length,
        storiesPlanned: weekSlots.filter(
          (s) => s.slot_kind === 'story' && s.status !== 'cancelled'
        ).length,
        storiesPublished: weekSlots.filter(
          (s) => s.slot_kind === 'story' && s.status === 'published'
        ).length,
        skipped: weekSlots.filter((s) => s.status === 'skipped').length,
        failed: weekSlots.filter((s) => s.status === 'failed').length,
        todayFeed: weekSlots.filter(
          (s) =>
            s.slot_kind === 'feed' &&
            String(s.planned_for).startsWith(today) &&
            s.status !== 'cancelled' &&
            s.status !== 'skipped'
        ).length,
        todayStories: weekSlots.filter(
          (s) =>
            s.slot_kind === 'story' &&
            String(s.planned_for).startsWith(today) &&
            s.status !== 'cancelled' &&
            s.status !== 'skipped'
        ).length,
      };

      const next = weekSlots.find(
        (s) =>
          (s.status === 'ready' || s.status === 'planned') &&
          new Date(String(s.planned_for)).getTime() >= Date.now() - 60_000
      );

      return json({
        ok: true,
        settings,
        instagramConnected: connected,
        eligibility: {
          ...gate,
          ...scopeCounts,
          minRequired: AUTOPILOT_MIN_ELIGIBLE_ASSETS,
          maxFeedPerDay: AUTOPILOT_MAX_FEED_PER_DAY,
          maxStoriesPerDay: AUTOPILOT_MAX_STORIES_PER_DAY,
        },
        plan: plan ?? null,
        slots,
        stats,
        nextSlot: next ?? null,
        datesInPeriod: plan
          ? enumerateDatesInclusive(String(plan.period_start), String(plan.period_end))
          : [],
      });
    }

    if (action === 'activate') {
      if (!connected) {
        return json({ ok: false, error: 'instagram_not_connected' }, 400);
      }
      if (!gate.ok) {
        return json(
          {
            ok: false,
            error: 'below_min_assets',
            count: gate.count,
            minRequired: AUTOPILOT_MIN_ELIGIBLE_ASSETS,
            scopeCounts,
          },
          400
        );
      }
      const period = defaultPeriod();
      const periodStart = String(body.periodStart ?? period.start).slice(0, 10);
      const periodEnd = String(body.periodEnd ?? period.end).slice(0, 10);
      const history = await loadHistory(db, membership.id);
      const built = await buildAndInsertAutopilotPlan(
        db,
        membership,
        periodStart,
        periodEnd,
        assets,
        history
      );
      const { data: updatedSettings, error: setErr } = await db
        .from('content_autopilot_settings')
        .update({
          enabled: true,
          paused: false,
          consent_confirmed_at: new Date().toISOString(),
          last_activated_at: new Date().toISOString(),
        })
        .eq('org_id', membership.org_id)
        .eq('membership_id', membership.id)
        .select('*')
        .single();
      if (setErr) throw setErr;

      return json({
        ok: true,
        settings: updatedSettings,
        planId: built.planId,
        slotCount: built.slotCount,
        skipped: built.skipped,
      });
    }

    if (action === 'pause') {
      const { data, error } = await db
        .from('content_autopilot_settings')
        .update({ paused: true, last_paused_at: new Date().toISOString() })
        .eq('membership_id', membership.id)
        .select('*')
        .single();
      if (error) throw error;
      return json({ ok: true, settings: data });
    }

    if (action === 'resume') {
      if (!connected) return json({ ok: false, error: 'instagram_not_connected' }, 400);
      if (!gate.ok) return json({ ok: false, error: 'below_min_assets', count: gate.count }, 400);
      const { data, error } = await db
        .from('content_autopilot_settings')
        .update({ paused: false, enabled: true })
        .eq('membership_id', membership.id)
        .select('*')
        .single();
      if (error) throw error;
      return json({ ok: true, settings: data });
    }

    if (action === 'deactivate') {
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
      const { data, error } = await db
        .from('content_autopilot_settings')
        .update({ enabled: false, paused: false })
        .eq('membership_id', membership.id)
        .select('*')
        .single();
      if (error) throw error;
      return json({ ok: true, settings: data });
    }

    if (action === 'replan') {
      if (!connected) return json({ ok: false, error: 'instagram_not_connected' }, 400);
      if (!gate.ok) return json({ ok: false, error: 'below_min_assets', count: gate.count }, 400);
      const period = defaultPeriod();
      const periodStart = String(body.periodStart ?? period.start).slice(0, 10);
      const periodEnd = String(body.periodEnd ?? period.end).slice(0, 10);
      const history = await loadHistory(db, membership.id);
      const built = await buildAndInsertAutopilotPlan(
        db,
        membership,
        periodStart,
        periodEnd,
        assets,
        history
      );
      return json({
        ok: true,
        planId: built.planId,
        slotCount: built.slotCount,
        skipped: built.skipped,
      });
    }

    return json({ ok: false, error: 'unknown_action' }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'internal_error';
    console.error('content_autopilot_error', msg);
    return json({ ok: false, error: 'internal_error' }, 500);
  }
});
