/**
 * instagram-publish — Phase 5C/5D official Instagram Graph Content Publishing.
 *
 * Official Meta path only (graph.instagram.com).
 * Requires explicit user confirmation in the request body.
 * Reuses encrypted token_ref from content_instagram_connections (decrypt server-side).
 * Phase 5D: Reels container (`media_type=REELS`) + server-side video validation.
 * Official Instagram Audio/Music library is NOT available with Instagram Login OAuth.
 * Does not modify the oauth start/callback flow.
 *
 * POST { action: "publish", draftId, confirmed: true } + user JWT
 */

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts';
import { handleOptions, json } from '../_shared/cors.ts';
import { decryptToken, sanitizeMetaError } from '../_shared/instagram-oauth/index.ts';
import {
  buildPublishCaption,
  computeFeedImageCrop,
  connectionHasPublishScope,
  createCarouselContainer,
  createMediaContainer,
  FEED_IMAGE_ASPECT_ERROR_MESSAGE,
  feedImageEncodeWidth,
  IG_PUBLISH_SCOPE,
  isFeedImageAspectAllowed,
  isMetaFeedImageAspectError,
  publishMediaContainer,
  reelValidationErrorMessage,
  validateReelAssetForPublish,
  waitForContainerReady,
  type ContentFormat,
  type MediaKind,
  type ReelValidationCode,
} from '../_shared/instagram-publish/index.ts';

/** Same private bucket as content-generate (avoid bundling that group here). */
const CONTENT_ASSETS_BUCKET = 'content-assets';

/**
 * Meta feed images: JPEG only, aspect 4:5…1.91:1, width ≤1440.
 * Center-crop + re-encode so any library image can publish within Instagram rules.
 */
