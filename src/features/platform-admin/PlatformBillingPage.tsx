import { useMemo, useState } from 'react';
import { useI18n } from '@shared/i18n';
import { useAuth } from '@shared/auth/AuthProvider';
import { Card } from '@shared/ui/Card';
import { formatEurFromCents } from '@shared/billing/billingMath';
import { usePlatformBilling } from '@shared/billing/billingApi';

const STATUS_FILTERS = ['', 'trial', 'active', 'past_due', 'suspended', 'cancelled'] as const;

export function PlatformBillingPage() {
  const { t, locale } = useI18n();
  const { isPlatformSuperAdmin } = useAuth();
  const [status, setStatus] = useState<string>('');
  const list = usePlatformBilling(isPlatformSuperAdmin, status || null);
  const loc = locale?.startsWith('en') ? 'en-US' : 'de-DE';

  const totals = useMemo(() => {
    const rows = list.data ?? [];
    return {
      orgs: rows.length,
      seats: rows.reduce((acc, r) => acc + r.active_seats, 0),
      estimated: rows.reduce((acc, r) => acc + r.estimated_monthly_cents, 0),
    };
  }, [list.data]);

  return (
    <div className="space-y-4">
      <p className="platform-admin__muted">{t('platformAdmin.billing.hint')}</p>

      <div className="platform-admin__actions">
        <label className="text-sm" htmlFor="pa-billing-status">
          {t('platformAdmin.billing.filter')}
        </label>
        <select id="pa-billing-status" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS_FILTERS.map((s) => (
            <option key={s || 'all'} value={s}>
              {s ? s : t('platformAdmin.billing.filterAll')}
            </option>
          ))}
        </select>
      </div>

      <div className="platform-admin__grid platform-admin__grid--2">
        <Card className="space-y-1">
          <p className="text-sm text-muted">{t('platformAdmin.billing.statOrgs')}</p>
          <p className="text-2xl font-bold">{list.isLoading ? '…' : totals.orgs}</p>
        </Card>
        <Card className="space-y-1">
          <p className="text-sm text-muted">{t('platformAdmin.billing.statSeats')}</p>
          <p className="text-2xl font-bold">{list.isLoading ? '…' : totals.seats}</p>
        </Card>
        <Card className="space-y-1">
          <p className="text-sm text-muted">{t('platformAdmin.billing.statEstimated')}</p>
          <p className="text-2xl font-bold">
            {list.isLoading ? '…' : formatEurFromCents(totals.estimated, loc)}
          </p>
        </Card>
      </div>

      {list.isError ? <p className="text-sm text-danger">{(list.error as Error).message}</p> : null}

      <Card className="overflow-x-auto">
        <table className="platform-admin__table">
          <thead>
            <tr>
              <th>{t('platformAdmin.billing.colOrg')}</th>
              <th>{t('platformAdmin.billing.colMembers')}</th>
              <th>{t('platformAdmin.billing.colBase')}</th>
              <th>{t('platformAdmin.billing.colSeats')}</th>
              <th>{t('platformAdmin.billing.colEstimated')}</th>
              <th>{t('platformAdmin.billing.colStatus')}</th>
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((row) => (
              <tr key={row.organization_id}>
                <td>
                  <div className="font-medium">{row.display_name}</div>
                  <div className="platform-admin__muted">{row.organization_name}</div>
                </td>
                <td>{row.active_seats}</td>
                <td>{formatEurFromCents(row.base_price_cents, loc)}</td>
                <td>{formatEurFromCents(row.seat_total_cents, loc)}</td>
                <td>{formatEurFromCents(row.estimated_monthly_cents, loc)}</td>
                <td>{row.billing_status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.isLoading ? (
          <p className="platform-admin__muted">{t('platformAdmin.loading')}</p>
        ) : null}
        {!list.isLoading && (list.data ?? []).length === 0 ? (
          <p className="platform-admin__muted">{t('platformAdmin.billing.empty')}</p>
        ) : null}
      </Card>

      <p className="platform-admin__muted">{t('platformAdmin.billing.paymentNote')}</p>
    </div>
  );
}
