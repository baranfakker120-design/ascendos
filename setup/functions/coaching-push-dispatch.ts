// AscendOS Edge Function: coaching-push-dispatch (Dashboard-Version, alles in einer Datei)
// Name der Function MUSS exakt lauten: coaching-push-dispatch
//
// GENERIERT von scripts/bundle-functions.mjs — NICHT von Hand ändern.
// Quelle: supabase/functions/coaching-push-dispatch/index.ts

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

// ---- inline: _shared/cors.ts ----
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  // x-ascendos-org: org selector from the shared Supabase client (additive; required for browser preflight).
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-ascendos-org, x-cron-secret',
};

export function handleOptions(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  return null;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ---- inline: _shared/coaching-push/policy.ts ----
/**
 * Pure dispatch policy for coaching-push-dispatch (mirrored in client tests).
 */

export type CoachingPushKind = 'published' | 't_minus_30' | 't_minus_5';

export interface OutboxRow {
  id: string;
  event_id: string;
  org_id?: string;
  kind: CoachingPushKind;
  scheduled_for: string;
  sent_at: string | null;
  title: string;
  body: string;
}

export interface EventRow {
  id: string;
  org_id?: string;
  title: string;
  starts_at: string;
  duration_minutes: number;
  zoom_url: string | null;
  active: boolean;
}

export type SkipReason =
  | 'already_sent'
  | 'not_due'
  | 'event_missing'
  | 'event_inactive'
  | 'event_finished';

export function endsAtIso(startsAt: string, durationMinutes: number): Date {
  return new Date(new Date(startsAt).getTime() + durationMinutes * 60_000);
}

export function evaluateDispatch(
  row: OutboxRow,
  event: EventRow | null,
  now: Date
): { ok: true } | { ok: false; reason: SkipReason } {
  if (row.sent_at) return { ok: false, reason: 'already_sent' };
  if (new Date(row.scheduled_for).getTime() > now.getTime()) {
    return { ok: false, reason: 'not_due' };
  }
  if (!event) return { ok: false, reason: 'event_missing' };
  if (!event.active) return { ok: false, reason: 'event_inactive' };
  if (now.getTime() > endsAtIso(event.starts_at, event.duration_minutes).getTime()) {
    return { ok: false, reason: 'event_finished' };
  }
  return { ok: true };
}

export function buildPayload(event: EventRow, row: OutboxRow): Record<string, unknown> {
  const clock = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(event.starts_at));

  let lead: string | null = null;
  if (row.kind === 't_minus_30') lead = 'Startet in 45 Minuten';
  if (row.kind === 't_minus_5') lead = 'Startet in 5 Minuten';

  const body =
    row.body?.trim() ||
    [event.title, lead, `Heute · ${clock} Uhr`].filter(Boolean).join('\n');

  return {
    title: row.title?.trim() || '🔴 LIVE COACHING',
    body,
    eventId: event.id,
    startAt: event.starts_at,
    zoomUrl: event.zoom_url,
    kind: row.kind,
    url: `/?liveCoaching=${encodeURIComponent(event.id)}`,
  };
}

// ---- inline: _shared/coaching-push/webPushSend.ts ----
/**
 * coaching-push — Web Push send helpers for Deno Edge (npm:web-push).
 * Private VAPID key stays server-side only.
 */


export interface StoredPushSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export function configureVapid():
  | { ok: true }
  | { ok: false; error: 'vapid_not_configured' } {
  const subject = Deno.env.get('VAPID_SUBJECT')?.trim();
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')?.trim();
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')?.trim();
  if (!subject || !publicKey || !privateKey) {
    return { ok: false, error: 'vapid_not_configured' };
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return { ok: true };
}

export async function sendWebPushToSubscription(
  sub: StoredPushSubscription,
  payloadJson: string
): Promise<{ ok: true } | { ok: false; statusCode?: number; gone: boolean; message: string }> {
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      payloadJson,
      {
        TTL: 60 * 60,
        urgency: 'high',
      }
    );
    return { ok: true };
  } catch (err) {
    const statusCode =
      err && typeof err === 'object' && 'statusCode' in err
        ? Number((err as { statusCode?: number }).statusCode)
        : undefined;
    const message = err instanceof Error ? err.message : String(err);
    const gone = statusCode === 404 || statusCode === 410;
    return { ok: false, statusCode, gone, message };
  }
}

// ---- inline: _shared/coaching-push/recipients.ts ----
/**
 * Org-scoped push recipient selection (Phase 5).
 * push_subscriptions stay user-scoped; isolation happens at send time.
 *
 * Keep in sync with src/features/live-coaching/pushOrgRecipients.ts
 */

export interface MembershipRecipient {
  identity_id: string;
  org_id: string;
  status: string;
}

export interface PushSubRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Keep only subscriptions whose user has an active membership in eventOrgId.
 */
export function filterSubscriptionsForOrg(
  subscriptions: PushSubRow[],
  memberships: MembershipRecipient[],
  eventOrgId: string
): PushSubRow[] {
  const allowedUsers = new Set(
    memberships
      .filter((m) => m.status === 'active' && m.org_id === eventOrgId)
      .map((m) => m.identity_id)
  );
  return subscriptions.filter((s) => allowedUsers.has(s.user_id));
}

/** Payload must not advertise a foreign organization id. */
export function assertPayloadOrgSafe(
  payload: Record<string, unknown>,
  eventOrgId: string
): boolean {
  if (payload.org_id != null && String(payload.org_id) !== eventOrgId) return false;
  if (payload.orgId != null && String(payload.orgId) !== eventOrgId) return false;
  return true;
}

/**
 * Event org is authority. Outbox org must match when both present
 * (Phase 7 — no cross-org outbox → event send).
 */
export function resolveDispatchOrgId(
  outboxOrgId: string | null | undefined,
  eventOrgId: string | null | undefined
): { ok: true; orgId: string } | { ok: false; reason: 'missing_org' | 'org_mismatch' } {
  if (!eventOrgId) {
    if (!outboxOrgId) return { ok: false, reason: 'missing_org' };
    return { ok: true, orgId: outboxOrgId };
  }
  if (outboxOrgId && outboxOrgId !== eventOrgId) {
    return { ok: false, reason: 'org_mismatch' };
  }
  return { ok: true, orgId: eventOrgId };
}

// ---- inline: _shared/coaching-push/index.ts ----


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
