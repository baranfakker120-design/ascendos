import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@shared/api/supabase';
import { useI18n } from '@shared/i18n';
import { Alert } from '@shared/ui/Alert';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { Input } from '@shared/ui/Input';

interface InviteInfo {
  org_name: string;
  team_name: string;
  sponsor_first_name: string | null;
}

/**
 * Zweistufige Registrierung:
 * 1. Invite-Code prüfen (validate_invite, anonym) — der Nutzer sieht,
 *    von wem und in welches Team er eingeladen wurde, bevor er Daten eingibt.
 * 2. Kontodaten — signUp übergibt die Metadata; der DB-Trigger legt das
 *    Profil inkl. Sponsor/Team transaktional an (ADR-021).
 */
export function RegisterPage() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const [code, setCode] = useState(params.get('code') ?? '');
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const checkInvite = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    // [S-1] Validierung läuft über die Edge Function mit IP-Rate-Limit.
    const { data, error: fnError } = await supabase.functions.invoke('validate-invite', {
      body: { code },
    });
    setBusy(false);
    if (fnError) {
      const ctx = await (fnError as { context?: Response }).context?.json?.().catch(() => null);
      setError(ctx?.error ?? t('auth.invalidCode'));
      return;
    }
    if (!data?.valid) {
      setError(t('auth.invalidCode'));
      return;
    }
    setInvite(data);
  };

  const register = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          invite_code: code.trim().toUpperCase(),
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          username: username.trim().toLowerCase(),
        },
      },
    });
    setBusy(false);
    if (signUpError) {
      // Trigger-Fehler (z.B. Benutzername vergeben) kommen als Datenbank-
      // Meldung mit "AscendOS:"-Präfix zurück — die zeigen wir direkt an.
      const dbMessage = signUpError.message.match(/AscendOS: (.+)/)?.[1];
      setError(dbMessage ?? t('common.errorGeneric'));
      return;
    }
    // Bei aktiver Session (lokal, Bestätigung aus) leitet der Router
    // automatisch in die App weiter. Mit Mail-Bestätigung (Staging/Prod)
    // zeigen wir den Hinweis:
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setError(null);
      setInvite(null);
      alert(t('auth.emailConfirmHint'));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('auth.registerTitle')}</h1>
        <p className="mt-1 text-sm text-muted">{t('auth.registerSubtitle')}</p>
      </div>

      {!invite ? (
        <form onSubmit={checkInvite} className="space-y-4">
          <Input
            label={t('auth.inviteCode')}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder={t('auth.inviteCodePlaceholder')}
            autoCapitalize="characters"
            autoComplete="off"
            required
          />
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Button type="submit" disabled={busy || code.trim().length < 6}>
            {busy ? t('auth.checkingCode') : t('auth.checkCode')}
          </Button>
        </form>
      ) : (
        <form onSubmit={register} className="space-y-4">
          <Card>
            <p className="text-sm">
              {invite.sponsor_first_name
                ? t('auth.invitedBy', { name: invite.sponsor_first_name })
                : t('auth.invitedGeneric')}
            </p>
            <p className="mt-0.5 font-semibold">
              {invite.team_name} · {invite.org_name}
            </p>
          </Card>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t('auth.firstName')}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
              required
            />
            <Input
              label={t('auth.lastName')}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              autoComplete="family-name"
              required
            />
          </div>
          <Input
            label={t('auth.username')}
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            hint={t('auth.usernameHint')}
            pattern="[a-z0-9_.]{3,30}"
            autoComplete="username"
            required
          />
          <Input
            label={t('auth.email')}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <Input
            label={t('auth.password')}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint={t('auth.passwordHint')}
            minLength={8}
            autoComplete="new-password"
            required
          />
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Button type="submit" disabled={busy}>
            {busy ? t('auth.creatingAccount') : t('auth.createAccount')}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setInvite(null)}>
            {t('auth.useOtherCode')}
          </Button>
        </form>
      )}

      <p className="text-center text-sm text-muted">
        Schon ein Konto?{' '}
        <Link to="/login" className="font-medium text-primary">
          {t('auth.signIn')}
        </Link>
      </p>
    </div>
  );
}
