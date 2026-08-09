import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useI18n } from '@shared/i18n';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { useAuth } from '@shared/auth/AuthProvider';
import { useFacebookBusinessConnection } from './facebookBusinessConnectionApi';
import { parseFbCallbackParam } from './lib/facebookBusinessConnect';

/**
 * Parallel Facebook Login for Business card (Phase B — Music path).
 * Does not replace Instagram Login. Never shows tokens. No audio search.
 */
export function FacebookBusinessConnectionCard() {
  const { t } = useI18n();
  const { membership } = useAuth();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { connectionQuery, startMutation, disconnectMutation } = useFacebookBusinessConnection();
  const [banner, setBanner] = useState<string | null>(null);
  const fbParam = params.get('fb');

  useEffect(() => {
    const fb = parseFbCallbackParam(fbParam);
    if (!fb) return;
    if (fb === 'connected') setBanner(t('contentAssistant.fbConnectedBanner'));
    else if (fb === 'cancelled') setBanner(t('contentAssistant.fbCancelledBanner'));
    else if (fb === 'denied') setBanner(t('contentAssistant.fbDeniedBanner'));
    else setBanner(t('contentAssistant.fbErrorBanner'));
    const next = new URLSearchParams(params);
    next.delete('fb');
    next.delete('reason');
    setParams(next, { replace: true });
    void qc.invalidateQueries({
      queryKey: ['facebook-business-connection', membership?.org_id, membership?.id],
    });
  }, [fbParam, params, setParams, t, qc, membership?.org_id, membership?.id]);

  const connection = connectionQuery.data;
  const status = connection?.status ?? 'disconnected';
  const busy = startMutation.isPending || disconnectMutation.isPending;
  const musicReady = connection?.instagramMusicAvailable === true;

  return (
    <Card className="space-y-3">
      <div className="space-y-1">
        <p className="font-semibold text-ink">{t('contentAssistant.fbTitle')}</p>
        <p className="text-sm text-muted">{t('contentAssistant.fbHint')}</p>
      </div>

      {banner ? <p className="text-sm text-ink">{banner}</p> : null}

      {connectionQuery.isLoading ? (
        <p className="text-sm text-muted">{t('contentAssistant.fbLoading')}</p>
      ) : connectionQuery.isError ? (
        <p className="text-sm text-muted">{t('contentAssistant.fbLoadError')}</p>
      ) : status === 'connected' ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-ink">
            {musicReady
              ? t('contentAssistant.fbStatusMusicReady')
              : t('contentAssistant.fbStatusConnected')}
          </p>
          {connection?.pageName ? (
            <p className="text-sm text-muted">
              {t('contentAssistant.fbPageLabel')}: {connection.pageName}
            </p>
          ) : null}
          {connection?.igUsername ? (
            <p className="text-sm text-muted">@{connection.igUsername}</p>
          ) : null}
          <Button
            type="button"
            size="sm"
            fullWidth={false}
            disabled={busy}
            onClick={() => disconnectMutation.mutate()}
          >
            {disconnectMutation.isPending
              ? t('contentAssistant.fbDisconnecting')
              : t('contentAssistant.fbDisconnect')}
          </Button>
        </div>
      ) : status === 'connecting' ? (
        <p className="text-sm text-muted">{t('contentAssistant.fbConnecting')}</p>
      ) : (
        <div className="space-y-2">
          {status === 'error' && connection?.lastError ? (
            <p className="text-sm text-muted">{connection.lastError}</p>
          ) : null}
          <p className="text-sm text-muted">{t('contentAssistant.fbMusicUnavailable')}</p>
          <Button
            type="button"
            size="sm"
            fullWidth={false}
            disabled={busy || connection?.oauthConfigured === false}
            onClick={() => startMutation.mutate()}
          >
            {startMutation.isPending
              ? t('contentAssistant.fbConnecting')
              : t('contentAssistant.fbConnect')}
          </Button>
          {connection?.oauthConfigured === false ? (
            <p className="text-xs text-muted">{t('contentAssistant.fbNotConfigured')}</p>
          ) : null}
        </div>
      )}
    </Card>
  );
}
