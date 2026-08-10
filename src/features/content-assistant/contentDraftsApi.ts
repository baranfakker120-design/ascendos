import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@shared/api/supabase';
import { useAuth } from '@shared/auth/AuthProvider';
import { useI18n } from '@shared/i18n';
import type { ContentFormat } from './contentAssetsApi';
import { formatCleanCheckNotes, runCleanCheck, type CleanCheckStatus } from './lib/cleanCheck';
import type { HashtagCandidate, HashtagResearchResult } from './lib/hashtagResearch';

export type ContentDraftStatus = 'draft' | 'ready' | 'archived';

export interface ContentKeywordDetail {
  keyword: string;
  why: string;
}

export interface ContentHashtagDetail {
  tag: string;
  why: string;
}

export interface ContentSlideAnalysis {
  index: number;
  summary: string;
  role: string;
  issue: string | null;
  fix: string | null;
}

export interface ContentAnalysisJson {
  visual_summary?: string;
  theme?: string | null;
  core_message?: string | null;
  content_intent?: string | null;
  target_audience?: string | null;
  audience_hint?: string | null;
  problem?: string | null;
  emotion?: string | null;
  why_swipe?: string | null;
  why_save?: string | null;
  why_share?: string | null;
  hook_strength?: 'strong' | 'ok' | 'weak' | null;
  hook_alternatives?: string[];
  keyword_details?: ContentKeywordDetail[];
  hashtag_details?: ContentHashtagDetail[];
  slides?: ContentSlideAnalysis[];
  optimization?: string | null;
  research?: ContentResearchPayload;
  [key: string]: unknown;
}

export interface ContentDraft {
  id: string;
  org_id: string;
  asset_id: string;
  carousel_asset_ids: string[];
  analysis_json: ContentAnalysisJson;
  owner_membership_id: string;
  format: ContentFormat;
  hook: string | null;
  caption: string | null;
  cta: string | null;
  keywords: string[];
  hashtags: string[];
  clean_check_status: CleanCheckStatus | 'pending';
  clean_check_notes: string | null;
  target_audience: string | null;
  posting_hint: string | null;
  content_score: number | null;
  status: ContentDraftStatus;
  created_at: string;
  updated_at: string;
}

export type ContentResearchPayload = Pick<
  HashtagResearchResult,
  'mode' | 'liveResearchActive' | 'providersUsed' | 'recommended' | 'rejected' | 'notes'
> & { hashtagApi: string };

export interface ContentGenerateResult {
  draft: ContentDraft;
  analysis: ContentAnalysisJson;
  research?: ContentResearchPayload;
  assetAnalysisPersisted?: boolean;
  assetAnalysisMode?: 'persisted' | 'persist_failed' | 'draft_only_central_or_foreign';
  cleanCheck: {
    status: CleanCheckStatus;
    notes: string[];
    isGuarantee: false;
  };
  quota: { used: number; limit: number };
}

export type { HashtagCandidate };

const DRAFT_SELECT =
  'id, org_id, asset_id, carousel_asset_ids, analysis_json, owner_membership_id, format, hook, caption, cta, keywords, hashtags, clean_check_status, clean_check_notes, target_audience, posting_hint, content_score, status, created_at, updated_at';

function normalizeDraft(row: ContentDraft): ContentDraft {
  return {
    ...row,
    carousel_asset_ids: Array.isArray(row.carousel_asset_ids) ? row.carousel_asset_ids : [],
    analysis_json:
      row.analysis_json && typeof row.analysis_json === 'object'
        ? (row.analysis_json as ContentAnalysisJson)
        : {},
    keywords: row.keywords ?? [],
    hashtags: row.hashtags ?? [],
  };
}

export async function listContentDraftsForAsset(assetId: string): Promise<ContentDraft[]> {
  const { data, error } = await supabase
    .from('content_drafts')
    .select(DRAFT_SELECT)
    .eq('asset_id', assetId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as ContentDraft[]).map(normalizeDraft);
}

