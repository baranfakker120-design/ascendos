import { Link } from 'react-router-dom';
import { useI18n } from '@shared/i18n';
import { useAuth } from '@shared/auth/AuthProvider';
import { useActiveOrganizationProfile } from '@shared/org/useActiveOrganizationProfile';
import { Card } from '@shared/ui/Card';

const LINKS = [
  {
    to: '/admin/organization',
    title: 'orgAdmin.dash.organization',
    body: 'orgAdmin.dash.organizationBody',
  },
  { to: '/admin/members', title: 'orgAdmin.dash.members', body: 'orgAdmin.dash.membersBody' },
  { to: '/admin/branding', title: 'orgAdmin.dash.branding', body: 'orgAdmin.dash.brandingBody' },
  { to: '/admin/tools', title: 'orgAdmin.dash.tools', body: 'orgAdmin.dash.toolsBody' },
  { to: '/admin/coach', title: 'orgAdmin.dash.coach', body: 'orgAdmin.dash.coachBody' },
  { to: '/admin/knowledge', title: 'orgAdmin.dash.knowledge', body: 'orgAdmin.dash.knowledgeBody' },
  { to: '/admin/content', title: 'orgAdmin.dash.content', body: 'orgAdmin.dash.contentBody' },
  { to: '/admin/live-coaching', title: 'orgAdmin.dash.live', body: 'orgAdmin.dash.liveBody' },
  { to: '/admin/stories', title: 'orgAdmin.dash.stories', body: 'orgAdmin.dash.storiesBody' },
  { to: '/admin/billing', title: 'orgAdmin.dash.billing', body: 'orgAdmin.dash.billingBody' },
] as const;

export function OrgAdminDashboardPage() {
  const { t } = useI18n();
  const { role, canManageCoachContent, isSuperAdmin } = useAuth();
  const { profile } = useActiveOrganizationProfile();

  return (
    <div className="space-y-4">
      <Card>
        <p className="font-semibold">{profile?.displayName ?? t('orgAdmin.activeOrgGeneric')}</p>
        <p className="mt-1 text-sm text-muted">
          {t('orgAdmin.dash.roleLine', { role: role ?? '—' })}
        </p>
        <p className="mt-2 text-sm text-muted">{t('orgAdmin.dash.scopeNote')}</p>
      </Card>

      <div className="org-admin__grid org-admin__grid--2">
        {LINKS.map((item) => (
          <Link key={item.to} to={item.to} className="org-admin__card-link">
            <Card>
              <p className="font-semibold">{t(item.title)}</p>
              <p className="mt-1 text-sm text-muted">{t(item.body)}</p>
            </Card>
          </Link>
        ))}
      </div>

      {!canManageCoachContent && !isSuperAdmin ? (
        <Card>
          <p className="text-sm text-muted">{t('orgAdmin.dash.contentGateHint')}</p>
        </Card>
      ) : null}
    </div>
  );
}
