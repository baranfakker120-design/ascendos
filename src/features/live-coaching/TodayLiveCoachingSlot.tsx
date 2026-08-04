import { useI18n } from '@shared/i18n';
import { useEffect } from 'react';
import { LiveCoachingCard } from './LiveCoachingCard';
import { useLiveCoachingEvents } from './liveCoachingApi';
import { flushDueLocalNotifications } from './notifications';
import { flushDueOutboxNotifications } from './outboxFlush';
import { pickTodayCoachingEvent } from './pickTodayEvent';
import { LIVE_COACHING_FUTURE } from './types';

/**
 * Additive Today slot — does not alter Daily Plan state machine.
 * Reminders: DB outbox + per-user receipts (in-app when open).
 * Library/replay remain deferred (LIVE_COACHING_FUTURE).
 */
export function TodayLiveCoachingSlot() {
  const { t } = useI18n();
  const { data: events = [], isPending } = useLiveCoachingEvents({ activeOnly: true });
  const event = pickTodayCoachingEvent(events);

  useEffect(() => {
    const flush = () => {
      void flushDueOutboxNotifications();
      void flushDueLocalNotifications();
    };
    flush();
    const id = window.setInterval(flush, 30_000);
    return () => window.clearInterval(id);
  }, []);

  if (isPending || !event) return null;

  return (
    <section className="space-y-2" aria-label={t('liveCoaching.slotTitle')}>
      <LiveCoachingCard event={event} />
      {LIVE_COACHING_FUTURE.library ? null : null}
    </section>
  );
}
