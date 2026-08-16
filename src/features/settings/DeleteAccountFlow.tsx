import { useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '@shared/auth/AuthProvider';
import { useI18n } from '@shared/i18n';
import { Alert } from '@shared/ui/Alert';
import { BottomSheet } from '@shared/ui/BottomSheet';
import { Button } from '@shared/ui/Button';
import { Input } from '@shared/ui/Input';
import { requestAccountDeletion, verifyAccountPassword } from './accountDeletionApi';

type Step = 'confirm' | 'password' | 'final';

interface Props {
  open: boolean;
  onClose: () => void;
  onScheduled: () => void;
}

export function DeleteAccountFlow({ open, onClose, onScheduled }: Props) {
  const { t } = useI18n();
  const { session, signOut } = useAuth();
  const [step, setStep] = useState<Step>('confirm');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const email = session?.user?.email ?? '';

  const reset = () => {
    setStep('confirm');
    setPassword('');
    setShowPassword(false);
    setError(null);
    setBusy(false);
  };

  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const onPasswordContinue = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!password.trim()) {
      setError(t('settings.deletePasswordRequired'));
      return;
    }
    setBusy(true);
    const verified = await verifyAccountPassword({ email, password });
    // Clear password from React state ASAP after verification attempt.
    setPassword('');
    setBusy(false);
    if (!verified.ok) {
      setError(t('settings.deletePasswordInvalid'));
      return;
    }
    setStep('final');
  };

  const onConfirmDeletion = async () => {
    setError(null);
    setBusy(true);
    const result = await requestAccountDeletion();
    setBusy(false);
    if (!result.ok) {
      setError(t('settings.deleteRequestFailed'));
      return;
    }
    reset();
    onClose();
    onScheduled();
    await signOut();
  };

  const sheetTitle = useMemo(() => {
    if (step === 'confirm') return t('settings.deleteReallyTitle');
    if (step === 'password') return t('settings.deleteAccount');
    return t('settings.deleteFinalTitle');
  }, [step, t]);

  if (!open) return null;

  if (step === 'password') {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-bg">
        <header className="flex items-center gap-2 border-b border-line px-4 py-3 pt-[var(--app-header-pad)]">
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-sm font-semibold text-ink"
            onClick={() => {
              setError(null);
              setPassword('');
              setStep('confirm');
            }}
            disabled={busy}
          >
            ←
          </button>
          <h1 className="text-base font-bold">{t('settings.deleteAccount')}</h1>
        </header>
        <div className="mx-auto w-full max-w-lg flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
              className="text-red-700"
            >
              <rect
                x="5"
                y="11"
                width="14"
                height="10"
                rx="2"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path d="M8 11V8a4 4 0 1 1 8 0v3" stroke="currentColor" strokeWidth="2" />
            </svg>
          </div>
          <h2 className="text-xl font-bold tracking-tight">{t('settings.deletePasswordTitle')}</h2>
          <p className="mt-2 text-sm text-muted">{t('settings.deletePasswordBody')}</p>

          <form className="mt-6 space-y-4" onSubmit={(e) => void onPasswordContinue(e)}>
            <div className="relative">
              <Input
                label={t('auth.password')}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="absolute right-3 top-[2.05rem] text-xs font-semibold text-muted"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? t('settings.hidePassword') : t('settings.showPassword')}
              >
                {showPassword ? t('settings.hidePassword') : t('settings.showPassword')}
              </button>
            </div>
            {error ? <Alert tone="error">{error}</Alert> : null}
            <Button type="submit" variant="danger" disabled={busy || !email}>
              {busy ? t('common.loading') : t('common.continue')}
            </Button>
          </form>

          <section className="mt-8 rounded-2xl border border-line bg-white p-4">
            <p className="text-sm font-bold">{t('settings.deleteGraceTitle')}</p>
            <p className="mt-2 text-sm text-muted">{t('settings.deleteGraceBody')}</p>
            <ul className="mt-4 space-y-3 rounded-xl bg-red-50 p-3 text-sm text-ink">
              <li>{t('settings.deleteGraceHidden')}</li>
              <li>{t('settings.deleteGracePurge')}</li>
              <li>{t('settings.deleteGraceOrgKeeps')}</li>
            </ul>
          </section>
        </div>
      </div>
    );
  }

  return (
    <BottomSheet open={open} title={sheetTitle} onClose={close}>
      {step === 'confirm' ? (
        <div className="space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
              className="text-red-700"
            >
              <path
                d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0v12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <p className="text-center text-sm text-muted">{t('settings.deleteReallyBody')}</p>
          <Button type="button" variant="danger" onClick={() => setStep('password')}>
            {t('common.continue')}
          </Button>
          <Button type="button" variant="secondary" onClick={close}>
            {t('common.cancel')}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted">{t('settings.deleteFinalBody')}</p>
          <p className="rounded-xl bg-red-50 px-3 py-2 text-center text-sm font-bold text-red-700">
            {t('settings.deleteGraceBadge')}
          </p>
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Button
            type="button"
            variant="danger"
            disabled={busy}
            onClick={() => void onConfirmDeletion()}
          >
            {busy ? t('common.loading') : t('settings.deleteConfirmAction')}
          </Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={close}>
            {t('common.cancel')}
          </Button>
        </div>
      )}
    </BottomSheet>
  );
}