export async function generateContentDraft(params: {
  assetIds: string[];
  format: ContentFormat;
  locale: string;
}): Promise<ContentGenerateResult> {
  const assetIds = params.assetIds.filter(Boolean).slice(0, 6);
  const { data, error } = await supabase.functions.invoke('content-assistant', {
    body: {
      action: 'generate_draft',
      assetId: assetIds[0],
      assetIds,
      format: params.format,
      locale: params.locale,
    },
  });

  if (error) {
    const ctx = error as { context?: Response; message?: string };
    let detail = ctx.message ?? 'generate_failed';
    try {
      if (ctx.context) {
        const body = (await ctx.context.json()) as { error?: string; message?: string };
        detail = body.error ?? body.message ?? detail;
      }
    } catch {
      /* keep detail */
    }
    throw new Error(detail);
  }

  const payload = data as ContentGenerateResult & { error?: string; ok?: boolean };
  if (!payload?.draft || payload.error) {
    throw new Error(payload?.error ?? 'generate_failed');
  }
  return {
    ...payload,
    draft: normalizeDraft(payload.draft),
  };
}

export async function updateContentDraft(
  draftId: string,
  patch: Partial<{
    hook: string;
    caption: string;
    cta: string;
    keywords: string[];
    hashtags: string[];
    format: ContentFormat;
    status: ContentDraftStatus;
    target_audience: string | null;
    posting_hint: string | null;
  }>
): Promise<ContentDraft> {
  const next = { ...patch };
  if (
    next.hook !== undefined ||
    next.caption !== undefined ||
    next.cta !== undefined ||
    next.keywords !== undefined ||
    next.hashtags !== undefined
  ) {
    // Re-run local clean check on save so edits stay honest.
    const { data: current, error: curErr } = await supabase
      .from('content_drafts')
      .select('hook, caption, cta, keywords, hashtags')
      .eq('id', draftId)
      .single();
    if (curErr) throw curErr;
    const check = runCleanCheck({
      hook: next.hook ?? current.hook,
      caption: next.caption ?? current.caption,
      cta: next.cta ?? current.cta,
      keywords: next.keywords ?? current.keywords,
      hashtags: next.hashtags ?? current.hashtags,
    });
    Object.assign(next, {
      clean_check_status: check.status,
      clean_check_notes: formatCleanCheckNotes(check),
    });
  }

  const { data, error } = await supabase
    .from('content_drafts')
    .update(next)
    .eq('id', draftId)
    .select(DRAFT_SELECT)
    .single();
  if (error) throw error;
  return normalizeDraft(data as ContentDraft);
}

/** Marks draft ready for Instagram preview / later publish — does NOT publish or OAuth. */
export async function prepareDraftForInstagram(draftId: string): Promise<ContentDraft> {
  return updateContentDraft(draftId, { status: 'ready' });
}

export function useContentDrafts(assetIds: string[] | null) {
  const { membership } = useAuth();
  const { locale } = useI18n();
  const qc = useQueryClient();
  const orgId = membership?.org_id ?? null;
  const membershipId = membership?.id ?? null;
  const primaryAssetId = assetIds?.[0] ?? null;
  const idsKey = (assetIds ?? []).join(',');

  const draftsQuery = useQuery({
    queryKey: ['content-drafts', orgId, membershipId, primaryAssetId, idsKey],
    enabled: Boolean(orgId && membershipId && primaryAssetId),
    queryFn: () => listContentDraftsForAsset(primaryAssetId!),
  });

  const generateMutation = useMutation({
    mutationFn: (params: { format: ContentFormat }) =>
      generateContentDraft({
        assetIds: assetIds ?? [],
        format: params.format,
        locale,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['content-drafts'] });
      await qc.invalidateQueries({ queryKey: ['content-assets'] });
    },
  });

  const saveMutation = useMutation({
    mutationFn: (params: { draftId: string; patch: Parameters<typeof updateContentDraft>[1] }) =>
      updateContentDraft(params.draftId, params.patch),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['content-drafts'] });
    },
  });

  const prepareMutation = useMutation({
    mutationFn: (draftId: string) => prepareDraftForInstagram(draftId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['content-drafts'] });
    },
  });

  return {
    draftsQuery,
    generateMutation,
    saveMutation,
    prepareMutation,
  };
}
