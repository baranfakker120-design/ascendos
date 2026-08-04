import { Outlet, useLocation } from 'react-router-dom';
import { FirstLaunchGate } from '@features/first-launch';
import { OrgSwitcher } from '@shared/auth/OrgSwitcher';
import { SyncStatusIndicator } from '@shared/offline';
import { BottomNav } from './BottomNav';
import { LanguageMenu } from './nav/LanguageMenu';
import './nav/bottom-nav.css';

/** Routes that own their own scrollport (chat / embedded guide). */
function usesFillLayout(pathname: string): boolean {
  return pathname === '/coach' || pathname === '/team' || pathname === '/team-seyda';
}

/**
 * App shell: one document height, one primary scroll owner.
 * Fill-layout routes (Coach, Team) scroll inside the page; others scroll in main.
 */
export function AppShell() {
  const { pathname } = useLocation();
  const fill = usesFillLayout(pathname);

  return (
    <div className="mx-auto flex h-full max-w-lg flex-col overflow-x-clip">
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
            ? 'flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-[var(--app-nav-clearance)] pt-2'
            : 'min-h-0 flex-1 overflow-x-clip overflow-y-auto px-4 pb-[var(--app-nav-clearance)] pt-2 [scrollbar-gutter:stable]'
        }
      >
        <Outlet />
      </main>
      <BottomNav />
      <FirstLaunchGate />
    </div>
  );
}
