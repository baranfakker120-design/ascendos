// AscendOS Edge Function: content-daily-prepare (Dashboard-Version, alles in einer Datei)
// Name der Function MUSS exakt lauten: content-daily-prepare
//
// GENERIERT von scripts/bundle-functions.mjs — NICHT von Hand ändern.
// Quelle: supabase/functions/content-daily-prepare/index.ts

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

// ---- inline: _shared/content-research/index.ts ----


// ---- inline: _shared/content-generate/cleanCheck.ts ----
const SPAM_HASHTAGS = new Set([
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
  'instalike',
  'followme',
]);

const ENGAGEMENT_BAIT =
  /\b(like\s*and\s*share|like\s*for\s*like|comment\s*yes|tag\s*(3|three)\s*friends|double\s*tap|smash\s*that|follow\s*for\s*follow)\b/i;

const MISLEADING_CLAIMS =
  /\b(guaranteed\s*income|passive\s*income\s*guaranteed|get\s*rich|make\s*\$?\d+|earn\s*\$?\d+k?|miracle\s*cure|100\s*%\s*safe\s*from\s*shadowban|shadowban[\s-]*proof|instagram\s*guaranteed|financial\s*freedom\s*guaranteed)\b/i;

const RISKY_TERMS =
  /\b(shadowban\s*hack|algorithm\s*hack|bot\s*growth|buy\s*followers|fake\s*engagement)\b/i;

export const CLEAN_CHECK_DISCLAIMER =
  'Clean Check is a technical precaution only — not a guarantee of Instagram compliance or protection from reach loss.';

function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#/, '').toLowerCase();
}

function detectKeywordStuffing(caption: string, keywords: string[]): boolean {
  if (!caption || keywords.length < 3) return false;
  const lower = caption.toLowerCase();
  let hits = 0;
  for (const kw of keywords) {
    const k = kw.trim().toLowerCase();
    if (k.length < 3) continue;
    if (lower.includes(k)) hits += 1;
  }
  return hits >= Math.min(keywords.length, 5) && hits / Math.max(keywords.length, 1) >= 0.7;
}

export function runHeuristicCleanCheck(input: {
  hook: string;
  caption: string;
  cta: string;
  keywords: string[];
  hashtags: string[];
  llmFlags: string[];
}): { status: 'clean' | 'attention'; notes: string[] } {
  const notes: string[] = [];
  const hashtags = input.hashtags.map(normalizeTag).filter(Boolean);
  const blob = [input.hook, input.caption, input.cta, ...input.keywords, ...hashtags].join('\n');

  if (hashtags.length > 18) notes.push('Too many hashtags (keep a focused set).');
  if (hashtags.length > 0 && new Set(hashtags).size < hashtags.length) {
    notes.push('Repeated hashtags detected.');
  }
  const spamTags = hashtags.filter((h) => SPAM_HASHTAGS.has(h));
  if (spamTags.length > 0) {
    notes.push(`Generic/spam-leaning hashtags: ${spamTags.map((h) => `#${h}`).join(', ')}`);
  }
  if (ENGAGEMENT_BAIT.test(blob)) notes.push('Aggressive engagement-bait phrasing detected.');
  if (MISLEADING_CLAIMS.test(blob)) {
    notes.push('Potentially misleading or absolute claim language detected.');
  }
  if (RISKY_TERMS.test(blob)) {
    notes.push('Potentially risky growth/manipulation language detected.');
  }
  const letters = input.caption.replace(/[^A-Za-zÄÖÜäöüß]/g, '');
  if (letters.length >= 24) {
    const caps = letters.replace(/[^A-ZÄÖÜ]/g, '').length;
    if (caps / letters.length >= 0.45) notes.push('Caption uses excessive capitalization.');
  }
  if ((input.caption.match(/!/g) ?? []).length >= 4) {
    notes.push('Caption uses many exclamation marks.');
  }
  if (detectKeywordStuffing(input.caption, input.keywords)) {
    notes.push('Caption looks keyword-stuffed.');
  }
  for (const flag of input.llmFlags) {
    const f = flag.trim();
    if (f) notes.push(f);
  }
  notes.push(CLEAN_CHECK_DISCLAIMER);
  return { status: notes.length > 1 ? 'attention' : 'clean', notes };
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

// ---- inline: _shared/content-generate/parse.ts ----
export function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] ?? text).trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('invalid_ai_json');
  return JSON.parse(raw.slice(start, end + 1));
}

export function asStringArray(v: unknown, max = 24): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== 'string') continue;
    const s = item.trim();
    if (!s) continue;
    out.push(s.replace(/^#/, ''));
    if (out.length >= max) break;
  }
  return out;
}

export function asNullableString(v: unknown, max = 2000): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  return s.slice(0, max);
}

export function normalizeFormat(v: unknown, fallback: ContentFormat): ContentFormat {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (s === 'story' || s === 'feed' || s === 'reel') return s;
  return fallback;
}

function parseKeywordDetails(v: unknown, fallbackKeywords: string[]): KeywordDetail[] {
  const out: KeywordDetail[] = [];
  if (Array.isArray(v)) {
    for (const item of v) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const keyword = asNullableString(o.keyword ?? o.term ?? o.text, 120);
      const why = asNullableString(o.why ?? o.reason ?? o.begründung ?? o.begruendung, 400);
      if (!keyword || !why) continue;
      out.push({ keyword, why });
      if (out.length >= 12) break;
    }
  }
  if (out.length > 0) return out;
  return fallbackKeywords.slice(0, 8).map((keyword) => ({
    keyword,
    why: 'Abgeleitet aus Themen- und Zielgruppenkontext des Contents.',
  }));
}

function parseHashtagDetails(v: unknown, tags: string[]): HashtagDetail[] {
  const map = new Map<string, string>();
  if (Array.isArray(v)) {
    for (const item of v) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const tag = asNullableString(o.tag ?? o.hashtag ?? o.text, 80)?.replace(/^#/, '');
      const why = asNullableString(o.why ?? o.reason ?? o.begründung ?? o.begruendung, 400);
      if (!tag || !why) continue;
      map.set(tag.toLowerCase(), why);
    }
  }
  return tags.map((tag) => ({
    tag,
    why:
      map.get(tag.toLowerCase()) ??
      'Strategische Einschätzung auf Basis von Thema, Zielgruppe und Nischenrelevanz.',
  }));
}

function parseSlides(v: unknown, slideCount: number): SlideAnalysis[] {
  const out: SlideAnalysis[] = [];
  if (Array.isArray(v)) {
    for (const item of v) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const indexRaw = Number(o.index ?? o.slide ?? out.length + 1);
      const index = Number.isFinite(indexRaw) ? Math.floor(indexRaw) : out.length + 1;
      const summary = asNullableString(o.summary ?? o.what ?? o.text, 600) ?? '';
      const role = asNullableString(o.role ?? o.purpose, 200) ?? '';
      if (!summary && !role) continue;
      out.push({
        index,
        summary,
        role,
        issue: asNullableString(o.issue ?? o.problem, 400),
        fix: asNullableString(o.fix ?? o.improvement, 400),
      });
    }
  }
  if (slideCount <= 1) return out;
  // Ensure one entry per slide index when possible.
  const byIndex = new Map(out.map((s) => [s.index, s]));
  const filled: SlideAnalysis[] = [];
  for (let i = 1; i <= slideCount; i++) {
    filled.push(
      byIndex.get(i) ?? {
        index: i,
        summary: `Slide ${i}`,
        role: i === 1 ? 'hook' : i === slideCount ? 'close' : 'support',
        issue: null,
        fix: null,
      }
    );
  }
  return filled;
}

