import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '@shared/i18n';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { useAuth } from '@shared/auth/AuthProvider';
import { isInstagramPublishingEnabled } from './architecture/instagramArchitecture';
import { createSignedAssetUrl, type ContentAsset } from './contentAssetsApi';
import { updateContentDraft, type ContentDraft } from './contentDraftsApi';
import { useInstagramConnection } from './instagramConnectionApi';
import { useInstagramPublish } from './instagramPublishApi';
import { publishErrorI18nKey } from './lib/instagramPublish/graphPublish';
import {
  buildInstagramCaptionPreview,
  evaluateInstagramPublishGate,
  formatHashtagsForDisplay,
  type InstagramPublishGateReason,
} from './lib/instagramPublish/publishGate';
import { runClientConfirmedPublishAttempt } from './lib/instagramPublish/clientPublishAttempt';
import { readVideoDurationFromUrl } from './lib/instagramPublish/readVideoDuration';
import { useFacebookBusinessConnection } from './facebookBusinessConnectionApi';
import { useInstagramAudioSearch } from './instagramAudioSearchApi';
import type { InstagramAudioSearchItem, InstagramAudioSearchType } from './lib/instagramAudio';
import {
  isInstagramMusicAvailable,
  resolveInstagramMusicCapability,
  type InstagramAudioSelection,
} from './lib/instagramPublish/instagramMusicFoundation';
import { reelValidationI18nKey } from './lib/instagramPublish/reelVideoValidation';

