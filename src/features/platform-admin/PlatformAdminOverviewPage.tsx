import { Link } from 'react-router-dom';
import { useI18n } from '@shared/i18n';
import { Card } from '@shared/ui/Card';
import { usePlatformOrganizations, usePlatformAdmins, usePlatformUsage } from './platformAdminApi';
import { useAuth } from '@shared/auth/AuthProvider';

const LINKS = [
  {
    to: '/platform-admin/organizations',
    title: 'platformAdmin.dash.orgs',
    body: 'platformAdmin.dash.orgsBody',
  },
  {
    to: '/platform-admin/admins',
    title: 'platformAdmin.dash.admins',
    body: 'platformAdmin.dash.adminsBody',
  },
  {
    to: '/platform-admin/usage',
    title: 'platformAdmin.dash.usage',
    body: 'platformAdmin.dash.usageBody',
  },
  {
    to: '/platform-admin/settings',
    title: 'platformAdmin.dash.settings',
    body: 'platformAdmin.dash.settingsBody',
  },
] as const;

export function PlatformAdminOverviewPage() {
  const { t } = useI18n();
  const { isPlatformSuperAdmin } = useAuth();
  const orgs = usePlatformOrganizations(isPlatformSuperAdmin);
  const admins = usePlatformAdmins(isPlatformSuperAdmin);
  const usage = usePlatformUsage(isPlatformSuperAdmin);

  const activeOrgs = (orgs.data ?? []).filter((o) => o.status === 'active').length;
  const activeAdmins = (admins.data ?? []).filter((a) => a.is_active).length;

  return (
    <div className="space-y-4">
      <div className="platform-admin__grid platform-admin__grid--2">
        <Card className="space-y-1">
          <p className="text-sm text-muted">{t('platformAdmin.dash.statOrgs')}</p>
          <p className="text-2xl font-bold">{orgs.isLoading ? '…' : activeOrgs}</p>
        </Card>
        <Card className="space-y-1">
          <p className="text-sm text-muted">{t('platformAdmin.dash.statAdmins')}</p>
          <p className="text-2xl font-bold">{admins.isLoading ? '…' : activeAdmins}</p>
        </Card>
        <Card className="space-y-1">
          <p className="text-sm text-muted">{t('platformAdmin.dash.statEvents')}</p>
          <p className="text-2xl font-bold">
            {usage.isLoading ? '…' : (usage.data?.total_events ?? 0)}
          </p>
        </Card>
      </div>

      <div className="platform-admin__grid platform-admin__grid--2">
        {LINKS.map((item) => (
          <Link key={item.to} to={item.to} className="block no-underline text-inherit">
            <Card className="space-y-1">
              <p className="font-semibold">{t(item.title)}</p>
              <p className="platform-admin__muted">{t(item.body)}</p>
            </Card>
          </Link>
        ))}
      </div>

      <p className="platform-admin__muted">{t('platformAdmin.dash.scopeNote')}</p>
    </div>
  );
}
