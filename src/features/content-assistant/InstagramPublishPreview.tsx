import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@shared/i18n';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { isInstagramPublishingEnabled } from './architecture/instagramArchitecture';
import { createSignedAssetUrl, type ContentAsset } from './contentAssetsApi';
import type { ContentDraft } from './contentDraftsApi';
import { useInstagramConnection } from './instagramConnectionApi';
import {
  buildInstagramCaptionPreview,
  evaluateInstagramPublishGate,
  formatHashtagsForDisplay,
  type InstagramPublishGateReason,
} from './lib/instagramPublish/publishGate';

/**
 * Phase 5B — Instagram post preview after „Instagram vorbereiten“.
 * Shows media + caption + hashtags + CTA + connected account.
 * Publish button requires an explicit click and never auto-publishes.
 * Official Graph publishing stays gated until the publish API is ready.
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
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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
    hasCaption: Boolean(caption.trim()),
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
      case 'publishing_api_unavailable':
        return t('contentAssistant.igPublishApiNotReady');
      case 'ok':
        return t('contentAssistant.igPublishQueued');
      default:
        return t('contentAssistant.igPublishApiNotReady');
    }
  };

  const onPublishClick = () => {
    setFeedback(null);
    if (!confirming) {
      setConfirming(true);
      setFeedback(t('contentAssistant.igPublishConfirmHint'));
      return;
    }

    // Second click = explicit user confirmation. Still no Graph publish while gated.
    const reason = evaluateInstagramPublishGate({
      connected,
      draftReady: draft.status === 'ready',
      hasMedia: Boolean(asset),
      hasCaption: Boolean(caption.trim()),
      publishingEnabled: isInstagramPublishingEnabled(),
    });
    setConfirming(false);
    setFeedback(feedbackForReason(reason));
  };

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
          disabled={gate === 'draft_not_ready'}
          onClick={onPublishClick}
        >
          {confirming
            ? t('contentAssistant.igPublishConfirmCta')
            : t('contentAssistant.igPublishNow')}
        </Button>

        <p className="text-xs text-muted">{t('contentAssistant.noAutoPublish')}</p>
        {feedback ? <p className="text-sm text-ink">{feedback}</p> : null}
      </Card>
    </div>
  );
}