function normalizeHookStrength(v: unknown): 'strong' | 'ok' | 'weak' | null {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (s === 'strong' || s === 'ok' || s === 'weak') return s;
  if (s === 'good' || s === 'solid') return 'ok';
  if (s === 'poor' || s === 'bad') return 'weak';
  return null;
}

/**
 * Enforce exactly REQUIRED_HASHTAG_COUNT unique hashtags.
 * Prefer LLM order, then research tags if provided later by caller.
 */
export function enforceExactHashtagCount(
  tags: string[],
  extras: string[] = [],
  count = REQUIRED_HASHTAG_COUNT
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...tags, ...extras]) {
    const tag = raw.trim().replace(/^#/, '').toLowerCase();
    if (!tag || seen.has(tag)) continue;
    // Keep original casing from first occurrence.
    const original = raw.trim().replace(/^#/, '');
    seen.add(tag);
    out.push(original);
    if (out.length >= count) break;
  }
  // Pad with generic niche-safe placeholders only if model under-delivered —
  // caller should prefer research extras; still keep length exact for product rule.
  let i = 1;
  while (out.length < count) {
    const pad = `ascendcontent${i}`;
    if (!seen.has(pad)) {
      seen.add(pad);
      out.push(pad);
    }
    i += 1;
  }
  return out.slice(0, count);
}

export function parseGeneration(
  raw: unknown,
  formatFallback: ContentFormat,
  options?: { slideCount?: number }
): GenerationPayload {
  if (!raw || typeof raw !== 'object') throw new Error('invalid_ai_json');
  const o = raw as Record<string, unknown>;
  const visual = asNullableString(o.visual_summary, 4000);
  if (!visual) throw new Error('missing_visual_summary');

  const hook = asNullableString(o.hook, 280) ?? '';
  const caption = asNullableString(o.caption, 2200) ?? '';
  const cta = asNullableString(o.cta, 280) ?? '';
  if (!hook || !caption) throw new Error('missing_draft_fields');

  const keywords = asStringArray(o.keywords, 16);
  const hashtagsRaw = asStringArray(o.hashtags, 18);
  const hashtags = enforceExactHashtagCount(hashtagsRaw);
  const slideCount = options?.slideCount ?? 1;

  return {
    visual_summary: visual,
    theme: asNullableString(o.theme, 200),
    audience_hint: asNullableString(o.audience_hint, 400),
    mood: asNullableString(o.mood, 120),
    content_category: asNullableString(o.content_category, 120),
    message: asNullableString(o.message, 400),
    product_hint: asNullableString(o.product_hint, 200),
    uncertain: asStringArray(o.uncertain, 12),
    content_type: normalizeFormat(o.content_type ?? o.format, formatFallback),
    content_intent: asNullableString(o.content_intent ?? o.intent, 400),
    core_message: asNullableString(o.core_message ?? o.message, 400),
    problem: asNullableString(o.problem, 400),
    emotion: asNullableString(o.emotion, 200),
    why_swipe: asNullableString(o.why_swipe, 400),
    why_save: asNullableString(o.why_save, 400),
    why_share: asNullableString(o.why_share, 400),
    hook,
    hook_strength: normalizeHookStrength(o.hook_strength),
    hook_alternatives: asStringArray(o.hook_alternatives, 3),
    caption,
    keywords,
    keyword_details: parseKeywordDetails(o.keyword_details ?? o.keywords_detail, keywords),
    hashtags,
    hashtag_details: parseHashtagDetails(o.hashtag_details ?? o.hashtags_detail, hashtags),
    cta,
    target_audience: asNullableString(o.target_audience, 400),
    posting_hint: asNullableString(o.posting_hint, 400),
    optimization: asNullableString(o.optimization ?? o.optimierung, 2000),
    slides: parseSlides(o.slides ?? o.carousel_slides, slideCount),
    llm_clean_flags: asStringArray(o.llm_clean_flags ?? o.clean_check_flags, 12),
  };
}

// ---- inline: _shared/content-generate/prompts.ts ----
export function buildSystemPrompt(locale: string): string {
  return `You are AscendOS Content Assistant. Analyze the REAL media (image or video) the user provides.
Do NOT invent details you cannot see. If unsure, list the uncertainty in "uncertain" and keep related fields null or cautious.
Never claim shadowban safety or Instagram guarantees.
Never invent income, health, or miracle claims.
Never claim hashtags are "trending", "viral right now", or "currently popular" — you have no live trend feed.
Write captions that sound natural for the audience — not robotic, not keyword-stuffed, not spammy.
Hashtags must match the actual content. Do NOT default to fyp/viral/explore/trending (omit them unless you can give a concrete strategic reason for THIS content).
If the media is unclear or nearly empty, say so in uncertain and keep hashtags sparse.
No black-hat, scraping, bots, or fake-engagement advice.

Always follow this internal order before writing the final JSON:
1) Content analysis 2) Audience 3) Theme/core message 4) Content intent
5) Hook potential 6) Structure 7) Keywords 8) Candidate hashtags
9) Score hashtags 10) Select EXACTLY 5 best hashtags 11) Hook 12) Caption 13) CTA 14) Optimization notes

Respond with ONE JSON object only (no markdown) using this shape:
{
  "visual_summary": string,
  "theme": string|null,
  "audience_hint": string|null,
  "mood": string|null,
  "content_category": string|null,
  "message": string|null,
  "product_hint": string|null,
  "uncertain": string[],
  "content_type": "story"|"feed"|"reel",
  "content_intent": string|null,
  "core_message": string|null,
  "problem": string|null,
  "emotion": string|null,
  "why_swipe": string|null,
  "why_save": string|null,
  "why_share": string|null,
  "hook": string,
  "hook_strength": "strong"|"ok"|"weak"|null,
  "hook_alternatives": string[],
  "caption": string,
  "keywords": string[],
  "keyword_details": [{"keyword": string, "why": string}],
  "hashtags": string[],
  "hashtag_details": [{"tag": string, "why": string}],
  "cta": string,
  "target_audience": string|null,
  "posting_hint": string|null,
  "optimization": string|null,
  "slides": [{"index": number, "summary": string, "role": string, "issue": string|null, "fix": string|null}],
  "llm_clean_flags": string[]
}

Rules for hashtags:
- Return EXACTLY 5 hashtags in "hashtags" (no # prefix) and EXACTLY 5 objects in "hashtag_details".
- Each hashtag_details.why must explain why THIS tag fits THIS content (theme, audience, niche).
- Prefer specific niche tags over generic vanity tags.
- If you cannot justify live popularity, say so as strategic estimate from theme/audience — never invent metrics.

Caption style: sound like a real creator. Avoid clichés like "Tauche ein…", "Entdecke die Welt…", "In der heutigen schnelllebigen Welt…", "Du wirst es nicht glauben…".

Language for hook/caption/cta/keywords/hashtags/why text: ${locale}.
llm_clean_flags: short notes about spam risk, misleading claims, or engagement bait you still see in YOUR draft (empty if none).`;
}

export function buildUserPrompt(params: {
  format: ContentFormat;
  fileName: string;
  title: string | null;
  mediaKind: string;
  aspectRatio: string | null;
  locale: string;
}): string {
  return [
    `Requested content format: ${params.format}`,
    `Media kind: ${params.mediaKind}`,
    `Aspect ratio hint: ${params.aspectRatio ?? 'unknown'}`,
    `Asset title (may be wrong — trust the media first): ${params.title ?? ''}`,
    `File name (may be wrong — trust the media first): ${params.fileName}`,
    `Output language: ${params.locale}`,
    'Analyze the attached media and produce the JSON draft.',
    'Return EXACTLY 5 hashtags with reasons.',
  ].join('\n');
}

export function buildCarouselSystemPrompt(locale: string): string {
  return `${buildSystemPrompt(locale)}

CAROUSEL MODE (critical):
You receive MULTIPLE slides as ONE Instagram carousel content piece.
Do NOT analyze slides as independent posts.
Analyze each slide AND the relationship, order, story arc, emotional path, redundancy, weak slides, missing info, save/share potential, and CTA fit across the whole set.
Slide 1 must be evaluated as the hook slide.
Fill "slides" for EVERY attached slide (1-based index matching attachment order).
content_type must be "feed" for carousels.`;
}

export function buildCarouselUserPrompt(params: {
  format: ContentFormat;
  locale: string;
  slides: Array<{
    index: number;
    fileName: string;
    title: string | null;
    aspectRatio: string | null;
  }>;
}): string {
  const slideLines = params.slides.map(
    (s) =>
      `Slide ${s.index}: file=${s.fileName}; title=${s.title ?? ''}; aspect=${s.aspectRatio ?? 'unknown'}`
  );
  return [
    `Requested content format: ${params.format} (Instagram carousel)`,
    `Slide count: ${params.slides.length}`,
    `Output language: ${params.locale}`,
    'Slides in FINAL publish order:',
    ...slideLines,
    'Analyze ALL attached images together as one carousel.',
    'Return EXACTLY 5 hashtags with reasons.',
    'Fill optimization with concrete order/story/CTA improvements when needed (no fake numeric scores).',
  ].join('\n');
}

// ---- inline: _shared/content-generate/vision.ts ----
/** Stable error codes for edge + frontend (never API keys / secrets). */
export function visionError(code: VisionErrorCode): Error {
  return new Error(code);
}

/** Carrier for sanitized OpenRouter diagnostics (message stays the stable code). */
export class VisionFailureError extends Error {
  readonly code: VisionErrorCode;
  readonly errorDetails: ProviderErrorDetails | undefined;

  constructor(code: VisionErrorCode, errorDetails?: ProviderErrorDetails) {
    super(code);
    this.name = 'VisionFailureError';
    this.code = code;
    this.errorDetails = errorDetails;
  }
}

export function isVisionVideoMime(mime: string): mime is VisionVideoMime {
  return (VISION_VIDEO_MIMES as readonly string[]).includes(mime);
}

/**
 * Prefer asset mime when Content-Type is generic/missing; never invent image/*.
 */
export function resolveVisionVideoMime(
  assetMimeType: string,
  responseContentType: string | null | undefined
): VisionVideoMime {
  const asset = assetMimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  const header = (responseContentType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';

  if (isVisionVideoMime(asset)) return asset;
  if (isVisionVideoMime(header)) return header;
  throw visionError('VIDEO_UNSUPPORTED_MIME');
}

export function bytesToBase64(bytes: Uint8Array): string {
  // Chunked to avoid call-stack / argument limits on large videos.
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
}

export function buildVideoDataUrl(mimeType: VisionVideoMime, bytes: Uint8Array): string {
  return `data:${mimeType};base64,${bytesToBase64(bytes)}`;
}

/** OpenRouter multimodal part — video uses data URL, never image_url. */
export function buildVisionMediaPart(params: {
  mediaKind: 'image' | 'video';
  signedUrl: string;
  videoDataUrl?: string;
}): { type: string; image_url?: { url: string }; video_url?: { url: string } } {
  if (params.mediaKind === 'video') {
    if (!params.videoDataUrl?.startsWith('data:video/')) {
      throw visionError('VIDEO_FETCH_FAILED');
    }
    return {
      type: 'video_url',
      video_url: { url: params.videoDataUrl },
    };
  }
  return {
    type: 'image_url',
    image_url: { url: params.signedUrl },
  };
}

export function mapHttpStatusToVisionCode(status: number): VisionErrorCode {
  if (status === 400) return 'AI_PROVIDER_BAD_REQUEST';
  if (status === 401 || status === 403) return 'AI_PROVIDER_AUTH_ERROR';
  if (status === 429) return 'AI_PROVIDER_RATE_LIMIT';
  if (status === 408 || status === 504) return 'AI_PROVIDER_TIMEOUT';
  return 'AI_PROVIDER_ERROR';
}

/** Strip secrets, signed URLs, data-URLs, and long base64 from diagnostic text. */
export function sanitizeProviderText(value: unknown, maxLen: number): string | null {
  if (value == null) return null;
  let s = typeof value === 'string' ? value : String(value);
  s = s.replace(/data:[^;\s]+;base64,[A-Za-z0-9+/=\s]+/gi, '[data_url_redacted]');
  s = s.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
  s = s.replace(/sk-[A-Za-z0-9_-]{8,}/g, '[key_redacted]');
  s = s.replace(
    /https?:\/\/[^\s"'<>]+(?:token|sig|signature|apikey|api_key)=[^\s"'<>]+/gi,
    '[signed_url_redacted]'
  );
  s = s.replace(/(?:token|sig|signature|apikey|api_key)=[^\s"'&<>]+/gi, '[token_redacted]');
  // Only redact base64-looking blobs (padding or +/), not long plain words.
  s = s.replace(/[A-Za-z0-9+/]{40,}={1,2}/g, '[base64_redacted]');
  s = s.replace(/[A-Za-z0-9]{16,}[+/][A-Za-z0-9+/=]{40,}/g, '[base64_redacted]');
  s = s.replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function sanitizeErrorCode(value: unknown): string | number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') return sanitizeProviderText(value, 80);
  return null;
}

/**
 * Build persistable OpenRouter diagnostics from status + raw body.
 * Never includes Authorization, keys, data URLs, or full media payloads.
 */
export function extractProviderErrorDetails(
  status: number,
  contentType: string | null | undefined,
  bodyText: string
): ProviderErrorDetails {
  const details: ProviderErrorDetails = {
    http_status: Number.isFinite(status) ? status : null,
    content_type: sanitizeProviderText(contentType ?? null, 120),
    body_length: bodyText.length,
  };

  const trimmed = bodyText.trim();
  if (!trimmed) return details;

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const errRaw = parsed.error ?? parsed;
    if (typeof errRaw === 'string') {
      details.error_message = sanitizeProviderText(errRaw, 500);
      return details;
    }
    if (errRaw && typeof errRaw === 'object') {
      const err = errRaw as Record<string, unknown>;
      details.error_message = sanitizeProviderText(err.message, 500);
      details.error_code = sanitizeErrorCode(err.code);
      details.error_type = sanitizeProviderText(err.type, 120);
      const meta = err.metadata;
      if (meta && typeof meta === 'object') {
        const m = meta as Record<string, unknown>;
        details.provider_name = sanitizeProviderText(
          m.provider_name ?? m.provider ?? null,
          120
        );
      }
      return details;
    }
    details.error_message = sanitizeProviderText('unrecognized_json_error', 80);
    return details;
  } catch {
    // Sanitize a wider window first, then hard-cap preview length.
    const cleaned = sanitizeProviderText(trimmed.slice(0, 4000), 4000);
    details.body_preview = cleaned ? cleaned.slice(0, 1000) : null;
    return details;
  }
}

export function mapProviderFailureToVisionCode(err: unknown): VisionErrorCode {
  if (err instanceof VisionFailureError) return err.code;
  if (err instanceof ProviderError) {
    if (err.code === 'timeout') return 'AI_PROVIDER_TIMEOUT';
    if (err.code === 'rate_limited') return 'AI_PROVIDER_RATE_LIMIT';
    if (err.message.includes('401') || err.message.includes('403')) {
      return 'AI_PROVIDER_AUTH_ERROR';
    }
    if (err.message.includes('429')) return 'AI_PROVIDER_RATE_LIMIT';
    if (err.message.includes('400') || err.message.includes('Bad Request')) {
      return 'AI_PROVIDER_BAD_REQUEST';
    }
    return 'AI_PROVIDER_ERROR';
  }
  if (err instanceof Error) {
    const msg = err.message;
    if (
      msg === 'VIDEO_FETCH_FAILED' ||
      msg === 'VIDEO_TOO_LARGE' ||
      msg === 'VIDEO_UNSUPPORTED_MIME' ||
      msg === 'AI_PROVIDER_BAD_REQUEST' ||
      msg === 'AI_PROVIDER_AUTH_ERROR' ||
      msg === 'AI_PROVIDER_RATE_LIMIT' ||
      msg === 'AI_PROVIDER_TIMEOUT' ||
      msg === 'AI_PROVIDER_ERROR' ||
      msg === 'missing_openrouter_key'
    ) {
      return msg;
    }
    if (msg.includes('timeout') || msg.includes('Zeitüberschreitung')) {
      return 'AI_PROVIDER_TIMEOUT';
    }
    if (msg.includes('401') || msg.includes('403')) return 'AI_PROVIDER_AUTH_ERROR';
    if (msg.includes('429')) return 'AI_PROVIDER_RATE_LIMIT';
    if (msg.includes('400') || msg.includes('Bad Request')) {
      return 'AI_PROVIDER_BAD_REQUEST';
    }
  }
  return 'AI_PROVIDER_ERROR';
}

/**
 * Download private storage object server-side. Checks size before buffering.
 * Does not log URL query tokens.
 */
export async function fetchVideoForVision(params: {
  signedUrl: string;
  assetMimeType: string;
  maxBytes?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<{ mimeType: VisionVideoMime; bytes: Uint8Array; dataUrl: string }> {
  const maxBytes = params.maxBytes ?? VISION_VIDEO_MAX_BYTES;
  const timeoutMs = params.timeoutMs ?? VISION_VIDEO_FETCH_TIMEOUT_MS;
  const fetchImpl = params.fetchImpl ?? fetch;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetchImpl(params.signedUrl, { method: 'GET', signal: controller.signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw visionError('AI_PROVIDER_TIMEOUT');
    }
    throw visionError('VIDEO_FETCH_FAILED');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw visionError('VIDEO_FETCH_FAILED');
  }

  const lenHeader = res.headers.get('content-length');
  if (lenHeader) {
    const n = Number(lenHeader);
    if (Number.isFinite(n) && n > maxBytes) {
      throw visionError('VIDEO_TOO_LARGE');
    }
  }

  const mimeType = resolveVisionVideoMime(
    params.assetMimeType,
    res.headers.get('content-type')
  );

  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength === 0) {
    throw visionError('VIDEO_FETCH_FAILED');
  }
  if (buf.byteLength > maxBytes) {
    throw visionError('VIDEO_TOO_LARGE');
  }

  return {
    mimeType,
    bytes: buf,
    dataUrl: buildVideoDataUrl(mimeType, buf),
  };
}

function parseVisionSuccessText(
  status: number,
  contentType: string | null,
  bodyText: string
): string {
  const details = extractProviderErrorDetails(status, contentType, bodyText);
  let json: { choices?: Array<{ message?: { content?: string } }> };
  try {
    json = JSON.parse(bodyText) as typeof json;
  } catch {
    throw new VisionFailureError('AI_PROVIDER_ERROR', details);
  }
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new VisionFailureError('AI_PROVIDER_ERROR', {
      ...details,
      error_message: details.error_message ?? 'empty_vision_content',
    });
  }
  return text;
}

async function requestVisionCompletion(params: {
  system: string;
  content: Array<Record<string, unknown>>;
  maxTokens?: number;
}): Promise<{ text: string; model: string; provider: string }> {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!apiKey) {
    throw visionError('missing_openrouter_key');
  }

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
          'X-Title': 'AscendOS Content Assistant',
        },
        body: JSON.stringify({
          model: VISION_MODEL,
          temperature: 0.35,
          max_tokens: params.maxTokens ?? 2200,
          messages: [
            { role: 'system', content: params.system },
            { role: 'user', content: params.content },
          ],
        }),
      },
      VISION_TIMEOUT_MS
    );

    const contentType = res.headers.get('content-type');
    let bodyText = '';
    try {
      bodyText = await res.text();
    } catch {
      bodyText = '';
    }

    const errorDetails = extractProviderErrorDetails(res.status, contentType, bodyText);

    if (!res.ok) {
      const code = mapHttpStatusToVisionCode(res.status);
      // Sanitized only — never Authorization, data URLs, or media bytes.
      console.error('openrouter_vision_upstream', { code, ...errorDetails });
      throw new VisionFailureError(code, errorDetails);
    }

    const text = parseVisionSuccessText(res.status, contentType, bodyText);
    return { text, model: VISION_MODEL, provider: 'openrouter' };
  } catch (e) {
    if (e instanceof VisionFailureError) throw e;
    if (e instanceof Error && e.message.startsWith('VIDEO_')) throw e;
    if (e instanceof Error && e.message.startsWith('AI_PROVIDER_')) throw e;
    if (e instanceof Error && e.message === 'missing_openrouter_key') throw e;
    const code = mapProviderFailureToVisionCode(e);
    throw new VisionFailureError(code);
  }
}

