/**
 * Shared content generation core (Vision → Research → Clean Check → Draft).
 * Used by content-assistant (user JWT) and content-daily-prepare (service role).
 * Never publishes to Instagram.
 */

import {
  formatResearchPostingHint,
  runHashtagResearch,
  type HashtagResearchResult,
} from '../content-research/index.ts';

/** Minimal DB surface — avoid jsr imports inside _shared (breaks dashboard bundle). */
// deno-lint-ignore no-explicit-any
type DbClient = any;
import { runHeuristicCleanCheck } from './cleanCheck.ts';
import {
  enforceExactHashtagCount,
  extractJsonObject,
  normalizeFormat,
  parseGeneration,
} from './parse.ts';
import {
  buildCarouselSystemPrompt,
  buildCarouselUserPrompt,
  buildSystemPrompt,
  buildUserPrompt,
} from './prompts.ts';
import {
  CAROUSEL_MAX_ASSETS,
  CONTENT_ASSETS_BUCKET,
  DEFAULT_DAILY_GENERATION_LIMIT,
  REQUIRED_HASHTAG_COUNT,
  type AssetRow,
  type ContentFormat,
  type GenerationPayload,
  type MembershipRow,
  type ProviderErrorDetails,
} from './types.ts';
import { callVisionModel, callVisionModelCarousel, VisionFailureError } from './vision.ts';

export type {
  AssetRow,
  ContentFormat,
  GenerationPayload,
  MembershipRow,
  ProviderErrorDetails,
} from './types.ts';
export {
  CAROUSEL_MAX_ASSETS,
  CONTENT_ASSETS_BUCKET,
  DEFAULT_DAILY_GENERATION_LIMIT,
  REQUIRED_HASHTAG_COUNT,
} from './types.ts';
export { normalizeFormat, enforceExactHashtagCount } from './parse.ts';
export { runHeuristicCleanCheck, CLEAN_CHECK_DISCLAIMER } from './cleanCheck.ts';
export { VisionFailureError } from './vision.ts';
export {
  looksLikeInternalId,
  textContainsInternalId,
  pickSafePublicCopy,
  filterInternalIdHashtags,
} from './safeCopy.ts';

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
