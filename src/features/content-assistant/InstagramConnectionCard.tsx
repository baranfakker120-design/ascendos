import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useI18n } from '@shared/i18n';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { useAuth } from '@shared/auth/AuthProvider';
import {
  INSTAGRAM_META_APP_REVIEW_TODOS,
  isInstagramConnectEnabled,
  isInstagramPublishingEnabled,
} from './architecture/instagramArchitecture';
import { useInstagramConnection } from './instagramConnectionApi';
import { parseIgCallbackParam } from './lib/instagramConnect';

/**
 * Instagram connection card — OAuth connect/disconnect.
 * Publishing happens only via InstagramPublishPreview + instagram-publish.
 * Never shows tokens, never auto-publishes.
 */
export function InstagramConnectionCard() {
  const { t } = useI18n();
  const { membership } = useAuth();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { connectionQuery, startMutation, disconnectMutation } = useInstagramConnection();
  const [banner, setBanner] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const igParam = params.get('ig');

  useEffect(() => {
    const ig = parseIgCallbackParam(igParam);
    if (!ig) return;
    if (ig === 'connected') setBanner(t('contentAssistant.igConnectedBanner'));
    else if (ig === 'cancelled') setBanner(t('contentAssistant.igCancelledBanner'));
    else if (ig === 'denied') setBanner(t('contentAssistant.igDeniedBanner'));
    else setBanner(t('contentAssistant.igErrorBanner'));
    const next = new URLSearchParams(params);
    next.delete('ig');
    next.delete('reason');
    setParams(next, { replace: true });
    void qc.invalidateQueries({
      queryKey: ['instagram-connection', membership?.org_id, membership?.id],
    });
  }, [igParam, params, setParams, t, qc, membership?.org_id, membership?.id]);

  const connection = connectionQuery.data;
  const status = connection?.status ?? 'disconnected';
  const connectEnabled = isInstagramConnectEnabled();
  const busy = startMutation.isPending || disconnectMutation.isPending;

  return (
    <Card className="space-y-3">
      <div className="space-y-1">
        <p className="font-semibold text-ink">{t('contentAssistant.igTitle')}</p>
        <p className="text-sm text-muted">{t('contentAssistant.instagramArchitectureHint')}</p>
      </div>

      {banner ? <p className="text-sm text-ink">{banner}</p> : null}

      {connectionQuery.isLoading ? (
        <p className="text-sm text-muted">{t('contentAssistant.igLoading')}</p>
      ) : connectionQuery.isError ? (
        <p className="text-sm text-muted">{t('contentAssistant.igLoadError')}</p>
      ) : status === 'connected' ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-ink">
            <span aria-hidden="true">🟢 </span>
            {t('contentAssistant.igStatusConnected')}
          </p>
          {connection?.igUsername ? (
            <p className="text-sm text-muted">@{connection.igUsername}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              fullWidth={false}
              disabled={busy}
              onClick={() => setManageOpen((v) => !v)}
            >
              {t('contentAssistant.igManage')}
            </Button>
          </div>
          {manageOpen ? (
            <div className="space-y-2 border-t border-hairline pt-2">
              <p className="text-xs text-muted">{t('contentAssistant.igManageHint')}</p>
              <Button
                type="button"
                size="sm"
                fullWidth={false}
                disabled={busy}
                onClick={() => disconnectMutation.mutate()}
              >
                {disconnectMutation.isPending
                  ? t('contentAssistant.igDisconnecting')
                  : t('contentAssistant.igDisconnect')}
              </Button>
            </div>
          ) : null}
        </div>
      ) : status === 'connecting' ? (
        <div className="space-y-2">
          <p className="text-sm text-ink">
            <span aria-hidden="true">🟡 </span>
            {t('contentAssistant.igStatusConnecting')}
          </p>
          <Button
            type="button"
            size="sm"
            fullWidth={false}
            disabled={busy || !connectEnabled}
            onClick={() => startMutation.mutate()}
          >
            {t('contentAssistant.connectInstagram')}
          </Button>
        </div>
      ) : status === 'error' ? (
        <div className="space-y-2">
          <p className="text-sm text-ink">
            <span aria-hidden="true">🔴 </span>
            {t('contentAssistant.igStatusError')}
          </p>
          {connection?.lastError ? (
            <p className="text-xs text-muted">{connection.lastError}</p>
          ) : (
            <p className="text-xs text-muted">{t('contentAssistant.igErrorGeneric')}</p>
          )}
          <Button
            type="button"
            size="sm"
            fullWidth={false}
            disabled={busy || !connectEnabled}
            onClick={() => startMutation.mutate()}
          >
            {startMutation.isPending
              ? t('contentAssistant.igConnecting')
              : t('contentAssistant.connectInstagram')}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-ink">
            <span aria-hidden="true">🔴 </span>
            {t('contentAssistant.igStatusDisconnected')}
          </p>
          <Button
            type="button"
            size="sm"
            fullWidth={false}
            disabled={busy || !connectEnabled}
            onClick={() => startMutation.mutate()}
          >
            {startMutation.isPending
              ? t('contentAssistant.igConnecting')
              : t('contentAssistant.connectInstagram')}
          </Button>
          {startMutation.isError ? (
            <p className="text-xs text-muted">
              {String((startMutation.error as Error)?.message ?? '').includes(
                'instagram_oauth_not_configured'
              ) || connection?.oauthConfigured === false
                ? t('contentAssistant.igNotConfigured')
                : t('contentAssistant.igStartFailed')}
            </p>
          ) : null}
        </div>
      )}

      {!isInstagramPublishingEnabled() ? (
        <p className="text-xs text-muted">
          {t('contentAssistant.instagramTodoCount', {
            count: String(INSTAGRAM_META_APP_REVIEW_TODOS.length),
          })}
        </p>
      ) : null}
      <p className="text-xs text-muted">{t('contentAssistant.noAutoPublish')}</p>
    </Card>
  );
}
