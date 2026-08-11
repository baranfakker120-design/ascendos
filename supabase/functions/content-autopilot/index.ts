/**
 * content-autopilot — user JWT actions for Instagram Content Autopilot V1.
 *
 * Actions: get_state | activate | pause | resume | deactivate | replan
 * Instagram-only. No Facebook. Never touches OAuth start/callback.
 */

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { handleOptions, json } from '../_shared/cors.ts';
import {
  AUTOPILOT_MAX_FEED_PER_DAY,
  AUTOPILOT_MAX_STORIES_PER_DAY,
  AUTOPILOT_MIN_ELIGIBLE_ASSETS,
  buildAutopilotWeekPlan,
  canActivateAutopilot,
  countByScope,
  enumerateDatesInclusive,
  type AutopilotEligibleAsset,
  type AutopilotHistoryItem,
} from '../_shared/content-autopilot/index.ts';

interface MembershipRow {
  id: string;
  org_id: string;
  role: string;
  status: string;
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

async function resolveMembership(
  db: SupabaseClient,
  req: Request
): Promise<{ membership: MembershipRow } | Response> {
  const { data: userData, error: authError } = await db.auth.getUser();
  if (authError || !userData.user) return json({ ok: false, error: 'not_authenticated' }, 401);

  const { data: memberships, error } = await db
    .from('memberships')
    .select('id, org_id, role, status')
    .eq('identity_id', userData.user.id)
    .eq('status', 'active');
  if (error) throw error;
  const orgHeader = req.headers.get('x-ascendos-org');
  const list = (memberships as MembershipRow[] | null) ?? [];
  const active =
    list.find((m) => orgHeader && m.org_id === orgHeader) ?? (list.length === 1 ? list[0] : null);
  if (!active) return json({ ok: false, error: 'no_active_membership' }, 403);
  return { membership: active };
}

async function loadEligibleAssets(
  db: SupabaseClient,
  orgId: string,
  membershipId: string
): Promise<AutopilotEligibleAsset[]> {
  const { data, error } = await db
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
  db: SupabaseClient,
  membershipId: string
): Promise<AutopilotHistoryItem[]> {
  const since = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from('content_autopilot_slots')
    .select('asset_id, category, theme, published_at, planned_for, slot_kind, status')
    .eq('membership_id', membershipId)
    .in('status', ['published', 'ready', 'planned', 'publishing'])
    .gte('planned_for', since)
    .order('planned_for', { ascending: false })
    .limit(80);
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    assetId: (row.asset_id as string) ?? null,
    category: (row.category as string) ?? null,
    theme: (row.theme as string) ?? null,
    publishedAt: String(row.published_at ?? row.planned_for),
    slotKind: String(row.slot_kind ?? 'feed'),
  }));
}

function defaultPeriod(): { start: string; end: string } {
  const now = new Date();
  // Start = today (UTC date for planning seed; slots use Berlin offset)
  const start = now.toISOString().slice(0, 10);
  const endDate = new Date(now);
  endDate.setUTCDate(endDate.getUTCDate() + 6);
  const end = endDate.toISOString().slice(0, 10);
  return { start, end };
}

