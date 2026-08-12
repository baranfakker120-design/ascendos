import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@shared/auth/AuthProvider';
import { useI18n } from '@shared/i18n';
import { isStandaloneDisplayMode } from '@features/first-launch/platform';
import { Button } from '@shared/ui/Button';
import {
  PUSH_SUCCESS_TOAST_MS,
  resolvePushEnableUiMode,
  type PushEnableUiStatus,
} from './pushEnableUi';
import {
  enableLiveCoachingWebPush,
  resolveWebPushStatus,
  syncExistingSubscriptionToServer,
  type WebPushStatus,
} from './webPush';

/**
 * Opt-in Web Push for Live Coaching (iOS Home-Screen PWA + browsers).
 * Permission is only requested on explicit button click.
 *
 * UX: enable CTA when not subscribed; brief success toast after opt-in;
 * no permanent "Erinnerungen aktiviert" card on Heute once subscribed.
 * Subscription / T−45 / T−5 dispatch are unchanged.
 */
export function LiveCoachingPushEnableCard() {
  const { t } = useI18n();
  const { profile } = useAuth();
  const [status, setStatus] = useState<WebPushStatus | 'loading'>('loading');
  const [busy, setBusy] = useState(false);
  const [successUntilMs, setSuccessUntilMs] = useState<number | null>(null);
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

  useEffect(() => {
    if (successUntilMs == null) return;
    const remaining = successUntilMs - Date.now();
    if (remaining <= 0) {
      setSuccessUntilMs(null);
      return;
    }
    const id = window.setTimeout(() => setSuccessUntilMs(null), remaining);
    return () => window.clearTimeout(id);
  }, [successUntilMs]);

  const onEnable = async () => {
    if (!userId || busy) return;
    setBusy(true);
    try {
      const result = await enableLiveCoachingWebPush(userId);
      setStatus(result.status);
      if (result.status === 'subscribed') {
        setSuccessUntilMs(Date.now() + PUSH_SUCCESS_TOAST_MS);
      }
    } finally {
      setBusy(false);
    }
  };

  const mode = resolvePushEnableUiMode({
    status: status as PushEnableUiStatus,
    successUntilMs,
    nowMs: Date.now(),
  });

  if (mode === 'hidden') return null;

  if (mode === 'success_toast') {
    return (
      <div className="live-coaching-push-toast" role="status" aria-live="polite">
        <p className="live-coaching-push-toast__title">{t('liveCoaching.pushEnabledTitle')}</p>
      </div>
    );
  }

  if (mode === 'denied') {
    return (
      <div className="live-coaching-push-card" role="status">
        <p className="live-coaching-push-card__title">{t('liveCoaching.pushTitle')}</p>
        <p className="live-coaching-push-card__body">{t('liveCoaching.pushDeniedBody')}</p>
      </div>
    );
  }

  if (mode === 'missing_vapid') {
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
