import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { DailyPlanItem } from '@shared/types/domain';
import { comboBonusAp, scoreDailyMission } from '@shared/lib/apScoring';
import { ApRewardSticker } from '@shared/ui/ApRewardSticker';
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
 * Fokus-Modus: eine Mission dominant, Reward-Sticker zeigen den Wert.
 */
export function FocusMode({ ordered, progress, onStatus }: Props) {
  const { current, queue, resolved } = ordered;
  const [skipPickerFor, setSkipPickerFor] = useState<string | null>(null);

  if (!current) return null;

  const missionAp = scoreDailyMission(current.mission_type, {
    engineScore: current.score,
    missionsDoneToday: progress.done,
  });
  const combo = comboBonusAp(progress.done);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Dein Fokus</h1>
        <span className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-muted">
          {progress.done} / {progress.total} erledigt
        </span>
      </div>

      {combo > 0 ? (
        <div className="flex justify-end">
          <ApRewardSticker ap={combo} size="sm" mark="⚡" />
        </div>
      ) : null}

      <Card className="space-y-4 border-accent/50">
        <div className="flex gap-3">
          <span aria-hidden className="text-2xl leading-none">
            {MISSION_ICONS[current.mission_type]}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="text-lg font-bold leading-snug">{current.title}</p>
              <ApRewardSticker ap={missionAp} size="sm" />
            </div>
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
              <Button
                key={reason}
                variant="secondary"
                onClick={() => {
                  onStatus(current.id, 'skipped', reason);
                  setSkipPickerFor(null);
                }}
              >
                {reason}
              </Button>
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
              <QueueRow key={item.id} item={item} missionsDoneToday={progress.done} />
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
              <li key={item.id}>
                <Card padding="sm" className="flex items-center gap-2 text-sm text-muted">
                  <span aria-hidden>{item.status === 'done' ? '✓' : '–'}</span>
                  <span
                    className={`min-w-0 flex-1 truncate ${item.status === 'done' ? 'line-through' : ''}`}
                  >
                    {item.title}
                  </span>
                  {item.status === 'done' ? (
                    <ApRewardSticker
                      ap={scoreDailyMission(item.mission_type, { engineScore: item.score })}
                      size="sm"
                      animate={false}
                    />
                  ) : null}
                  {item.status_reason ? (
                    <span className="shrink-0 text-xs">({item.status_reason})</span>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function QueueRow({
  item,
  missionsDoneToday,
}: {
  item: DailyPlanItem;
  missionsDoneToday: number;
}) {
  const ap = scoreDailyMission(item.mission_type, {
    engineScore: item.score,
    missionsDoneToday,
  });
  return (
    <li>
      <Card padding="sm" className="flex items-center gap-2.5">
        <span aria-hidden className="text-base leading-none">
          {MISSION_ICONS[item.mission_type]}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</span>
        <ApRewardSticker ap={ap} size="sm" animate={false} />
        {item.status === 'deferred' ? (
          <span className="shrink-0 text-xs text-muted">verschoben</span>
        ) : null}
      </Card>
    </li>
  );
}
