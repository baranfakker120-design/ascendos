import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { isStandaloneDisplayMode } from '@features/first-launch/platform';
import { readFirstLaunchState, shouldAutoShowFirstLaunch } from '@features/first-launch/storage';
import { supabase } from '@shared/api/supabase';
import { useAuth } from '@shared/auth/AuthProvider';
import { useI18n } from '@shared/i18n';
import { Button } from '@shared/ui/Button';
import { RankFrame } from '@shared/ui/RankFrame';
import { useMonthlyAwardsHistory } from './AdvisorAwardsHistory';
import { podiumForPeriod, shouldShowAdvisorHero } from './advisorHeroLogic';
import { utcMonthStart } from './monthlyAwardsLogic';
import './advisor-hero.css';

function placeFrame(place: number): string | null {
  return place === 1 ? 'frame-10' : null;
}

/**
 * Recognition cinema: Berater des Monats podium for the current title month.
 * Shown once per user per period (usage_events.hero_seen). CSS choreography only.
 */
export function AdvisorHeroScreen() {
  const { t, locale } = useI18n();
  const { profile, membership } = useAuth();
  const titlePeriod = utcMonthStart();
  const awardsQuery = useMonthlyAwardsHistory(12);
  const seenQuery = useQuery({
    queryKey: ['advisor-hero-seen', profile?.id, membership?.org_id, titlePeriod],
    enabled: !!profile && !!membership,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc('has_seen_advisor_hero', {
        p_period: titlePeriod,
      });
      if (error) throw error;
      return !!data;
    },
  });

  const [dismissed, setDismissed] = useState(false);
  const firstLaunchBlocking = shouldAutoShowFirstLaunch(
    readFirstLaunchState(),
    isStandaloneDisplayMode()
  );
  const podium = podiumForPeriod(awardsQuery.data ?? [], titlePeriod);
  const open =
    !dismissed &&
    !firstLaunchBlocking &&
    shouldShowAdvisorHero({
      titlePeriod,
      awards: awardsQuery.data ?? [],
      alreadySeen: seenQuery.data === true,
      awardsReady: awardsQuery.isSuccess,
      seenReady: seenQuery.isSuccess,
    });

  const dismiss = useCallback(async () => {
    setDismissed(true);
    try {
      await supabase.rpc('mark_advisor_hero_seen', { p_period: titlePeriod });
      await seenQuery.refetch();
    } catch {
      // Local dismiss still stands; next session may retry mark.
    }
  }, [titlePeriod, seenQuery]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, dismiss]);

  if (!open || podium.length === 0) return null;

  const first = podium.find((p) => p.place === 1);

  return (
    <div
      className="advisor-hero"
      role="dialog"
      aria-modal="true"
      aria-label={t('profile.heroTitle')}
    >
      <div className="advisor-hero__glow" aria-hidden />
      <div className="advisor-hero__stage">
        <p className="advisor-hero__brand">{t('brand.name')}</p>
        <p className="advisor-hero__eyebrow">{t('profile.heroEyebrow')}</p>
        <h2 className="advisor-hero__title">{t('profile.heroTitle')}</h2>
        <p className="advisor-hero__sub">{t('profile.heroSubtitle')}</p>

        <ol className="advisor-hero__podium">
          {podium.map((row, index) => (
            <li
              key={`${row.period}-${row.place}`}
              className={`advisor-hero__place advisor-hero__place--${row.place}`}
              style={{ animationDelay: `${120 + index * 90}ms` }}
            >
              <RankFrame
                frameKey={placeFrame(row.place)}
                src={row.avatar_url}
                name={row.display_name || row.username}
                size={row.place === 1 ? 'lg' : 'sm'}
              />
              <p className="advisor-hero__name">
                {row.display_name || row.username}
                {row.is_me ? ` (${t('profile.advisorYou')})` : ''}
              </p>
              <p className="advisor-hero__meta">
                {t(
                  row.place === 1
                    ? 'profile.advisorPlace1'
                    : row.place === 2
                      ? 'profile.advisorPlace2'
                      : 'profile.advisorPlace3'
                )}{' '}
                · {row.ap_in_period.toLocaleString(locale)} AP
              </p>
            </li>
          ))}
        </ol>

        {first?.is_me ? <p className="advisor-hero__winner">{t('profile.heroYouWon')}</p> : null}

        <Button type="button" onClick={() => void dismiss()}>
          {t('common.continue')}
        </Button>
      </div>
    </div>
  );
}
