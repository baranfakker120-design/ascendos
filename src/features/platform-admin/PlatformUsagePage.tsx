import { useI18n } from '@shared/i18n';
import { Card } from '@shared/ui/Card';
import { useAuth } from '@shared/auth/AuthProvider';
import { usePlatformUsage } from './platformAdminApi';

export function PlatformUsagePage() {
  const { t } = useI18n();
  const { isPlatformSuperAdmin } = useAuth();
  const usage = usePlatformUsage(isPlatformSuperAdmin);

  if (usage.isError) {
    return <p className="text-sm text-danger">{(usage.error as Error).message}</p>;
  }

  const d = usage.data;

  return (
    <div className="space-y-4">
      <p className="platform-admin__muted">{t('platformAdmin.usage.hint')}</p>
      <div className="platform-admin__grid platform-admin__grid--2">
        <Card className="space-y-1">
          <p className="text-sm text-muted">{t('platformAdmin.usage.total')}</p>
          <p className="text-2xl font-bold">{usage.isLoading ? '…' : (d?.total_events ?? 0)}</p>
        </Card>
        <Card className="space-y-1">
          <p className="text-sm text-muted">{t('platformAdmin.usage.coach')}</p>
          <p className="text-2xl font-bold">{usage.isLoading ? '…' : (d?.coach_messages ?? 0)}</p>
        </Card>
        <Card className="space-y-1">
          <p className="text-sm text-muted">{t('platformAdmin.usage.appOpens')}</p>
          <p className="text-2xl font-bold">{usage.isLoading ? '…' : (d?.app_opens ?? 0)}</p>
        </Card>
        <Card className="space-y-1">
          <p className="text-sm text-muted">{t('platformAdmin.usage.plans')}</p>
          <p className="text-2xl font-bold">{usage.isLoading ? '…' : (d?.plans_committed ?? 0)}</p>
        </Card>
      </div>

      <Card className="overflow-x-auto">
        <p className="font-semibold mb-2">{t('platformAdmin.usage.byOrg')}</p>
        <table className="platform-admin__table">
          <thead>
            <tr>
              <th>{t('platformAdmin.usage.orgId')}</th>
              <th>{t('platformAdmin.usage.events')}</th>
            </tr>
          </thead>
          <tbody>
            {(d?.by_organization ?? []).map((row) => (
              <tr key={row.org_id}>
                <td>
                  <code className="text-xs">{row.org_id}</code>
                </td>
                <td>{row.event_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!usage.isLoading && (d?.by_organization ?? []).length === 0 ? (
          <p className="platform-admin__muted">{t('platformAdmin.usage.empty')}</p>
        ) : null}
      </Card>

      <p className="platform-admin__muted">{t('platformAdmin.usage.billingNote')}</p>
    </div>
  );
}
