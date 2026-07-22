import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { DailyPlanItem } from '@shared/types/domain';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import type { OrderedMissions } from '../missionOrder';
import { MISSION_ICONS } from './missionMeta';

interface Props {
  ordered: OrderedMissions;
  progress: { done: number; total: number };
  onStatus: (itemId: string, status: 'done' | 'deferred' | 'skipped', reason?: string) => void;
}

/**
 * Fokus-Modus (Phase 3): Führung durch Hierarchie, nicht durch
 * Verstecken — eine Mission dominant, der Rest sichtbar darunter.
 * Jede Mission hat drei Ausgänge; keiner blockiert den Tag.
 */
export function FocusMode({ ordered, progress, onStatus }: Props) {
  const { current, queue, resolved } = ordered;
  const [skipPickerFor, setSkipPickerFor] = useState<string | null>(null);

  if (!current) return null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Dein Fokus</h1>
        <span className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-muted">
          {progress.done} / {progress.total} erledigt
        </span>
      </div>

      <Card className="space-y-4 border-accent/50">
        <div className="flex gap-3">
          <span aria-hidden className="text-2xl leading-none">
            {MISSION_ICONS[current.mission_type]}
          </span>
          <div className="min-w-0">
            <p className="text-lg font-bold leading-snug">{current.title}</p>
            <p className="mt-1 text-sm text-muted">{current.reason}</p>
            {current.contact_id ? (
              <Link
                to={`/kontakte/${current.contact_id}`}
                className="mt-2 inline-block text-sm font-medium text-primary"
              >
                Kontakt öffnen — anrufen, teilen, dokumentieren →
              </Link>
            ) : null}
          </div>
        </div>

        {skipPickerFor === current.id ? (
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Warum klappt es heute nicht?
            </p>
            {['Nicht erreicht', 'Termin verschoben', 'Anderer Grund'].map((reason) => (
              <button
                key={reason}
                onClick={() => {
                  onStatus(current.id, 'skipped', reason);
                  setSkipPickerFor(null);
                }}
                className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-left text-sm font-medium hover:bg-bg"
              >
                {reason}
              </button>
            ))}
            <Button variant="ghost" onClick={() => setSkipPickerFor(null)}>
              Zurück
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Button onClick={() => onStatus(current.id, 'done')}>✓ Erledigt</Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => onStatus(current.id, 'deferred')}>
                Später heute
              </Button>
              <Button variant="secondary" onClick={() => setSkipPickerFor(current.id)}>
                Heute nicht möglich
              </Button>
            </div>
          </div>
        )}
      </Card>

      {queue.length > 0 ? (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Danach ({queue.length})
          </h2>
          <ul className="space-y-1.5">
            {queue.map((item) => (
              <QueueRow key={item.id} item={item} />
            ))}
          </ul>
        </section>
      ) : null}

      {resolved.length > 0 ? (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Heute geschafft
          </h2>
          <ul className="space-y-1.5">
            {resolved.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2 text-sm text-muted"
              >
                <span aria-hidden>{item.status === 'done' ? '✓' : '–'}</span>
                <span className={item.status === 'done' ? 'line-through' : ''}>{item.title}</span>
                {item.status_reason ? (
                  <span className="ml-auto text-xs">({item.status_reason})</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function QueueRow({ item }: { item: DailyPlanItem }) {
  return (
    <li className="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5">
      <span aria-hidden className="text-base leading-none">
        {MISSION_ICONS[item.mission_type]}
      </span>
      <span className="min-w-0 truncate text-sm font-medium">{item.title}</span>
      {item.status === 'deferred' ? (
        <span className="ml-auto shrink-0 text-xs text-muted">verschoben</span>
      ) : null}
    </li>
  );
}
