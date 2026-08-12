import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@shared/i18n';
import { Button } from '@shared/ui/Button';
import { berlinCalendarDayOffset, formatBerlinDate, formatBerlinTime } from './berlinTime';
import { buildGoogleCalendarUrl, buildOutlookCalendarUrl, downloadAppleIcs } from './calendarLinks';
import { LiveCoachingFlyer } from './LiveCoachingFlyer';
import { formatCountdown, resolveLiveCoachingState } from './liveState';
import type { LiveCoachingEvent } from './types';
import { openZoomJoin } from './zoomJoin';
import './live-coaching.css';

export function LiveCoachingCard({
  event,
  compact = false,
}: {
  event: LiveCoachingEvent;
  compact?: boolean;
}) {
  const { t, locale } = useI18n();
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

  if (state === 'finished') return null;

  return (
    <article className={`live-coach-card ${compact ? 'live-coach-card--compact' : ''}`}>
      <div className="live-coach-card__media">
        <LiveCoachingFlyer
          src={event.media_url}
          mediaType={event.media_type === 'video' ? 'video' : 'image'}
          placeholder={
            <div className="flex h-full items-center justify-center text-sm text-white/50">
              {t('liveCoaching.slotTitle')}
            </div>
          }
        />
      </div>
      <div className="live-coach-card__body">
        <p
          className={`live-coach-card__state ${
            state === 'live' ? 'live-coach-card__state--live' : ''
          }`}
        >
          <span className="live-coach-card__state-dot" aria-hidden />
          {t('liveCoaching.liveBadge')}
        </p>
        <h2 className="live-coach-card__title">{event.title}</h2>
        {event.subtitle ? <p className="live-coach-card__subtitle">{event.subtitle}</p> : null}
        <div className="live-coach-card__meta">
          <span className="live-coach-card__when">{whenLabel}</span>
          <span>{t('liveCoaching.durationMinutes', { n: event.duration_minutes })}</span>
          {state !== 'live' ? (
            <span className="live-coach-card__countdown">{stateLabel}</span>
          ) : (
            <span className="live-coach-card__countdown live-coach-card__countdown--live">
              {stateLabel}
            </span>
          )}
          {event.coach_name ? (
            <span>
              {event.coach_name}
              {event.category ? ` · ${event.category}` : ''}
            </span>
          ) : null}
        </div>
        <div className="live-coach-card__actions">
          {event.zoom_url ? (
            <Button fullWidth onClick={() => openZoomJoin(event.zoom_url!)}>
              {t('liveCoaching.zoomJoin')}
            </Button>
          ) : null}
        </div>
        {!compact ? (
          <div className="live-coach-card__calendar">
            <span>{t('liveCoaching.calendar')}</span>
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
        ) : null}
      </div>
    </article>
  );
}