export async function callVisionModel(params: {
  system: string;
  userText: string;
  mediaKind: 'image' | 'video';
  mimeType: string;
  signedUrl: string;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}): Promise<{ text: string; model: string; provider: string }> {
  let videoDataUrl: string | undefined;
  if (params.mediaKind === 'video') {
    if (!isVisionVideoMime(params.mimeType.split(';')[0]?.trim().toLowerCase() ?? '')) {
      throw visionError('VIDEO_UNSUPPORTED_MIME');
    }
    const fetched = await fetchVideoForVision({
      signedUrl: params.signedUrl,
      assetMimeType: params.mimeType,
      fetchImpl: params.fetchImpl,
    });
    videoDataUrl = fetched.dataUrl;
  }

  const mediaPart = buildVisionMediaPart({
    mediaKind: params.mediaKind,
    signedUrl: params.signedUrl,
    videoDataUrl,
  });

  // Single attempt — no image_url fallback for MOV/mp4/webm (Gemini rejects that).
  const content = [{ type: 'text', text: params.userText }, mediaPart];
  return requestVisionCompletion({ system: params.system, content });
}

/**
 * Multi-image carousel analysis — all slides in one multimodal request.
 * Images only (signed URLs). Order of imageUrls is publish order.
 */
export async function callVisionModelCarousel(params: {
  system: string;
  userText: string;
  imageUrls: string[];
}): Promise<{ text: string; model: string; provider: string }> {
  if (params.imageUrls.length < 2) {
    throw new Error('carousel_requires_multiple_images');
  }
  const content: Array<Record<string, unknown>> = [
    { type: 'text', text: params.userText },
  ];
  for (let i = 0; i < params.imageUrls.length; i++) {
    content.push({ type: 'text', text: `Slide ${i + 1}:` });
    content.push(
      buildVisionMediaPart({
        mediaKind: 'image',
        signedUrl: params.imageUrls[i],
      })
    );
  }
  return requestVisionCompletion({
    system: params.system,
    content,
    maxTokens: 3200,
  });
}

