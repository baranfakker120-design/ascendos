import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@shared/auth/AuthProvider';
import { useI18n } from '@shared/i18n';
import { isStandaloneDisplayMode } from '@features/first-launch/platform';
import { Button } from '@shared/ui/Button';
import {
  enableLiveCoachingWebPush,
  resolveWebPushStatus,
  syncExistingSubscriptionToServer,
  type WebPushStatus,
} from './webPush';

/**
 * Opt-in Web Push for Live Coaching (iOS Home-Screen PWA + browsers).
 * Permission is only requested on explicit button click.
 */
export function LiveCoachingPushEnableCard() {
  const { t } = useI18n();
  const { profile } = useAuth();
  const [status, setStatus] = useState<WebPushStatus | 'loading'>('loading');
  const [busy, setBusy] = useState(false);
  const standalone = isStandaloneDisplayMode();
  const userId = profile?.id ?? null;

  const refresh = useCallback(async () => {
    const next = await resolveWebPushStatus();
    setStatus(next);
    if (next === 'subscribed' && userId) {
      void syncExistingSubscriptionToServer(userId);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onEnable = async () => {
    if (!userId || busy) return;
    setBusy(true);
    try {
      const result = await enableLiveCoachingWebPush(userId);
      setStatus(result.status);
    } finally {
      setBusy(false);
    }
  };

  if (status === 'loading') return null;

  // Hide entirely when Web Push APIs are missing (desktop Safari without SW push, etc.)
  if (status === 'unsupported') return null;

  if (status === 'subscribed') {
    return (
      <div className="live-coaching-push-card live-coaching-push-card--ok" role="status">
        <p className="live-coaching-push-card__title">{t('liveCoaching.pushEnabledTitle')}</p>
        <p className="live-coaching-push-card__body">{t('liveCoaching.pushEnabledBody')}</p>
        <ul className="live-coaching-push-card__list">
          <li>{t('liveCoaching.pushReminder45')}</li>
          <li>{t('liveCoaching.pushReminder5')}</li>
        </ul>
      </div>
    );
  }

  if (status === 'denied') {
    return (
      <div className="live-coaching-push-card" role="status">
        <p className="live-coaching-push-card__title">{t('liveCoaching.pushTitle')}</p>
        <p className="live-coaching-push-card__body">{t('liveCoaching.pushDeniedBody')}</p>
      </div>
    );
  }

  if (status === 'missing_vapid') {
    return (
      <div className="live-coaching-push-card" role="status">
        <p className="live-coaching-push-card__title">{t('liveCoaching.pushTitle')}</p>
        <p className="live-coaching-push-card__body">{t('liveCoaching.pushMissingVapid')}</p>
      </div>
    );
  }

  return (
    <div className="live-coaching-push-card">
      <p className="live-coaching-push-card__title">{t('liveCoaching.pushTitle')}</p>
      <p className="live-coaching-push-card__body">
        {standalone ? t('liveCoaching.pushBodyStandalone') : t('liveCoaching.pushBody')}
      </p>
      <Button
        type="button"
        variant="primary"
        disabled={busy || !userId}
        onClick={() => void onEnable()}
      >
        {busy ? t('liveCoaching.pushEnabling') : t('liveCoaching.pushEnableCta')}
      </Button>
    </div>
  );
}
