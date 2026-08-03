import { createTranslator } from '@shared/i18n';
import { readStoredLocale } from '@shared/lib/locale';

export type CoachingNotifyKind = 'published' | 't_minus_30' | 't_minus_5';

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
 * Notification schedule after publish:
 * - immediately (published)
 * - 30 minutes before
 * - 5 minutes before
 *
 * Past due reminders are skipped (except published, which fires at publish time).
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

  const t30 = new Date(startsAt.getTime() - 30 * 60_000);
  const t5 = new Date(startsAt.getTime() - 5 * 60_000);

  if (t30.getTime() > now.getTime()) {
    items.push({
      kind: 't_minus_30',
      scheduledFor: t30,
      title: t('push.t30Title'),
      body: t('push.t30Body', { title: input.title }),
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

/**
 * Shows a local notification intended for lock screen / notification center / banner
 * when the browser + OS allow it (PWA / installed context preferred).
 */
export async function showCoachingNotification(title: string, body: string): Promise<boolean> {
  const ok = await ensureNotificationPermission();
  if (!ok) return false;
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg?.showNotification) {
        await reg.showNotification(title, {
          body,
          tag: `coaching-${title}`,
        });
        return true;
      }
    }
    // Banner / Notification Center fallback
    new Notification(title, { body, tag: `coaching-${title}` });
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

/** Fire due local notifications (call on app focus / interval). */
export async function flushDueLocalNotifications(now: Date = new Date()): Promise<number> {
  const items = readLocalNotificationSchedule();
  let fired = 0;
  const next = [];
  for (const item of items) {
    if (item.fired) {
      next.push(item);
      continue;
    }
    if (new Date(item.scheduledFor).getTime() <= now.getTime()) {
      const ok = await showCoachingNotification(item.title, item.body);
      next.push({ ...item, fired: ok || item.kind !== 'published' ? true : item.fired });
      if (ok) fired += 1;
    } else {
      next.push(item);
    }
  }
  writeLocalNotificationSchedule(next);
  return fired;
}