// ---- inline: _shared/content-generate/index.ts ----
/**
 * Shared content generation core (Vision → Research → Clean Check → Draft).
 * Used by content-assistant (user JWT) and content-daily-prepare (service role).
 * Never publishes to Instagram.
 */


/** Minimal DB surface — avoid jsr imports inside _shared (breaks dashboard bundle). */
// deno-lint-ignore no-explicit-any
type DbClient = any;


const DRAFT_SELECT =
  'id, org_id, asset_id, carousel_asset_ids, analysis_json, owner_membership_id, format, hook, caption, cta, keywords, hashtags, clean_check_status, clean_check_notes, target_audience, posting_hint, content_score, status, created_at, updated_at';

export function canPersistAssetAnalysis(asset: AssetRow, membership: MembershipRow): boolean {
  if (asset.scope === 'personal') return asset.owner_membership_id === membership.id;
  return membership.role === 'super_admin' || membership.role === 'developer';
}

export function resolveDailyGenerationLimit(settings: Record<string, unknown>): number {
  const dailyLimitRaw = Number(settings.content_daily_generation_limit);
  return Number.isFinite(dailyLimitRaw) && dailyLimitRaw > 0
    ? Math.min(500, Math.floor(dailyLimitRaw))
    : DEFAULT_DAILY_GENERATION_LIMIT;
}

