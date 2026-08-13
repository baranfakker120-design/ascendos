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
