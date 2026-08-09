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

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { handleOptions, json } from '../_shared/cors.ts';
import {
  ASSET_COOLDOWN_DAYS,
  BERLIN_TZ,
  berlinPrepDate,
  chooseContentFormat,
  isBerlinNoonWindow,
  selectBestAsset,
  subtractDaysFromDate,
  type SelectableAsset,
} from '../_shared/content-daily/index.ts';
import {
  countGenerationsToday,
  generateDraftFromAsset,
  markAssetAnalysisFailed,
  resolveDailyGenerationLimit,
  VisionFailureError,
  type AssetRow,
  type MembershipRow,
} from '../_shared/content-generate/index.ts';

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
