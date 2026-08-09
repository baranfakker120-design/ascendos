import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@shared/i18n';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { isInstagramPublishingEnabled } from './architecture/instagramArchitecture';
import { createSignedAssetUrl, type ContentAsset } from './contentAssetsApi';
import type { ContentDraft } from './contentDraftsApi';
import { useInstagramConnection } from './instagramConnectionApi';
import { useInstagramPublish } from './instagramPublishApi';
import { publishErrorI18nKey } from './lib/instagramPublish/graphPublish';
import {
  buildInstagramCaptionPreview,
  evaluateInstagramPublishGate,
  formatHashtagsForDisplay,
  type InstagramPublishGateReason,
} from './lib/instagramPublish/publishGate';

/**
 * Phase 5C — Instagram post preview + official Graph publish after confirm.
 * Requires two explicit clicks. Never auto-publishes. No tokens in the UI.
 */
export function InstagramPublishPreview({
  asset,
  draft,
  caption,
  cta,
  hashtags,
}: {
  asset: ContentAsset | null;
  draft: ContentDraft;
  caption: string;
  cta: string;
  hashtags: string[];
}) {
  const { t } = useI18n();
  const { connectionQuery } = useInstagramConnection();
  const { publishMutation } = useInstagramPublish();
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<'ok' | 'error' | 'info'>('info');
  const [confirming, setConfirming] = useState(false);
  const [publishedMediaId, setPublishedMediaId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inFlightRef = useRef(false);

  const connection = connectionQuery.data;
  const connected = connection?.status === 'connected';
  const username = connection?.igUsername ?? null;

  useEffect(() => {
    rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [draft.id, draft.status]);

  useEffect(() => {
    if (!asset?.storage_path) {
      setMediaUrl(null);
      return;
    }
    let cancelled = false;
    void createSignedAssetUrl(asset.storage_path, 1800)
      .then((signed) => {
        if (!cancelled) setMediaUrl(signed);
      })
      .catch(() => {
        if (!cancelled) setMediaUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [asset?.storage_path]);

  const hashtagDisplay = useMemo(() => formatHashtagsForDisplay(hashtags), [hashtags]);
  const captionPreview = useMemo(
    () => buildInstagramCaptionPreview(caption, hashtags),
    [caption, hashtags]
  );

  const gate = evaluateInstagramPublishGate({
    connected,
    draftReady: draft.status === 'ready',
    hasMedia: Boolean(asset),
    hasCaption: Boolean(caption.trim()) || draft.format === 'story',
    scopes: connection?.scopes,
  });

  const feedbackForReason = (reason: InstagramPublishGateReason): string => {
    switch (reason) {
      case 'not_connected':
        return t('contentAssistant.igPublishNeedConnect');
      case 'draft_not_ready':
        return t('contentAssistant.igPublishNeedPrepare');
      case 'missing_media':
        return t('contentAssistant.igPublishNeedMedia');
      case 'missing_caption':
        return t('contentAssistant.igPublishNeedCaption');
      case 'missing_publish_permission':
        return t('contentAssistant.igPublishNeedPermission');
      case 'publishing_api_unavailable':
        return t('contentAssistant.igPublishApiNotReady');
      case 'ok':
        return t('contentAssistant.igPublishQueued');
      default:
        return t('contentAssistant.igPublishFailed');
    }
  };

  const onPublishClick = async () => {
    setFeedback(null);
    setFeedbackTone('info');

    if (publishedMediaId) {
      setFeedbackTone('ok');
      setFeedback(t('contentAssistant.igPublishSuccess'));
      return;
    }

    if (!confirming) {
      setConfirming(true);
      setFeedback(t('contentAssistant.igPublishConfirmHint'));
      return;
    }

    const reason = evaluateInstagramPublishGate({
      connected,
      draftReady: draft.status === 'ready',
      hasMedia: Boolean(asset),
      hasCaption: Boolean(caption.trim()) || draft.format === 'story',
      scopes: connection?.scopes,
      publishingEnabled: isInstagramPublishingEnabled(),
    });

    if (reason !== 'ok') {
      setConfirming(false);
      setFeedbackTone('error');
      setFeedback(feedbackForReason(reason));
      return;
    }

    if (inFlightRef.current || publishMutation.isPending) {
      setFeedbackTone('info');
      setFeedback(t('contentAssistant.igPublishInProgress'));
      return;
    }

    inFlightRef.current = true;
    setFeedbackTone('info');
    // Polling can take tens of seconds — never show a premature failure while waiting.
    setFeedback(t('contentAssistant.igPublishPreparing'));

    try {
      const result = await publishMutation.mutateAsync(draft.id);
      if (result.ok && result.mediaId) {
        setPublishedMediaId(result.mediaId);
        setConfirming(false);
        setFeedbackTone('ok');
        setFeedback(
          result.alreadyPublished
            ? t('contentAssistant.igPublishAlreadyDone')
            : t('contentAssistant.igPublishSuccess')
        );
        return;
      }

      setConfirming(false);
      setFeedbackTone('error');
      const key = publishErrorI18nKey(result.error);
      const translated = t(`contentAssistant.${key}` as 'contentAssistant.igPublishFailed');
      setFeedback(result.message ? `${translated} (${result.message})` : translated);
    } catch {
      setConfirming(false);
      setFeedbackTone('error');
      setFeedback(t('contentAssistant.igPublishFailed'));
    } finally {
      inFlightRef.current = false;
    }
  };

  const busy = publishMutation.isPending;
  const done = Boolean(publishedMediaId);

  return (
    <div ref={rootRef}>
      <Card className="space-y-3">
        <div className="space-y-1">
          <p className="font-semibold text-ink">{t('contentAssistant.igPreviewTitle')}</p>
          <p className="text-sm text-muted">{t('contentAssistant.igPreviewHint')}</p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-line bg-[rgb(var(--color-bg))]">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent-deep"
              aria-hidden="true"
            >
              IG
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">
                {username ? `@${username}` : t('contentAssistant.igPreviewAccountUnknown')}
              </p>
              <p className="text-[0.68rem] text-muted">
                {connected
                  ? t('contentAssistant.igStatusConnected')
                  : t('contentAssistant.igStatusDisconnected')}
                {' · '}
                {draft.format}
              </p>
            </div>
          </div>

          <div className="relative aspect-square w-full bg-black/5">
            {!asset ? (
              <div className="flex h-full items-center justify-center text-sm text-muted">
                {t('contentAssistant.igPublishNeedMedia')}
              </div>
            ) : !mediaUrl ? (
              <div className="flex h-full items-center justify-center text-sm text-muted">
                {t('contentAssistant.igPreviewMediaLoading')}
              </div>
            ) : asset.media_kind === 'video' ? (
              <video
                src={mediaUrl}
                className="h-full w-full object-cover"
                controls
                playsInline
                preload="metadata"
              />
            ) : (
              <img src={mediaUrl} alt="" className="h-full w-full object-cover" />
            )}
          </div>

          <div className="space-y-2 px-3 py-3">
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-muted">
                {t('contentAssistant.fieldCaption')}
              </p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink">
                {caption.trim() || t('contentAssistant.igPreviewEmptyCaption')}
              </p>
            </div>

            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-muted">
                {t('contentAssistant.fieldHashtags')}
              </p>
              <p className="mt-0.5 text-sm text-accent-deep">
                {hashtagDisplay || t('contentAssistant.igPreviewEmptyHashtags')}
              </p>
            </div>

            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-muted">
                {t('contentAssistant.fieldCta')}
              </p>
              <p className="mt-0.5 text-sm text-ink">
                {cta.trim() || t('contentAssistant.igPreviewEmptyCta')}
              </p>
            </div>

            {captionPreview ? <p className="sr-only">{captionPreview}</p> : null}
          </div>
        </div>

        <Button
          type="button"
          size="md"
          disabled={gate === 'draft_not_ready' || busy || done}
          onClick={() => void onPublishClick()}
        >
          {busy
            ? t('contentAssistant.igPublishPreparing')
            : done
              ? t('contentAssistant.igPublishSuccessShort')
              : confirming
                ? t('contentAssistant.igPublishConfirmCta')
                : t('contentAssistant.igPublishNow')}
        </Button>

        <p className="text-xs text-muted">{t('contentAssistant.noAutoPublish')}</p>
        {feedback ? (
          <p
            className={
              feedbackTone === 'ok'
                ? 'text-sm font-medium text-ink'
                : feedbackTone === 'error'
                  ? 'text-sm font-medium text-red-700'
                  : 'text-sm text-ink'
            }
          >
            {feedback}
          </p>
        ) : null}
      </Card>
    </div>
  );
}
