import { useEffect } from 'react';
import { LiveCoachingCard } from './LiveCoachingCard';
import { useLiveCoachingEvents } from './liveCoachingApi';
import { flushDueLocalNotifications } from './notifications';
import { pickTodayCoachingEvent } from './pickTodayEvent';
import { LIVE_COACHING_FUTURE } from './types';

/**
 * Additive Today slot — does not alter Daily Plan state machine.
 * Future library/search/replay surfaces stay stubbed.
 */
export function TodayLiveCoachingSlot() {
  const { data: events = [], isPending } = useLiveCoachingEvents({ activeOnly: true });
  const event = pickTodayCoachingEvent(events);

  useEffect(() => {
    void flushDueLocalNotifications();
    const id = window.setInterval(() => void flushDueLocalNotifications(), 30_000);
    return () => window.clearInterval(id);
  }, []);

  if (isPending || !event) return null;

  return (
    <section className="space-y-2" aria-label="Live Coaching">
      <LiveCoachingCard event={event} />
      {/* Future-ready hooks (additive only, unused until later sprints) */}
      {LIVE_COACHING_FUTURE.library ? null : null}
    </section>
  );
}
