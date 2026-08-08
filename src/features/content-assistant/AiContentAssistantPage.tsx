import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '@shared/i18n';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import {
  DAILY_CONTENT_JOB,
  DAILY_CONTENT_COMPLIANCE,
} from './architecture/dailyContentArchitecture';
import { ContentAssetThumb } from './ContentAssetThumb';
import { InstagramConnectionCard } from './InstagramConnectionCard';
import {
  useContentLibrary,
  type ContentAsset,
  type ContentAssetScope,
  type ContentFormat,
} from './contentAssetsApi';
import {
  useContentDrafts,
  type ContentDraft,
  type ContentGenerateResult,
  type ContentResearchPayload,
} from './contentDraftsApi';
import { hashtagReasonI18nKey } from './lib/hashtagResearch';

/**
 * AI Content Assistant — Phase 3 generation + Phase 4 daily prep + Phase 5A IG connect.
 * No Instagram publishing. Cron not activated from the client.
 * Does not touch Coach domains.
 */
export function AiContentAssistantPage() {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const [scope, setScope] = useState<ContentAssetScope>('personal');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [format, setFormat] = useState<ContentFormat>('feed');
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [research, setResearch] = useState<ContentResearchPayload | null>(null);
  const [assetPersistNote, setAssetPersistNote] = useState<string | null>(null);
  const [edit, setEdit] = useState<{
    hook: string;
    caption: string;
    cta: string;
    keywords: string;
    hashtags: string;
  } | null>(null);

  const { assetsQuery, quotaQuery, todayQuery, uploadMutation, deleteMutation, canCentral } =
    useContentLibrary();
  const { draftsQuery, generateMutation, saveMutation, prepareMutation } =
    useContentDrafts(selectedAssetId);

  const formats: {
    id: ContentFormat;
    titleKey: 'todayHub.contentStory' | 'todayHub.contentFeed' | 'todayHub.contentReel';
    subKey: 'todayHub.contentStorySub' | 'todayHub.contentFeedSub' | 'todayHub.contentReelSub';
  }[] = [
    {
      id: 'story',
      titleKey: 'todayHub.contentStory',
      subKey: 'todayHub.contentStorySub',
    },
    {
      id: 'feed',
      titleKey: 'todayHub.contentFeed',
      subKey: 'todayHub.contentFeedSub',
    },
    {
      id: 'reel',
      titleKey: 'todayHub.contentReel',
      subKey: 'todayHub.contentReelSub',
    },
  ];

  const quota = quotaQuery.data;
  const assets = assetsQuery.data ?? [];
  const today = todayQuery.data;
  const selectedAsset = useMemo(
    () => assets.find((a) => a.id === selectedAssetId) ?? null,
    [assets, selectedAssetId]
  );
  const activeDraft: ContentDraft | null = draftsQuery.data?.[0] ?? null;

  useEffect(() => {
    if (!activeDraft) {
      setEdit(null);
      return;
    }
    setEdit({
      hook: activeDraft.hook ?? '',
      caption: activeDraft.caption ?? '',
      cta: activeDraft.cta ?? '',
      keywords: (activeDraft.keywords ?? []).join(', '),
      hashtags: (activeDraft.hashtags ?? [])
        .map((h) => (h.startsWith('#') ? h : `#${h}`))
        .join(' '),
    });
  }, [activeDraft?.id, activeDraft?.updated_at]);

  useEffect(() => {
    if (!selectedAsset) return;
    const suggested = selectedAsset.suggested_formats?.[0] as ContentFormat | undefined;
    if (suggested === 'story' || suggested === 'feed' || suggested === 'reel') {
      setFormat(suggested);
    }
  }, [selectedAsset?.id]);

  const onPickFile = async (file: File | null) => {
    if (!file) return;
    setUploadError(null);
    try {
      const uploaded = await uploadMutation.mutateAsync({ file, scope });
      setSelectedAssetId(uploaded.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'upload_failed';
      if (msg.includes('content_asset_limit_reached'))
        setUploadError(t('contentAssistant.quotaFull'));
      else if (msg.includes('unsupported_mime'))
        setUploadError(t('contentAssistant.unsupportedType'));
      else if (msg.includes('file_too_large')) setUploadError(t('contentAssistant.fileTooLarge'));
      else setUploadError(t('contentAssistant.uploadFailed'));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onGenerate = async () => {
    if (!selectedAssetId) return;
    setGenerateError(null);
    setSaveMessage(null);
    setAssetPersistNote(null);
    try {
      const result: ContentGenerateResult = await generateMutation.mutateAsync({ format });
      setResearch(result.research ?? result.analysis?.research ?? null);
      if (result.assetAnalysisMode === 'draft_only_central_or_foreign') {
        setAssetPersistNote(t('contentAssistant.assetAnalysisDraftOnly'));
      } else if (result.assetAnalysisMode === 'persist_failed') {
        setAssetPersistNote(t('contentAssistant.assetAnalysisPersistFailed'));
      } else {
        setAssetPersistNote(null);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'generate_failed';
      if (msg.includes('content_generation_quota_reached'))
        setGenerateError(t('contentAssistant.generationQuotaFull'));
      else if (msg.includes('ai_not_configured'))
        setGenerateError(t('contentAssistant.aiNotConfigured'));
      else setGenerateError(t('contentAssistant.generateFailed'));
    }
  };

  const onSave = async () => {
    if (!activeDraft || !edit) return;
    setSaveMessage(null);
    setGenerateError(null);
    try {
      await saveMutation.mutateAsync({
        draftId: activeDraft.id,
        patch: {
          hook: edit.hook.trim(),
          caption: edit.caption.trim(),
          cta: edit.cta.trim(),
          keywords: edit.keywords
            .split(/[,;\n]/)
            .map((s) => s.trim())
            .filter(Boolean),
          hashtags: edit.hashtags
            .split(/[\s,;]+/)
            .map((s) => s.trim().replace(/^#/, ''))
            .filter(Boolean),
          format,
        },
      });
      setSaveMessage(t('contentAssistant.draftSaved'));
    } catch {
      setGenerateError(t('contentAssistant.draftSaveFailed'));
    }
  };

  const onPrepareIg = async () => {
    if (!activeDraft) return;
    setSaveMessage(null);
    try {
      await prepareMutation.mutateAsync(activeDraft.id);
      setSaveMessage(t('contentAssistant.instagramPrepared'));
    } catch {
      setGenerateError(t('contentAssistant.draftSaveFailed'));
    }
  };

  const selectAsset = (asset: ContentAsset) => {
    setSelectedAssetId(asset.id);
    setGenerateError(null);
    setSaveMessage(null);
    setResearch(null);
    setAssetPersistNote(null);
  };

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
          {t('todayHub.contentPageEyebrow')}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">{t('todayHub.content')}</h1>
        <p className="mt-1 text-sm text-muted">{t('todayHub.contentSub')}</p>
      </header>

      <Card className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-ink">{t('contentAssistant.libraryTitle')}</p>
          {quota ? (
            <p className="text-xs font-semibold text-muted">
              {t('contentAssistant.quotaLabel', {
                used: String(quota.used),
                limit: String(quota.limit),
              })}
            </p>
          ) : null}
        </div>
        <p className="text-sm text-muted">{t('contentAssistant.libraryHint')}</p>

        <div className="flex flex-wrap items-center gap-2">
          {canCentral ? (
            <div className="flex gap-1 rounded-full border border-line p-0.5">
              <Button
                type="button"
                size="chip"
                variant={scope === 'personal' ? 'secondary' : 'ghost'}
                fullWidth={false}
                onClick={() => setScope('personal')}
              >
                {t('contentAssistant.scopePersonal')}
              </Button>
              <Button
                type="button"
                size="chip"
                variant={scope === 'central' ? 'secondary' : 'ghost'}
                fullWidth={false}
                onClick={() => setScope('central')}
              >
                {t('contentAssistant.scopeCentral')}
              </Button>
            </div>
          ) : null}
          <Button
            type="button"
            size="sm"
            fullWidth={false}
            disabled={
              uploadMutation.isPending ||
              (scope === 'personal' ? quota?.canUploadPersonal === false : !canCentral)
            }
            onClick={() => fileRef.current?.click()}
          >
            {uploadMutation.isPending
              ? t('contentAssistant.uploading')
              : t('contentAssistant.uploadCta')}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
            className="hidden"
            onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
          />
        </div>
        {uploadError ? <p className="text-sm font-medium text-red-700">{uploadError}</p> : null}
        {assetsQuery.isError ? (
          <p className="text-sm text-muted">{t('contentAssistant.loadError')}</p>
        ) : null}
        {assetsQuery.isLoading ? (
          <p className="text-sm text-muted">{t('contentAssistant.loading')}</p>
        ) : assets.length === 0 ? (
          <p className="text-sm text-muted">{t('contentAssistant.emptyLibrary')}</p>
        ) : (
          <ul className="space-y-2" aria-label={t('contentAssistant.libraryTitle')}>
            {assets.map((asset) => {
              const selected = asset.id === selectedAssetId;
              return (
                <li
                  key={asset.id}
                  className={`flex items-center gap-3 rounded-xl border px-2.5 py-2 ${
                    selected
                      ? 'border-accent bg-accent/10'
                      : 'border-line bg-[rgb(var(--color-bg))]/60'
                  }`}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    onClick={() => selectAsset(asset)}
                  >
                    <ContentAssetThumb asset={asset} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">
                        {asset.title || asset.file_name}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {asset.media_kind} · {asset.aspect_ratio || '—'} · {asset.scope}
                        {asset.analysis_status ? ` · ${asset.analysis_status}` : ''}
                      </p>
                    </div>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    fullWidth={false}
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      if (selectedAssetId === asset.id) setSelectedAssetId(null);
                      void deleteMutation.mutateAsync(asset);
                    }}
                  >
                    {t('contentAssistant.delete')}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="space-y-3">
        <div>
          <p className="font-semibold text-ink">{t('contentAssistant.generateTitle')}</p>
          <p className="text-sm text-muted">{t('contentAssistant.generateHint')}</p>
        </div>

        <div
          className="flex flex-wrap gap-1"
          role="group"
          aria-label={t('todayHub.contentFormatsAria')}
        >
          {formats.map((fmt) => (
            <Button
              key={fmt.id}
              type="button"
              size="chip"
              variant={format === fmt.id ? 'secondary' : 'ghost'}
              fullWidth={false}
              onClick={() => setFormat(fmt.id)}
            >
              {t(fmt.titleKey)}
            </Button>
          ))}
        </div>

        <Button
          type="button"
          size="sm"
          fullWidth={false}
          disabled={!selectedAssetId || generateMutation.isPending}
          onClick={() => void onGenerate()}
        >
          {generateMutation.isPending
            ? t('contentAssistant.generating')
            : t('contentAssistant.generateCta')}
        </Button>
        {!selectedAssetId ? (
          <p className="text-xs text-muted">{t('contentAssistant.selectAssetFirst')}</p>
        ) : null}
        {generateError ? <p className="text-sm font-medium text-red-700">{generateError}</p> : null}
        {saveMessage ? <p className="text-sm font-medium text-ink">{saveMessage}</p> : null}

        {draftsQuery.isLoading && selectedAssetId ? (
          <p className="text-sm text-muted">{t('contentAssistant.draftLoading')}</p>
        ) : null}

        {activeDraft && edit ? (
          <div className="space-y-3 border-t border-line pt-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              {t('contentAssistant.draftTitle')} · {activeDraft.format}
            </p>

            <label className="block space-y-1">
              <span className="text-xs font-semibold text-muted">
                {t('contentAssistant.fieldHook')}
              </span>
              <input
                className="w-full rounded-xl border border-line bg-[rgb(var(--color-bg))] px-3 py-2 text-sm text-ink"
                value={edit.hook}
                onChange={(e) => setEdit((s) => (s ? { ...s, hook: e.target.value } : s))}
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-semibold text-muted">
                {t('contentAssistant.fieldCaption')}
              </span>
              <textarea
                className="min-h-[120px] w-full rounded-xl border border-line bg-[rgb(var(--color-bg))] px-3 py-2 text-sm text-ink"
                value={edit.caption}
                onChange={(e) => setEdit((s) => (s ? { ...s, caption: e.target.value } : s))}
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-semibold text-muted">
                {t('contentAssistant.fieldCta')}
              </span>
              <input
                className="w-full rounded-xl border border-line bg-[rgb(var(--color-bg))] px-3 py-2 text-sm text-ink"
                value={edit.cta}
                onChange={(e) => setEdit((s) => (s ? { ...s, cta: e.target.value } : s))}
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-semibold text-muted">
                {t('contentAssistant.fieldKeywords')}
              </span>
              <input
                className="w-full rounded-xl border border-line bg-[rgb(var(--color-bg))] px-3 py-2 text-sm text-ink"
                value={edit.keywords}
                onChange={(e) => setEdit((s) => (s ? { ...s, keywords: e.target.value } : s))}
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-semibold text-muted">
                {t('contentAssistant.fieldHashtags')}
              </span>
              <input
                className="w-full rounded-xl border border-line bg-[rgb(var(--color-bg))] px-3 py-2 text-sm text-ink"
                value={edit.hashtags}
                onChange={(e) => setEdit((s) => (s ? { ...s, hashtags: e.target.value } : s))}
              />
            </label>

            {research ? (
              <div className="space-y-1.5 rounded-xl border border-line px-3 py-2">
                <p className="text-xs font-semibold text-muted">
                  {t('contentAssistant.hashtagResearchTitle')}
                </p>
                <p className="text-[0.68rem] text-muted">
                  {research.liveResearchActive
                    ? t('contentAssistant.hashtagResearchLiveOn')
                    : t('contentAssistant.hashtagResearchLiveOff')}
                </p>
                {research.recommended.length > 0 ? (
                  <ul className="space-y-1">
                    {research.recommended.slice(0, 10).map((c) => (
                      <li key={`ok-${c.tag}`} className="text-xs text-ink">
                        #{c.tag}{' '}
                        <span className="text-muted">
                          — {t(hashtagReasonI18nKey(c.reasonCode))}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted">{t('contentAssistant.hashtagResearchEmpty')}</p>
                )}
                {research.rejected.slice(0, 4).map((c) => (
                  <p key={`no-${c.tag}`} className="text-[0.68rem] text-muted">
                    #{c.tag} — {t(hashtagReasonI18nKey(c.reasonCode))}
                  </p>
                ))}
              </div>
            ) : activeDraft.posting_hint ? (
              <p className="text-xs text-muted">{activeDraft.posting_hint}</p>
            ) : null}

            {assetPersistNote ? (
              <p className="text-xs font-medium text-muted">{assetPersistNote}</p>
            ) : null}

            <div className="rounded-xl border border-line px-3 py-2">
              <p className="text-xs font-semibold text-muted">
                {t('contentAssistant.cleanCheckLabel')} ·{' '}
                <span className="text-ink">
                  {activeDraft.clean_check_status === 'clean'
                    ? t('contentAssistant.cleanCheckClean')
                    : activeDraft.clean_check_status === 'attention'
                      ? t('contentAssistant.cleanCheckAttention')
                      : t('contentAssistant.cleanCheckPending')}
                </span>
              </p>
              {activeDraft.clean_check_notes ? (
                <p className="mt-1 text-xs text-muted">{activeDraft.clean_check_notes}</p>
              ) : null}
              <p className="mt-1 text-[0.68rem] text-muted">
                {t('contentAssistant.cleanCheckDisclaimer')}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                fullWidth={false}
                disabled={saveMutation.isPending}
                onClick={() => void onSave()}
              >
                {saveMutation.isPending
                  ? t('contentAssistant.saving')
                  : t('contentAssistant.saveDraft')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                fullWidth={false}
                disabled={prepareMutation.isPending}
                onClick={() => void onPrepareIg()}
              >
                {t('contentAssistant.prepareInstagram')}
              </Button>
            </div>
            <p className="text-xs text-muted">{t('contentAssistant.noAutoPublish')}</p>
          </div>
        ) : selectedAssetId ? (
          <p className="text-sm text-muted">{t('contentAssistant.noDraftYet')}</p>
        ) : null}
      </Card>

      <Card className="space-y-3">
        <div className="space-y-1">
          <p className="font-semibold text-ink">{t('contentAssistant.todayTitle')}</p>
          <p className="text-sm text-muted">
            {t('contentAssistant.todayHint', {
              time: DAILY_CONTENT_JOB.localTime,
              tz: DAILY_CONTENT_JOB.defaultTimezone,
            })}
          </p>
        </div>

        {!today ? (
          <p className="text-sm text-muted">{t('contentAssistant.todayEmpty')}</p>
        ) : today.status === 'ready' && today.draft ? (
          <div className="space-y-2">
            <div className="flex items-start gap-3">
              {today.asset ? <ContentAssetThumb asset={today.asset} /> : null}
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {t('contentAssistant.todayReady')} · {today.draft.format}
                </p>
                {today.draft.hook ? (
                  <p className="text-sm font-medium text-ink">{today.draft.hook}</p>
                ) : null}
                {today.draft.caption ? (
                  <p className="line-clamp-3 text-sm text-muted">{today.draft.caption}</p>
                ) : null}
                {today.draft.hashtags?.length ? (
                  <p className="text-xs text-muted">
                    {today.draft.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}
                  </p>
                ) : null}
                <p className="text-xs text-muted">
                  {t('contentAssistant.cleanCheckLabel')} · {today.draft.clean_check_status}
                </p>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              fullWidth={false}
              onClick={() => {
                if (today.asset_id) setSelectedAssetId(today.asset_id);
                setSaveMessage(null);
                setGenerateError(null);
              }}
            >
              {t('contentAssistant.todayViewEdit')}
            </Button>
          </div>
        ) : today.status === 'skipped' ? (
          <div className="space-y-1">
            <p className="text-sm text-ink">{t('contentAssistant.todaySkipped')}</p>
            <p className="text-sm text-muted">
              {today.summary === 'generation_quota_reached'
                ? t('contentAssistant.todaySkippedQuota')
                : today.summary === 'no_assets' || today.summary === 'no_suitable_asset'
                  ? t('contentAssistant.todaySkippedNoAsset')
                  : t('contentAssistant.todaySkippedGeneric', {
                      reason: today.summary ?? today.status,
                    })}
            </p>
            <p className="text-xs text-muted">{t('contentAssistant.todayManualGenerateHint')}</p>
          </div>
        ) : today.status === 'failed' ? (
          <div className="space-y-1">
            <p className="text-sm text-ink">{t('contentAssistant.todayFailed')}</p>
            <p className="text-sm text-muted">
              {t('contentAssistant.todayFailedDetail', {
                reason: today.summary ?? 'error',
              })}
            </p>
            <p className="text-xs text-muted">{t('contentAssistant.todayManualGenerateHint')}</p>
          </div>
        ) : (
          <p className="text-sm text-ink">
            {t('contentAssistant.todayStatus', { status: today.status })}
            {today.summary ? ` — ${today.summary}` : ''}
          </p>
        )}

        {!DAILY_CONTENT_COMPLIANCE.autoPublish ? (
          <p className="text-xs text-muted">{t('contentAssistant.noAutoPublish')}</p>
        ) : null}
      </Card>

      <InstagramConnectionCard />

      <Link
        to="/"
        className="inline-flex text-sm font-semibold text-accent-deep underline-offset-2 hover:underline"
      >
        {t('todayHub.backToToday')}
      </Link>
    </div>
  );
}
