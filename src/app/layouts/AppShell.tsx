import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import './nav/bottom-nav.css';

/** Grundgerüst der eingeloggten App: Inhalt oben, cinematic Bottom-Nav unten. */
export function AppShell() {
  return (
    <div className="mx-auto flex h-full max-w-lg flex-col">
      <main className="flex-1 overflow-y-auto px-4 pb-32 pt-6">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
