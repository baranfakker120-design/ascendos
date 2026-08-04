import { Link } from 'react-router-dom';
import { useI18n } from '@shared/i18n';
import { comboBonusAp, scoreDailyMission } from '@shared/lib/apScoring';
import type { DailyPlanItem } from '@shared/types/domain';
import { ApRewardSticker } from '@shared/ui/ApRewardSticker';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import type { DayCloseOutcome, DayCloseSource } from '../dayMemory';
import { deriveCloseOutcome } from '../dayMemory';
import './closingLoop.css';

interface Props {
  items: DailyPlanItem[];
  busy?: boolean;
  sourceHint: DayCloseSource;
  onClose: () => void;
  onKeepWorking?: () => void;
}

/**
 * Sprint 5 · L1 Closing Loop — intentional end of day.
 * Answers: Did today’s most important work land? Then close and seed tomorrow.
 */
export function ClosingLoop({ items, busy = false, sourceHint, onClose, onKeepWorking }: Props) {
  const { t } = useI18n();
  const done = items.filter((i) => i.status === 'done');
  const skipped = items.filter((i) => i.status === 'skipped');
  const open = items.filter((i) => i.status === 'pending' || i.status === 'deferred');
  const outcome = deriveCloseOutcome(items);
  const combo = comboBonusAp(done.length);

  return (
    <div className="closing-loop space-y-5" data-outcome={outcome}>
      <header className="closing-loop__hero">
        <p className="closing-loop__eyebrow">{t('today.closingEyebrow')}</p>
        <h1 className="text-2xl font-bold tracking-tight">{t('today.closingTitle')}</h1>
        <p className="mt-1.5 text-sm text-muted">{outcomeCopy(outcome, t)}</p>
      </header>

      <Card className="closing-loop__truth space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          {t('today.closingTruth')}
        </p>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">
            {t('today.reviewPartial', { done: done.length, total: items.length || done.length })}
          </p>
          {combo > 0 ? <ApRewardSticker ap={combo} size="sm" mark="⚡" animate={false} /> : null}
        </div>

        {done.length > 0 ? (
          <ul className="space-y-2">
            {done.map((i) => (
              <li key={i.id} className="flex items-center gap-2 text-sm">
                <span aria-hidden className="text-accent-deep">
                  ✓
                </span>
                <span className="min-w-0 flex-1 text-muted line-through">{i.title}</span>
                <ApRewardSticker
                  ap={scoreDailyMission(i.mission_type, { engineScore: i.score })}
                  size="sm"
                  animate={false}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{t('today.closingNoWins')}</p>
        )}

        {open.length > 0 ? (
          <div className="closing-loop__carry rounded-xl border border-line/80 bg-surface/60 px-3 py-2.5">
            <p className="text-xs font-semibold text-muted">{t('today.closingCarry')}</p>
            <ul className="mt-1.5 space-y-1">
              {open.slice(0, 4).map((i) => (
                <li key={i.id} className="text-sm">
                  → {i.title}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {skipped.length > 0 ? (
          <p className="text-xs text-muted">
            {t('today.closingSkipped', { count: skipped.length })}
          </p>
        ) : null}
      </Card>

      <div className="closing-loop__actions space-y-2">
        <Button onClick={onClose} disabled={busy} aria-busy={busy}>
          {busy ? t('today.closingBusy') : t('today.closingCta')}
        </Button>
        {sourceHint === 'manual_close' && onKeepWorking ? (
          <Button variant="ghost" disabled={busy} onClick={onKeepWorking}>
            {t('today.closingKeepWorking')}
          </Button>
        ) : null}
      </div>

      <p className="text-center text-xs text-muted">{t('today.closingHint')}</p>
    </div>
  );
}

export function ClosedDay({
  outcome,
  missionsDone,
  missionsTotal,
  tomorrowSeed,
}: {
  outcome: DayCloseOutcome;
  missionsDone: number;
  missionsTotal: number;
  tomorrowSeed: string[];
}) {
  const { t } = useI18n();
  return (
    <div className="closing-loop closing-loop--closed space-y-5">
      <header className="closing-loop__hero">
        <p className="closing-loop__eyebrow">{t('today.closedEyebrow')}</p>
        <h1 className="text-2xl font-bold tracking-tight">{t('today.closedTitle')}</h1>
        <p className="mt-1.5 text-sm text-muted">{outcomeCopy(outcome, t)}</p>
      </header>

      <Card className="space-y-2">
        <p className="text-sm font-medium">
          {t('today.reviewPartial', {
            done: missionsDone,
            total: missionsTotal || missionsDone,
          })}
        </p>
        {tomorrowSeed.length > 0 ? (
          <div className="closing-loop__carry rounded-xl border border-line/80 bg-surface/60 px-3 py-2.5">
            <p className="text-xs font-semibold text-muted">{t('today.closedTomorrow')}</p>
            <ul className="mt-1.5 space-y-1">
              {tomorrowSeed.map((title) => (
                <li key={title} className="text-sm text-muted">
                  → {title}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-muted">{t('today.closedClean')}</p>
        )}
      </Card>

      <Card>
        <p className="text-sm font-medium">{t('today.energyLeft')}</p>
        <p className="mt-1 text-sm text-muted">
          {t('today.energyBodyBefore')}{' '}
          <Link to="/kontakte" className="font-medium text-primary">
            {t('today.pipeline')}
          </Link>{' '}
          {t('today.energyBodyAfter')}
        </p>
      </Card>
    </div>
  );
}

function outcomeCopy(
  outcome: DayCloseOutcome,
  t: ReturnType<typeof useI18n>['t']
): string {
  if (outcome === 'done') return t('today.closingOutcomeDone');
  if (outcome === 'partial') return t('today.closingOutcomePartial');
  return t('today.closingOutcomeMissed');
}
