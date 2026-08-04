import { Link } from 'react-router-dom';
import { isMissingRpcError } from '@shared/api/rpcErrors';
import { useI18n } from '@shared/i18n';
import { buttonClassName } from '@shared/ui/Button';
import { useQualificationProgress } from './leadershipApi';
import { TeamLeaderProgressCard } from './components/TeamLeaderProgressCard';
import './components/leader-surface.css';

export function QualificationsPage() {
  const { t, locale } = useI18n();
  const { data, isPending, isError, error, refetch } = useQualificationProgress();

  if (isPending) {
    return <p className="text-sm text-muted">{t('qualifications.loading')}</p>;
  }

  if (isError) {
    const schemaGap = isMissingRpcError(error);
    return (
      <div className="space-y-3 text-center">
        <p className="font-medium">
          {schemaGap ? t('qualifications.migration') : t('qualifications.loadError')}
        </p>
        <p className="text-sm text-muted">
          {schemaGap ? t('qualifications.migrationBody') : t('common.connectionHint')}
        </p>
        <button type="button" className="text-sm underline" onClick={() => void refetch()}>
          {t('common.retry')}
        </button>
      </div>
    );
  }

  // data is always defined on success (fallback fills gaps)
  const progress = data!;
  const tl = progress.teamLeader;
  const noPartnersYet = tl.activeFirstlines === 0 && !tl.qualified;
  const nextPct =
    progress.nextRank && progress.nextRank.thresholdAp > 0
      ? Math.min(100, Math.round((progress.apTotal / progress.nextRank.thresholdAp) * 100))
      : 100;

  return (
    <div className="leader-qual space-y-3">
      <header>
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-accent-deep">
          {t('qualifications.eyebrow')}
        </p>
        <h1 className="text-2xl font-bold tracking-tight">{t('qualifications.title')}</h1>
      </header>

      {noPartnersYet ? (
        <section className="leader-glass leader-qual__card space-y-3 text-center">
          <p className="text-lg font-bold tracking-tight">{t('qualifications.startPartner')}</p>
          <p className="text-sm text-muted">{t('qualifications.startBody')}</p>
          <Link to="/more" className={buttonClassName({ fullWidth: false })}>
            {t('team.inviteFirst')}
          </Link>
        </section>
      ) : null}

      <section className="leader-glass leader-qual__card">
        <p className="leader-dash__label">{t('qualifications.current')}</p>
        <p className="text-xl font-bold">
          {progress.currentRank?.label ?? t('qualifications.newcomer')}
        </p>
        <p className="text-sm text-muted">
          {progress.apTotal.toLocaleString(locale)} {t('common.ap')}
        </p>
      </section>

      {progress.nextRank ? (
        <section className="leader-glass leader-qual__card">
          <p className="leader-dash__label">{t('qualifications.next')}</p>
          <p className="text-lg font-bold">{progress.nextRank.label}</p>
          <p className="text-sm text-muted">
            {t('qualifications.remainingAp', {
              ap: progress.nextRank.remainingAp.toLocaleString(locale),
            })}
          </p>
          <div
            className="leader-tl__bar mt-3"
            role="progressbar"
            aria-valuenow={nextPct}
            aria-label={t('qualifications.progressAria')}
          >
            <span style={{ width: `${nextPct}%` }} />
          </div>
        </section>
      ) : (
        <section className="leader-glass leader-qual__card">
          <p className="font-semibold">{t('qualifications.highestRank')}</p>
        </section>
      )}

      <TeamLeaderProgressCard
        progress={{
          membershipId: progress.membershipId,
          activeFirstlines: tl.activeFirstlines,
          requiredFirstlines: tl.requiredFirstlines,
          qualified: tl.qualified,
          qualifiedAt: tl.qualifiedAt,
          bonusEntitled: tl.qualified,
          bonusPaid: tl.bonusPaid,
          bonusAmountCents: tl.bonusAmountCents,
        }}
      />

      <section className="leader-glass leader-qual__card">
        <p className="leader-dash__label">{t('leadership.unlocked')}</p>
        {progress.unlockedRewards.length === 0 ? (
          <p className="text-sm text-muted">{t('qualifications.rewardsEmpty')}</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm">
            {progress.unlockedRewards.map((r) => (
              <li key={`${r.kind}-${r.amountCents}`} className="flex justify-between gap-2">
                <span>{r.note ?? r.kind}</span>
                <span className="font-semibold">
                  {(r.amountCents / 100).toLocaleString(locale, {
                    style: 'currency',
                    currency: 'EUR',
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
