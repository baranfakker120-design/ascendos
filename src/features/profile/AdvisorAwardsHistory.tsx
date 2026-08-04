import { useQuery } from '@tanstack/react-query';
import { supabase } from '@shared/api/supabase';
import { useAuth } from '@shared/auth/AuthProvider';
import { useI18n } from '@shared/i18n';
import type { MessageKey } from '@shared/i18n/translate';
import { Card } from '@shared/ui/Card';
import { RankFrame } from '@shared/ui/RankFrame';
import { utcMonthStart } from './monthlyAwardsLogic';

export interface MonthlyAwardRow {
  period: string;
  place: number;
  membership_id: string;
  ap_in_period: number;
  display_name: string;
  avatar_url: string | null;
  username: string;
  is_me: boolean;
  created_at: string;
}

/** Ensure current title-month awards exist, then list org history. */
export function useMonthlyAwardsHistory(limit = 36) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['monthly-awards', profile?.org_id, limit],
    enabled: !!profile,
    queryFn: async (): Promise<MonthlyAwardRow[]> => {
      await supabase.rpc('ensure_monthly_awards');
      const { data, error } = await supabase.rpc('list_monthly_awards', {
        p_limit: limit,
      });
      if (error) throw error;
      return (data ?? []) as MonthlyAwardRow[];
    },
  });
}

function formatPeriodLabel(period: string, locale: string): string {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function placeKey(place: number): MessageKey {
  if (place === 1) return 'profile.advisorPlace1';
  if (place === 2) return 'profile.advisorPlace2';
  if (place === 3) return 'profile.advisorPlace3';
  return 'profile.advisorPlace1';
}

/**
 * Current podium + recent history for Berater des Monats.
 * Data comes from monthly_awards after ensure_monthly_awards catch-up.
 */
export function AdvisorAwardsHistory() {
  const { t, locale } = useI18n();
  const { data, isPending, isError } = useMonthlyAwardsHistory();
  const titlePeriod = utcMonthStart();
  const dateLocale = locale || 'de';

  if (isPending) {
    return (
      <Card>
        <p className="text-sm text-muted">{t('profile.advisorLoading')}</p>
      </Card>
    );
  }
  if (isError) {
    return (
      <Card>
        <p className="text-sm text-muted">{t('profile.advisorLoadError')}</p>
      </Card>
    );
  }

  const rows = data ?? [];
  const current = rows.filter((r) => r.period === titlePeriod);
  const historyPeriods = [...new Set(rows.map((r) => r.period))].filter((p) => p !== titlePeriod);

  return (
    <Card className="space-y-4">
      <div>
        <p className="font-semibold">{t('profile.advisorTitle')}</p>
        <p className="mt-1 text-sm text-muted">{t('profile.advisorHint')}</p>
      </div>

      {current.length === 0 ? (
        <p className="text-sm text-muted">{t('profile.advisorEmpty')}</p>
      ) : (
        <ol className="space-y-3">
          {current.map((row) => (
            <li key={`${row.period}-${row.place}`} className="flex items-center gap-3 text-left">
              <RankFrame
                frameKey={row.place === 1 ? 'frame-10' : null}
                src={row.avatar_url}
                name={row.display_name || row.username}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {t(placeKey(row.place))} · {row.display_name || row.username}
                  {row.is_me ? ` (${t('profile.advisorYou')})` : ''}
                </p>
                <p className="text-xs text-muted">
                  {row.ap_in_period.toLocaleString(dateLocale)} AP ·{' '}
                  {formatPeriodLabel(row.period, dateLocale)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}

      {historyPeriods.length > 0 ? (
        <div className="border-t border-border/60 pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            {t('profile.advisorHistory')}
          </p>
          <ul className="space-y-2">
            {historyPeriods.slice(0, 6).map((period) => {
              const podium = rows.filter((r) => r.period === period);
              const first = podium.find((r) => r.place === 1);
              return (
                <li key={period} className="flex justify-between gap-2 text-sm">
                  <span className="text-muted">{formatPeriodLabel(period, dateLocale)}</span>
                  <span className="truncate font-medium">
                    {first
                      ? `${first.display_name || first.username} · ${first.ap_in_period.toLocaleString(dateLocale)} AP`
                      : '—'}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
