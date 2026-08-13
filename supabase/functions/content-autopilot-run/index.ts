/**
 * content-autopilot-run — CRON_SECRET + service role.
 * Publishes due Instagram Autopilot slots + auto-continues exhausted plans.
 * No Facebook. No browser timers. No daily user confirmation.
 *
 * Auth: x-cron-secret / Bearer CRON_SECRET (same pattern as content-daily-prepare).
 */

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { handleOptions, json } from '../_shared/cors.ts';
import { decryptToken, sanitizeMetaError } from '../_shared/instagram-oauth/index.ts';
import {
  buildPublishCaption,
  connectionHasPublishScope,
  createCarouselContainer,
  createMediaContainer,
  FEED_IMAGE_ASPECT_ERROR_MESSAGE,
  isMetaFeedImageAspectError,
  publishMediaContainer,
  waitForContainerReady,
  type PublishContentFormat,
  type MediaKind,
} from '../_shared/instagram-publish/index.ts';
import {
  AUTOPILOT_MIN_ELIGIBLE_ASSETS,
  buildAndInsertAutopilotPlan,
  canActivateAutopilot,
  isAutopilotPlanExhausted,
  isPermanentAutopilotPublishError,
  nextAutopilotPeriod,
  optimizeAutopilotDraftBeforePublish,
  reconcileActivePlanForMembership,
  type AutopilotEligibleAsset,
  type AutopilotHistoryItem,
} from '../_shared/content-autopilot/index.ts';
import { resolveAutopilotFeedImageUrl } from '../_shared/content-autopilot/feedImagePrepare.ts';

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

/**
 * Feed image URL for Meta containers.
 *
 * MUST NOT import `deno.land/x/imagescript` in this worker: on Supabase Edge the
 * imagescript WASM boot hits `TypeError: brotli error` (zlib.js → Response.arrayBuffer)
 * as an uncaught event-loop error → WORKER_ERROR on every cold start / cron tick,
 * before any slot claim. See feedImagePrepare.ts.
 */
async function prepareFeedImageUrlForMeta(params: {
  admin: SupabaseClient;
  sourceSignedUrl: string;
  orgId: string;
  slotId: string;
  mimeType: string | null | undefined;
}): Promise<string> {
  void params.admin;
  void params.orgId;
  void params.slotId;
  void params.mimeType;
  return resolveAutopilotFeedImageUrl(params.sourceSignedUrl);
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

  // AUTOPILOT HARD RULE: Feed = exactly 1 image. Never publish as carousel.
  // Legacy multi-asset slots are collapsed to the primary before publish.
  // Manual Content Assistant carousel publishing is a separate code path.
  const hadLegacyCarousel =
    !isStory &&
    (carouselFromSlot.length >= 2 ||
      carouselFromDraft.length >= 2 ||
      [...carouselFromSlot, ...carouselFromDraft].some(
        (id) => id && id !== primaryId
      ));

  if (hadLegacyCarousel && primaryId) {
    console.warn('autopilot_publish_collapse_carousel', {
      slotId: slot.id,
      primaryId,
      slotCarouselCount: carouselFromSlot.length,
      draftCarouselCount: carouselFromDraft.length,
    });
    await admin
      .from('content_autopilot_slots')
      .update({
        asset_id: primaryId,
        carousel_asset_ids: [],
        content_format: 'feed',
        selection_reason:
          'Autopilot publish safety: Carousel → Single-Image Feed (1 Image only).',
        updated_at: new Date().toISOString(),
      })
      .eq('id', slot.id);
    // Preserve caption / hashtags / cta — only clear companions.
    await admin
      .from('content_drafts')
      .update({
        asset_id: primaryId,
        carousel_asset_ids: [],
      })
      .eq('id', slot.draft_id);
  }

  const publishAssetIds = primaryId ? [primaryId] : [];
  // AUTOPILOT HARD RULE: never set isCarousel true on the publish path.
  const isCarousel = false;

  // Feed/Carousel only: one optimization pass. Image Story + Video Story skip (no extra AI).
  if (!isStory) {
    try {
      const opt = await optimizeAutopilotDraftBeforePublish({
        admin,
        membershipId: slot.membership_id,
        orgId: slot.org_id,
        draftId: slot.draft_id,
        slotKind: slot.slot_kind,
        contentFormat: slot.content_format || draftPre.format,
        plannedFor: slot.planned_for,
        assetIds: publishAssetIds,
      });
      if (!opt.qualityOk) {
        console.error('autopilot_optimize_quality_failed', {
          slotId: slot.id,
          draftId: slot.draft_id,
          mode: opt.mode,
          notes: opt.notes.slice(0, 8),
        });
        return releaseSlotAfterError(admin, slot, 'content_quality_failed', false);
      }
    } catch (optErr) {
      console.error(
        'autopilot_optimize_failed',
        optErr instanceof Error ? optErr.message : optErr
      );
      return releaseSlotAfterError(admin, slot, 'content_optimize_failed', false);
    }
  }

  const { data: draft } = await admin
    .from('content_drafts')
    .select(
      'id, org_id, owner_membership_id, asset_id, carousel_asset_ids, format, hook, caption, cta, hashtags, status'
    )
    .eq('id', slot.draft_id)
    .maybeSingle();
  if (!draft || draft.status !== 'ready') {
    return releaseSlotAfterError(admin, slot, 'draft_not_ready', true);
  }

  // Hard stop: never publish UUID / request-id shaped copy to Instagram.
  const hookText = String(draft.hook ?? '');
  const captionText = String(draft.caption ?? '');
  const ctaText = String(draft.cta ?? '');
  const uuidRe =
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
  if (uuidRe.test(hookText) || uuidRe.test(captionText) || uuidRe.test(ctaText)) {
    console.error('autopilot_internal_id_in_copy', { slotId: slot.id, draftId: draft.id });
    return releaseSlotAfterError(admin, slot, 'internal_id_in_copy', true);
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
