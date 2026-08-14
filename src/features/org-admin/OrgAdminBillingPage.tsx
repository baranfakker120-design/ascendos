import { useI18n } from '@shared/i18n';
import { useAuth } from '@shared/auth/AuthProvider';
import { Card } from '@shared/ui/Card';
import { formatEurFromCents } from '@shared/billing/billingMath';
import { useOrgAdminBilling, useOrgAdminUsage } from '@shared/billing/billingApi';

export function OrgAdminBillingPage() {
  const { t, locale } = useI18n();
  const { isOrganizationAdmin } = useAuth();
  const billing = useOrgAdminBilling(isOrganizationAdmin);
  const usage = useOrgAdminUsage(isOrganizationAdmin);

  if (billing.isError) {
    return <p className="text-sm text-danger">{(billing.error as Error).message}</p>;
  }

  const b = billing.data;
  const loc = locale?.startsWith('en') ? 'en-US' : 'de-DE';

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <p className="font-semibold">{t('orgAdmin.billing.title')}</p>
        <p className="org-admin__muted">{t('orgAdmin.billing.hint')}</p>
        {billing.isLoading || !b ? (
          <p className="org-admin__muted">{t('orgAdmin.billing.loading')}</p>
        ) : (
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt>{t('orgAdmin.billing.plan')}</dt>
              <dd className="font-medium">{b.plan_key}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>{t('orgAdmin.billing.base')}</dt>
              <dd className="font-medium">{formatEurFromCents(b.base_price_cents, loc)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>{t('orgAdmin.billing.seats')}</dt>
              <dd className="font-medium">{b.active_seats}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>{t('orgAdmin.billing.seatFee')}</dt>
              <dd className="font-medium">{formatEurFromCents(b.seat_total_cents, loc)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-[var(--color-line,#e5e7eb)] pt-2">
              <dt className="font-semibold">{t('orgAdmin.billing.estimated')}</dt>
              <dd className="font-bold">{formatEurFromCents(b.estimated_monthly_cents, loc)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>{t('orgAdmin.billing.status')}</dt>
              <dd className="font-medium">{b.billing_status}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>{t('orgAdmin.billing.email')}</dt>
              <dd className="font-medium">{b.billing_email ?? t('orgAdmin.notSet')}</dd>
            </div>
          </dl>
        )}
        <p className="org-admin__muted">{t('orgAdmin.billing.paymentNote')}</p>
      </Card>

      <Card className="space-y-2">
        <p className="font-semibold">{t('orgAdmin.billing.usageTitle')}</p>
        {usage.isLoading || !usage.data ? (
          <p className="org-admin__muted">{t('orgAdmin.billing.loading')}</p>
        ) : (
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt>{t('orgAdmin.billing.usageTotal')}</dt>
              <dd>{usage.data.total_events}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>{t('orgAdmin.billing.usageCoach')}</dt>
              <dd>{usage.data.coach_messages}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>{t('orgAdmin.billing.usageOpens')}</dt>
              <dd>{usage.data.app_opens}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>{t('orgAdmin.billing.usagePlans')}</dt>
              <dd>{usage.data.plans_committed}</dd>
            </div>
          </dl>
        )}
      </Card>
    </div>
  );
}
