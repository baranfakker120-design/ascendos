// AscendOS Edge Function: content-assistant (Dashboard-Version, alles in einer Datei)
// Name der Function MUSS exakt lauten: content-assistant
//
// GENERIERT von scripts/bundle-functions.mjs — NICHT von Hand ändern.
// Quelle: supabase/functions/content-assistant/index.ts

import { createClient } from 'jsr:@supabase/supabase-js@2';

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


// ============================================================
// content-assistant — Phase 3: AI asset analysis + draft generation
//
// Separate from coach-chat. Does NOT use coach quota.
// Does NOT publish to Instagram. Does NOT run daily cron.
// Vision: OpenRouter multimodal (Gemini) via signed media URL so the
// model sees the actual image/video — not only the file name.
// ============================================================


const CONTENT_ASSETS_BUCKET = 'content-assets';
const DEFAULT_DAILY_GENERATION_LIMIT = 25;
/** Vision model with image + video URL support via OpenRouter. */
const VISION_MODEL = 'google/gemini-2.5-flash';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const VISION_TIMEOUT_MS = 60_000;

type ContentFormat = 'story' | 'feed' | 'reel';

interface MembershipRow {
  id: string;
  org_id: string;
  role: string;
  status: string;
}

interface AssetRow {
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

interface GenerationPayload {
  visual_summary: string;
  theme: string | null;
  audience_hint: string | null;
  mood: string | null;
  content_category: string | null;
  message: string | null;
  product_hint: string | null;
  uncertain: string[];
  content_type: ContentFormat;
  hook: string;
  caption: string;
  keywords: string[];
  hashtags: string[];
  cta: string;
  target_audience: string | null;
  posting_hint: string | null;
  llm_clean_flags: string[];
}

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

const CLEAN_CHECK_DISCLAIMER =
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

function runHeuristicCleanCheck(input: {
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

function canPersistAssetAnalysis(asset: AssetRow, membership: MembershipRow): boolean {
  if (asset.scope === 'personal') return asset.owner_membership_id === membership.id;
  return membership.role === 'super_admin' || membership.role === 'developer';
}

function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] ?? text).trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('invalid_ai_json');
  return JSON.parse(raw.slice(start, end + 1));
}

function asStringArray(v: unknown, max = 24): string[] {
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

function asNullableString(v: unknown, max = 2000): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  return s.slice(0, max);
}

function normalizeFormat(v: unknown, fallback: ContentFormat): ContentFormat {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (s === 'story' || s === 'feed' || s === 'reel') return s;
  return fallback;
}

function parseGeneration(raw: unknown, formatFallback: ContentFormat): GenerationPayload {
  if (!raw || typeof raw !== 'object') throw new Error('invalid_ai_json');
  const o = raw as Record<string, unknown>;
  const visual = asNullableString(o.visual_summary, 4000);
  if (!visual) throw new Error('missing_visual_summary');

  const hook = asNullableString(o.hook, 280) ?? '';
  const caption = asNullableString(o.caption, 2200) ?? '';
  const cta = asNullableString(o.cta, 280) ?? '';
  if (!hook || !caption) throw new Error('missing_draft_fields');

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
    hook,
    caption,
    keywords: asStringArray(o.keywords, 16),
    hashtags: asStringArray(o.hashtags, 18),
    cta,
    target_audience: asNullableString(o.target_audience, 400),
    posting_hint: asNullableString(o.posting_hint, 400),
    llm_clean_flags: asStringArray(o.llm_clean_flags ?? o.clean_check_flags, 12),
  };
}

function buildSystemPrompt(locale: string): string {
  return `You are AscendOS Content Assistant. Analyze the REAL media (image or video) the user provides.
Do NOT invent details you cannot see. If unsure, list the uncertainty in "uncertain" and keep related fields null or cautious.
Never claim shadowban safety or Instagram guarantees.
Never invent income, health, or miracle claims.
Never claim hashtags are "trending", "viral right now", or "currently popular" — you have no live trend feed.
Write captions that sound natural for the audience — not robotic, not keyword-stuffed, not spammy.
Hashtags must match the actual content. Do NOT default to fyp/viral/explore/trending (omit them).
If the media is unclear or nearly empty, say so in uncertain and keep hashtags sparse.
No black-hat, scraping, bots, or fake-engagement advice.

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
  "hook": string,
  "caption": string,
  "keywords": string[],
  "hashtags": string[],
  "cta": string,
  "target_audience": string|null,
  "posting_hint": string|null,
  "llm_clean_flags": string[]
}

Language for hook/caption/cta/keywords/hashtags text: ${locale}.
llm_clean_flags: short notes about spam risk, misleading claims, or engagement bait you still see in YOUR draft (empty if none).`;
}

function buildUserPrompt(params: {
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
  ].join('\n');
}