/** UTC day start — same contract as existing content-assistant quota. */
export function utcDayStartIso(now = new Date()): string {
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  return dayStart.toISOString();
}

export async function countGenerationsToday(
  db: DbClient,
  membershipId: string,
  now = new Date()
): Promise<number> {
  const { count, error } = await db
    .from('content_drafts')
    .select('id', { count: 'exact', head: true })
    .eq('owner_membership_id', membershipId)
    .gte('created_at', utcDayStartIso(now));
  if (error) throw error;
  return count ?? 0;
}

export interface GenerateDraftResult {
  draft: Record<string, unknown>;
  analysis: Record<string, unknown>;
  research: Record<string, unknown>;
  cleanCheck: { status: 'clean' | 'attention'; notes: string[]; isGuarantee: false };
  assetAnalysisPersisted: boolean;
  assetAnalysisMode: 'persisted' | 'persist_failed' | 'draft_only_central_or_foreign';
  parsed: GenerationPayload;
}

function finalizeHashtags(
  parsed: GenerationPayload,
  research: HashtagResearchResult
): { tags: string[]; details: GenerationPayload['hashtag_details'] } {
  const researchTags = research.recommended.map((c) => c.tag);
  const tags = enforceExactHashtagCount(parsed.hashtags, researchTags, REQUIRED_HASHTAG_COUNT);
  const whyByTag = new Map<string, string>();
  for (const d of parsed.hashtag_details) {
    whyByTag.set(d.tag.toLowerCase(), d.why);
  }
  for (const c of research.recommended) {
    if (!whyByTag.has(c.tag.toLowerCase())) {
      whyByTag.set(
        c.tag.toLowerCase(),
        'Strategische Einschätzung auf Basis von Thema, Zielgruppe und Nischenrelevanz.'
      );
    }
  }
  const details = tags.map((tag) => ({
    tag,
    why:
      whyByTag.get(tag.toLowerCase()) ??
      'Strategische Einschätzung auf Basis von Thema, Zielgruppe und Nischenrelevanz.',
  }));
  return { tags, details };
}

function buildAnalysisJson(params: {
  vision: { provider: string; model: string };
  parsed: GenerationPayload;
  researchPayload: Record<string, unknown>;
  hashtagDetails: GenerationPayload['hashtag_details'];
  carouselAssetIds: string[];
}): Record<string, unknown> {
  const { vision, parsed, researchPayload, hashtagDetails, carouselAssetIds } = params;
  return {
    provider: vision.provider,
    model: vision.model,
    visual_summary: parsed.visual_summary,
    theme: parsed.theme,
    audience_hint: parsed.audience_hint,
    mood: parsed.mood,
    content_category: parsed.content_category,
    message: parsed.message,
    core_message: parsed.core_message,
    content_intent: parsed.content_intent,
    problem: parsed.problem,
    emotion: parsed.emotion,
    why_swipe: parsed.why_swipe,
    why_save: parsed.why_save,
    why_share: parsed.why_share,
    product_hint: parsed.product_hint,
    uncertain: parsed.uncertain,
    hook_strength: parsed.hook_strength,
    hook_alternatives: parsed.hook_alternatives,
    keyword_details: parsed.keyword_details,
    hashtag_details: hashtagDetails,
    slides: parsed.slides,
    optimization: parsed.optimization,
    carousel_asset_ids: carouselAssetIds,
    generated_at: new Date().toISOString(),
    research: researchPayload,
  };
}

async function persistPrimaryAssetAnalysis(params: {
  db: DbClient;
  asset: AssetRow;
  membership: MembershipRow;
  parsed: GenerationPayload;
  analysisJson: Record<string, unknown>;
  forcePersistAsset?: boolean;
}): Promise<{
  assetAnalysisPersisted: boolean;
  assetAnalysisMode: GenerateDraftResult['assetAnalysisMode'];
}> {
  const persistAsset =
    params.forcePersistAsset || canPersistAssetAnalysis(params.asset, params.membership);
  if (!persistAsset) {
    return {
      assetAnalysisPersisted: false,
      assetAnalysisMode: 'draft_only_central_or_foreign',
    };
  }
  const { data: usageRow } = await params.db
    .from('content_assets')
    .select('usage_count')
    .eq('id', params.asset.id)
    .maybeSingle();
  const { error: assetUpdateError } = await params.db
    .from('content_assets')
    .update({
      analysis_status: 'ready',
      detected_summary: params.parsed.visual_summary.slice(0, 2000),
      theme: params.parsed.theme,
      mood: params.parsed.mood,
      product_hint: params.parsed.product_hint,
      audience_hint: params.parsed.audience_hint,
      keywords: params.parsed.keywords,
      analysis_json: params.analysisJson,
      last_used_at: new Date().toISOString(),
      usage_count: Number(usageRow?.usage_count ?? 0) + 1,
    })
    .eq('id', params.asset.id);
  return {
    assetAnalysisPersisted: !assetUpdateError,
    assetAnalysisMode: assetUpdateError ? 'persist_failed' : 'persisted',
  };
}

/**
 * Run Vision + research + clean check + draft insert.
 * Always inserts draft with status='draft'. Never publishes.
 */
export async function generateDraftFromAsset(params: {
  db: DbClient;
  asset: AssetRow;
  membership: MembershipRow;
  format: ContentFormat;
  locale: string;
  /** When true (daily job), always attempt asset analysis persist via service role. */
  forcePersistAsset?: boolean;
}): Promise<GenerateDraftResult> {
  return generateDraftFromAssets({
    db: params.db,
    assets: [params.asset],
    membership: params.membership,
    format: params.format,
    locale: params.locale,
    forcePersistAsset: params.forcePersistAsset,
  });
}

/**
 * Single image OR carousel (2–10 images) generation.
 * Videos remain single-asset only.
 */