/**
 * Instagram post/Reel preview + official Graph publish after confirm.
 * Phase D: optional library audio selection stored on draft; publish attaches audio_configuration
 * for Reels only when a valid Facebook Business connection exists.
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
  const { membership } = useAuth();
  const qc = useQueryClient();
  const { connectionQuery } = useInstagramConnection();
  const { connectionQuery: facebookConnectionQuery } = useFacebookBusinessConnection();
  const { publishMutation } = useInstagramPublish();
  const { searchMutation } = useInstagramAudioSearch();
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<'ok' | 'error' | 'info'>('info');
  const [confirming, setConfirming] = useState(false);
  const [publishedMediaId, setPublishedMediaId] = useState<string | null>(null);
  const [audioType, setAudioType] = useState<InstagramAudioSearchType>('music');
  const [audioQuery, setAudioQuery] = useState('');
  const [audioResults, setAudioResults] = useState<InstagramAudioSearchItem[]>([]);
  const [audioSearchError, setAudioSearchError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inFlightRef = useRef(false);

  const audioSaveMutation = useMutation({
    mutationFn: (selection: InstagramAudioSelection | null) =>
      updateContentDraft(draft.id, { instagram_audio_json: selection }),
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: ['content-drafts', membership?.org_id, membership?.id],
      });
    },
  });

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
  const isReel =
    draft.format === 'reel' || (draft.format !== 'story' && asset?.media_kind === 'video');
  /** Phase C: music UI + search when Facebook Login scopes allow Audio API. */
  const showMusicSection = isReel;
  const musicCapability = resolveInstagramMusicCapability(facebookConnectionQuery.data);
  const musicAvailable = isInstagramMusicAvailable(musicCapability);
  const audioSearchAvailable = musicCapability.audio_search_available === true;

  const onAudioSearch = () => {
    setAudioSearchError(null);
    searchMutation.mutate(
      { audioType, searchQuery: audioQuery.trim() || undefined },
      {
        onSuccess: (result) => {
          setAudioResults(result.audio);
        },
        onError: (err) => {
          setAudioResults([]);
          const msg = err instanceof Error ? err.message : 'audio_search_failed';
          setAudioSearchError(msg);
        },
      }
    );
  };

  const onSelectAudio = (item: InstagramAudioSearchItem) => {
    const selection: InstagramAudioSelection = {
      audio_id: item.audio_id,
      audio_type: item.audio_type,
      title: item.title,
      artist: item.artist,
      audio_volume: 100,
      video_volume: 100,
    };
    audioSaveMutation.mutate(selection);
  };

  const onClearAudio = () => {
    audioSaveMutation.mutate(null);
  };

  const selectedAudio = draft.instagram_audio_json;

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

    setFeedbackTone('info');
    // Polling can take tens of seconds — never show a premature failure while waiting.
    setFeedback(
      isReel
        ? t('contentAssistant.igPublishPreparingReel')
        : t('contentAssistant.igPublishPreparing')
    );

    const needsVideoCheck = Boolean(
      asset && (asset.media_kind === 'video' || draft.format === 'reel')
    );

    try {
      // Lock is acquired inside runClientConfirmedPublishAttempt BEFORE any await.
      const outcome = await runClientConfirmedPublishAttempt({
        inFlight: inFlightRef,
        mutationPending: publishMutation.isPending,
        needsVideoCheck,
        readDuration:
          needsVideoCheck && mediaUrl && asset?.media_kind === 'video'
            ? () => readVideoDurationFromUrl(mediaUrl)
            : undefined,
        videoValidation:
          needsVideoCheck && asset
            ? {
                mediaKind: asset.media_kind,
                format: draft.format,
                mimeType: asset.mime_type,
                byteSize: asset.byte_size,
                widthPx: asset.width_px,
                heightPx: asset.height_px,
              }
            : undefined,
        publish: async () => {
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
            return { ok: true, alreadyPublished: result.alreadyPublished };
          }
          setConfirming(false);
          setFeedbackTone('error');
          const key = publishErrorI18nKey(result.error);
          const translated = t(`contentAssistant.${key}` as 'contentAssistant.igPublishFailed');
          setFeedback(result.message ? `${translated} (${result.message})` : translated);
          return { ok: false, error: result.error };
        },
      });

      if (outcome.status === 'already_in_progress') {
        setFeedbackTone('info');
        setFeedback(t('contentAssistant.igPublishInProgress'));
        return;
      }

      if (outcome.status === 'validation_failed') {
        setConfirming(false);
        setFeedbackTone('error');
        setFeedback(
          t(
            `contentAssistant.${reelValidationI18nKey(outcome.code)}` as 'contentAssistant.igPublishFailed'
          )
        );
      }
      // published / publish_failed feedback already set inside publish callback
    } catch {
      setConfirming(false);
      setFeedbackTone('error');
      setFeedback(t('contentAssistant.igPublishFailed'));
    }
  };

  const busy = publishMutation.isPending;
  const done = Boolean(publishedMediaId);

  return (
    <div ref={rootRef}>
      <Card className="space-y-3">
        <div className="space-y-1">
          <p className="font-semibold text-ink">
            {isReel
              ? t('contentAssistant.igPreviewTitleReel')
              : t('contentAssistant.igPreviewTitle')}
          </p>
          <p className="text-sm text-muted">
            {isReel ? t('contentAssistant.igPreviewHintReel') : t('contentAssistant.igPreviewHint')}
          </p>
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
                {isReel ? t('contentAssistant.igFormatReel') : draft.format}
              </p>
            </div>
          </div>

          <div
            className={
              isReel
                ? 'relative mx-auto aspect-[9/16] w-full max-w-[280px] bg-black/5'
                : 'relative aspect-square w-full bg-black/5'
            }
          >
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

            {showMusicSection ? (
              <div className="space-y-2">
                <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-muted">
                  {t('contentAssistant.igAudioLabel')}
                </p>
                {!musicAvailable ? (
                  <p className="mt-0.5 text-sm text-muted">
                    {t('contentAssistant.igAudioUnavailable')}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {selectedAudio?.audio_id ? (
                      <div className="space-y-1">
                        <p className="text-sm text-ink">
                          {[selectedAudio.title, selectedAudio.artist]
                            .filter(Boolean)
                            .join(' · ') || selectedAudio.audio_id}
                        </p>
                        <p className="text-xs text-muted">
                          {selectedAudio.audio_type === 'original_sound'
                            ? t('contentAssistant.igAudioTypeOriginal')
                            : t('contentAssistant.igAudioTypeMusic')}
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          fullWidth={false}
                          disabled={audioSaveMutation.isPending}
                          onClick={() => onClearAudio()}
                        >
                          {t('contentAssistant.igAudioRemove')}
                        </Button>
                      </div>
                    ) : null}

                    {audioSearchAvailable ? (
                      <>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={audioType === 'music' ? 'primary' : 'secondary'}
                            fullWidth={false}
                            onClick={() => setAudioType('music')}
                          >
                            {t('contentAssistant.igAudioTypeMusic')}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={audioType === 'original_sound' ? 'primary' : 'secondary'}
                            fullWidth={false}
                            onClick={() => setAudioType('original_sound')}
                          >
                            {t('contentAssistant.igAudioTypeOriginal')}
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <input
                            type="search"
                            value={audioQuery}
                            onChange={(e) => setAudioQuery(e.target.value)}
                            placeholder={t('contentAssistant.igAudioSearchPlaceholder')}
                            className="min-w-0 flex-1 rounded-md border border-hairline bg-surface px-2 py-1.5 text-sm text-ink"
                          />
                          <Button
                            type="button"
                            size="sm"
                            fullWidth={false}
                            disabled={searchMutation.isPending}
                            onClick={() => onAudioSearch()}
                          >
                            {searchMutation.isPending
                              ? t('contentAssistant.igAudioSearching')
                              : t('contentAssistant.igAudioSearch')}
                          </Button>
                        </div>
                        {audioSearchError ? (
                          <p className="text-sm text-muted">{audioSearchError}</p>
                        ) : null}
                        {audioResults.length > 0 ? (
                          <ul className="max-h-40 space-y-1 overflow-y-auto text-sm text-ink">
                            {audioResults.map((item) => (
                              <li key={item.audio_id}>
                                <button
                                  type="button"
                                  className="text-left text-accent-deep underline-offset-2 hover:underline"
                                  onClick={() => onSelectAudio(item)}
                                >
                                  {[item.title, item.artist || item.ig_username]
                                    .filter(Boolean)
                                    .join(' · ') || item.audio_id}
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </>
                    ) : (
                      <p className="text-sm text-muted">
                        {t('contentAssistant.igAudioSearchNeedPermission')}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : null}

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
            ? isReel
              ? t('contentAssistant.igPublishPreparingReel')
              : t('contentAssistant.igPublishPreparing')
            : done
              ? t('contentAssistant.igPublishSuccessShort')
              : confirming
                ? t('contentAssistant.igPublishConfirmCta')
                : isReel
                  ? t('contentAssistant.igPublishNowReel')
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
