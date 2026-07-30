import { NavLink, Outlet } from 'react-router-dom';

// Nur der Ascent-Eintrag bekommt ein `image`-Feld statt eines Emoji-Zeichens
// (Branding-Auftrag vom 30. Juli 2026, Punkt 3). Die uebrigen drei Tabs
// sind unveraendert: das ist ein bekannter, aber ausserhalb des
// Auftragsumfangs liegender Bestandsverstoss gegen F4 (nur Lucide-Symbole,
// keine Emoji) und wird hier bewusst NICHT mit angefasst.
const TABS: Array<{ to: string; label: string; icon?: string; image?: string }> = [
  { to: '/', label: 'Heute', icon: '☀️' },
  { to: '/kontakte', label: 'Kontakte', icon: '👥' },
  { to: '/coach', label: 'Ascent', image: '/brand/ascendos-symbol-mono-v2.png' },
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
              {tab.image ? (
                <img src={tab.image} alt="" aria-hidden className="h-6 w-auto" />
              ) : (
                <span aria-hidden className="text-lg leading-none">
                  {tab.icon}
                </span>
              )}
              {tab.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