async function prepareFeedImageUrlForMeta(params: {
  admin: SupabaseClient;
  sourceSignedUrl: string;
  orgId: string;
  draftId: string;
  mimeType: string | null | undefined;
}): Promise<string> {
  const res = await fetch(params.sourceSignedUrl);
  if (!res.ok) throw new Error('feed_image_fetch_failed');
  const bytes = new Uint8Array(await res.arrayBuffer());
  const image = await Image.decode(bytes);
  const crop = computeFeedImageCrop(image.width, image.height);
  const needsCrop =
    crop.x !== 0 ||
    crop.y !== 0 ||
    crop.width !== image.width ||
    crop.height !== image.height;
  const mime = (params.mimeType ?? '').toLowerCase();
  const needsJpeg = mime !== 'image/jpeg' && mime !== 'image/jpg';
  const targetW = feedImageEncodeWidth(crop.width);
  const needsResize = targetW !== crop.width;

  if (!needsCrop && !needsJpeg && !needsResize && isFeedImageAspectAllowed(image.width, image.height)) {
    return params.sourceSignedUrl;
  }

  let fitted = image;
  if (needsCrop) {
    fitted = image.clone().crop(crop.x, crop.y, crop.width, crop.height);
  }
  const encodeW = feedImageEncodeWidth(fitted.width);
  if (encodeW !== fitted.width) {
    const encodeH = Math.max(1, Math.round((fitted.height * encodeW) / fitted.width));
    fitted.resize(encodeW, encodeH);
  }

  const jpeg = await fitted.encodeJPEG(85);
  const path = `${params.orgId}/publish-fit/${params.draftId}.jpg`;
  const { error: upErr } = await params.admin.storage.from(CONTENT_ASSETS_BUCKET).upload(path, jpeg, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (upErr) {
    console.error('instagram_publish_feed_fit_upload_failed', upErr.message);
    throw new Error('feed_image_fit_failed');
  }
  const { data: fittedSigned, error: fitSignErr } = await params.admin.storage
    .from(CONTENT_ASSETS_BUCKET)
    .createSignedUrl(path, 7200);
  if (fitSignErr || !fittedSigned?.signedUrl) {
    throw new Error('feed_image_fit_failed');
  }
  return fittedSigned.signedUrl;
}

interface MembershipRow {
  id: string;
  org_id: string;
  role: string;
  status: string;
}

interface DraftRow {
  id: string;
  org_id: string;
  owner_membership_id: string;
  asset_id: string;
  carousel_asset_ids: string[] | null;
  format: ContentFormat;
  caption: string | null;
  cta: string | null;
  hashtags: string[] | null;
  status: string;
}

interface AssetRow {
  id: string;
  org_id: string;
  storage_path: string;
  media_kind: MediaKind;
  mime_type: string;
  byte_size: number | null;
  width_px: number | null;
  height_px: number | null;
}

interface ConnectionRow {
  id: string;
  org_id: string;
  membership_id: string;
  ig_user_id: string | null;
  ig_username: string | null;
  status: string;
  scopes: string[] | null;
  token_ref: string | null;
}

interface AttemptRow {
  id: string;
  status: string;
  meta_container_id: string | null;
  meta_media_id: string | null;
  error_message: string | null;
}

function tokenSecret(): string {
  return (
    Deno.env.get('META_TOKEN_ENCRYPTION_KEY')?.trim() ||
    Deno.env.get('META_APP_SECRET')?.trim() ||
    ''
  );
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

function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

async function resolveMembership(
  db: SupabaseClient,
  req: Request
): Promise<{ userId: string; membership: MembershipRow } | Response> {
  const { data: userData, error: authError } = await db.auth.getUser();
  if (authError || !userData.user) return json({ ok: false, error: 'not_authenticated' }, 401);

  const { data: memberships, error: membershipError } = await db
    .from('memberships')
    .select('id, org_id, role, status')
    .eq('identity_id', userData.user.id)
    .eq('status', 'active');
  if (membershipError) throw membershipError;

  const orgHeader = req.headers.get('x-ascendos-org');
  const list = (memberships as MembershipRow[] | null) ?? [];
  const active =
    list.find((m) => orgHeader && m.org_id === orgHeader) ?? (list.length === 1 ? list[0] : null);
  if (!active) return json({ ok: false, error: 'no_active_membership' }, 403);
  return { userId: userData.user.id, membership: active };
}

function safePublishResponse(payload: Record<string, unknown>, status = 200): Response {
  const body = JSON.stringify(payload);
  if (/"token_ref"\s*:/.test(body) || /"access_token"\s*:/.test(body) || /"accessToken"\s*:/.test(body)) {
    console.error('instagram_publish_token_leak_blocked');
    return json({ ok: false, error: 'internal_error' }, 500);
  }
  return json(payload, status);
}

async function markAttemptFailed(
  admin: SupabaseClient,
  attemptId: string,
  message: string
): Promise<void> {
  const { error } = await admin
    .from('content_publish_attempts')
    .update({
      status: 'failed',
      error_message: sanitizeMetaError(message),
    })
    .eq('id', attemptId)
    .in('status', ['queued', 'submitted']);
  if (error) {
    console.error('instagram_publish_mark_failed_error', error.message);
  }
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  if (req.method !== 'POST') {
    return json({ ok: false, error: 'method_not_allowed' }, 405);
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      draftId?: string;
      confirmed?: boolean;
    };

    if (body.action !== 'publish') {
      return json({ ok: false, error: 'unknown_action' }, 400);
    }
    if (body.confirmed !== true) {
      return json({ ok: false, error: 'confirm_required' }, 400);
    }
    const draftId = typeof body.draftId === 'string' ? body.draftId.trim() : '';
    if (!draftId) return json({ ok: false, error: 'draft_not_found' }, 400);

    const db = userClient(req);
    const resolved = await resolveMembership(db, req);
    if (resolved instanceof Response) return resolved;
    const { membership } = resolved;
    const admin = adminClient();

    const { data: draftRaw, error: draftErr } = await db
      .from('content_drafts')
      .select(
        'id, org_id, owner_membership_id, asset_id, carousel_asset_ids, format, caption, cta, hashtags, status'
      )
      .eq('id', draftId)
      .maybeSingle();
    if (draftErr) throw draftErr;
    const draft = draftRaw as DraftRow | null;
    if (!draft || draft.org_id !== membership.org_id || draft.owner_membership_id !== membership.id) {
      return json({ ok: false, error: 'draft_not_found' }, 404);
    }
    if (draft.status !== 'ready') {
      return json({ ok: false, error: 'draft_not_ready' }, 400);
    }

    const carouselIds = (draft.carousel_asset_ids ?? []).filter(Boolean);
    const isCarousel = carouselIds.length >= 2;
    const orderedAssetIds = isCarousel
      ? carouselIds.slice(0, 6)
      : [draft.asset_id];

    const { data: assetsRaw, error: assetErr } = await db
      .from('content_assets')
      .select('id, org_id, storage_path, media_kind, mime_type, byte_size, width_px, height_px')
      .in('id', orderedAssetIds);
    if (assetErr) throw assetErr;
    const assetById = new Map(
      ((assetsRaw as AssetRow[] | null) ?? []).map((a) => [a.id, a] as const)
    );
    const assets: AssetRow[] = [];
    for (const id of orderedAssetIds) {
      const row = assetById.get(id);
      if (!row || row.org_id !== membership.org_id || !row.storage_path) {
        return json({ ok: false, error: 'asset_not_found' }, 404);
      }
      assets.push(row);
    }
    const asset = assets[0];
    if (isCarousel && assets.some((a) => a.media_kind !== 'image')) {
      return safePublishResponse(
        {
          ok: false,
          error: 'carousel_images_only',
          message: 'Carousel-Veröffentlichung unterstützt aktuell nur Bilder.',
        },
        400
      );
    }

    // Phase 5D: reject Meta-incompatible videos before any Graph container call.
    if (asset.media_kind === 'video' || draft.format === 'reel') {
      const videoCheck = validateReelAssetForPublish({
        mediaKind: asset.media_kind,
        format: draft.format,
        mimeType: asset.mime_type,
        byteSize: asset.byte_size,
        widthPx: asset.width_px,
        heightPx: asset.height_px,
      });
      if (videoCheck !== 'ok') {
        const code = videoCheck as Exclude<ReelValidationCode, 'ok'>;
        return safePublishResponse(
          {
            ok: false,
            error: code,
            message: reelValidationErrorMessage(code),
          },
          400
        );
      }
    }

    const caption = buildPublishCaption({
      caption: draft.caption,
      hashtags: draft.hashtags,
      cta: draft.cta,
    });
    if (!caption && draft.format !== 'story') {
      return json({ ok: false, error: 'missing_caption' }, 400);
    }

    // token_ref only via service role — never selected with user client for responses.
    const { data: connRaw, error: connErr } = await admin
      .from('content_instagram_connections')
      .select('id, org_id, membership_id, ig_user_id, ig_username, status, scopes, token_ref')
      .eq('org_id', membership.org_id)
      .eq('membership_id', membership.id)
      .maybeSingle();
    if (connErr) throw connErr;
    const connection = connRaw as ConnectionRow | null;
    if (!connection || connection.status !== 'connected' || !connection.ig_user_id) {
      return json({ ok: false, error: 'not_connected' }, 400);
    }
    if (!connection.token_ref) {
      return json({ ok: false, error: 'missing_token' }, 400);
    }
    if (!connectionHasPublishScope(connection.scopes)) {
      console.error('instagram_publish_missing_scope', {
        required: IG_PUBLISH_SCOPE,
        have: connection.scopes ?? [],
      });
      return safePublishResponse(
        {
          ok: false,
          error: 'missing_publish_permission',
          message:
            'Instagram-Berechtigung instagram_business_content_publish fehlt. Bitte im Meta Developer Dashboard freischalten und Instagram in AscendOS erneut verbinden.',
          requiredScope: IG_PUBLISH_SCOPE,
        },
        403
      );
    }

    // Idempotency: already published for this draft → return success, no second post.
    const { data: publishedRows, error: pubLookupErr } = await admin
      .from('content_publish_attempts')
      .select('id, status, meta_container_id, meta_media_id, error_message')
      .eq('draft_id', draft.id)
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(1);
    if (pubLookupErr) throw pubLookupErr;
    const already = (publishedRows as AttemptRow[] | null)?.[0];
    if (already?.meta_media_id) {
      return safePublishResponse({
        ok: true,
        status: 'published',
        alreadyPublished: true,
        attemptId: already.id,
        mediaId: already.meta_media_id,
        igUsername: connection.ig_username,
      });
    }

    const { data: activeRows, error: activeErr } = await admin
      .from('content_publish_attempts')
      .select('id, status, meta_container_id, meta_media_id, error_message')
      .eq('draft_id', draft.id)
      .in('status', ['queued', 'submitted'])
      .order('created_at', { ascending: false })
      .limit(1);
    if (activeErr) throw activeErr;
    let attempt = (activeRows as AttemptRow[] | null)?.[0] ?? null;

    if (attempt?.status === 'submitted' && attempt.meta_container_id) {
      // Resume after crash/timeout — never create a second container for this draft.
      // Parallel requests are guarded before media_publish (meta_media_id / status re-check).
      console.log('instagram_publish_resume', { attemptId: attempt.id });
    } else if (attempt?.status === 'queued') {
      // Another request is likely still creating the container.
      return safePublishResponse(
        {
          ok: false,
          error: 'already_in_progress',
          attemptId: attempt.id,
          message: 'Veröffentlichung läuft bereits — bitte kurz warten.',
        },
        409
      );
    } else {
      const { data: inserted, error: insertErr } = await admin
        .from('content_publish_attempts')
        .insert({
          org_id: membership.org_id,
          membership_id: membership.id,
          draft_id: draft.id,
          connection_id: connection.id,
          status: 'queued',
          user_confirmed_at: new Date().toISOString(),
        })
        .select('id, status, meta_container_id, meta_media_id, error_message')
        .single();

      if (insertErr) {
        // Unique active-draft index → concurrent double-click.
        if (insertErr.code === '23505') {
          return safePublishResponse(
            {
              ok: false,
              error: 'already_in_progress',
              message: 'Veröffentlichung läuft bereits — bitte kurz warten.',
            },
            409
          );
        }
        throw insertErr;
      }
      attempt = inserted as AttemptRow;
    }

    if (!attempt) {
      return json({ ok: false, error: 'internal_error' }, 500);
    }

    const secret = tokenSecret();
    if (!secret) {
      await markAttemptFailed(admin, attempt.id, 'missing_encryption_secret');
      return json({ ok: false, error: 'missing_token' }, 500);
    }

    let accessToken: string;
    try {
      accessToken = await decryptToken(connection.token_ref, secret);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'decrypt_failed';
      console.error('instagram_publish_decrypt_failed', sanitizeMetaError(msg));
      await markAttemptFailed(admin, attempt.id, 'token_decrypt_failed');
      return json({ ok: false, error: 'missing_token' }, 500);
    }

    let containerId = attempt.meta_container_id;

    try {
      if (!containerId) {
        if (isCarousel) {
          const childIds: string[] = [];
          for (let i = 0; i < assets.length; i++) {
            const slide = assets[i];
            const { data: signed, error: signErr } = await admin.storage
              .from(CONTENT_ASSETS_BUCKET)
              .createSignedUrl(slide.storage_path, 7200);
            if (signErr || !signed?.signedUrl) {
              console.error('instagram_publish_signed_url_failed', signErr?.message);
              await markAttemptFailed(admin, attempt.id, 'signed_url_failed');
              return json({ ok: false, error: 'signed_url_failed' }, 500);
            }

            let mediaUrl = signed.signedUrl;
            try {
              mediaUrl = await prepareFeedImageUrlForMeta({
                admin,
                sourceSignedUrl: signed.signedUrl,
                orgId: membership.org_id,
                draftId: `${draft.id}-c${i}`,
                mimeType: slide.mime_type,
              });
            } catch (fitErr) {
              const fitMsg = fitErr instanceof Error ? fitErr.message : 'feed_image_fit_failed';
              console.error('instagram_publish_feed_fit_failed', sanitizeMetaError(fitMsg));
              await markAttemptFailed(admin, attempt.id, 'feed_image_fit_failed');
              return safePublishResponse(
                {
                  ok: false,
                  error: 'image_aspect_invalid',
                  message: FEED_IMAGE_ASPECT_ERROR_MESSAGE,
                  attemptId: attempt.id,
                },
                400
              );
            }

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
            caption,
          });
          containerId = parent.containerId;
        } else {
          const { data: signed, error: signErr } = await admin.storage
            .from(CONTENT_ASSETS_BUCKET)
            .createSignedUrl(asset.storage_path, 7200);
          if (signErr || !signed?.signedUrl) {
            console.error('instagram_publish_signed_url_failed', signErr?.message);
            await markAttemptFailed(admin, attempt.id, 'signed_url_failed');
            return json({ ok: false, error: 'signed_url_failed' }, 500);
          }

          let mediaUrl = signed.signedUrl;
          // Feed images: fit into Meta's official aspect/JPEG rules before Graph create.
          if (asset.media_kind === 'image' && draft.format !== 'story' && draft.format !== 'reel') {
            try {
              mediaUrl = await prepareFeedImageUrlForMeta({
                admin,
                sourceSignedUrl: signed.signedUrl,
                orgId: membership.org_id,
                draftId: draft.id,
                mimeType: asset.mime_type,
              });
            } catch (fitErr) {
              const fitMsg = fitErr instanceof Error ? fitErr.message : 'feed_image_fit_failed';
              console.error('instagram_publish_feed_fit_failed', sanitizeMetaError(fitMsg));
              await markAttemptFailed(admin, attempt.id, 'feed_image_fit_failed');
              return safePublishResponse(
                {
                  ok: false,
                  error: 'image_aspect_invalid',
                  message: FEED_IMAGE_ASPECT_ERROR_MESSAGE,
                  attemptId: attempt.id,
                },
                400
              );
            }
          }

          const created = await createMediaContainer({
            igUserId: connection.ig_user_id,
            accessToken,
            mediaKind: asset.media_kind,
            format: draft.format,
            mediaUrl,
            caption,
          });
          containerId = created.containerId;
        }

        // Persist container id immediately — before polling / publish.
        const { error: submitErr } = await admin
          .from('content_publish_attempts')
          .update({
            status: 'submitted',
            meta_container_id: containerId,
            error_message: null,
          })
          .eq('id', attempt.id)
          .eq('status', 'queued');
        if (submitErr) throw submitErr;
      }

      // Always wait for Meta readiness — including feed images (avoids 9007/2207027).
      await waitForContainerReady({
        containerId,
        accessToken,
        mediaKind: isCarousel ? 'image' : asset.media_kind,
      });

      // Idempotency: re-check before media_publish (parallel click / race).
      const { data: beforePublish, error: beforeErr } = await admin
        .from('content_publish_attempts')
        .select('id, status, meta_container_id, meta_media_id, error_message')
        .eq('id', attempt.id)
        .maybeSingle();
      if (beforeErr) throw beforeErr;
      const latest = beforePublish as AttemptRow | null;
      if (latest?.meta_media_id || latest?.status === 'published') {
        return safePublishResponse({
          ok: true,
          status: 'published',
          alreadyPublished: true,
          attemptId: attempt.id,
          mediaId: latest.meta_media_id,
          containerId: latest.meta_container_id ?? containerId,
          igUsername: connection.ig_username,
        });
      }

      const published = await publishMediaContainer({
        igUserId: connection.ig_user_id,
        accessToken,
        containerId,
      });

      const { data: doneRow, error: doneErr } = await admin
        .from('content_publish_attempts')
        .update({
          status: 'published',
          meta_container_id: containerId,
          meta_media_id: published.mediaId,
          error_message: null,
        })
        .eq('id', attempt.id)
        .in('status', ['queued', 'submitted'])
        .is('meta_media_id', null)
        .select('id, meta_media_id')
        .maybeSingle();
      if (doneErr) throw doneErr;
      // If another worker won the race, still treat as success with our media id.
      if (!doneRow) {
        console.log('instagram_publish_race_already_published', { attemptId: attempt.id });
      }

      console.log('instagram_publish_ok', {
        attemptId: attempt.id,
        draftId: draft.id,
        mediaKind: asset.media_kind,
        format: draft.format,
      });

      return safePublishResponse({
        ok: true,
        status: 'published',
        alreadyPublished: false,
        attemptId: attempt.id,
        mediaId: published.mediaId,
        containerId,
        igUsername: connection.ig_username,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'publish_failed';
      const sanitized = sanitizeMetaError(msg);
      console.error('instagram_publish_graph_error', sanitized);
      await markAttemptFailed(admin, attempt.id, sanitized);

      let error = 'publish_failed';
      let message = sanitized;
      if (sanitized.includes('container_timeout')) error = 'container_timeout';
      else if (sanitized.includes('container_error') || sanitized.includes('container_expired'))
        error = 'container_error';
      else if (sanitized.includes('container_')) error = 'container_failed';
      else if (isMetaFeedImageAspectError(sanitized)) {
        error = 'image_aspect_invalid';
        message = FEED_IMAGE_ASPECT_ERROR_MESSAGE;
      }

      return safePublishResponse(
        {
          ok: false,
          error,
          attemptId: attempt.id,
          message,
        },
        502
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'internal_error';
    console.error('instagram_publish_internal', sanitizeMetaError(msg));
    return json({ ok: false, error: 'internal_error' }, 500);
  }
});
