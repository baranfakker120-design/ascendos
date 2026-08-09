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
import { extractJsonObject, normalizeFormat, parseGeneration } from './parse.ts';
import { buildSystemPrompt, buildUserPrompt } from './prompts.ts';
import {
  CONTENT_ASSETS_BUCKET,
  DEFAULT_DAILY_GENERATION_LIMIT,
  type AssetRow,
  type ContentFormat,
  type GenerationPayload,
  type MembershipRow,
  type ProviderErrorDetails,
} from './types.ts';
import { callVisionModel, VisionFailureError } from './vision.ts';

export type {
  AssetRow,
  ContentFormat,
  GenerationPayload,
  MembershipRow,
  ProviderErrorDetails,
} from './types.ts';
export {
  CONTENT_ASSETS_BUCKET,
  DEFAULT_DAILY_GENERATION_LIMIT,
} from './types.ts';
export { normalizeFormat } from './parse.ts';
export { runHeuristicCleanCheck, CLEAN_CHECK_DISCLAIMER } from './cleanCheck.ts';
export { VisionFailureError } from './vision.ts';

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
  const { db, asset, membership, locale } = params;
  const format: ContentFormat =
    params.format || normalizeFormat(asset.suggested_formats?.[0], 'feed');

  const { data: signed, error: signError } = await db.storage
    .from(CONTENT_ASSETS_BUCKET)
    .createSignedUrl(asset.storage_path, 3600);
  if (signError || !signed?.signedUrl) {
    throw new Error(`signed_url_failed:${signError?.message ?? 'missing'}`);
  }

  const vision = await callVisionModel({
    system: buildSystemPrompt(locale),
    userText: buildUserPrompt({
      format,
      fileName: asset.file_name,
      title: asset.title,
      mediaKind: asset.media_kind,
      aspectRatio: asset.aspect_ratio,
      locale,
    }),
    mediaKind: asset.media_kind,
    mimeType: asset.mime_type,
    signedUrl: signed.signedUrl,
  });

  const parsed = parseGeneration(extractJsonObject(vision.text), format);

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
    provider: vision.provider,
    model: vision.model,
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

  const persistAsset = params.forcePersistAsset || canPersistAssetAnalysis(asset, membership);
  let assetAnalysisPersisted = false;
  if (persistAsset) {
    const { data: usageRow } = await db
      .from('content_assets')
      .select('usage_count')
      .eq('id', asset.id)
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
      .eq('id', asset.id);
    assetAnalysisPersisted = !assetUpdateError;
  }

  const researchHint = formatResearchPostingHint(research);
  const postingHint = [parsed.posting_hint, researchHint].filter(Boolean).join(' · ');

  const draftInsert = {
    org_id: membership.org_id,
    asset_id: asset.id,
    owner_membership_id: membership.id,
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

  return {
    draft: draft as Record<string, unknown>,
    analysis: analysisJson,
    research: researchPayload,
    cleanCheck: {
      status: clean.status,
      notes: clean.notes,
      isGuarantee: false,
    },
    assetAnalysisPersisted,
    assetAnalysisMode: persistAsset
      ? assetAnalysisPersisted
        ? 'persisted'
        : 'persist_failed'
      : 'draft_only_central_or_foreign',
    parsed,
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
