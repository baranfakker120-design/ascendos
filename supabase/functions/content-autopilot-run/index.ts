/**
 * content-autopilot-run — CRON_SECRET + service role.
 * Publishes due Instagram Autopilot slots. No Facebook. No browser timers.
 *
 * Auth: x-cron-secret / Bearer CRON_SECRET (same pattern as content-daily-prepare).
 */

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts';
import { handleOptions, json } from '../_shared/cors.ts';
import { decryptToken, sanitizeMetaError } from '../_shared/instagram-oauth/index.ts';
import {
  buildPublishCaption,
  computeFeedImageCrop,
  connectionHasPublishScope,
  createMediaContainer,
  FEED_IMAGE_ASPECT_ERROR_MESSAGE,
  feedImageEncodeWidth,
  isFeedImageAspectAllowed,
  isMetaFeedImageAspectError,
  publishMediaContainer,
  validateReelAssetForPublish,
  waitForContainerReady,
  type ContentFormat,
  type MediaKind,
} from '../_shared/instagram-publish/index.ts';

const CONTENT_ASSETS_BUCKET = 'content-assets';

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
  if (!needsCrop && !needsJpeg && !needsResize && isFeedImageAspectAllowed(image.width, image.height)) {
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
  const { error: upErr } = await params.admin.storage.from(CONTENT_ASSETS_BUCKET).upload(path, jpeg, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (upErr) throw new Error('feed_image_fit_failed');
  const { data: fittedSigned, error: fitSignErr } = await params.admin.storage
    .from(CONTENT_ASSETS_BUCKET)
    .createSignedUrl(path, 7200);
  if (fitSignErr || !fittedSigned?.signedUrl) throw new Error('feed_image_fit_failed');
  return fittedSigned.signedUrl;
}

async function publishOneSlot(
  admin: SupabaseClient,
  slot: {
    id: string;
    org_id: string;
    membership_id: string;
    draft_id: string;
    asset_id: string | null;
    content_format: ContentFormat;
    retry_count: number;
    max_retries: number;
  }
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

  const { data: draft } = await admin
    .from('content_drafts')
    .select('id, org_id, owner_membership_id, asset_id, format, caption, cta, hashtags, status')
    .eq('id', slot.draft_id)
    .maybeSingle();
  if (!draft || draft.status !== 'ready') {
    return { ok: false, status: 'failed', error: 'draft_not_ready' };
  }

  const assetId = slot.asset_id ?? draft.asset_id;
  const { data: asset } = await admin
    .from('content_assets')
    .select('id, org_id, storage_path, media_kind, mime_type, byte_size, width_px, height_px')
    .eq('id', assetId)
    .maybeSingle();
  if (!asset?.storage_path) return { ok: false, status: 'failed', error: 'asset_not_found' };

  if (asset.media_kind === 'video' || draft.format === 'reel') {
    const videoCheck = validateReelAssetForPublish({
      mediaKind: asset.media_kind as MediaKind,
      format: draft.format as ContentFormat,
      mimeType: asset.mime_type,
      byteSize: asset.byte_size,
      widthPx: asset.width_px,
      heightPx: asset.height_px,
    });
    if (videoCheck !== 'ok') {
      return { ok: false, status: 'failed', error: String(videoCheck) };
    }
  }

  const caption = buildPublishCaption({
    caption: draft.caption,
    hashtags: draft.hashtags,
    cta: draft.cta,
  });
  if (!caption && draft.format !== 'story') {
    return { ok: false, status: 'failed', error: 'missing_caption' };
  }

  const { data: connection } = await admin
    .from('content_instagram_connections')
    .select('id, ig_user_id, ig_username, status, scopes, token_ref')
    .eq('org_id', slot.org_id)
    .eq('membership_id', slot.membership_id)
    .maybeSingle();
  if (!connection || connection.status !== 'connected' || !connection.ig_user_id || !connection.token_ref) {
    return { ok: false, status: 'failed', error: 'not_connected' };
  }
  if (!connectionHasPublishScope(connection.scopes)) {
    return { ok: false, status: 'failed', error: 'missing_publish_permission' };
  }

  const secret = tokenSecret();
  if (!secret) return { ok: false, status: 'failed', error: 'missing_token' };
  let accessToken: string;
  try {
    accessToken = await decryptToken(connection.token_ref, secret);
  } catch {
    return { ok: false, status: 'failed', error: 'token_decrypt_failed' };
  }

  const { data: attempt, error: attemptErr } = await admin
    .from('content_publish_attempts')
    .insert({
      org_id: slot.org_id,
      membership_id: slot.membership_id,
      draft_id: draft.id,
      connection_id: connection.id,
      status: 'queued',
      user_confirmed_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (attemptErr) {
    if (attemptErr.code === '23505') {
      return { ok: false, status: 'failed', error: 'already_in_progress' };
    }
    throw attemptErr;
  }

  try {
    const { data: signed, error: signErr } = await admin.storage
      .from(CONTENT_ASSETS_BUCKET)
      .createSignedUrl(asset.storage_path, 7200);
    if (signErr || !signed?.signedUrl) throw new Error('signed_url_failed');

    let mediaUrl = signed.signedUrl;
    if (asset.media_kind === 'image' && draft.format !== 'story' && draft.format !== 'reel') {
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
      mediaKind: asset.media_kind as MediaKind,
      format: (slot.content_format || draft.format) as ContentFormat,
      mediaUrl,
      caption,
    });

    await admin
      .from('content_publish_attempts')
      .update({ status: 'submitted', meta_container_id: created.containerId })
      .eq('id', attempt.id);

    await waitForContainerReady({
      containerId: created.containerId,
      accessToken,
      mediaKind: asset.media_kind as MediaKind,
    });

    const published = await publishMediaContainer({
      igUserId: connection.ig_user_id,
      accessToken,
      containerId: created.containerId,
    });

    await admin
      .from('content_publish_attempts')
      .update({
        status: 'published',
        meta_container_id: created.containerId,
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
          note: 'Snapshot stored at publish time. Insights filled only when Instagram Graph returns real metrics — never invented.',
        },
      })
      .eq('id', slot.id);

    // Best-effort Instagram Graph insights (Instagram-only; no Facebook APIs).
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
      /* insights optional — never invent */
    }

    // Usage bump on successful publish
    if (asset.id) {
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
    const retries = slot.retry_count + 1;
    const giveUp = retries >= slot.max_retries;
    await admin
      .from('content_publish_attempts')
      .update({ status: 'failed', error_message: msg })
      .eq('id', attempt.id)
      .in('status', ['queued', 'submitted']);
    await admin
      .from('content_autopilot_slots')
      .update({
        status: giveUp ? 'failed' : 'ready',
        retry_count: retries,
        error_message: msg,
      })
      .eq('id', slot.id);
    if (isMetaFeedImageAspectError(msg)) {
      return { ok: false, status: 'failed', error: FEED_IMAGE_ASPECT_ERROR_MESSAGE };
    }
    return { ok: false, status: giveUp ? 'failed' : 'retry', error: msg };
  }
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
    };
    const limit = Math.min(20, Math.max(1, Number(body.limit) || 5));
    const admin = adminClient();
    const now = new Date().toISOString();

    // Settings must be enabled + not paused
    let dueQuery = admin
      .from('content_autopilot_slots')
      .select(
        'id, org_id, membership_id, draft_id, asset_id, content_format, retry_count, max_retries, planned_for, status'
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
      const slot = raw as {
        id: string;
        org_id: string;
        membership_id: string;
        draft_id: string;
        asset_id: string | null;
        content_format: ContentFormat;
        retry_count: number;
        max_retries: number;
      };

      const { data: settings } = await admin
        .from('content_autopilot_settings')
        .select('enabled, paused')
        .eq('membership_id', slot.membership_id)
        .maybeSingle();
      if (!settings?.enabled || settings.paused) {
        results.push({ slotId: slot.id, status: 'skipped', reason: 'autopilot_paused_or_off' });
        continue;
      }

      // Claim publishing
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

    return json({
      ok: true,
      job: 'content-autopilot-run',
      processed: results.length,
      results,
      facebook: 'not_used',
    });
  } catch (e) {
    console.error('content_autopilot_run_error', e instanceof Error ? e.message : e);
    return json({ ok: false, error: 'internal_error' }, 500);
  }
});
