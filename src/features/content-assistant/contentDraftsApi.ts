import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@shared/api/supabase';
import { useAuth } from '@shared/auth/AuthProvider';
import { useI18n } from '@shared/i18n';
import type { ContentFormat } from './contentAssetsApi';
import { formatCleanCheckNotes, runCleanCheck, type CleanCheckStatus } from './lib/cleanCheck';
import type { HashtagCandidate, HashtagResearchResult } from './lib/hashtagResearch';

export type ContentDraftStatus = 'draft' | 'ready' | 'archived';

export interface ContentDraft {
  id: string;
  org_id: string;
  asset_id: string;
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
  analysis: {
    visual_summary?: string;
    theme?: string | null;
    uncertain?: string[];
    research?: ContentResearchPayload;
  };
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
  'id, org_id, asset_id, owner_membership_id, format, hook, caption, cta, keywords, hashtags, clean_check_status, clean_check_notes, target_audience, posting_hint, content_score, status, created_at, updated_at';

export async function listContentDraftsForAsset(assetId: string): Promise<ContentDraft[]> {
  const { data, error } = await supabase
    .from('content_drafts')
    .select(DRAFT_SELECT)
    .eq('asset_id', assetId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ContentDraft[];
}

export async function generateContentDraft(params: {
  assetId: string;
  format: ContentFormat;
  locale: string;
}): Promise<ContentGenerateResult> {
  const { data, error } = await supabase.functions.invoke('content-assistant', {
    body: {
      action: 'generate_draft',
      assetId: params.assetId,
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
  return payload;
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
  return data as ContentDraft;
}

/** Marks draft ready for later Instagram flow — does NOT publish or OAuth. */
export async function prepareDraftForInstagram(draftId: string): Promise<ContentDraft> {
  return updateContentDraft(draftId, { status: 'ready' });
}

export function useContentDrafts(assetId: string | null) {
  const { membership } = useAuth();
  const { locale } = useI18n();
  const qc = useQueryClient();
  const orgId = membership?.org_id ?? null;
  const membershipId = membership?.id ?? null;

  const draftsQuery = useQuery({
    queryKey: ['content-drafts', orgId, membershipId, assetId],
    enabled: Boolean(orgId && membershipId && assetId),
    queryFn: () => listContentDraftsForAsset(assetId!),
  });

  const generateMutation = useMutation({
    mutationFn: (params: { format: ContentFormat }) =>
      generateContentDraft({
        assetId: assetId!,
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
