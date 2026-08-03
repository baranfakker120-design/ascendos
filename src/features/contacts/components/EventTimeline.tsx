import { useMemo } from 'react';
import { useI18n } from '@shared/i18n';
import { eventLabel } from '@shared/lib/pipeline';
import type { ShareVerificationRecord } from '@shared/lib/shareVerification';
import type { PipelineEvent } from '@shared/types/domain';
import { Button } from '@shared/ui/Button';

/**
 * Vollständige, unveränderliche Historie (ADR-003). Fehl-Taps werden
 * nicht gelöscht, sondern per Korrektur-Event unwirksam gemacht [D-2]:
 * korrigierte Einträge bleiben sichtbar (durchgestrichen).
 * Pending share proofs appear until verified (no AP yet).
 */
export function EventTimeline({
  events,
  pendingProofs = [],
  onCorrect,
  correcting,
}: {
  events: PipelineEvent[];
  pendingProofs?: ShareVerificationRecord[];
  onCorrect: (eventId: string) => void;
  correcting: boolean;
}) {
  const { t, locale } = useI18n();
  const dateFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    [locale]
  );

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

  if (events.length === 0 && pendingProofs.length === 0) {
    return <p className="text-sm text-muted">{t('contacts.noEvents')}</p>;
  }

  return (
    <ol className="relative space-y-4 border-l border-line pl-5">
      {pendingProofs.map((proof) => (
        <li key={proof.id} className="relative">
          <span
            aria-hidden
            className="absolute -left-[26.5px] top-1.5 h-2.5 w-2.5 rounded-full bg-accent"
          />
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-medium">
              {t('contacts.waitingProofNamed', { name: proof.toolName })}
            </p>
          </div>
          <p className="text-xs text-muted">
            {dateFmt.format(new Date(proof.updatedAt))}
            {proof.shareCompleted ? ` · ${t('contacts.shareOk')}` : ''}
            {proof.screenshotFileName
              ? ` · ${t('contacts.screenshotNamed', { name: proof.screenshotFileName })}`
              : ''}
          </p>
          {proof.screenshotDataUrl ? (
            <img
              src={proof.screenshotDataUrl}
              alt=""
              className="mt-2 max-h-28 rounded-lg border border-line object-contain"
            />
          ) : null}
        </li>
      ))}

      {events.map((event) => {
        if (event.event_type === 'correction') return null;
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
                {eventLabel(event.event_type, t)}
              </p>
              {correctable ? (
                <Button
                  variant="ghost"
                  size="sm"
                  fullWidth={false}
                  onClick={() => onCorrect(event.id)}
                  disabled={correcting}
                  className="shrink-0 underline"
                >
                  {t('contacts.correct')}
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-muted">
              {dateFmt.format(new Date(event.occurred_at))}
              {corrected ? ` · ${t('contacts.corrected')}` : ''}
              {event.source !== 'manual' && event.source !== 'system'
                ? ` · ${t('contacts.via', { source: event.source })}`
                : ''}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
