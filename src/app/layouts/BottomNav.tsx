import { useCallback, useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useI18n, type MessageKey } from '@shared/i18n';
import { triggerNavHaptic } from '@shared/lib/haptics';
import { LiquidChampagne } from '@shared/ui/LiquidChampagne';
import { AscendLogo, ContactsIcon, TeamSeydaIcon, TodayIcon } from './nav/NavIcons';
import { ProfileStack } from './nav/ProfileStack';
import { TodayHubMenu } from './nav/TodayHubMenu';

export type NavTabId = 'heute' | 'kontakte' | 'coach' | 'team' | 'profil';

interface NavTab {
  id: NavTabId;
  to: string;
  labelKey: MessageKey;
  ariaKey: MessageKey;
  end?: boolean;
  externalInApp?: boolean;
}

export const BOTTOM_NAV_TABS: readonly NavTab[] = [
  { id: 'heute', to: '/', labelKey: 'nav.today', ariaKey: 'nav.today', end: true },
  { id: 'kontakte', to: '/kontakte', labelKey: 'nav.contacts', ariaKey: 'nav.contacts' },
  { id: 'coach', to: '/coach', labelKey: 'nav.coach', ariaKey: 'nav.coachAria' },
  {
    id: 'team',
    to: '/team',
    labelKey: 'nav.team',
    ariaKey: 'nav.teamAria',
  },
  { id: 'profil', to: '/profil', labelKey: 'nav.profile', ariaKey: 'nav.profile' },
] as const;

function isTabActive(tab: NavTab, pathname: string): boolean {
  if (tab.id === 'profil') {
    return (
      pathname === '/profil' ||
      pathname.startsWith('/profil/') ||
      pathname === '/settings' ||
      pathname.startsWith('/settings/') ||
      pathname === '/more' ||
      pathname.startsWith('/more/') ||
      pathname === '/mehr' ||
      pathname.startsWith('/mehr/')
    );
  }
  if (tab.id === 'heute') {
    return pathname === '/' || pathname.startsWith('/heute/');
  }
  if (tab.id === 'team') {
    return pathname === '/team' || pathname.startsWith('/team/');
  }
  if (tab.end) return pathname === tab.to;
  return pathname === tab.to || pathname.startsWith(`${tab.to}/`);
}

/**
 * AAA cinematic bottom navigation — floating shell, custom icons,
 * signature liquid champagne hold effect. Ascend logo unchanged.
 *
 * Additive Ascend control: 1st tap collapses side tabs (no route change);
 * 2nd tap (while collapsed) opens Coach. Original tab markup preserved.
 */
