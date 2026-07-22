import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@shared/api/supabase';
import { Alert } from '@shared/ui/Alert';
import { Button } from '@shared/ui/Button';
import { Input } from '@shared/ui/Input';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const login = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (signInError) {
      setError('Anmeldung fehlgeschlagen. Bitte prüfe E-Mail und Passwort.');
    }
    // Erfolg: onAuthStateChange setzt die Session, der Router leitet weiter.
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Anmelden</h1>
        <p className="mt-1 text-sm text-muted">Willkommen zurück. Dein Tag ist vorbereitet.</p>
      </div>
      <form onSubmit={login} className="space-y-4">
        <Input
          label="E-Mail"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
        <Input
          label="Passwort"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Button type="submit" disabled={busy}>
          {busy ? 'Wird angemeldet …' : 'Anmelden'}
        </Button>
      </form>
      <p className="text-center text-sm text-muted">
        Neu hier?{' '}
        <Link to="/registrieren" className="font-medium text-primary">
          Mit Einladungscode registrieren
        </Link>
      </p>
    </div>
  );
}
