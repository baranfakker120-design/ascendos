import { useMemo, useState } from 'react';
import { useAuth } from '@shared/auth/AuthProvider';
import { useI18n } from '@shared/i18n';
import { scoreDailyMission } from '@shared/lib/apScoring';
import type { DailyPlanItem } from '@shared/types/domain';
import { ApRewardSticker } from '@shared/ui/ApRewardSticker';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { pickGravityPriority, pickPriorityMission, scoreFollowUpGravity } from '../dayMemory';
import { MISSION_ICONS } from './missionMeta';
import './oneTapDay.css';

/**
 * Sprint 5 · L3 One-Tap Day — commit to ONE action, not a menu of missions.
 * L4 Gravity chooses the default focus when contact idle data is present.
 */
export function MorningCommit({
  items,
  onCommit,
  busy,
  lastEventByContactId,
}: {
  items: DailyPlanItem[];
  onCommit: (priority: DailyPlanItem) => void;
  busy: boolean;
  lastEventByContactId?: Map<string, string | null>;
}) {
  const { profile } = useAuth();
  const { t } = useI18n();
  const suggested = useMemo(() => {
    if (lastEventByContactId && lastEventByContactId.size > 0) {
      return pickGravityPriority(items, lastEventByContactId);
    }
    return pickPriorityMission(items);
  }, [items, lastEventByContactId]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    items.find((i) => i.id === (selectedId ?? suggested?.id)) ?? suggested ?? items[0]!;
  const queue = items.filter((i) => i.id !== selected.id).sort((a, b) => a.position - b.position);

  const hour = new Date().getHours();
  const greeting =
    hour < 11
      ? t('today.greetingMorning')
      : hour < 18
        ? t('today.greetingDay')
        : t('today.greetingEvening');

  const ap = scoreDailyMission(selected.mission_type, { engineScore: selected.score });
  const gravity = scoreFollowUpGravity({
    missionType: selected.mission_type,
    engineScore: selected.score,
    lastEventAt: selected.contact_id
      ? (lastEventByContactId?.get(selected.contact_id) ?? null)
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

  return (
    <div className="one-tap space-y-5">
      <div>
        <p className="one-tap__eyebrow">{t('today.oneTapEyebrow')}</p>
        <h1 className="text-2xl font-bold tracking-tight">
          {greeting}
          {profile ? `, ${profile.first_name}` : ''}.
        </h1>
        <p className="mt-1.5 text-sm text-muted">{t('today.oneTapIntro')}</p>
      </div>

      <Card className="one-tap__primary space-y-3 border-accent/45">
        <div className="flex gap-3">
          <span aria-hidden className="text-2xl leading-none">
            {MISSION_ICONS[selected.mission_type]}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="text-lg font-bold leading-snug">{selected.title}</p>
              <ApRewardSticker ap={ap} size="sm" animate={false} />
            </div>
            <p className="mt-1 text-sm text-muted">{selected.reason}</p>
            {gravityLabel ? (
              <p className="mt-2 text-xs font-semibold text-accent-deep">
                {gravityLabel}
                {gravity.idleDays !== null
                  ? ` · ${t('today.gravityIdle', { days: gravity.idleDays })}`
                  : ''}
              </p>
            ) : null}
          </div>
        </div>
        <Button onClick={() => onCommit(selected)} disabled={busy} aria-busy={busy}>
          {busy ? t('today.commitBusy') : t('today.oneTapCta')}
        </Button>
      </Card>

      {queue.length > 0 ? (
        <section className="one-tap__queue" aria-label={t('today.oneTapQueueAria')}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            {t('today.oneTapQueue', { count: queue.length })}
          </p>
          <ul className="space-y-1.5">
            {queue.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="one-tap__alt"
                  disabled={busy}
                  onClick={() => setSelectedId(item.id)}
                >
                  <span aria-hidden>{MISSION_ICONS[item.mission_type]}</span>
                  <span className="min-w-0 flex-1 truncate text-left text-sm font-medium">
                    {item.title}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-primary">
                    {t('today.oneTapMakePrimary')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
