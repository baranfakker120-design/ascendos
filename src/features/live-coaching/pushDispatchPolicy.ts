/**
 * Pure policy for coaching-push-dispatch (unit-tested).
 * Edge function mirrors these rules.
 */

import { endsAt } from './liveState';
import type { CoachingPushKind } from './pushPayload';

export interface OutboxCandidate {
  id: string;
  event_id: string;
  kind: CoachingPushKind;
  scheduled_for: string;
  sent_at: string | null;
  title: string;
  body: string;
}

export interface EventCandidate {
  id: string;
  title: string;
  starts_at: string;
  duration_minutes: number;
  zoom_url: string | null;
  active: boolean;
}

export type DispatchSkipReason =
  | 'already_sent'
  | 'not_due'
  | 'event_missing'
  | 'event_inactive'
  | 'event_finished'
  | 'kind_published_skip_push';

export function isDue(scheduledFor: string, now: Date): boolean {
  return new Date(scheduledFor).getTime() <= now.getTime();
}

export function isEventFinished(
  event: Pick<EventCandidate, 'starts_at' | 'duration_minutes'>,
  now: Date
): boolean {
  const end = endsAt(new Date(event.starts_at), event.duration_minutes);
  return now.getTime() > end.getTime();
}

/**
 * Whether an outbox row should be delivered via Web Push now.
 * `published` is typically shown locally on the publisher device at save —
 * server push for `published` is allowed so subscribed members also get it.
 */
export function evaluateOutboxDispatch(
  row: OutboxCandidate,
  event: EventCandidate | null,
  now: Date = new Date()
): { ok: true } | { ok: false; reason: DispatchSkipReason } {
  if (row.sent_at) return { ok: false, reason: 'already_sent' };
  if (!isDue(row.scheduled_for, now)) return { ok: false, reason: 'not_due' };
  if (!event) return { ok: false, reason: 'event_missing' };
  if (!event.active) return { ok: false, reason: 'event_inactive' };
  if (isEventFinished(event, now)) return { ok: false, reason: 'event_finished' };
  return { ok: true };
}

/** HTTP statuses that mean the push endpoint is gone forever. */
export function isInvalidPushEndpointStatus(status: number): boolean {
  return status === 404 || status === 410;
}
