import { useEffect, useState } from 'react';
import { useI18n } from '@shared/i18n';
import { LiveCoachingCard } from './LiveCoachingCard';
import { LiveCoachingOverlay } from './LiveCoachingOverlay';
import { LiveCoachingPushEnableCard } from './LiveCoachingPushEnableCard';
import { useLiveCoachingEvents } from './liveCoachingApi';
import { flushDueLocalNotifications } from './notifications';
import { isOverlayDismissed, readOverlayDismiss } from './overlayDismiss';
import { pickTodayCoachingEvent } from './pickTodayEvent';
import './live-coaching.css';

/**
 * Additive Today slot — does not alter Daily Plan state machine.
 * Hides finished events automatically via pickTodayCoachingEvent.
 * Push opt-in remains visible so members can subscribe before events exist.
 */
export function TodayLiveCoachingSlot() {
  const { t } = useI18n();
  const { data: events = [] } = useLiveCoachingEvents({ activeOnly: true });
  const [, setTick] = useState(0);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [dismissReady, setDismissReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Re-evaluate presentation every 15s so expiry removes the card without reload.
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 15_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const flush = () => void flushDueLocalNotifications();
    flush();
    const id = window.setInterval(flush, 20_000);
    const onVis = () => {
      if (document.visibilityState === 'visible') flush();
    };
    window.addEventListener('focus', flush);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', flush);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const event = pickTodayCoachingEvent(events);

  useEffect(() => {
    let cancelled = false;
    setDismissReady(false);
    if (!event) {
      setOverlayOpen(false);
      setDismissed(false);
      setDismissReady(true);
      return;
    }
    void readOverlayDismiss().then((rec) => {
      if (cancelled) return;
      const hidden = isOverlayDismissed(rec, event.id);
      setDismissed(hidden);
      setOverlayOpen(!hidden);
      setDismissReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [event?.id]);

  return (
    <section className="space-y-2" aria-label={t('liveCoaching.slotTitle')}>
      <LiveCoachingPushEnableCard />
      {event ? <LiveCoachingCard event={event} /> : null}
      {event && dismissReady && overlayOpen && !dismissed ? (
        <LiveCoachingOverlay
          event={event}
          onClose={() => {
            setOverlayOpen(false);
            setDismissed(true);
          }}
        />
      ) : null}
    </section>
  );
}
