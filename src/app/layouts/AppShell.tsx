import { Outlet, useLocation } from 'react-router-dom';
import { FirstLaunchGate } from '@features/first-launch';
import { OrgSwitcher } from '@shared/auth/OrgSwitcher';
import { SyncStatusIndicator } from '@shared/offline';
import { SiteFooter } from '@shared/ui/SiteFooter';
import { BottomNav } from './BottomNav';
import { LanguageMenu } from './nav/LanguageMenu';
import './nav/bottom-nav.css';

/** Routes that own their own scrollport (chat / embedded guide). */
function usesFillLayout(pathname: string): boolean {
  return (
    pathname === '/coach' ||
    pathname.startsWith('/coach/person/') ||
    pathname === '/team' ||
    pathname === '/team-seyda'
  );
}

function isPersonCoachRoute(pathname: string): boolean {
  return pathname.startsWith('/coach/person/');
}

/**
 * App shell: one document height, one primary scroll owner.
 * Fill-layout routes (Coach, Team) scroll inside the page; others scroll in main.
 * Person Coach is immersive — no bottom nav overlaying the composer.
 */
export function AppShell() {
  const { pathname } = useLocation();
  const fill = usesFillLayout(pathname);
  const personCoach = isPersonCoachRoute(pathname);
  const wideCoach = pathname === '/coach' || personCoach;

  return (
    <div
      className={`mx-auto flex h-full flex-col overflow-x-clip ${wideCoach ? 'max-w-5xl' : 'max-w-lg'}`}
    >
      <header className="pointer-events-none z-30 flex shrink-0 items-center justify-between gap-2 px-4 pb-1 pt-[var(--app-header-pad)]">
        <div className="pointer-events-auto">
          <OrgSwitcher />
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <SyncStatusIndicator />
          <LanguageMenu />
        </div>
      </header>
      <main
        className={
          fill
            ? `flex min-h-0 flex-1 flex-col overflow-hidden px-4 pt-2 ${
                personCoach
                  ? 'pb-[max(0.5rem,env(safe-area-inset-bottom))]'
                  : 'pb-[var(--app-nav-clearance)]'
              }`
            : 'min-h-0 flex-1 overflow-x-clip overflow-y-auto px-4 pb-[var(--app-nav-clearance)] pt-2 [scrollbar-gutter:stable]'
        }
      >
        <Outlet />
        {personCoach ? null : <SiteFooter className="mt-6 px-0" />}
      </main>
      {personCoach ? null : <BottomNav />}
      <FirstLaunchGate />
    </div>
  );
}
