import { useState } from 'react';
import { useAuth } from '@shared/auth/AuthProvider';
import { useI18n } from '@shared/i18n';
import { Alert } from '@shared/ui/Alert';
import { Button } from '@shared/ui/Button';
import { cancelAccountDeletion, daysUntilDeletion } from './accountDeletionApi';

/** Banner shown while the signed-in profile is pending_deletion. */
export function PendingDeletionBanner() {
  const { t } = useI18n();
  const { profile, refreshProfile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!profile || profile.account_status !== 'pending_deletion') return null;

  const days = daysUntilDeletion(profile.deletion_scheduled_for);

  const onCancel = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await cancelAccountDeletion();
    setBusy(false);
    if (!result.ok) {
      setError(t('settings.deleteCancelFailed'));
      return;
    }
    setMessage(t('settings.deleteReactivated'));
    await refreshProfile();
  };

  return (
    <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4">
      <p className="text-sm font-bold text-red-700">{t('settings.deletePendingTitle')}</p>
      <p className="mt-1 text-sm text-ink">
        {t('settings.deletePendingBody', { days: String(days) })}
      </p>
      <p className="mt-1 text-xs text-muted">
        {t('settings.deletePendingHint', { days: String(days) })}
      </p>
      {message ? (
        <div className="mt-3">
          <Alert tone="info">{message}</Alert>
        </div>
      ) : null}
      {error ? (
        <div className="mt-3">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        className="mt-3"
        disabled={busy}
        onClick={() => void onCancel()}
      >
        {busy ? t('common.loading') : t('settings.deleteCancelAction')}
      </Button>
    </div>
  );
}