async function callVisionModel(params: {
  system: string;
  userText: string;
  mediaKind: 'image' | 'video';
  mimeType: string;
  signedUrl: string;
}): Promise<{ text: string; model: string; provider: string }> {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!apiKey) {
    throw new Error('missing_openrouter_key');
  }

  const mediaPart =
    params.mediaKind === 'video'
      ? {
          type: 'video_url',
          video_url: { url: params.signedUrl },
        }
      : {
          type: 'image_url',
          image_url: { url: params.signedUrl },
        };

  // Some OpenRouter routes reject video_url — retry images-only style with image_url for video as last resort is useless.
  // Primary: native multimodal parts; fallback for video: also try image_url key (some gateways accept video there).
  const attempts: unknown[][] = [
    [
      { type: 'text', text: params.userText },
      mediaPart,
    ],
  ];
  if (params.mediaKind === 'video') {
    attempts.push([
      { type: 'text', text: params.userText },
      { type: 'image_url', image_url: { url: params.signedUrl } },
    ]);
  }

  let lastErr: Error | null = null;
  for (const content of attempts) {
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
            max_tokens: 2200,
            messages: [
              { role: 'system', content: params.system },
              { role: 'user', content },
            ],
          }),
        },
        VISION_TIMEOUT_MS
      );
      const httpError = classifyHttpStatus('openrouter', res.status, res.statusText);
      if (httpError) throw httpError;
      const { text } = await parseOpenAiResponse('openrouter', res);
      return { text, model: VISION_MODEL, provider: 'openrouter' };
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastErr ?? new Error('vision_failed');
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    // Forward org selector so current_org_id()/RLS resolve the same membership as the client.
    const forwardHeaders: Record<string, string> = {
      Authorization: req.headers.get('Authorization') ?? '',
    };
    const orgSelector = req.headers.get('x-ascendos-org');
    if (orgSelector) forwardHeaders['x-ascendos-org'] = orgSelector;

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: forwardHeaders },
    });

    const { data: userData, error: authError } = await db.auth.getUser();
    if (authError || !userData.user) return json({ error: 'not_authenticated' }, 401);

    const { data: memberships, error: membershipError } = await db
      .from('memberships')
      .select('id, org_id, role, status')
      .eq('identity_id', userData.user.id)
      .eq('status', 'active');
    if (membershipError) throw membershipError;

    const orgHeader = req.headers.get('x-ascendos-org');
    const active =
      (memberships as MembershipRow[] | null)?.find((m) => orgHeader && m.org_id === orgHeader) ??
      ((memberships as MembershipRow[] | null)?.length === 1
        ? (memberships as MembershipRow[])[0]
        : null);
    if (!active) return json({ error: 'no_active_membership' }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? 'generate_draft');
    if (action !== 'generate_draft') {
      return json({ error: 'unsupported_action', action }, 400);
    }

    const assetId = String(body.assetId ?? '').trim();
    if (!assetId) return json({ error: 'asset_id_required' }, 400);

    const requestedFormat = normalizeFormat(body.format, 'feed');
    const locale = String(body.locale ?? 'de').trim().slice(0, 8) || 'de';

    const { data: asset, error: assetError } = await db
      .from('content_assets')
      .select(
        'id, org_id, owner_membership_id, scope, media_kind, storage_path, file_name, mime_type, title, aspect_ratio, suggested_formats'
      )
      .eq('id', assetId)
      .maybeSingle();
    if (assetError) throw assetError;
    if (!asset) return json({ error: 'asset_not_found' }, 404);
    const assetRow = asset as AssetRow;
    if (assetRow.org_id !== active.org_id) return json({ error: 'asset_wrong_org' }, 403);

    // Content-side daily generation quota (org settings). Never coach quota.
    const { data: orgRow } = await db
      .from('organizations')
      .select('settings')
      .eq('id', active.org_id)
      .maybeSingle();
    const settings = (orgRow?.settings ?? {}) as Record<string, unknown>;
    const dailyLimitRaw = Number(settings.content_daily_generation_limit);
    const dailyLimit =
      Number.isFinite(dailyLimitRaw) && dailyLimitRaw > 0
        ? Math.min(500, Math.floor(dailyLimitRaw))
        : DEFAULT_DAILY_GENERATION_LIMIT;

    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const { count: usedToday, error: countError } = await db
      .from('content_drafts')
      .select('id', { count: 'exact', head: true })
      .eq('owner_membership_id', active.id)
      .gte('created_at', dayStart.toISOString());
    if (countError) throw countError;
    if ((usedToday ?? 0) >= dailyLimit) {
      return json(
        {
          error: 'content_generation_quota_reached',
          used: usedToday ?? 0,
          limit: dailyLimit,
          message: 'Content-Quota für KI-Generierungen heute erreicht.',
        },
        429
      );
    }

    const format: ContentFormat =
      requestedFormat ||
      normalizeFormat(assetRow.suggested_formats?.[0], 'feed');

    const { data: signed, error: signError } = await db.storage
      .from(CONTENT_ASSETS_BUCKET)
      .createSignedUrl(assetRow.storage_path, 3600);
    if (signError || !signed?.signedUrl) {
      return json({ error: 'signed_url_failed', detail: signError?.message }, 500);
    }

    let visionText: string;
    let providerMeta: { provider: string; model: string };
    try {
      const vision = await callVisionModel({
        system: buildSystemPrompt(locale),
        userText: buildUserPrompt({
          format,
          fileName: assetRow.file_name,
          title: assetRow.title,
          mediaKind: assetRow.media_kind,
          aspectRatio: assetRow.aspect_ratio,
          locale,
        }),
        mediaKind: assetRow.media_kind,
        mimeType: assetRow.mime_type,
        signedUrl: signed.signedUrl,
      });
      visionText = vision.text;
      providerMeta = { provider: vision.provider, model: vision.model };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (canPersistAssetAnalysis(assetRow, active)) {
        await db
          .from('content_assets')
          .update({
            analysis_status: 'failed',
            analysis_json: { error: msg, at: new Date().toISOString() },
          })
          .eq('id', assetRow.id);
      }
      if (msg.includes('missing_openrouter_key') || msg.includes('OPENROUTER')) {
        return json({ error: 'ai_not_configured', detail: msg }, 503);
      }
      return json({ error: 'ai_analysis_failed', detail: msg }, 502);
    }

    let parsed: GenerationPayload;
    try {
      parsed = parseGeneration(extractJsonObject(visionText), format);
    } catch (e) {
      if (canPersistAssetAnalysis(assetRow, active)) {
        await db
          .from('content_assets')
          .update({
            analysis_status: 'failed',
            analysis_json: {
              error: 'parse_failed',
              rawPreview: visionText.slice(0, 800),
              at: new Date().toISOString(),
            },
          })
          .eq('id', assetRow.id);
      }
      return json(
        {
          error: 'ai_parse_failed',
          detail: e instanceof Error ? e.message : String(e),
        },
        502
      );
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
    const finalHashtags = research.recommended.map((c) => c.tag);

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
      recommended: research.recommended,
      rejected: research.rejected,
      notes: research.notes,
      hashtagApi: 'not_enabled',
    };

    const analysisJson = {
      provider: providerMeta.provider,
      model: providerMeta.model,
      visual_summary: parsed.visual_summary,
      theme: parsed.theme,
      audience_hint: parsed.audience_hint,
      mood: parsed.mood,
      content_category: parsed.content_category,
      message: parsed.message,
      product_hint: parsed.product_hint,
      uncertain: parsed.uncertain,
      generated_at: new Date().toISOString(),
      research: researchPayload,
    };

    const persistAsset = canPersistAssetAnalysis(assetRow, active);
    let assetAnalysisPersisted = false;
    if (persistAsset) {
      const { data: usageRow } = await db
        .from('content_assets')
        .select('usage_count')
        .eq('id', assetRow.id)
        .maybeSingle();
      const { error: assetUpdateError } = await db
        .from('content_assets')
        .update({
          analysis_status: 'ready',
          detected_summary: parsed.visual_summary.slice(0, 2000),
          theme: parsed.theme,
          mood: parsed.mood,
          product_hint: parsed.product_hint,
          audience_hint: parsed.audience_hint,
          keywords: parsed.keywords,
          analysis_json: analysisJson,
          last_used_at: new Date().toISOString(),
          usage_count: Number(usageRow?.usage_count ?? 0) + 1,
        })
        .eq('id', assetRow.id);
      assetAnalysisPersisted = !assetUpdateError;
    }

    const researchHint = formatResearchPostingHint(research);
    const postingHint = [parsed.posting_hint, researchHint].filter(Boolean).join(' · ');

    const draftInsert = {
      org_id: active.org_id,
      asset_id: assetRow.id,
      owner_membership_id: active.id,
      format: parsed.content_type,
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
      .select(
        'id, org_id, asset_id, owner_membership_id, format, hook, caption, cta, keywords, hashtags, clean_check_status, clean_check_notes, target_audience, posting_hint, content_score, status, created_at, updated_at'
      )
      .single();
    if (draftError) throw draftError;

    return json({
      ok: true,
      draft,
      analysis: analysisJson,
      research: researchPayload,
      assetAnalysisPersisted,
      assetAnalysisMode: persistAsset
        ? assetAnalysisPersisted
          ? 'persisted'
          : 'persist_failed'
        : 'draft_only_central_or_foreign',
      cleanCheck: {
        status: clean.status,
        notes: clean.notes,
        isGuarantee: false,
      },
      quota: {
        used: (usedToday ?? 0) + 1,
        limit: dailyLimit,
      },
      // Phase 6 placeholder — never auto-publish.
      instagram: { prepareOnly: true, publishingEnabled: false },
    });
  } catch (e) {
    console.error('content-assistant error', e);
    return json(
      {
        error: 'internal_error',
        detail: e instanceof Error ? e.message : String(e),
      },
      500
    );
  }
});
