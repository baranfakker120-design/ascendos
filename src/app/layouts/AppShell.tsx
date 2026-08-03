import { Outlet } from 'react-router-dom';
import { OrgSwitcher } from '@shared/auth/OrgSwitcher';
import { BottomNav } from './BottomNav';
import { LanguageMenu } from './nav/LanguageMenu';
import './nav/bottom-nav.css';

/** Grundgerüst der eingeloggten App: Inhalt oben, cinematic Bottom-Nav unten. */
export function AppShell() {
  return (
    <div className="mx-auto flex h-full max-w-lg flex-col overflow-x-clip">
      <header className="pointer-events-none sticky top-0 z-30 flex items-center justify-between gap-2 px-4 pb-1 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto">
          <OrgSwitcher />
        </div>
        <div className="pointer-events-auto">
          <LanguageMenu />
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-x-clip overflow-y-auto px-4 pb-32 pt-2 [scrollbar-gutter:stable]">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
