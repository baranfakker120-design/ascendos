import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@shared/api/supabase';
import { useAuth } from '@shared/auth/AuthProvider';
import { canManageCoachContent } from '@shared/auth/coachContentAuthority';
import { berlinPrepDate } from './lib/dailyPrepare/berlinTime';
import {
  CONTENT_ASSET_FILE_ACCEPT,
  extForContentAssetMime,
  mediaKindForContentAssetMime,
  resolveContentAssetUploadMime,
} from './lib/contentAssets/uploadMime';

export const CONTENT_ASSETS_BUCKET = 'content-assets';
export const DEFAULT_CONTENT_ASSET_LIMIT = 25;
/** Re-export for the file input `accept` attribute. */
export { CONTENT_ASSET_FILE_ACCEPT };

export type ContentAssetScope = 'personal' | 'central';
export type ContentMediaKind = 'image' | 'video';
export type ContentFormat = 'story' | 'feed' | 'reel';

export interface ContentAsset {
  id: string;
  org_id: string;
  owner_membership_id: string;
  created_by: string;
  scope: ContentAssetScope;
  media_kind: ContentMediaKind;
  storage_path: string;
  file_name: string;
  mime_type: string;
  byte_size: number;
  width_px: number | null;
  height_px: number | null;
  aspect_ratio: string | null;
  suggested_formats: string[];
  title: string | null;
  theme: string | null;
  keywords: string[];
  analysis_status: string;
  last_used_at: string | null;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export interface ContentQuota {
  used: number;
  limit: number;
  canUploadPersonal: boolean;
  canUploadCentral: boolean;
}

export interface ContentDailyPreparation {
  id: string;
  prep_date: string;
  status: string;
  score: number | null;
  summary: string | null;
  draft_id: string | null;
  asset_id: string | null;
  /** Populated when status=ready and relations resolve. */
  asset?: ContentAsset | null;
  draft?: {
    id: string;
    format: ContentFormat;
    hook: string | null;
    caption: string | null;
    hashtags: string[];
    clean_check_status: string;
    clean_check_notes: string | null;
    status: string;
  } | null;
}

function guessAspectRatio(width: number | null, height: number | null): string | null {
  if (!width || !height || width <= 0 || height <= 0) return null;
  const r = width / height;
  if (Math.abs(r - 9 / 16) < 0.08) return '9:16';
  if (Math.abs(r - 4 / 5) < 0.08) return '4:5';
  if (Math.abs(r - 1) < 0.08) return '1:1';
  if (Math.abs(r - 16 / 9) < 0.08) return '16:9';
  return 'other';
}

function suggestedFormatsForAspect(aspect: string | null): ContentFormat[] {
  if (aspect === '9:16') return ['story', 'reel'];
  if (aspect === '4:5') return ['feed'];
  if (aspect === '1:1') return ['feed'];
  return [];
}

async function readImageDimensions(
  file: File
): Promise<{ width: number | null; height: number | null }> {
  const url = URL.createObjectURL(file);
  try {
    const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error('image_load_failed'));
      img.src = url;
    });
    return dims;
  } catch {
    return { width: null, height: null };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Best-effort video width/height for Instagram Reel pre-checks (no duration column yet). */
async function readVideoDimensions(
  file: File
): Promise<{ width: number | null; height: number | null }> {
  const url = URL.createObjectURL(file);
  try {
    const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        resolve({ width: video.videoWidth || 0, height: video.videoHeight || 0 });
      };
      video.onerror = () => reject(new Error('video_load_failed'));
      video.src = url;
    });
    return {
      width: dims.width > 0 ? dims.width : null,
      height: dims.height > 0 ? dims.height : null,
    };
  } catch {
    return { width: null, height: null };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function fetchContentQuota(): Promise<ContentQuota> {
  const [usedRes, limitRes, personalOk] = await Promise.all([
    supabase.rpc('content_personal_asset_count'),
    supabase.rpc('content_asset_limit'),
    supabase.rpc('content_can_upload_asset', { p_scope: 'personal' }),
  ]);
  if (usedRes.error) throw usedRes.error;
  if (limitRes.error) throw limitRes.error;
  if (personalOk.error) throw personalOk.error;
  return {
    used: Number(usedRes.data ?? 0),
    limit: Number(limitRes.data ?? DEFAULT_CONTENT_ASSET_LIMIT),
    canUploadPersonal: Boolean(personalOk.data),
    canUploadCentral: false, // filled in hook via auth role
  };
}

export async function listContentAssets(): Promise<ContentAsset[]> {
  const { data, error } = await supabase
    .from('content_assets')
    .select(
      'id, org_id, owner_membership_id, created_by, scope, media_kind, storage_path, file_name, mime_type, byte_size, width_px, height_px, aspect_ratio, suggested_formats, title, theme, keywords, analysis_status, last_used_at, usage_count, created_at, updated_at'
    )
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ContentAsset[];
}

export async function createSignedAssetUrl(storagePath: string, expiresIn = 3600): Promise<string> {
  const { data, error } = await supabase.storage
    .from(CONTENT_ASSETS_BUCKET)
    .createSignedUrl(storagePath, expiresIn);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error('signed_url_missing');
  return data.signedUrl;
}

export async function uploadContentAsset(params: {
  file: File;
  orgId: string;
  membershipId: string;
  userId: string;
  scope: ContentAssetScope;
  title?: string;
}): Promise<ContentAsset> {
  const { file, orgId, membershipId, userId, scope, title } = params;
  const mime = resolveContentAssetUploadMime(file);
  if (!mime) {
    throw new Error('unsupported_mime');
  }
  if (file.size <= 0 || file.size > 52_428_800) {
    throw new Error('file_too_large');
  }

  const can = await supabase.rpc('content_can_upload_asset', { p_scope: scope });
  if (can.error) throw can.error;
  if (!can.data)
    throw new Error(
      scope === 'central' ? 'content_central_forbidden' : 'content_asset_limit_reached'
    );

  const assetId = crypto.randomUUID();
  const ext = extForContentAssetMime(mime);
  const folder = scope === 'central' ? 'central' : userId;
  const storagePath = `${orgId}/${folder}/${assetId}/original.${ext}`;
  const mediaKind = mediaKindForContentAssetMime(mime);
  const dims =
    mediaKind === 'video' ? await readVideoDimensions(file) : await readImageDimensions(file);
  const aspect = guessAspectRatio(dims.width, dims.height);

  const { error: upErr } = await supabase.storage
    .from(CONTENT_ASSETS_BUCKET)
    .upload(storagePath, file, {
      upsert: false,
      contentType: mime,
      cacheControl: '3600',
    });
  if (upErr) throw upErr;

  const row = {
    id: assetId,
    org_id: orgId,
    owner_membership_id: membershipId,
    created_by: userId,
    scope,
    media_kind: mediaKind,
    storage_path: storagePath,
    file_name: file.name,
    mime_type: mime,
    byte_size: file.size,
    width_px: dims.width,
    height_px: dims.height,
    aspect_ratio: aspect,
    suggested_formats: suggestedFormatsForAspect(aspect),
    title: title?.trim() || file.name.replace(/\.[^.]+$/, ''),
    analysis_status: 'pending',
  };

  const { data, error } = await supabase.from('content_assets').insert(row).select().single();
  if (error) {
    // Best-effort cleanup of orphaned binary (original never overwritten elsewhere).
    await supabase.storage.from(CONTENT_ASSETS_BUCKET).remove([storagePath]);
    throw error;
  }
  return data as ContentAsset;
}

export async function deleteContentAsset(asset: ContentAsset): Promise<void> {
  const { error } = await supabase.from('content_assets').delete().eq('id', asset.id);
  if (error) throw error;
  await supabase.storage.from(CONTENT_ASSETS_BUCKET).remove([asset.storage_path]);
}

export async function fetchTodayPreparation(): Promise<ContentDailyPreparation | null> {
  // Must match the daily job: Europe/Berlin calendar day (not browser local TZ).
  const prepDate = berlinPrepDate();
  const { data, error } = await supabase
    .from('content_daily_preparations')
    .select('id, prep_date, status, score, summary, draft_id, asset_id')
    .eq('prep_date', prepDate)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const prep = data as ContentDailyPreparation;
  if (prep.asset_id) {
    const { data: asset } = await supabase
      .from('content_assets')
      .select(
        'id, org_id, owner_membership_id, created_by, scope, media_kind, storage_path, file_name, mime_type, byte_size, width_px, height_px, aspect_ratio, suggested_formats, title, theme, keywords, analysis_status, last_used_at, usage_count, created_at, updated_at'
      )
      .eq('id', prep.asset_id)
      .maybeSingle();
    prep.asset = (asset as ContentAsset | null) ?? null;
  }
  if (prep.draft_id) {
    const { data: draft } = await supabase
      .from('content_drafts')
      .select('id, format, hook, caption, hashtags, clean_check_status, clean_check_notes, status')
      .eq('id', prep.draft_id)
      .maybeSingle();
    prep.draft = draft
      ? {
          id: draft.id,
          format: draft.format as ContentFormat,
          hook: draft.hook,
          caption: draft.caption,
          hashtags: (draft.hashtags ?? []) as string[],
          clean_check_status: draft.clean_check_status,
          clean_check_notes: draft.clean_check_notes,
          status: draft.status,
        }
      : null;
  }
  return prep;
}

export function useContentLibrary() {
  const { session, membership, canManageCoachContent: canCentralAuth } = useAuth();
  const qc = useQueryClient();
  const userId = session?.user?.id ?? null;
  const orgId = membership?.org_id ?? null;
  const membershipId = membership?.id ?? null;
  const canCentral = canCentralAuth || canManageCoachContent(membership?.role);

  const assetsQuery = useQuery({
    queryKey: ['content-assets', orgId, membershipId],
    enabled: Boolean(userId && orgId && membershipId),
    queryFn: listContentAssets,
  });

  const quotaQuery = useQuery({
    queryKey: ['content-quota', orgId, membershipId],
    enabled: Boolean(userId && orgId && membershipId),
    queryFn: async (): Promise<ContentQuota> => {
      const q = await fetchContentQuota();
      return { ...q, canUploadCentral: canCentral };
    },
  });

  const todayQuery = useQuery({
    queryKey: ['content-daily-prep', orgId, membershipId],
    enabled: Boolean(userId && orgId && membershipId),
    queryFn: fetchTodayPreparation,
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ file, scope }: { file: File; scope: ContentAssetScope }) => {
      if (!userId || !orgId || !membershipId) throw new Error('not_authenticated');
      return uploadContentAsset({
        file,
        orgId,
        membershipId,
        userId,
        scope,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['content-assets'] });
      await qc.invalidateQueries({ queryKey: ['content-quota'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteContentAsset,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['content-assets'] });
      await qc.invalidateQueries({ queryKey: ['content-quota'] });
    },
  });

  return {
    assetsQuery,
    quotaQuery,
    todayQuery,
    uploadMutation,
    deleteMutation,
    canCentral,
  };
}