async function ensureSettings(
  db: SupabaseClient,
  membership: MembershipRow
): Promise<Record<string, unknown>> {
  const { data: existing } = await db
    .from('content_autopilot_settings')
    .select('*')
    .eq('org_id', membership.org_id)
    .eq('membership_id', membership.id)
    .maybeSingle();
  if (existing) return existing as Record<string, unknown>;
  const { data, error } = await db
    .from('content_autopilot_settings')
    .insert({
      org_id: membership.org_id,
      membership_id: membership.id,
      enabled: false,
      paused: false,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as Record<string, unknown>;
}

async function igConnected(db: SupabaseClient, membership: MembershipRow): Promise<boolean> {
  const { data } = await db
    .from('content_instagram_connections')
    .select('status, ig_user_id, token_ref, scopes')
    .eq('org_id', membership.org_id)
    .eq('membership_id', membership.id)
    .maybeSingle();
  if (!data || data.status !== 'connected' || !data.ig_user_id || !data.token_ref) return false;
  const scopes = (data.scopes as string[] | null) ?? [];
  return scopes.includes('instagram_business_content_publish');
}

async function createDraftForSlot(
  db: SupabaseClient,
  membership: MembershipRow,
  assetId: string,
  format: 'story' | 'feed' | 'reel',
  category: string
): Promise<string | null> {
  // Reuse newest ready/draft for same asset+format if present.
  const { data: existing } = await db
    .from('content_drafts')
    .select('id, status, format')
    .eq('asset_id', assetId)
    .eq('owner_membership_id', membership.id)
    .eq('format', format)
    .in('status', ['draft', 'ready'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing?.id) {
    if (existing.status !== 'ready') {
      await db.from('content_drafts').update({ status: 'ready' }).eq('id', existing.id);
    }
    return existing.id as string;
  }

  const { data: asset } = await db
    .from('content_assets')
    .select(
      'id, title, theme, keywords, detected_summary, audience_hint, analysis_json, mime_type, media_kind'
    )
    .eq('id', assetId)
    .maybeSingle();
  if (!asset) return null;

  const analysis = (asset.analysis_json ?? {}) as Record<string, unknown>;
  const hook =
    (typeof analysis.hook === 'string' && analysis.hook) ||
    (asset.theme ? String(asset.theme).slice(0, 120) : null) ||
    (asset.title ? String(asset.title).slice(0, 120) : 'AscendOS Update');
  const caption =
    (typeof analysis.caption === 'string' && analysis.caption) ||
    (asset.detected_summary ? String(asset.detected_summary).slice(0, 1800) : null) ||
    `${hook}`;
  const cta =
    (typeof analysis.cta === 'string' && analysis.cta) ||
    (format === 'story' ? '' : 'Speichere diesen Beitrag für später.');
  const keywords = Array.isArray(asset.keywords) ? asset.keywords.slice(0, 12) : [];
  let hashtags: string[] = [];
  if (Array.isArray(analysis.hashtags)) {
    hashtags = analysis.hashtags.map(String).map((h) => h.replace(/^#/, '')).slice(0, 5);
  }
  while (hashtags.length < 5) {
    const pad = ['ascendos', 'content', category || 'business', 'team', 'fokus'][hashtags.length];
    if (!hashtags.includes(pad)) hashtags.push(pad);
    else hashtags.push(`tag${hashtags.length + 1}`);
  }
  hashtags = hashtags.slice(0, 5);

  const { data: draft, error } = await db
    .from('content_drafts')
    .insert({
      org_id: membership.org_id,
      asset_id: assetId,
      owner_membership_id: membership.id,
      format,
      hook,
      caption: format === 'story' ? caption.slice(0, 400) : caption,
      cta,
      keywords,
      hashtags,
      clean_check_status: 'clean',
      clean_check_notes: 'Autopilot draft from existing asset analysis / metadata.',
      target_audience: asset.audience_hint,
      posting_hint: `Autopilot · ${category}`,
      status: 'ready',
      carousel_asset_ids: [],
      analysis_json: {
        source: 'autopilot_v1',
        category,
        reused_analysis: Boolean(analysis && Object.keys(analysis).length),
      },
    })
    .select('id')
    .single();
  if (error) {
    console.error('autopilot_draft_insert_failed', error.message);
    return null;
  }
  return draft.id as string;
}

async function buildAndInsertPlan(
  db: SupabaseClient,
  membership: MembershipRow,
  periodStart: string,
  periodEnd: string
): Promise<{ planId: string; slotCount: number; skipped: number }> {
  const assets = await loadEligibleAssets(db, membership.org_id, membership.id);
  const history = await loadHistory(db, membership.id);
  const planned = buildAutopilotWeekPlan({
    periodStart,
    periodEnd,
    assets,
    history,
    maxFeedPerDay: AUTOPILOT_MAX_FEED_PER_DAY,
    maxStoriesPerDay: AUTOPILOT_MAX_STORIES_PER_DAY,
  });

  // Cancel previous active plans' future slots
  const { data: activePlans } = await db
    .from('content_autopilot_plans')
    .select('id')
    .eq('membership_id', membership.id)
    .eq('status', 'active');
  for (const p of activePlans ?? []) {
    await db
      .from('content_autopilot_slots')
      .update({ status: 'cancelled' })
      .eq('plan_id', p.id)
      .in('status', ['planned', 'ready', 'failed']);
    await db.from('content_autopilot_plans').update({ status: 'cancelled' }).eq('id', p.id);
  }

  const { data: plan, error: planErr } = await db
    .from('content_autopilot_plans')
    .insert({
      org_id: membership.org_id,
      membership_id: membership.id,
      period_start: periodStart,
      period_end: periodEnd,
      status: 'active',
      summary: `Autopilot ${periodStart} → ${periodEnd}`,
    })
    .select('id')
    .single();
  if (planErr) throw planErr;

  let slotCount = 0;
  let skipped = 0;
  for (const s of planned) {
    if (s.status === 'skipped' || !s.assetId) {
      skipped += 1;
      await db.from('content_autopilot_slots').insert({
        org_id: membership.org_id,
        membership_id: membership.id,
        plan_id: plan.id,
        asset_id: null,
        planned_for: s.plannedFor,
        slot_kind: s.slotKind,
        content_format: s.contentFormat,
        theme: s.theme,
        category: s.category,
        selection_reason: s.selectionReason,
        status: 'skipped',
        error_message: s.skipReason ?? 'no_suitable_asset',
      });
      continue;
    }

    const draftId = await createDraftForSlot(
      db,
      membership,
      s.assetId,
      s.contentFormat,
      s.category
    );
    if (!draftId) {
      skipped += 1;
      await db.from('content_autopilot_slots').insert({
        org_id: membership.org_id,
        membership_id: membership.id,
        plan_id: plan.id,
        asset_id: s.assetId,
        planned_for: s.plannedFor,
        slot_kind: s.slotKind,
        content_format: s.contentFormat,
        theme: s.theme,
        category: s.category,
        selection_reason: s.selectionReason,
        status: 'skipped',
        error_message: 'draft_create_failed',
      });
      continue;
    }

    const { error: slotErr } = await db.from('content_autopilot_slots').insert({
      org_id: membership.org_id,
      membership_id: membership.id,
      plan_id: plan.id,
      draft_id: draftId,
      asset_id: s.assetId,
      planned_for: s.plannedFor,
      slot_kind: s.slotKind,
      content_format: s.contentFormat,
      theme: s.theme,
      category: s.category,
      selection_reason: s.selectionReason,
      status: 'ready',
    });
    if (slotErr) {
      // Reservation conflict — skip
      skipped += 1;
      continue;
    }
    slotCount += 1;
  }

  return { planId: plan.id as string, slotCount, skipped };
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  try {
    const db = userClient(req);
    const resolved = await resolveMembership(db, req);
    if (resolved instanceof Response) return resolved;
    const { membership } = resolved;
    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      periodStart?: string;
      periodEnd?: string;
    };
    const action = String(body.action ?? 'get_state');

    const settings = await ensureSettings(db, membership);
    const assets = await loadEligibleAssets(db, membership.org_id, membership.id);
    const scopeCounts = countByScope(assets);
    const gate = canActivateAutopilot(assets, AUTOPILOT_MIN_ELIGIBLE_ASSETS);
    const connected = await igConnected(db, membership);

    if (action === 'get_state') {
      const { data: plan } = await db
        .from('content_autopilot_plans')
        .select('id, period_start, period_end, status, summary, created_at')
        .eq('membership_id', membership.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let slots: unknown[] = [];
      if (plan?.id) {
        const { data: slotRows } = await db
          .from('content_autopilot_slots')
          .select(
            'id, draft_id, asset_id, planned_for, slot_kind, content_format, theme, category, selection_reason, status, error_message, published_at, retry_count'
          )
          .eq('plan_id', plan.id)
          .order('planned_for', { ascending: true });
        slots = slotRows ?? [];
      }

      const today = new Date().toISOString().slice(0, 10);
      const weekSlots = (slots as Array<Record<string, unknown>>) ?? [];
      const stats = {
        feedPlanned: weekSlots.filter((s) => s.slot_kind === 'feed' && s.status !== 'cancelled')
          .length,
        feedPublished: weekSlots.filter(
          (s) => s.slot_kind === 'feed' && s.status === 'published'
        ).length,
        storiesPlanned: weekSlots.filter(
          (s) => s.slot_kind === 'story' && s.status !== 'cancelled'
        ).length,
        storiesPublished: weekSlots.filter(
          (s) => s.slot_kind === 'story' && s.status === 'published'
        ).length,
        skipped: weekSlots.filter((s) => s.status === 'skipped').length,
        failed: weekSlots.filter((s) => s.status === 'failed').length,
        todayFeed: weekSlots.filter(
          (s) =>
            s.slot_kind === 'feed' &&
            String(s.planned_for).startsWith(today) &&
            s.status !== 'cancelled' &&
            s.status !== 'skipped'
        ).length,
        todayStories: weekSlots.filter(
          (s) =>
            s.slot_kind === 'story' &&
            String(s.planned_for).startsWith(today) &&
            s.status !== 'cancelled' &&
            s.status !== 'skipped'
        ).length,
      };

      const next = weekSlots.find(
        (s) =>
          (s.status === 'ready' || s.status === 'planned') &&
          new Date(String(s.planned_for)).getTime() >= Date.now() - 60_000
      );

      return json({
        ok: true,
        settings,
        instagramConnected: connected,
        eligibility: {
          ...gate,
          ...scopeCounts,
          minRequired: AUTOPILOT_MIN_ELIGIBLE_ASSETS,
          maxFeedPerDay: AUTOPILOT_MAX_FEED_PER_DAY,
          maxStoriesPerDay: AUTOPILOT_MAX_STORIES_PER_DAY,
        },
        plan: plan ?? null,
        slots,
        stats,
        nextSlot: next ?? null,
        datesInPeriod: plan
          ? enumerateDatesInclusive(String(plan.period_start), String(plan.period_end))
          : [],
      });
    }

    if (action === 'activate') {
      if (!connected) {
        return json({ ok: false, error: 'instagram_not_connected' }, 400);
      }
      if (!gate.ok) {
        return json(
          {
            ok: false,
            error: 'below_min_assets',
            count: gate.count,
            minRequired: AUTOPILOT_MIN_ELIGIBLE_ASSETS,
            scopeCounts,
          },
          400
        );
      }
      const period = defaultPeriod();
      const periodStart = String(body.periodStart ?? period.start).slice(0, 10);
      const periodEnd = String(body.periodEnd ?? period.end).slice(0, 10);

      const built = await buildAndInsertPlan(db, membership, periodStart, periodEnd);
      const { data: updatedSettings, error: setErr } = await db
        .from('content_autopilot_settings')
        .update({
          enabled: true,
          paused: false,
          consent_confirmed_at: new Date().toISOString(),
          last_activated_at: new Date().toISOString(),
        })
        .eq('org_id', membership.org_id)
        .eq('membership_id', membership.id)
        .select('*')
        .single();
      if (setErr) throw setErr;

      return json({
        ok: true,
        settings: updatedSettings,
        planId: built.planId,
        slotCount: built.slotCount,
        skipped: built.skipped,
      });
    }

    if (action === 'pause') {
      const { data, error } = await db
        .from('content_autopilot_settings')
        .update({ paused: true, last_paused_at: new Date().toISOString() })
        .eq('membership_id', membership.id)
        .select('*')
        .single();
      if (error) throw error;
      return json({ ok: true, settings: data });
    }

    if (action === 'resume') {
      if (!connected) return json({ ok: false, error: 'instagram_not_connected' }, 400);
      if (!gate.ok) return json({ ok: false, error: 'below_min_assets', count: gate.count }, 400);
      const { data, error } = await db
        .from('content_autopilot_settings')
        .update({ paused: false, enabled: true })
        .eq('membership_id', membership.id)
        .select('*')
        .single();
      if (error) throw error;
      return json({ ok: true, settings: data });
    }

    if (action === 'deactivate') {
      const { data: activePlans } = await db
        .from('content_autopilot_plans')
        .select('id')
        .eq('membership_id', membership.id)
        .eq('status', 'active');
      for (const p of activePlans ?? []) {
        await db
          .from('content_autopilot_slots')
          .update({ status: 'cancelled' })
          .eq('plan_id', p.id)
          .in('status', ['planned', 'ready', 'failed']);
        await db.from('content_autopilot_plans').update({ status: 'cancelled' }).eq('id', p.id);
      }
      const { data, error } = await db
        .from('content_autopilot_settings')
        .update({ enabled: false, paused: false })
        .eq('membership_id', membership.id)
        .select('*')
        .single();
      if (error) throw error;
      return json({ ok: true, settings: data });
    }

    if (action === 'replan') {
      if (!connected) return json({ ok: false, error: 'instagram_not_connected' }, 400);
      if (!gate.ok) return json({ ok: false, error: 'below_min_assets', count: gate.count }, 400);
      const period = defaultPeriod();
      const periodStart = String(body.periodStart ?? period.start).slice(0, 10);
      const periodEnd = String(body.periodEnd ?? period.end).slice(0, 10);
      const built = await buildAndInsertPlan(db, membership, periodStart, periodEnd);
      return json({ ok: true, planId: built.planId, slotCount: built.slotCount, skipped: built.skipped });
    }

    return json({ ok: false, error: 'unknown_action' }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'internal_error';
    console.error('content_autopilot_error', msg);
    return json({ ok: false, error: 'internal_error' }, 500);
  }
});
