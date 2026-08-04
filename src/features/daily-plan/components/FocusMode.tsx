import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '@shared/i18n';
import type { DailyPlanItem } from '@shared/types/domain';
import { comboBonusAp, scoreDailyMission } from '@shared/lib/apScoring';
import { contactHasPendingShareProof } from '@shared/lib/shareVerification';
import { ApRewardSticker } from '@shared/ui/ApRewardSticker';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { scoreFollowUpGravity, type GravityReading } from '../dayMemory';
import type { OrderedMissions } from '../missionOrder';
import { MISSION_ICONS } from './missionMeta';

interface Props {
  ordered: OrderedMissions;
  progress: { done: number; total: number };
  busy?: boolean;
  onStatus: (itemId: string, status: 'done' | 'deferred' | 'skipped', reason?: string) => void;
  /** Sprint 5 · L1 — intentional close while work remains. */
  onEndDay?: () => void;
  lastEventByContactId?: Map<string, string | null>;
}

/**
 * Fokus-Modus: eine Mission dominant, Reward-Sticker zeigen den Wert.
 */
export function FocusMode({
  ordered,
  progress,
  busy = false,
  onStatus,
  onEndDay,
  lastEventByContactId,
}: Props) {
  const { t } = useI18n();
  const { current, queue, resolved } = ordered;
  const [skipPickerFor, setSkipPickerFor] = useState<string | null>(null);

  if (!current) return null;

  const missionAp = scoreDailyMission(current.mission_type, {
    engineScore: current.score,
    missionsDoneToday: progress.done,
  });
  const combo = comboBonusAp(progress.done);
  const awaitingProof =
    Boolean(current.contact_id) && contactHasPendingShareProof(current.contact_id!);
  const gravity: GravityReading = scoreFollowUpGravity({
    missionType: current.mission_type,
    engineScore: current.score,
    lastEventAt: current.contact_id
      ? (lastEventByContactId?.get(current.contact_id) ?? null)
      : null,
  });
  const gravityLabel =
    gravity.band === 'pulling'
      ? t('today.gravityPulling')
      : gravity.band === 'heavy'
        ? t('today.gravityHeavy')
        : gravity.band === 'critical'
          ? t('today.gravityCritical')
          : null;

  const skipReasons = [
    { key: 'notReached' as const, label: t('today.skipNotReached') },
    { key: 'noTime' as const, label: t('today.skipNoTime') },
    { key: 'other' as const, label: t('today.skipOther') },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{t('today.focus')}</h1>
        <span className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-muted">
          {t('today.progressDone', { done: progress.done, total: progress.total })}
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
            {gravityLabel ? (
              <p className="mt-2 text-xs font-semibold text-accent-deep">
                {gravityLabel}
                {gravity.idleDays !== null
                  ? ` · ${t('today.gravityIdle', { days: gravity.idleDays })}`
                  : ''}
              </p>
            ) : null}
            {awaitingProof ? (
              <p className="mt-2 rounded-lg border border-accent/30 bg-accent/10 px-2.5 py-1.5 text-xs font-semibold text-accent-deep">
                {t('today.waitingProof')}
              </p>
            ) : null}
            {current.contact_id ? (
              <Link
                to={`/kontakte/${current.contact_id}`}
                className="mt-2 inline-block text-sm font-medium text-primary"
              >
                {t('today.openContact')}
              </Link>
            ) : null}
          </div>
        </div>

        {skipPickerFor === current.id ? (
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              {t('today.skipWhy')}
            </p>
            {skipReasons.map((reason) => (
              <Button
                key={reason.key}
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  onStatus(current.id, 'skipped', reason.label);
                  setSkipPickerFor(null);
                }}
              >
                {reason.label}
              </Button>
            ))}
            <Button variant="ghost" disabled={busy} onClick={() => setSkipPickerFor(null)}>
              {t('common.back')}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Button disabled={busy} aria-busy={busy} onClick={() => onStatus(current.id, 'done')}>
              {busy ? t('today.saving') : t('today.done')}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => onStatus(current.id, 'deferred')}
              >
                {t('today.laterToday')}
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => setSkipPickerFor(current.id)}
              >
                {t('today.notPossible')}
              </Button>
            </div>
            <p className="text-xs leading-relaxed text-muted">{t('today.oneTapConsequence')}</p>
          </div>
        )}
      </Card>

      {queue.length > 0 ? (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            {t('today.afterwardsCount', { count: queue.length })}
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
            {t('today.doneToday')}
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

      {onEndDay ? (
        <div className="pt-1">
          <Button variant="ghost" disabled={busy} onClick={onEndDay}>
            {t('today.endWorkday')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function QueueRow({ item, missionsDoneToday }: { item: DailyPlanItem; missionsDoneToday: number }) {
  const { t } = useI18n();
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
          <span className="shrink-0 text-xs text-muted">{t('today.postponed')}</span>
        ) : null}
      </Card>
    </li>
  );
}
