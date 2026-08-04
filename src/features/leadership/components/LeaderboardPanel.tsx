import { useMemo, useState } from 'react';
import { useI18n } from '@shared/i18n';
import { useTeamLeaderboard } from '../leadershipApi';
import type { LeaderboardPeriod, LeaderboardSort } from '../types';
import './leader-surface.css';

export function LeaderboardPanel() {
  const { t, locale } = useI18n();
  const [period, setPeriod] = useState<LeaderboardPeriod>('month');
  const [sort, setSort] = useState<LeaderboardSort>('ap');
  const { data = [], isPending } = useTeamLeaderboard(period, sort);

  const periods = useMemo(
    () =>
      [
        { id: 'today' as const, label: t('leadership.periodToday') },
        { id: 'week' as const, label: t('leadership.periodWeek') },
        { id: 'month' as const, label: t('leadership.periodMonth') },
        { id: 'year' as const, label: t('leadership.periodYear') },
      ] satisfies Array<{ id: LeaderboardPeriod; label: string }>,
    [t]
  );

  const sorts = useMemo(
    () =>
      [
        { id: 'ap' as const, label: t('leadership.sortAp') },
        { id: 'icp' as const, label: t('leadership.sortIcp') },
        { id: 'new_partners' as const, label: t('leadership.newPartners') },
        { id: 'sales' as const, label: t('leadership.sortSales') },
        { id: 'activity' as const, label: t('leadership.sortActivity') },
      ] satisfies Array<{ id: LeaderboardSort; label: string }>,
    [t]
  );

  return (
    <section className="leader-board leader-glass" aria-label={t('leadership.leaderboard')}>
      <header className="leader-board__head">
        <h2>{t('leadership.leaderboard')}</h2>
        <div className="leader-tabs" role="tablist">
          {periods.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={period === p.id}
              className={period === p.id ? 'is-active' : undefined}
              onClick={() => setPeriod(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div
          className="leader-tabs leader-tabs--sort"
          role="group"
          aria-label={t('leadership.sortLabel')}
        >
          {sorts.map((s) => (
            <button
              key={s.id}
              type="button"
              className={sort === s.id ? 'is-active' : undefined}
              onClick={() => setSort(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </header>

      <ol className="leader-board__list">
        {isPending ? (
          <li className="leader-board__empty">{t('leadership.loadingBoard')}</li>
        ) : data.length === 0 ? (
          <li className="leader-board__empty">{t('leadership.emptyBoard')}</li>
        ) : (
          data.slice(0, 12).map((row, idx) => (
            <li key={row.membershipId} className="leader-board__row">
              <span className="leader-board__rank">{idx + 1}</span>
              <div className="leader-board__who">
                <p className="leader-board__name">
                  {`${row.firstName} ${row.lastName}`.trim() || t('leadership.partner')}
                </p>
                <p className="leader-board__meta">{row.rankLabel ?? '—'}</p>
              </div>
              <span className="leader-board__metric">{row.metric.toLocaleString(locale)}</span>
            </li>
          ))
        )}
      </ol>
    </section>
  );
}
