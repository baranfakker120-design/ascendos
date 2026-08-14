import { NavLink, Outlet } from 'react-router-dom';
import { useI18n } from '@shared/i18n';
import { useActiveOrganizationProfile } from '@shared/org/useActiveOrganizationProfile';
import './org-admin.css';

const NAV = [
  { to: '/admin', end: true, key: 'orgAdmin.nav.dashboard' },
  { to: '/admin/organization', end: false, key: 'orgAdmin.nav.organization' },
  { to: '/admin/members', end: false, key: 'orgAdmin.nav.members' },
  { to: '/admin/branding', end: false, key: 'orgAdmin.nav.branding' },
  { to: '/admin/tools', end: false, key: 'orgAdmin.nav.tools' },
  { to: '/admin/coach', end: false, key: 'orgAdmin.nav.coach' },
  { to: '/admin/knowledge', end: false, key: 'orgAdmin.nav.knowledge' },
  { to: '/admin/content', end: false, key: 'orgAdmin.nav.content' },
  { to: '/admin/live-coaching', end: false, key: 'orgAdmin.nav.live' },
  { to: '/admin/stories', end: false, key: 'orgAdmin.nav.stories' },
  { to: '/admin/billing', end: false, key: 'orgAdmin.nav.billing' },
] as const;

export function OrgAdminLayout() {
  const { t } = useI18n();
  const { profile } = useActiveOrganizationProfile();

  return (
    <div className="org-admin">
      <header className="org-admin__header">
        <p className="org-admin__eyebrow">{t('orgAdmin.eyebrow')}</p>
        <h1 className="org-admin__title">{t('orgAdmin.title')}</h1>
        <p className="org-admin__sub">
          {profile?.displayName
            ? t('orgAdmin.activeOrg', { name: profile.displayName })
            : t('orgAdmin.activeOrgGeneric')}
        </p>
      </header>

      <nav className="org-admin__nav" aria-label={t('orgAdmin.navLabel')}>
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `org-admin__nav-link${isActive ? ' org-admin__nav-link--active' : ''}`
            }
          >
            {t(item.key)}
          </NavLink>
        ))}
      </nav>

      <div className="org-admin__body">
        <Outlet />
      </div>
    </div>
  );
}
