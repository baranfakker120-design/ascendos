import { NavLink, Outlet } from 'react-router-dom';

const TABS = [
  { to: '/', label: 'Heute', icon: '☀️' },
  { to: '/kontakte', label: 'Kontakte', icon: '👥' },
  { to: '/coach', label: 'Ascent', icon: '⌃' },
  { to: '/mehr', label: 'Mehr', icon: '⋯' },
];

/** Grundgerüst der eingeloggten App: Inhalt oben, Bottom-Nav unten. */
export function AppShell() {
  return (
    <div className="mx-auto flex h-full max-w-lg flex-col">
      <main className="flex-1 overflow-y-auto px-4 pb-24 pt-6">
        <Outlet />
      </main>
      <nav
        aria-label="Hauptnavigation"
        className="fixed inset-x-0 bottom-0 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto flex max-w-lg">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.to === '/'}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors ${
                  isActive ? 'text-accent-deep' : 'text-muted'
                }`
              }
            >
              <span aria-hidden className="text-lg leading-none">
                {tab.icon}
              </span>
              {tab.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
