import { useEffect, useMemo, useState } from 'react';
import { Button } from '@shared/ui/Button';
import { buildGoogleCalendarUrl, buildOutlookCalendarUrl, downloadAppleIcs } from './calendarLinks';
import { formatCountdown, resolveLiveCoachingState } from './liveState';
import type { LiveCoachingEvent } from './types';
import { openZoomJoin } from './zoomJoin';
import './live-coaching.css';

export function LiveCoachingCard({ event }: { event: LiveCoachingEvent }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const state = resolveLiveCoachingState({
    startsAt: event.starts_at,
    durationMinutes: event.duration_minutes,
    now,
  });

  const stateLabel =
    state === 'countdown'
      ? `Countdown · ${formatCountdown(event.starts_at, now)}`
      : state === 'live'
        ? 'LIVE'
        : 'Finished';

  const calendarInput = useMemo(
    () => ({
      title: event.title,
      description: [event.subtitle, event.description].filter(Boolean).join('\n\n'),
      startsAt: event.starts_at,
      durationMinutes: event.duration_minutes,
      url: event.zoom_url,
      location: event.zoom_url ?? undefined,
    }),
    [event]
  );

  const startLocal = new Date(event.starts_at);
  const mediaClass =
    event.media_type === 'image'
      ? 'live-coach-card__media--image'
      : 'live-coach-card__media--video';

  return (
    <article className="live-coach-card">
      <div className={`live-coach-card__media ${mediaClass}`}>
        {event.media_type === 'video' && event.media_url ? (
          <video src={event.media_url} muted playsInline loop autoPlay controls={false} />
        ) : event.media_url ? (
          <img src={event.media_url} alt="" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-white/50">
            Live Coaching
          </div>
        )}
      </div>
      <div className="live-coach-card__body">
        <p
          className={`live-coach-card__state ${
            state === 'live' ? 'live-coach-card__state--live' : ''
          } ${state === 'finished' ? 'live-coach-card__state--finished' : ''}`}
        >
          <span className="live-coach-card__state-dot" aria-hidden />
          {stateLabel}
        </p>
        <h2 className="live-coach-card__title">{event.title}</h2>
        {event.subtitle ? <p className="live-coach-card__subtitle">{event.subtitle}</p> : null}
        <div className="live-coach-card__meta">
          <span>
            {event.coach_name} · {event.category} · {event.language.toUpperCase()}
          </span>
          <span>
            {startLocal.toLocaleDateString()} ·{' '}
            {startLocal.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ·{' '}
            {event.duration_minutes} Min
          </span>
        </div>
        <div className="live-coach-card__actions">
          {event.zoom_url && state !== 'finished' ? (
            <Button fullWidth={false} onClick={() => openZoomJoin(event.zoom_url!)}>
              Join Coaching
            </Button>
          ) : null}
        </div>
        <div className="live-coach-card__calendar">
          <span>Kalender:</span>
          <button type="button" onClick={() => downloadAppleIcs(calendarInput)}>
            Apple
          </button>
          <a href={buildGoogleCalendarUrl(calendarInput)} target="_blank" rel="noreferrer">
            Google
          </a>
          <a href={buildOutlookCalendarUrl(calendarInput)} target="_blank" rel="noreferrer">
            Outlook
          </a>
        </div>
      </div>
    </article>
  );
}
