import { createTranslator } from '@shared/i18n';
import { readStoredLocale } from '@shared/lib/locale';
import { isWebPushPrimaryActive } from './webPush';

/**
 * Outbox/DB kind `t_minus_30` is retained for schema compatibility (no migration).
 * Timing is T−45 minutes as required by Live Coaching V2 UX.
 */
export type CoachingNotifyKind = 'published' | 't_minus_30' | 't_minus_5';

export const COACHING_REMINDER_T45_MS = 45 * 60_000;
export const COACHING_REMINDER_T5_MS = 5 * 60_000;

export interface CoachingNotifyPlanItem {
  kind: CoachingNotifyKind;
  scheduledFor: Date;
  title: string;
  body: string;
}

export interface ScheduleNotifyInput {
  eventId: string;
  title: string;
  startsAt: string | Date;
  publishedAt?: string | Date;
  now?: Date;
}

/**
 * Notification schedule after publish / activate:
 * - immediately (published)
 * - 45 minutes before (stored as kind t_minus_30 — legacy DB check)
 * - 5 minutes before
 */
export function buildCoachingNotificationPlan(
  input: ScheduleNotifyInput
): CoachingNotifyPlanItem[] {
  const t = createTranslator(readStoredLocale());

  const startsAt = input.startsAt instanceof Date ? input.startsAt : new Date(input.startsAt);
  const publishedAt = input.publishedAt
    ? input.publishedAt instanceof Date
      ? input.publishedAt
      : new Date(input.publishedAt)
    : (input.now ?? new Date());
  const now = input.now ?? publishedAt;

  const items: CoachingNotifyPlanItem[] = [
    {
      kind: 'published',
      scheduledFor: publishedAt,
      title: t('push.publishedTitle'),
      body: t('push.publishedBody', { title: input.title }),
    },
  ];

  const t45 = new Date(startsAt.getTime() - COACHING_REMINDER_T45_MS);
  const t5 = new Date(startsAt.getTime() - COACHING_REMINDER_T5_MS);

  if (t45.getTime() > now.getTime()) {
    items.push({
      kind: 't_minus_30',
      scheduledFor: t45,
      title: t('push.t45Title'),
      body: t('push.t45Body', { title: input.title }),
    });
  }
  if (t5.getTime() > now.getTime()) {
    items.push({
      kind: 't_minus_5',
      scheduledFor: t5,
      title: t('push.t5Title'),
      body: t('push.t5Body', { title: input.title }),
    });
  }

  return items;
}

export function notificationPermissionState(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export async function showCoachingNotification(
  title: string,
  body: string,
  tag?: string
): Promise<boolean> {
  const ok = await ensureNotificationPermission();
  if (!ok) return false;
  const notifyTag = tag ?? `coaching-${title}`;
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg?.showNotification) {
        await reg.showNotification(title, {
          body,
          tag: notifyTag,
        });
        return true;
      }
    }
    new Notification(title, { body, tag: notifyTag });
    return true;
  } catch {
    return false;
  }
}

const LOCAL_SCHEDULE_KEY = 'ascendos.coachingNotifySchedule';

export interface LocalScheduledNotification {
  id: string;
  eventId: string;
  kind: CoachingNotifyKind;
  scheduledFor: string;
  title: string;
  body: string;
  fired?: boolean;
}

export function readLocalNotificationSchedule(): LocalScheduledNotification[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_SCHEDULE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as LocalScheduledNotification[];
  } catch {
    return [];
  }
}

export function writeLocalNotificationSchedule(items: LocalScheduledNotification[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_SCHEDULE_KEY, JSON.stringify(items));
  } catch {
    // private mode
  }
}

export function clearLocalNotificationsForEvent(eventId: string): void {
  const next = readLocalNotificationSchedule().filter((n) => n.eventId !== eventId);
  writeLocalNotificationSchedule(next);
}

export function upsertLocalNotificationPlan(
  eventId: string,
  plan: CoachingNotifyPlanItem[]
): LocalScheduledNotification[] {
  const existing = readLocalNotificationSchedule().filter((n) => n.eventId !== eventId);
  const next: LocalScheduledNotification[] = [
    ...existing,
    ...plan.map((p) => ({
      id: `${eventId}:${p.kind}`,
      eventId,
      kind: p.kind,
      scheduledFor: p.scheduledFor.toISOString(),
      title: p.title,
      body: p.body,
      fired: false,
    })),
  ];
  writeLocalNotificationSchedule(next);
  return next;
}

/**
 * Fire due local notifications (fallback when Web Push is not primary).
 * When Web Push subscription is active on this device, skip T−45/T−5 locally
 * to avoid duplicate banners alongside server push. `published` may still fire
 * on the publisher device at save time.
 */
export async function flushDueLocalNotifications(now: Date = new Date()): Promise<number> {
  const webPushPrimary = isWebPushPrimaryActive();
  const items = readLocalNotificationSchedule();
  let fired = 0;
  const next: LocalScheduledNotification[] = [];
  for (const item of items) {
    if (item.fired) {
      next.push(item);
      continue;
    }
    if (webPushPrimary && (item.kind === 't_minus_30' || item.kind === 't_minus_5')) {
      // Server Web Push owns these reminders — mark local as handled.
      next.push({ ...item, fired: true });
      continue;
    }
    if (new Date(item.scheduledFor).getTime() <= now.getTime()) {
      const ok = await showCoachingNotification(
        item.title,
        item.body,
        `coaching-${item.eventId}-${item.kind}`
      );
      // Mark fired only on success so we can retry if permission was denied.
      next.push({ ...item, fired: ok ? true : item.fired });
      if (ok) fired += 1;
    } else {
      next.push(item);
    }
  }
  writeLocalNotificationSchedule(next);
  return fired;
}

/** Sync helper for tests — whether local flush should skip a kind. */
export function shouldSkipLocalReminderKind(
  kind: CoachingNotifyKind,
  webPushPrimary: boolean
): boolean {
  if (!webPushPrimary) return false;
  return kind === 't_minus_30' || kind === 't_minus_5';
}
