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
  buildAndInsertAutopilotPlan,
  canActivateAutopilot,
  countByScope,
  enumerateDatesInclusive,
  type AutopilotEligibleAsset,
  type AutopilotHistoryItem,
} from '../_shared/content-autopilot/index.ts';

/** Local auth membership shape — must not collide with content-generate MembershipRow in setup bundles. */
interface AutopilotMembershipRow {
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
): Promise<{ membership: AutopilotMembershipRow } | Response> {
  const { data: userData, error: authError } = await db.auth.getUser();
  if (authError || !userData.user) return json({ ok: false, error: 'not_authenticated' }, 401);

  const { data: memberships, error } = await db
    .from('memberships')
    .select('id, org_id, role, status')
    .eq('identity_id', userData.user.id)
    .eq('status', 'active');
  if (error) throw error;
  const orgHeader = req.headers.get('x-ascendos-org');
  const list = (memberships as AutopilotMembershipRow[] | null) ?? [];
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
      'id, scope, media_kind, mime_type, storage_path, theme, keywords, suggested_formats, aspect_ratio, analysis_status, last_used_at, usage_count, created_at, owner_membership_id'
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
    if (ids.length === 0) items.push({ assetId: null, ...base });
    else for (const id of ids) items.push({ assetId: String(id), ...base });
  }
  return items.slice(0, 120);
}

function defaultPeriod(): { start: string; end: string } {
  const now = new Date();
  const start = now.toISOString().slice(0, 10);
  const endDate = new Date(now);
  endDate.setUTCDate(endDate.getUTCDate() + 6);
  const end = endDate.toISOString().slice(0, 10);
  return { start, end };
}

async function ensureSettings(
  db: SupabaseClient,
  membership: AutopilotMembershipRow
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

async function igConnected(db: SupabaseClient, membership: AutopilotMembershipRow): Promise<boolean> {
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
      const history = await loadHistory(db, membership.id);
      const built = await buildAndInsertAutopilotPlan(
        db,
        membership,
        periodStart,
        periodEnd,
        assets,
        history
      );
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
      const history = await loadHistory(db, membership.id);
      const built = await buildAndInsertAutopilotPlan(
        db,
        membership,
        periodStart,
        periodEnd,
        assets,
        history
      );
      return json({
        ok: true,
        planId: built.planId,
        slotCount: built.slotCount,
        skipped: built.skipped,
      });
    }

    return json({ ok: false, error: 'unknown_action' }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'internal_error';
    console.error('content_autopilot_error', msg);
    return json({ ok: false, error: 'internal_error' }, 500);
  }
});
