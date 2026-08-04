import { useEffect, useState } from 'react';
import { useI18n } from '@shared/i18n';
import type { TeamLeaderProgress } from '../types';
import './leader-surface.css';

interface TeamLeaderProgressCardProps {
  progress: TeamLeaderProgress | null | undefined;
}

export function TeamLeaderProgressCard({ progress }: TeamLeaderProgressCardProps) {
  const { t, locale } = useI18n();
  const [celebrate, setCelebrate] = useState(false);

  useEffect(() => {
    if (!progress?.qualified || !progress.qualifiedAt) return;
    const key = `tl-unlock-${progress.membershipId}-${progress.qualifiedAt}`;
    if (sessionStorage.getItem(key)) return;
    const age = Date.now() - new Date(progress.qualifiedAt).getTime();
    if (age < 7 * 86_400_000) {
      sessionStorage.setItem(key, '1');
      setCelebrate(true);
    }
  }, [progress]);

  if (!progress) return null;
  const pct = Math.min(
    100,
    Math.round((progress.activeFirstlines / Math.max(1, progress.requiredFirstlines)) * 100)
  );
  const missing = Math.max(0, progress.requiredFirstlines - progress.activeFirstlines);
  const euros = (progress.bonusAmountCents / 100).toLocaleString(locale);

  return (
    <>
      <section className="leader-tl leader-glass" aria-label={t('leadership.tlProgress')}>
        <header>
          <h2>{t('leadership.teamLeader')}</h2>
          <p>
            {progress.qualified
              ? t('leadership.qualified')
              : t('leadership.activeFirstlines', {
                  active: progress.activeFirstlines,
                  required: progress.requiredFirstlines,
                })}
          </p>
        </header>
        <div className="leader-tl__bar" role="progressbar" aria-valuenow={pct} aria-valuemax={100}>
          <span style={{ width: `${pct}%` }} />
        </div>
        <dl className="leader-tl__meta">
          <div>
            <dt>{t('leadership.missing')}</dt>
            <dd>{missing}</dd>
          </div>
          <div>
            <dt>{t('leadership.bonus100')}</dt>
            <dd>
              {progress.qualified
                ? progress.bonusPaid
                  ? t('leadership.paidOut')
                  : t('leadership.released')
                : t('leadership.euroPreview', { euros })}
            </dd>
          </div>
        </dl>
      </section>

      {celebrate ? (
        <div className="leader-unlock" role="dialog" aria-modal="true">
          <div className="leader-unlock__panel">
            <p className="leader-unlock__eyebrow">{t('leadership.unlocked')}</p>
            <h3>{t('leadership.teamLeader')}</h3>
            <p>{t('leadership.unlockBody')}</p>
            <button type="button" onClick={() => setCelebrate(false)}>
              {t('leadership.continue')}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
