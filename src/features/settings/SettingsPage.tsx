import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@shared/auth/AuthProvider';
import { useI18n } from '@shared/i18n';
import { APP_LOCALES, type AppLocale } from '@shared/lib/locale';
import { Alert } from '@shared/ui/Alert';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { Toggle } from '@shared/ui/Toggle';
import {
  ensureNotificationPermission,
  notificationPermissionState,
} from '@features/live-coaching/notifications';

/**
 * Premium Settings — clean system preferences only.
 * Business actions live on More.
 */
export function SettingsPage() {
  const { signOut } = useAuth();
  const { locale, setLocale, t } = useI18n();
  const [deleteHint, setDeleteHint] = useState<string | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushHint, setPushHint] = useState<string | null>(null);

  useEffect(() => {
    setPushEnabled(notificationPermissionState() === 'granted');
  }, []);

  const onLocale = (code: AppLocale) => {
    setLocale(code);
  };

  const onPushToggle = async (next: boolean) => {
    if (!next) {
      setPushEnabled(false);
      setPushHint(t('settings.pushDisabled'));
      return;
    }
    const ok = await ensureNotificationPermission();
    setPushEnabled(ok);
    setPushHint(ok ? t('settings.pushActive') : t('settings.pushDenied'));
  };

  const requestDelete = () => {
    const ok = window.confirm(t('settings.deleteConfirm'));
    if (!ok) return;
    setDeleteHint(t('settings.deleteHint'));
  };

  return (
    <div className="space-y-4">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
          {t('settings.eyebrow')}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{t('settings.title')}</h1>
      </header>

      <Card>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          {t('settings.general')}
        </p>
        <p className="mt-2 text-sm text-muted">{t('settings.generalBody')}</p>
      </Card>

      <Card>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          {t('settings.language')}
        </p>
        <ul className="mt-3 space-y-1.5">
          {APP_LOCALES.map((opt) => (
            <li key={opt.code}>
              <Button
                type="button"
                variant={locale === opt.code ? 'primary' : 'secondary'}
                onClick={() => onLocale(opt.code)}
                className="justify-start text-left"
              >
                <img src={opt.flag} alt="" aria-hidden className="h-6 w-6" draggable={false} />
                <span>{t(opt.labelKey)}</span>
              </Button>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          {t('settings.notifications')}
        </p>
        <div className="mt-3 flex items-center justify-between gap-3 text-sm">
          <div>
            <span className="font-medium">{t('settings.pushTitle')}</span>
            <p className="mt-0.5 text-xs text-muted">{t('settings.pushBody')}</p>
            {pushHint ? <p className="mt-1 text-xs text-muted">{pushHint}</p> : null}
          </div>
          <Toggle
            checked={pushEnabled}
            onChange={(next) => void onPushToggle(next)}
            label={t('settings.pushTitle')}
          />
        </div>
      </Card>

      <Card>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          {t('settings.appearance')}
        </p>
        <p className="mt-2 text-sm text-muted">{t('settings.appearanceBody')}</p>
      </Card>

      <Card>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          {t('settings.privacy')}
        </p>
        <p className="mt-2 text-sm text-muted">{t('settings.privacyBody')}</p>
      </Card>

      <Card>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          {t('settings.support')}
        </p>
        <p className="mt-2 text-sm text-muted">{t('settings.supportBody')}</p>
        <a
          href="mailto:support@ascendos.app"
          className="mt-3 inline-flex text-sm font-semibold text-accent-deep hover:underline"
        >
          {t('settings.supportCta')}
        </a>
      </Card>

      <Card>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          {t('settings.feedback')}
        </p>
        <p className="mt-2 text-sm text-muted">{t('settings.feedbackBody')}</p>
        <a
          href="mailto:feedback@ascendos.app"
          className="mt-3 inline-flex text-sm font-semibold text-accent-deep hover:underline"
        >
          {t('settings.feedbackCta')}
        </a>
      </Card>

      <Card>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          {t('settings.about')}
        </p>
        <p className="mt-2 text-sm text-ink">{t('settings.aboutLine')}</p>
        <p className="mt-1 text-xs text-muted">{t('settings.version', { version: '0.1.0' })}</p>
        <Link
          to="/profil"
          className="mt-3 inline-flex text-sm font-semibold text-accent-deep hover:underline"
        >
          {t('settings.toProfile')}
        </Link>
      </Card>

      <Card>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          {t('settings.danger')}
        </p>
        <div className="mt-3 space-y-2">
          <Button type="button" variant="secondary" onClick={() => void signOut()}>
            {t('settings.logout')}
          </Button>
          <Button type="button" variant="danger" onClick={requestDelete}>
            {t('settings.deleteAccount')}
          </Button>
          {deleteHint ? <Alert tone="info">{deleteHint}</Alert> : null}
        </div>
      </Card>
    </div>
  );
}
