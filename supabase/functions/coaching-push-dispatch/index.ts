/**
 * coaching-push-dispatch — process due Live Coaching outbox rows via Web Push.
 *
 * Target schedule: every 1 minute (configure externally; NOT auto-enabled here).
 * Same auth pattern as content-daily-prepare / content-autopilot-run:
 *   Header: x-cron-secret: $CRON_SECRET   (or Bearer CRON_SECRET)
 *
 * Phase 5 tenant discipline (service_role bypasses RLS — filter explicitly):
 *   outbox.org_id / event.org_id
 *   → active memberships in that org
 *   → push_subscriptions for those users only
 *
 * Uses existing tables only:
 *   - coaching_notification_outbox
 *   - push_subscriptions
 *   - live_coaching_events
 *   - memberships
 *
 * Secrets (server):
 *   CRON_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Never Instagram / Autopilot / OAuth.
 */

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { handleOptions, json } from '../_shared/cors.ts';
import {
  assertPayloadOrgSafe,
  buildPayload,
  configureVapid,
  evaluateDispatch,
  filterSubscriptionsForOrg,
  resolveDispatchOrgId,
  sendWebPushToSubscription,
  type EventRow,
  type MembershipRecipient,
  type OutboxRow,
  type PushSubRow,
} from '../_shared/coaching-push/index.ts';

