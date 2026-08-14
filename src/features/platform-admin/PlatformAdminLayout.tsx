import { NavLink, Outlet } from 'react-router-dom';
import { useI18n } from '@shared/i18n';
import './platform-admin.css';

const NAV = [
  { to: '/platform-admin', end: true, key: 'platformAdmin.nav.overview' },
  { to: '/platform-admin/organizations', end: false, key: 'platformAdmin.nav.organizations' },
  { to: '/platform-admin/admins', end: false, key: 'platformAdmin.nav.admins' },
  { to: '/platform-admin/usage', end: false, key: 'platformAdmin.nav.usage' },
  { to: '/platform-admin/settings', end: false, key: 'platformAdmin.nav.settings' },
] as const;

export function PlatformAdminLayout() {
  const { t } = useI18n();

  return (
    <div className="platform-admin">
      <header>
        <p className="platform-admin__eyebrow">{t('platformAdmin.eyebrow')}</p>
        <h1 className="platform-admin__title">{t('platformAdmin.title')}</h1>
        <p className="platform-admin__sub">{t('platformAdmin.subtitle')}</p>
      </header>

      <nav className="platform-admin__nav" aria-label={t('platformAdmin.navLabel')}>
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `platform-admin__nav-link${isActive ? ' platform-admin__nav-link--active' : ''}`
            }
          >
            {t(item.key)}
          </NavLink>
        ))}
      </nav>

      <div className="platform-admin__body">
        <Outlet />
      </div>
    </div>
  );
}
