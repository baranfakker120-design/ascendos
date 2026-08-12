import { describe, expect, it } from 'vitest';
import { evaluateOutboxDispatch, isInvalidPushEndpointStatus } from './pushDispatchPolicy';
import {
  buildCoachingPushPayload,
  formatBerlinClock,
  notificationTagFor,
  reminderLeadLabel,
} from './pushPayload';
import { shouldSkipLocalReminderKind } from './notifications';
import { readVapidPublicKey, urlBase64ToUint8Array } from './webPush';

describe('urlBase64ToUint8Array', () => {
  it('decodes url-safe base64', () => {
    const bytes = urlBase64ToUint8Array('AQID');
    expect(Array.from(bytes)).toEqual([1, 2, 3]);
  });
});

describe('readVapidPublicKey', () => {
  it('returns null when VITE_VAPID_PUBLIC_KEY is missing', () => {
    // In vitest/node, import.meta.env.VITE_VAPID_PUBLIC_KEY is typically unset.
    expect(readVapidPublicKey()).toBeNull();
  });
});

describe('push payload', () => {
  it('builds T−45 payload with event metadata', () => {
    const payload = buildCoachingPushPayload({
      eventId: 'evt-1',
      eventTitle: 'Modul 6 — Onboarding',
      startAt: '2026-08-12T18:30:00.000Z',
      zoomUrl: 'https://zoom.us/j/123',
      kind: 't_minus_30',
    });
    expect(payload.title).toBe('🔴 LIVE COACHING');
    expect(payload.body).toContain('Modul 6 — Onboarding');
    expect(payload.body).toContain('Startet in 45 Minuten');
    expect(payload.body).toContain(formatBerlinClock('2026-08-12T18:30:00.000Z'));
    expect(payload.eventId).toBe('evt-1');
    expect(payload.zoomUrl).toBe('https://zoom.us/j/123');
    expect(payload.url).toBe('/?liveCoaching=evt-1');
    expect(notificationTagFor('evt-1', 't_minus_30')).toBe('coaching-evt-1-t_minus_30');
  });

  it('builds T−5 lead label', () => {
    expect(reminderLeadLabel('t_minus_5')).toBe('Startet in 5 Minuten');
    const payload = buildCoachingPushPayload({
      eventId: 'e',
      eventTitle: 'X',
      startAt: '2026-08-12T18:30:00.000Z',
      zoomUrl: null,
      kind: 't_minus_5',
    });
    expect(payload.body).toContain('Startet in 5 Minuten');
  });
});

describe('dispatch policy', () => {
  const baseEvent = {
    id: 'e1',
    title: 'Modul 6',
    starts_at: '2026-08-12T18:30:00.000Z',
    duration_minutes: 60,
    zoom_url: 'https://zoom.us/j/1',
    active: true,
  };

  const baseRow = {
    id: 'r1',
    event_id: 'e1',
    kind: 't_minus_30' as const,
    scheduled_for: '2026-08-12T17:45:00.000Z',
    sent_at: null,
    title: '🔴 LIVE COACHING',
    body: 'body',
  };

  it('allows due unsent active event', () => {
    const now = new Date('2026-08-12T17:46:00.000Z');
    expect(evaluateOutboxDispatch(baseRow, baseEvent, now)).toEqual({ ok: true });
  });

  it('blocks already sent (duplicate protection)', () => {
    const now = new Date('2026-08-12T17:46:00.000Z');
    expect(
      evaluateOutboxDispatch({ ...baseRow, sent_at: '2026-08-12T17:45:01.000Z' }, baseEvent, now)
    ).toEqual({ ok: false, reason: 'already_sent' });
  });

  it('blocks not due', () => {
    const now = new Date('2026-08-12T17:00:00.000Z');
    expect(evaluateOutboxDispatch(baseRow, baseEvent, now)).toEqual({
      ok: false,
      reason: 'not_due',
    });
  });

  it('blocks inactive / cancelled event', () => {
    const now = new Date('2026-08-12T17:46:00.000Z');
    expect(evaluateOutboxDispatch(baseRow, { ...baseEvent, active: false }, now)).toEqual({
      ok: false,
      reason: 'event_inactive',
    });
  });

  it('blocks finished / expired event', () => {
    const now = new Date('2026-08-12T19:31:00.000Z');
    expect(evaluateOutboxDispatch(baseRow, baseEvent, now)).toEqual({
      ok: false,
      reason: 'event_finished',
    });
  });

  it('blocks missing event', () => {
    const now = new Date('2026-08-12T17:46:00.000Z');
    expect(evaluateOutboxDispatch(baseRow, null, now)).toEqual({
      ok: false,
      reason: 'event_missing',
    });
  });

  it('treats 404/410 as invalid subscription', () => {
    expect(isInvalidPushEndpointStatus(404)).toBe(true);
    expect(isInvalidPushEndpointStatus(410)).toBe(true);
    expect(isInvalidPushEndpointStatus(500)).toBe(false);
  });
});

describe('local vs server duplicate protection', () => {
  it('skips T−45/T−5 local when web push primary', () => {
    expect(shouldSkipLocalReminderKind('t_minus_30', true)).toBe(true);
    expect(shouldSkipLocalReminderKind('t_minus_5', true)).toBe(true);
    expect(shouldSkipLocalReminderKind('published', true)).toBe(false);
    expect(shouldSkipLocalReminderKind('t_minus_30', false)).toBe(false);
  });
});

describe('notification click target', () => {
  it('encodes liveCoaching deep link', () => {
    const payload = buildCoachingPushPayload({
      eventId: 'abc/def',
      eventTitle: 'T',
      startAt: '2026-08-12T18:30:00.000Z',
      zoomUrl: null,
      kind: 't_minus_5',
    });
    expect(payload.url).toBe('/?liveCoaching=abc%2Fdef');
  });
});