function authorizeCron(req: Request): Response | null {
  const expected = Deno.env.get('CRON_SECRET');
  if (!expected) {
    return json({ ok: false, error: 'cron_secret_not_configured' }, 503);
  }
  const header =
    req.headers.get('x-cron-secret') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    '';
  if (!header || header !== expected) {
    return json({ ok: false, error: 'unauthorized' }, 401);
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

/** Claim row for send: set sent_at only if still null (duplicate protection). */
async function claimOutboxRow(
  db: SupabaseClient,
  id: string,
  sentAtIso: string
): Promise<boolean> {
  const { data, error } = await db
    .from('coaching_notification_outbox')
    .update({ sent_at: sentAtIso })
    .eq('id', id)
    .is('sent_at', null)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

async function releaseOutboxClaim(db: SupabaseClient, id: string): Promise<void> {
  await db.from('coaching_notification_outbox').update({ sent_at: null }).eq('id', id);
}

async function markOutboxSkipped(db: SupabaseClient, id: string, nowIso: string): Promise<void> {
  // Mark as sent so we never retry dead rows (inactive/finished/missing).
  await db
    .from('coaching_notification_outbox')
    .update({ sent_at: nowIso })
    .eq('id', id)
    .is('sent_at', null);
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  if (req.method !== 'POST' && req.method !== 'GET') {
    return json({ ok: false, error: 'method_not_allowed' }, 405);
  }

  const denied = authorizeCron(req);
  if (denied) return denied;

  const vapid = configureVapid();
  if (!vapid.ok) {
    return json({ ok: false, error: vapid.error }, 503);
  }

  const db = adminClient();
  const now = new Date();
  const nowIso = now.toISOString();

  const { data: dueRows, error: dueErr } = await db
    .from('coaching_notification_outbox')
    .select('id, event_id, org_id, kind, scheduled_for, sent_at, title, body')
    .is('sent_at', null)
    .lte('scheduled_for', nowIso)
    .order('scheduled_for', { ascending: true })
    .limit(50);

  if (dueErr) {
    return json({ ok: false, error: dueErr.message }, 500);
  }

  const rows = (dueRows ?? []) as OutboxRow[];
  if (rows.length === 0) {
    return json({ ok: true, processed: 0, sent: 0, skipped: 0, removedSubs: 0 });
  }

  const eventIds = [...new Set(rows.map((r) => r.event_id))];
  const { data: eventsData, error: evErr } = await db
    .from('live_coaching_events')
    .select('id, org_id, title, starts_at, duration_minutes, zoom_url, active')
    .in('id', eventIds);
  if (evErr) {
    return json({ ok: false, error: evErr.message }, 500);
  }
  const eventsById = new Map((eventsData as EventRow[] | null)?.map((e) => [e.id, e]) ?? []);

  const orgIds = [
    ...new Set(
      rows
        .map((r) => r.org_id ?? eventsById.get(r.event_id)?.org_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const { data: membershipRows, error: memErr } = await db
    .from('memberships')
    .select('identity_id, org_id, status')
    .in('org_id', orgIds.length > 0 ? orgIds : ['00000000-0000-0000-0000-000000000000'])
    .eq('status', 'active');
  if (memErr) {
    return json({ ok: false, error: memErr.message }, 500);
  }
  const memberships = (membershipRows ?? []) as MembershipRecipient[];

  const memberUserIds = [...new Set(memberships.map((m) => m.identity_id))];
  const { data: subsData, error: subErr } = await db
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .in(
      'user_id',
      memberUserIds.length > 0 ? memberUserIds : ['00000000-0000-0000-0000-000000000000']
    );
  if (subErr) {
    return json({ ok: false, error: subErr.message }, 500);
  }
  const allSubscriptions = (subsData ?? []) as PushSubRow[];

  let sent = 0;
  let skipped = 0;
  let removedSubs = 0;
  const details: Array<Record<string, unknown>> = [];

  for (const row of rows) {
    const event = eventsById.get(row.event_id) ?? null;
    const orgResolved = resolveDispatchOrgId(row.org_id, event?.org_id ?? null);
    if (!orgResolved.ok) {
      await markOutboxSkipped(db, row.id, nowIso);
      skipped += 1;
      details.push({ id: row.id, skipped: orgResolved.reason });
      continue;
    }
    const eventOrgId = orgResolved.orgId;

    const decision = evaluateDispatch(row, event, now);
    if (!decision.ok) {
      await markOutboxSkipped(db, row.id, nowIso);
      skipped += 1;
      details.push({ id: row.id, skipped: decision.reason, orgId: eventOrgId });
      continue;
    }

    // Recipients are filtered per-event org — never reuse another org's list.
    const subscriptions = filterSubscriptionsForOrg(allSubscriptions, memberships, eventOrgId);
    if (subscriptions.length === 0) {
      // Keep due for later — someone may subscribe before the event.
      skipped += 1;
      details.push({ id: row.id, skipped: 'no_org_subscriptions', orgId: eventOrgId });
      continue;
    }

    // Claim before send — second worker loses the race and skips.
    const claimed = await claimOutboxRow(db, row.id, nowIso);
    if (!claimed) {
      skipped += 1;
      details.push({ id: row.id, skipped: 'race_lost', orgId: eventOrgId });
      continue;
    }

    const payloadObj = buildPayload(event!, row);
    if (!assertPayloadOrgSafe(payloadObj, eventOrgId)) {
      await releaseOutboxClaim(db, row.id);
      skipped += 1;
      details.push({ id: row.id, skipped: 'payload_org_unsafe', orgId: eventOrgId });
      continue;
    }
    const payload = JSON.stringify(payloadObj);
    let anyOk = false;
    let sendErrors = 0;
    let goneCount = 0;

    for (const sub of subscriptions) {
      const result = await sendWebPushToSubscription(sub, payload);
      if (result.ok) {
        anyOk = true;
        continue;
      }
      sendErrors += 1;
      if (result.gone) {
        goneCount += 1;
        const { error: delErr } = await db.from('push_subscriptions').delete().eq('id', sub.id);
        if (!delErr) removedSubs += 1;
      }
    }

    if (anyOk) {
      sent += 1;
      details.push({
        id: row.id,
        sent: true,
        kind: row.kind,
        eventId: row.event_id,
        orgId: eventOrgId,
        recipients: subscriptions.length,
      });
      continue;
    }

    // No successful delivery.
    if (goneCount === subscriptions.length) {
      // All endpoints dead — keep claimed to avoid endless retries.
      skipped += 1;
      details.push({ id: row.id, skipped: 'all_subscriptions_gone', orgId: eventOrgId });
      continue;
    }

    // Transient failures — release for retry.
    await releaseOutboxClaim(db, row.id);
    details.push({ id: row.id, retry: true, sendErrors, orgId: eventOrgId });
  }

  return json({
    ok: true,
    processed: rows.length,
    sent,
    skipped,
    removedSubs,
    details,
  });
});