export async function generateDraftFromAssets(params: {
  db: DbClient;
  assets: AssetRow[];
  membership: MembershipRow;
  format: ContentFormat;
  locale: string;
  forcePersistAsset?: boolean;
}): Promise<GenerateDraftResult> {
  const { db, membership, locale } = params;
  const assets = params.assets.slice(0, CAROUSEL_MAX_ASSETS);
  if (assets.length === 0) throw new Error('asset_id_required');

  const primary = assets[0];
  const isCarousel = assets.length >= 2;
  if (isCarousel) {
    if (assets.some((a) => a.media_kind !== 'image')) {
      throw new Error('carousel_images_only');
    }
  }

  const format: ContentFormat = isCarousel
    ? 'feed'
    : params.format || normalizeFormat(primary.suggested_formats?.[0], 'feed');

  const signedUrls: string[] = [];
  for (const asset of assets) {
    const { data: signed, error: signError } = await db.storage
      .from(CONTENT_ASSETS_BUCKET)
      .createSignedUrl(asset.storage_path, 3600);
    if (signError || !signed?.signedUrl) {
      throw new Error(`signed_url_failed:${signError?.message ?? 'missing'}`);
    }
    signedUrls.push(signed.signedUrl);
  }

  const vision = isCarousel
    ? await callVisionModelCarousel({
        system: buildCarouselSystemPrompt(locale),
        userText: buildCarouselUserPrompt({
          format,
          locale,
          slides: assets.map((a, i) => ({
            index: i + 1,
            fileName: a.file_name,
            title: a.title,
            aspectRatio: a.aspect_ratio,
          })),
        }),
        imageUrls: signedUrls,
      })
    : await callVisionModel({
        system: buildSystemPrompt(locale),
        userText: buildUserPrompt({
          format,
          fileName: primary.file_name,
          title: primary.title,
          mediaKind: primary.media_kind,
          aspectRatio: primary.aspect_ratio,
          locale,
        }),
        mediaKind: primary.media_kind,
        mimeType: primary.mime_type,
        signedUrl: signedUrls[0],
      });

  const parsed = parseGeneration(extractJsonObject(vision.text), format, {
    slideCount: assets.length,
  });
  if (isCarousel) {
    parsed.content_type = 'feed';
  }

  const research: HashtagResearchResult = runHashtagResearch({
    theme: parsed.theme,
    contentCategory: parsed.content_category,
    mood: parsed.mood,
    visualSummary: parsed.visual_summary,
    keywords: parsed.keywords,
    llmHashtags: parsed.hashtags,
    locale,
  });
  const { tags: finalHashtags, details: hashtagDetails } = finalizeHashtags(parsed, research);

  const clean = runHeuristicCleanCheck({
    hook: parsed.hook,
    caption: parsed.caption,
    cta: parsed.cta,
    keywords: parsed.keywords,
    hashtags: finalHashtags,
    llmFlags: parsed.llm_clean_flags,
  });

  const researchPayload = {
    mode: research.mode,
    liveResearchActive: research.liveResearchActive,
    providersUsed: research.providersUsed,
    recommended: research.recommended.slice(0, REQUIRED_HASHTAG_COUNT).map((c, i) => ({
      ...c,
      tag: finalHashtags[i] ?? c.tag,
      reasonText: hashtagDetails[i]?.why,
    })),
    rejected: research.rejected,
    notes: [
      ...research.notes,
      `Exactly ${REQUIRED_HASHTAG_COUNT} hashtags selected for Instagram Content Assistant.`,
    ],
    hashtagApi: 'not_enabled',
  };

  const carouselAssetIds = isCarousel ? assets.map((a) => a.id) : [];
  const analysisJson = buildAnalysisJson({
    vision,
    parsed,
    researchPayload,
    hashtagDetails,
    carouselAssetIds,
  });

  const persist = await persistPrimaryAssetAnalysis({
    db,
    asset: primary,
    membership,
    parsed,
    analysisJson,
    forcePersistAsset: params.forcePersistAsset,
  });

  // Touch usage for additional carousel slides (best-effort).
  if (isCarousel) {
    for (const asset of assets.slice(1)) {
      if (!canPersistAssetAnalysis(asset, membership) && !params.forcePersistAsset) continue;
      await db
        .from('content_assets')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', asset.id);
    }
  }

  const researchHint = formatResearchPostingHint({
    ...research,
    recommended: research.recommended.slice(0, REQUIRED_HASHTAG_COUNT),
  });
  const postingHint = [parsed.posting_hint, researchHint].filter(Boolean).join(' · ');

  const draftInsert = {
    org_id: membership.org_id,
    asset_id: primary.id,
    carousel_asset_ids: carouselAssetIds,
    analysis_json: analysisJson,
    owner_membership_id: membership.id,
    format: isCarousel ? 'feed' : parsed.content_type,
    hook: parsed.hook,
    caption: parsed.caption,
    cta: parsed.cta,
    keywords: parsed.keywords,
    hashtags: finalHashtags,
    clean_check_status: clean.status,
    clean_check_notes: clean.notes.join(' · '),
    target_audience: parsed.target_audience ?? parsed.audience_hint,
    posting_hint: postingHint,
    status: 'draft' as const,
  };

  const { data: draft, error: draftError } = await db
    .from('content_drafts')
    .insert(draftInsert)
    .select(DRAFT_SELECT)
    .single();
  if (draftError) throw draftError;

  return {
    draft: draft as Record<string, unknown>,
    analysis: analysisJson,
    research: researchPayload,
    cleanCheck: {
      status: clean.status,
      notes: clean.notes,
      isGuarantee: false,
    },
    assetAnalysisPersisted: persist.assetAnalysisPersisted,
    assetAnalysisMode: persist.assetAnalysisMode,
    parsed: {
      ...parsed,
      hashtags: finalHashtags,
      hashtag_details: hashtagDetails,
    },
  };
}

export async function markAssetAnalysisFailed(
  db: DbClient,
  asset: AssetRow,
  membership: MembershipRow,
  detail: Record<string, unknown>,
  forcePersist = false
): Promise<void> {
  if (!forcePersist && !canPersistAssetAnalysis(asset, membership)) return;
  await db
    .from('content_assets')
    .update({
      analysis_status: 'failed',
      analysis_json: { ...detail, at: new Date().toISOString() },
    })
    .eq('id', asset.id);
}

// ---- inline: _shared/content-daily/berlinTime.ts ----
/** Europe/Berlin calendar helpers for daily content preparation. */

export const BERLIN_TZ = 'Europe/Berlin';
/** Inclusive start hour; minutes must be < WINDOW_MINUTES. */
export const BERLIN_NOON_HOUR = 12;
export const BERLIN_NOON_WINDOW_MINUTES = 20;

function berlinParts(now: Date): { year: number; month: number; day: number; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: BERLIN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? NaN);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

/** YYYY-MM-DD for the calendar day in Europe/Berlin. */
export function berlinPrepDate(now = new Date()): string {
  const { year, month, day } = berlinParts(now);
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/** True when local Berlin time is 12:00 .. 12:(WINDOW-1). */
export function isBerlinNoonWindow(
  now = new Date(),
  windowMinutes = BERLIN_NOON_WINDOW_MINUTES
): boolean {
  const { hour, minute } = berlinParts(now);
  return hour === BERLIN_NOON_HOUR && minute >= 0 && minute < windowMinutes;
}

/** Subtract calendar days from a YYYY-MM-DD (UTC noon arithmetic is fine for date-only). */
export function subtractDaysFromDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - days);
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ---- inline: _shared/content-daily/assetSelection.ts ----
export interface SelectableAsset {
  id: string;
  scope: 'personal' | 'central' | string;
  owner_membership_id: string;
  media_kind: 'image' | 'video' | string;
  last_used_at: string | null;
  usage_count: number;
  created_at: string;
  suggested_formats: string[] | null;
  aspect_ratio: string | null;
  storage_path: string;
}

export const ASSET_COOLDOWN_DAYS = 7;

/**
 * Rank candidates: personal before central; never-used first;
 * then lowest usage_count; then oldest created_at.
 */
