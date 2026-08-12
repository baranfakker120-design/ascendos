/**
 * Shared Live Coaching Web Push payload + copy helpers (client + tests).
 * Server edge function mirrors the same shape.
 */

export type CoachingPushKind = 'published' | 't_minus_30' | 't_minus_5';

export interface CoachingPushPayload {
  title: string;
  body: string;
  eventId: string;
  startAt: string;
  zoomUrl: string | null;
  kind: CoachingPushKind;
  /** In-app path to open on notification click. */
  url: string;
}

export function formatBerlinClock(iso: string | Date): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

export function reminderLeadLabel(kind: CoachingPushKind): string | null {
  if (kind === 't_minus_30') return 'Startet in 45 Minuten';
  if (kind === 't_minus_5') return 'Startet in 5 Minuten';
  return null;
}

export function buildCoachingPushPayload(input: {
  eventId: string;
  eventTitle: string;
  startAt: string;
  zoomUrl: string | null;
  kind: CoachingPushKind;
  /** Optional prebuilt title/body from outbox (preferred when present). */
  outboxTitle?: string;
  outboxBody?: string;
}): CoachingPushPayload {
  const lead = reminderLeadLabel(input.kind);
  const clock = formatBerlinClock(input.startAt);
  const title = '🔴 LIVE COACHING';
  const bodyParts = [input.eventTitle];
  if (lead) bodyParts.push(lead);
  bodyParts.push(`Heute · ${clock} Uhr`);

  return {
    title: input.outboxTitle?.trim() ? input.outboxTitle : title,
    body: input.outboxBody?.trim() ? input.outboxBody : bodyParts.join('\n'),
    eventId: input.eventId,
    startAt: input.startAt,
    zoomUrl: input.zoomUrl,
    kind: input.kind,
    url: `/?liveCoaching=${encodeURIComponent(input.eventId)}`,
  };
}

export function notificationTagFor(eventId: string, kind: CoachingPushKind): string {
  return `coaching-${eventId}-${kind}`;
}
