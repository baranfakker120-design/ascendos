import { useMemo } from 'react';
import { eventLabel } from '@shared/lib/pipeline';
import type { PipelineEvent } from '@shared/types/domain';

const dateFmt = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * Vollständige, unveränderliche Historie (ADR-003). Fehl-Taps werden
 * nicht gelöscht, sondern per Korrektur-Event unwirksam gemacht [D-2]:
 * korrigierte Einträge bleiben sichtbar (durchgestrichen).
 */
export function EventTimeline({
  events,
  onCorrect,
  correcting,
}: {
  events: PipelineEvent[];
  onCorrect: (eventId: string) => void;
  correcting: boolean;
}) {
  const correctedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const e of events) {
      if (e.event_type === 'correction') {
        const target = (e.payload as { corrects_event_id?: string })?.corrects_event_id;
        if (target) ids.add(target);
      }
    }
    return ids;
  }, [events]);

  if (events.length === 0) {
    return <p className="text-sm text-muted">Noch keine Ereignisse.</p>;
  }

  return (
    <ol className="relative space-y-4 border-l border-line pl-5">
      {events.map((event) => {
        if (event.event_type === 'correction') return null; // implizit via Durchstreichung
        const corrected = correctedIds.has(event.id);
        const correctable =
          !corrected && event.event_type !== 'contact_created' && event.source !== 'system';
        return (
          <li key={event.id} className="relative">
            <span
              aria-hidden
              className={`absolute -left-[26.5px] top-1.5 h-2.5 w-2.5 rounded-full ${
                corrected ? 'bg-line' : 'bg-primary'
              }`}
            />
            <div className="flex items-baseline justify-between gap-2">
              <p className={`text-sm font-medium ${corrected ? 'text-muted line-through' : ''}`}>
                {eventLabel(event.event_type)}
              </p>
              {correctable ? (
                <button
                  onClick={() => onCorrect(event.id)}
                  disabled={correcting}
                  className="shrink-0 text-xs font-medium text-muted underline disabled:opacity-50"
                >
                  korrigieren
                </button>
              ) : null}
            </div>
            <p className="text-xs text-muted">
              {dateFmt.format(new Date(event.occurred_at))}
              {corrected ? ' · korrigiert' : ''}
              {event.source !== 'manual' && event.source !== 'system'
                ? ` · via ${event.source}`
                : ''}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