export function rankContentAssets(assets: SelectableAsset[]): SelectableAsset[] {
  return [...assets].sort((a, b) => {
    const scopeRank = (s: string) => (s === 'personal' ? 0 : 1);
    const sa = scopeRank(a.scope);
    const sb = scopeRank(b.scope);
    if (sa !== sb) return sa - sb;

    const aUnused = a.last_used_at == null ? 0 : 1;
    const bUnused = b.last_used_at == null ? 0 : 1;
    if (aUnused !== bUnused) return aUnused - bUnused;

    if (a.usage_count !== b.usage_count) return a.usage_count - b.usage_count;

    return a.created_at.localeCompare(b.created_at);
  });
}

export function filterExcludedAssets(
  assets: SelectableAsset[],
  excludedIds: Set<string>
): SelectableAsset[] {
  return assets.filter((a) => a.storage_path && !excludedIds.has(a.id));
}

export function selectBestAsset(
  assets: SelectableAsset[],
  excludedIds: Set<string>
): SelectableAsset | null {
  const ranked = rankContentAssets(filterExcludedAssets(assets, excludedIds));
  return ranked[0] ?? null;
}

export function chooseContentFormat(asset: SelectableAsset): 'story' | 'feed' | 'reel' {
  const suggested = (asset.suggested_formats ?? [])
    .map((f) => String(f).toLowerCase())
    .filter((f): f is 'story' | 'feed' | 'reel' => f === 'story' || f === 'feed' || f === 'reel');

  if (asset.media_kind === 'video') {
    if (suggested.includes('reel')) return 'reel';
    return 'reel';
  }

  if (suggested[0]) return suggested[0];

  if (asset.aspect_ratio === '9:16') return 'story';
  if (asset.aspect_ratio === '4:5' || asset.aspect_ratio === '1:1') return 'feed';

  return 'feed';
}

// ---- inline: _shared/content-daily/index.ts ----


/**
 * content-daily-prepare — Phase 4 Daily Content Preparation.
 *
 * Target schedule: 12:00 Europe/Berlin (configure externally; NOT auto-enabled here).
 * Hard rules:
 * - Preparation ≠ Publishing
 * - Never writes content_publish_attempts
 * - Never Instagram OAuth / Graph API
 * - Draft status always remains `draft`
 * - Never uses coach quota
 *
 * Auth: CRON_SECRET gate + service role. No user JWT batch.
 */


type PrepStatus = 'pending' | 'ready' | 'skipped' | 'failed';

interface PrepRow {
  id: string;
  org_id: string;
  membership_id: string;
  prep_date: string;
  status: PrepStatus;
  draft_id: string | null;
  asset_id: string | null;
  summary: string | null;
  updated_at: string;
}

interface MemberResult {
  membershipId: string;
  orgId: string;
  outcome: 'ready' | 'skipped' | 'failed' | 'noop';
  reason?: string;
  prepId?: string;
  draftId?: string;
  assetId?: string;
}

function authorizeCron(req: Request): Response | null {
  const expected = Deno.env.get('CRON_SECRET');
  if (!expected) {
    return json({ error: 'cron_secret_not_configured' }, 503);
  }
  const header =
    req.headers.get('x-cron-secret') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    '';
  if (!header || header !== expected) {
    return json({ error: 'unauthorized' }, 401);
  }
  return null;
}

function adminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error('missing_supabase_admin_env');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function claimPrepSlot(
  db: SupabaseClient,
  orgId: string,
  membershipId: string,
  prepDate: string
): Promise<{ kind: 'claimed' | 'noop' | 'in_progress'; prep: PrepRow | null }> {
  const { data: existing, error: selErr } = await db
    .from('content_daily_preparations')
    .select('id, org_id, membership_id, prep_date, status, draft_id, asset_id, summary, updated_at')
    .eq('org_id', orgId)
    .eq('membership_id', membershipId)
    .eq('prep_date', prepDate)
    .maybeSingle();
  if (selErr) throw selErr;

  if (existing) {
    const row = existing as PrepRow;
    if (row.status === 'ready') return { kind: 'noop', prep: row };
    if (row.status === 'pending') {
      const ageMs = Date.now() - new Date(row.updated_at).getTime();
      if (ageMs < 10 * 60 * 1000) return { kind: 'in_progress', prep: row };
    }
    // Retry failed/skipped/stale pending
    const { data: updated, error: upErr } = await db
      .from('content_daily_preparations')
      .update({
        status: 'pending',
        summary: 'claimed',
        draft_id: null,
        asset_id: null,
        score: null,
      })
      .eq('id', row.id)
      .in('status', ['failed', 'skipped', 'pending'])
      .select('id, org_id, membership_id, prep_date, status, draft_id, asset_id, summary, updated_at')
      .maybeSingle();
    if (upErr) throw upErr;
    if (!updated) {
      // Lost race — re-read
      const { data: again } = await db
        .from('content_daily_preparations')
        .select(
          'id, org_id, membership_id, prep_date, status, draft_id, asset_id, summary, updated_at'
        )
        .eq('id', row.id)
        .maybeSingle();
      const againRow = again as PrepRow | null;
      if (againRow?.status === 'ready') return { kind: 'noop', prep: againRow };
      return { kind: 'in_progress', prep: againRow };
    }
    return { kind: 'claimed', prep: updated as PrepRow };
  }

  const { data: inserted, error: insErr } = await db
    .from('content_daily_preparations')
    .insert({
      org_id: orgId,
      membership_id: membershipId,
      prep_date: prepDate,
      timezone: BERLIN_TZ,
      status: 'pending',
      summary: 'claimed',
    })
    .select('id, org_id, membership_id, prep_date, status, draft_id, asset_id, summary, updated_at')
    .maybeSingle();

  if (insErr) {
    // Unique race
    if (insErr.code === '23505') {
      const { data: raced } = await db
        .from('content_daily_preparations')
        .select(
          'id, org_id, membership_id, prep_date, status, draft_id, asset_id, summary, updated_at'
        )
        .eq('org_id', orgId)
        .eq('membership_id', membershipId)
        .eq('prep_date', prepDate)
        .maybeSingle();
      const racedRow = raced as PrepRow | null;
      if (racedRow?.status === 'ready') return { kind: 'noop', prep: racedRow };
      return { kind: 'in_progress', prep: racedRow };
    }
    throw insErr;
  }

  return { kind: 'claimed', prep: inserted as PrepRow };
}

async function finishPrep(
  db: SupabaseClient,
  prepId: string,
  patch: {
    status: PrepStatus;
    summary: string;
    draft_id?: string | null;
    asset_id?: string | null;
    score?: number | null;
  }
): Promise<void> {
  const { error } = await db
    .from('content_daily_preparations')
    .update({
      status: patch.status,
      summary: patch.summary.slice(0, 500),
      draft_id: patch.draft_id ?? null,
      asset_id: patch.asset_id ?? null,
      score: patch.score ?? null,
    })
    .eq('id', prepId);
  if (error) throw error;
}

async function loadExcludedAssetIds(
  db: SupabaseClient,
  membershipId: string,
  prepDate: string
): Promise<Set<string>> {
  const cooldownFrom = subtractDaysFromDate(prepDate, ASSET_COOLDOWN_DAYS);
  const { data, error } = await db
    .from('content_daily_preparations')
    .select('asset_id, prep_date, status')
    .eq('membership_id', membershipId)
    .not('asset_id', 'is', null)
    .gte('prep_date', cooldownFrom);
  if (error) throw error;

  const excluded = new Set<string>();
  for (const row of data ?? []) {
    if (!row.asset_id) continue;
    // Always exclude today's slot asset; for prior days only ready preps (cooldown).
    if (row.prep_date === prepDate || row.status === 'ready') {
      excluded.add(row.asset_id as string);
    }
  }
  return excluded;
}

