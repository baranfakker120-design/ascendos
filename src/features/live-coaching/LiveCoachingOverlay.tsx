import { useEffect, useState } from 'react';
import { useI18n } from '@shared/i18n';
import { Button } from '@shared/ui/Button';
import {
  berlinCalendarDayOffset,
  formatBerlinDate,
  formatBerlinTime,
} from './berlinTime';
import { formatCountdown, resolveLiveCoachingState, endsAt } from './liveState';
import { dismissOverlayForEvent } from './overlayDismiss';
import type { LiveCoachingEvent } from './types';
import { openZoomJoin } from './zoomJoin';
import './live-coaching.css';

interface Props {
  event: LiveCoachingEvent;
  onClose: () => void;
}

export function LiveCoachingOverlay({ event, onClose }: Props) {
  const { t, locale } = useI18n();
  const [now, setNow] = useState(() => new Date());
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const tId = window.setTimeout(() => setEntered(true), 20);
    return () => window.clearTimeout(tId);
  }, []);

  const state = resolveLiveCoachingState({
    startsAt: event.starts_at,
    durationMinutes: event.duration_minutes,
    now,
  });

  if (state === 'finished') return null;

  const countdown = formatCountdown(event.starts_at, now, locale);
  const stateLabel =
    state === 'live'
      ? t('liveCoaching.live')
      : countdown === 'LIVE'
        ? t('liveCoaching.startingNow')
        : t('liveCoaching.countdown', { time: countdown });

  const clock = t('liveCoaching.clock', { time: formatBerlinTime(event.starts_at, locale) });
  const dayOffset = berlinCalendarDayOffset(event.starts_at, now);
  const whenLabel =
    state === 'live'
      ? t('liveCoaching.live')
      : dayOffset === 0
        ? t('liveCoaching.whenToday', { time: clock })
        : dayOffset === 1
          ? t('liveCoaching.whenTomorrow', { time: clock })
          : t('liveCoaching.whenDate', {
              date: formatBerlinDate(event.starts_at, locale),
              time: clock,
            });

  const close = () => {
    const until = endsAt(new Date(event.starts_at), event.duration_minutes).toISOString();
    void dismissOverlayForEvent(event.id, until).finally(onClose);
  };

  return (
    <div
      className={`live-coach-overlay ${entered ? 'live-coach-overlay--in' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={t('liveCoaching.slotTitle')}
    >
      <button
        type="button"
        className="live-coach-overlay__backdrop"
        aria-label={t('common.close')}
        onClick={close}
      />
      <div className="live-coach-overlay__panel">
        <button
          type="button"
          className="live-coach-overlay__close"
          aria-label={t('common.close')}
          onClick={close}
        >
          ×
        </button>
        <p className="live-coach-overlay__eyebrow">
          <span className="live-coach-card__state-dot" aria-hidden />
          {t('liveCoaching.liveBadge')}
        </p>
        {event.media_url ? (
          <div className="live-coach-overlay__flyer">
            {event.media_type === 'video' ? (
              <video src={event.media_url} muted playsInline loop autoPlay />
            ) : (
              <img src={event.media_url} alt="" />
            )}
          </div>
        ) : null}
        <h2 className="live-coach-overlay__title">{event.title}</h2>
        {event.subtitle ? <p className="live-coach-overlay__subtitle">{event.subtitle}</p> : null}
        <p className="live-coach-overlay__when">{whenLabel}</p>
        <p className="live-coach-overlay__duration">
          {t('liveCoaching.durationMinutes', { n: event.duration_minutes })}
        </p>
        <p className="live-coach-overlay__countdown">{stateLabel}</p>
        {event.zoom_url ? (
          <Button
            className="live-coach-overlay__zoom"
            onClick={() => openZoomJoin(event.zoom_url!)}
          >
            {t('liveCoaching.zoomJoin')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