export function BottomNav() {
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const [burstId, setBurstId] = useState<NavTabId | null>(null);
  const [burstKey, setBurstKey] = useState(0);
  /** true = full original bar; false = only Ascend center (sides visually tucked) */
  const [navigationExpanded, setNavigationExpanded] = useState(true);

  const playBurst = useCallback((id: NavTabId) => {
    triggerNavHaptic(150);
    setBurstId(id);
    setBurstKey((k) => k + 1);
    window.setTimeout(() => {
      setBurstId((current) => (current === id ? null : current));
    }, 520);
  }, []);

  // Route changes restore the full original bar (e.g. after opening Coach).
  useEffect(() => {
    setNavigationExpanded(true);
  }, [location.pathname]);

  const renderIcon = (id: Exclude<NavTabId, 'profil'>, active: boolean) => {
    const burst = burstId === id;
    const key = `${id}-${burstKey}`;
    switch (id) {
      case 'heute':
        return <TodayIcon key={key} active={active} burst={burst} />;
      case 'kontakte':
        return <ContactsIcon key={key} active={active} burst={burst} />;
      case 'coach':
        return <AscendLogo key={key} active={active} burst={burst} />;
      case 'team':
        return <TeamSeydaIcon key={key} active={active} burst={burst} />;
    }
  };

  const coachActive = location.pathname === '/coach' || location.pathname.startsWith('/coach/');

  return (
    <nav
      aria-label={t('nav.main')}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <div className="pointer-events-auto relative mx-auto max-w-lg">
        <div
          className={
            navigationExpanded
              ? 'nav-shell relative grid grid-cols-5 items-end rounded-[1.75rem] border border-line bg-surface px-1.5 pb-2 pt-2 shadow-[0_10px_40px_rgb(17_18_20/0.08),0_1px_0_rgb(255_255_255/0.8)_inset]'
              : 'nav-shell nav-shell--coach-collapsed relative'
          }
        >
          {BOTTOM_NAV_TABS.map((tab) => {
            const active = isTabActive(tab, location.pathname);
            const isCenter = tab.id === 'coach';
            const label = t(tab.labelKey);
            const ariaLabel = t(tab.ariaKey);

            if (tab.id === 'profil') {
              return (
                <ProfileStack
                  key={tab.id}
                  burst={burstId === 'profil'}
                  burstKey={burstKey}
                  onBurst={() => {
                    setBurstId('profil');
                    setBurstKey((k) => k + 1);
                    window.setTimeout(() => {
                      setBurstId((current) => (current === 'profil' ? null : current));
                    }, 520);
                  }}
                />
              );
            }

            if (tab.id === 'heute') {
              return (
                <TodayHubMenu
                  key={tab.id}
                  burst={burstId === 'heute'}
                  burstKey={burstKey}
                  onBurst={() => {
                    setBurstId('heute');
                    setBurstKey((k) => k + 1);
                    window.setTimeout(() => {
                      setBurstId((current) => (current === 'heute' ? null : current));
                    }, 520);
                  }}
                />
              );
            }

            if (isCenter) {
              return (
                <div key={tab.id} className="relative flex justify-center">
                  <LiquidChampagne>
                    <NavLink
                      to={tab.to}
                      aria-label={ariaLabel}
                      aria-expanded={navigationExpanded}
                      onClick={(e) => {
                        playBurst(tab.id);
                        if (navigationExpanded) {
                          // 1st tap: tuck side tabs only — no navigation.
                          e.preventDefault();
                          setNavigationExpanded(false);
                          return;
                        }
                        // 2nd tap while collapsed: open Coach.
                        if (coachActive) {
                          e.preventDefault();
                          setNavigationExpanded(true);
                        }
                        // else NavLink navigates to /coach; pathname effect expands.
                      }}
                      className={({ isActive }) =>
                        [
                          'nav-center-btn group relative flex flex-col items-center outline-none',
                          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                          navigationExpanded
                            ? '-mt-7 min-h-[44px] min-w-[44px] justify-end gap-0.5'
                            : 'nav-center-btn--collapsed',
                          isActive ? 'text-accent-deep' : 'text-muted',
                        ].join(' ')
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <span
                            className={[
                              'nav-center-disc flex h-[3.6rem] w-[3.6rem] items-center justify-center rounded-full border border-line bg-surface',
                              'shadow-[0_8px_28px_rgb(184_147_90/0.22),0_2px_8px_rgb(17_18_20/0.06)]',
                              isActive ? 'nav-center-disc-active' : '',
                              navigationExpanded ? '' : 'nav-center-disc--bloom',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                          >
                            {renderIcon('coach', isActive)}
                          </span>
                          {navigationExpanded ? (
                            <span
                              className={[
                                'nav-center-label text-[10px] tracking-[0.14em] transition-[color,font-weight] duration-150',
                                isActive ? 'font-bold text-accent-deep' : 'font-medium text-muted',
                              ].join(' ')}
                            >
                              {label}
                            </span>
                          ) : (
                            <span className="sr-only">{label}</span>
                          )}
                        </>
                      )}
                    </NavLink>
                  </LiquidChampagne>
                </div>
              );
            }

            const sideId = tab.id as 'kontakte' | 'team';

            return (
              <LiquidChampagne key={tab.id} className="w-full justify-center">
                <NavLink
                  to={tab.to}
                  end={tab.end}
                  aria-label={ariaLabel}
                  onClick={(e) => {
                    playBurst(tab.id);
                    if (tab.externalInApp) {
                      e.preventDefault();
                      navigate(tab.to);
                    }
                  }}
                  className={({ isActive }) =>
                    [
                      'flex min-h-[44px] w-full flex-col items-center justify-end gap-1 px-1 py-1 outline-none',
                      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                      isActive || active ? 'text-accent-deep' : 'text-muted',
                    ].join(' ')
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span className={isActive || active ? 'nav-icon-active-glow' : undefined}>
                        {renderIcon(sideId, isActive || active)}
                      </span>
                      <span
                        className={[
                          'text-[10px] tracking-[0.14em] transition-[color,font-weight] duration-150',
                          isActive || active
                            ? 'font-bold text-accent-deep'
                            : 'font-medium text-muted',
                        ].join(' ')}
                      >
                        {label}
                      </span>
                    </>
                  )}
                </NavLink>
              </LiquidChampagne>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