async function loadCandidateAssets(
  db: SupabaseClient,
  orgId: string,
  membershipId: string
): Promise<SelectableAsset[]> {
  const { data, error } = await db
    .from('content_assets')
    .select(
      'id, scope, owner_membership_id, media_kind, last_used_at, usage_count, created_at, suggested_formats, aspect_ratio, storage_path'
    )
    .eq('org_id', orgId)
    .or(`and(scope.eq.personal,owner_membership_id.eq.${membershipId}),scope.eq.central`);
  if (error) throw error;
  return (data ?? []) as SelectableAsset[];
}

async function processMembership(
  db: SupabaseClient,
  membership: MembershipRow,
  prepDate: string,
  locale: string
): Promise<MemberResult> {
  const base = { membershipId: membership.id, orgId: membership.org_id };

  const claim = await claimPrepSlot(db, membership.org_id, membership.id, prepDate);
  if (claim.kind === 'noop') {
    return { ...base, outcome: 'noop', reason: 'already_ready', prepId: claim.prep?.id };
  }
  if (claim.kind === 'in_progress' || !claim.prep) {
    return { ...base, outcome: 'noop', reason: 'in_progress', prepId: claim.prep?.id };
  }

  const prepId = claim.prep.id;

  try {
    const { data: orgRow, error: orgErr } = await db
      .from('organizations')
      .select('settings')
      .eq('id', membership.org_id)
      .maybeSingle();
    if (orgErr) throw orgErr;
    const settings = (orgRow?.settings ?? {}) as Record<string, unknown>;
    const dailyLimit = resolveDailyGenerationLimit(settings);
    const usedToday = await countGenerationsToday(db, membership.id);
    if (usedToday >= dailyLimit) {
      await finishPrep(db, prepId, {
        status: 'skipped',
        summary: 'generation_quota_reached',
      });
      return {
        ...base,
        outcome: 'skipped',
        reason: 'generation_quota_reached',
        prepId,
      };
    }

    const candidates = await loadCandidateAssets(db, membership.org_id, membership.id);
    if (candidates.length === 0) {
      await finishPrep(db, prepId, { status: 'skipped', summary: 'no_assets' });
      return { ...base, outcome: 'skipped', reason: 'no_assets', prepId };
    }

    const excluded = await loadExcludedAssetIds(db, membership.id, prepDate);
    const selected = selectBestAsset(candidates, excluded);
    if (!selected) {
      await finishPrep(db, prepId, { status: 'skipped', summary: 'no_suitable_asset' });
      return { ...base, outcome: 'skipped', reason: 'no_suitable_asset', prepId };
    }

    const { data: assetFull, error: assetErr } = await db
      .from('content_assets')
      .select(
        'id, org_id, owner_membership_id, scope, media_kind, storage_path, file_name, mime_type, title, aspect_ratio, suggested_formats'
      )
      .eq('id', selected.id)
      .maybeSingle();
    if (assetErr) throw assetErr;
    if (!assetFull) {
      await finishPrep(db, prepId, { status: 'skipped', summary: 'no_suitable_asset' });
      return { ...base, outcome: 'skipped', reason: 'no_suitable_asset', prepId };
    }

    const assetRow = assetFull as AssetRow;
    const format = chooseContentFormat(selected);

    let lastError = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await generateDraftFromAsset({
          db,
          asset: assetRow,
          membership,
          format,
          locale,
          forcePersistAsset: true,
        });

        const draftId = String(result.draft.id);
        const draftStatus = String(result.draft.status);
        if (draftStatus !== 'draft') {
          throw new Error(`unexpected_draft_status:${draftStatus}`);
        }

        await finishPrep(db, prepId, {
          status: 'ready',
          summary: `prepared:${result.parsed.content_type}`,
          draft_id: draftId,
          asset_id: assetRow.id,
          score: result.cleanCheck.status === 'clean' ? 1 : 0.5,
        });

        return {
          ...base,
          outcome: 'ready',
          reason: 'prepared',
          prepId,
          draftId,
          assetId: assetRow.id,
        };
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        const errorDetails = e instanceof VisionFailureError ? e.errorDetails : undefined;
        await markAssetAnalysisFailed(
          db,
          assetRow,
          membership,
          {
            error: lastError,
            attempt,
            ...(errorDetails ? { error_details: errorDetails } : {}),
          },
          true
        );
      }
    }

    await finishPrep(db, prepId, {
      status: 'failed',
      summary: `ai_failed:${lastError}`.slice(0, 500),
      asset_id: assetRow.id,
    });
    return {
      ...base,
      outcome: 'failed',
      reason: lastError.slice(0, 200),
      prepId,
      assetId: assetRow.id,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finishPrep(db, prepId, {
      status: 'failed',
      summary: `job_failed:${msg}`.slice(0, 500),
    }).catch(() => undefined);
    return { ...base, outcome: 'failed', reason: msg.slice(0, 200), prepId };
  }
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    const authErr = authorizeCron(req);
    if (authErr) return authErr;

    if (!Deno.env.get('OPENROUTER_API_KEY')) {
      return json({ error: 'ai_not_configured', detail: 'missing_openrouter_key' }, 503);
    }

    const body = await req.json().catch(() => ({}));
    const force = Boolean(body.force);
    const orgIdFilter = typeof body.orgId === 'string' ? body.orgId.trim() : '';
    const membershipIdFilter =
      typeof body.membershipId === 'string' ? body.membershipId.trim() : '';
    const locale = String(body.locale ?? 'de').trim().slice(0, 8) || 'de';
    const limitRaw = Number(body.limit);
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(500, Math.floor(limitRaw)) : 200;

    const now = new Date();
    if (!force && !isBerlinNoonWindow(now)) {
      return json({
        ok: true,
        job: 'content-daily-prepare',
        skipped: true,
        reason: 'outside_berlin_noon_window',
        prepDate: berlinPrepDate(now),
        timezone: BERLIN_TZ,
        hint: 'Pass force:true for manual smoke; production cron should hit 12:00 Europe/Berlin.',
        publishingEnabled: false,
        autoPublish: false,
      });
    }

    const prepDate = berlinPrepDate(now);
    const db = adminClient();

    let query = db
      .from('memberships')
      .select('id, org_id, role, status')
      .eq('status', 'active')
      .limit(limit);
    if (orgIdFilter) query = query.eq('org_id', orgIdFilter);
    if (membershipIdFilter) query = query.eq('id', membershipIdFilter);

    const { data: members, error: memErr } = await query;
    if (memErr) throw memErr;

    const results: MemberResult[] = [];
    for (const m of (members ?? []) as MembershipRow[]) {
      results.push(await processMembership(db, m, prepDate, locale));
    }

    const summary = {
      ready: results.filter((r) => r.outcome === 'ready').length,
      skipped: results.filter((r) => r.outcome === 'skipped').length,
      failed: results.filter((r) => r.outcome === 'failed').length,
      noop: results.filter((r) => r.outcome === 'noop').length,
    };

    return json({
      ok: true,
      job: 'content-daily-prepare',
      prepDate,
      timezone: BERLIN_TZ,
      force,
      summary,
      results,
      // Hard compliance — preparation never publishes.
      publishingEnabled: false,
      autoPublish: false,
      draftStatusContract: 'draft',
    });
  } catch (e) {
    console.error('content-daily-prepare error', e);
    return json(
      {
        error: 'internal_error',
        detail: e instanceof Error ? e.message : String(e),
        publishingEnabled: false,
        autoPublish: false,
      },
      500
    );
  }
});
