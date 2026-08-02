import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@shared/auth/AuthProvider';
import {
  APP_LOCALES,
  readStoredLocale,
  writeStoredLocale,
  type AppLocale,
} from '@shared/lib/locale';
import { Alert } from '@shared/ui/Alert';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';

/**
 * Premium Settings — clean system preferences only.
 * Business actions live on More.
 */
export function SettingsPage() {
  const { signOut } = useAuth();
  const [locale, setLocale] = useState<AppLocale>(() => readStoredLocale());
  const [notifications, setNotifications] = useState(true);
  const [deleteHint, setDeleteHint] = useState<string | null>(null);

  const onLocale = (code: AppLocale) => {
    setLocale(code);
    writeStoredLocale(code);
  };

  const requestDelete = () => {
    const ok = window.confirm(
      'Konto wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden. Bitte bestätige, dass du eine Löschung anfordern möchtest.'
    );
    if (!ok) return;
    setDeleteHint(
      'Löschanfrage vorgemerkt. Bitte kontaktiere den Support, um die endgültige Löschung abzuschließen.'
    );
  };

  return (
    <div className="space-y-4">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">System</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Einstellungen</h1>
      </header>

      <Card>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">General</p>
        <p className="mt-2 text-sm text-muted">
          Grundlegende App-Einstellungen für deinen AscendOS-Arbeitsplatz.
        </p>
      </Card>

      <Card>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Language</p>
        <ul className="mt-3 space-y-1.5">
          {APP_LOCALES.map((opt) => (
            <li key={opt.code}>
              <button
                type="button"
                onClick={() => onLocale(opt.code)}
                className={[
                  'flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm',
                  locale === opt.code
                    ? 'bg-bg font-semibold text-accent-deep'
                    : 'font-medium text-ink hover:bg-bg',
                ].join(' ')}
              >
                <img src={opt.flag} alt="" aria-hidden className="h-6 w-6" draggable={false} />
                <span>{opt.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Notifications</p>
        <label className="mt-3 flex items-center justify-between gap-3 text-sm">
          <span className="font-medium">Push & Erinnerungen</span>
          <input
            type="checkbox"
            checked={notifications}
            onChange={(e) => setNotifications(e.target.checked)}
            className="h-4 w-4 accent-[rgb(var(--color-accent))]"
          />
        </label>
      </Card>

      <Card>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Appearance</p>
        <p className="mt-2 text-sm text-muted">
          Licht-Modus nach Brand Foundation v1. Dunkler Modus folgt mit dem PWA-Feinschliff.
        </p>
      </Card>

      <Card>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Privacy</p>
        <p className="mt-2 text-sm text-muted">
          Profil- und Aktivitätsdaten bleiben in deiner Organisation. Firstline sieht nur Fortschritt,
          keine privaten Inhalte.
        </p>
      </Card>

      <Card>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Support</p>
        <p className="mt-2 text-sm text-muted">Hilfe und technische Fragen über dein Leadership-Team.</p>
        <a
          href="mailto:support@ascendos.app"
          className="mt-3 inline-flex text-sm font-semibold text-accent-deep hover:underline"
        >
          Support kontaktieren
        </a>
      </Card>

      <Card>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Feedback</p>
        <p className="mt-2 text-sm text-muted">
          Ideen und Verbesserungen willkommen — wir bauen AscendOS mit Leadern.
        </p>
        <a
          href="mailto:feedback@ascendos.app"
          className="mt-3 inline-flex text-sm font-semibold text-accent-deep hover:underline"
        >
          Feedback senden
        </a>
      </Card>

      <Card>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">About AscendOS</p>
        <p className="mt-2 text-sm text-ink">AscendOS · Build a better tomorrow.</p>
        <p className="mt-1 text-xs text-muted">Version 0.1.0</p>
        <Link to="/profil" className="mt-3 inline-flex text-sm font-semibold text-accent-deep hover:underline">
          Zum Profil
        </Link>
      </Card>

      <Card>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Danger Zone</p>
        <div className="mt-3 space-y-2">
          <Button type="button" variant="secondary" onClick={() => void signOut()}>
            Logout
          </Button>
          <Button type="button" variant="ghost" onClick={requestDelete} className="text-[#C0392B]">
            Delete account
          </Button>
          {deleteHint ? <Alert tone="info">{deleteHint}</Alert> : null}
        </div>
      </Card>
    </div>
  );
}
