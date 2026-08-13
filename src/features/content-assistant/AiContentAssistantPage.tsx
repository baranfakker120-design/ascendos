import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@shared/auth/AuthProvider';
import { useI18n } from '@shared/i18n';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import {
  DAILY_CONTENT_JOB,
  DAILY_CONTENT_COMPLIANCE,
} from './architecture/dailyContentArchitecture';
import { CarouselPreview } from './CarouselPreview';
import { CarouselTray } from './CarouselTray';
import { ContentAssetThumb } from './ContentAssetThumb';
import { ContentResultPanel } from './ContentResultPanel';
import { AutopilotPanel } from './AutopilotPanel';
import { InstagramConnectionCard } from './InstagramConnectionCard';
import { InstagramPublishPreview } from './InstagramPublishPreview';
import {
  CONTENT_ASSET_FILE_ACCEPT,
  CONTENT_UPLOAD_BATCH_MAX,
  isLibraryUploadDisabled,
  planMultiUpload,
  remainingLibrarySlots,
  useContentLibrary,
  type ContentAsset,
  type ContentAssetScope,
  type ContentFormat,
} from './contentAssetsApi';
import {
  useContentDrafts,
  type ContentAnalysisJson,
  type ContentDraft,
  type ContentGenerateResult,
  type ContentResearchPayload,
} from './contentDraftsApi';
import {
  addToSelection,
  canAddToSelection,
  isCarouselMode,
  removeFromSelection,
  replaceInSelection,
  selectionCounter,
} from './lib/carousel/selection';
import { filterLibraryAssetsByScope } from './lib/contentAssets/scopeFilter';
import { hashtagReasonI18nKey } from './lib/hashtagResearch';

/**
 * AI Content Assistant — single image + Instagram carousel (2–10 images).
 * Official Graph publishing stays gated. Does not touch Coach domains.
 */
export function AiContentAssistantPage() {
  const { t } = useI18n();
  const { membership } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const replaceIndexRef = useRef<number | null>(null);
  const [scope, setScope] = useState<ContentAssetScope>('personal');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [format, setFormat] = useState<ContentFormat>('feed');
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [research, setResearch] = useState<ContentResearchPayload | null>(null);
  const [analysis, setAnalysis] = useState<ContentAnalysisJson | null>(null);
  const [assetPersistNote, setAssetPersistNote] = useState<string | null>(null);
  /** When true, do not show stale autopilot/placeholder drafts as a successful KI analysis. */
  const [suppressStaleDraft, setSuppressStaleDraft] = useState(false);
  const [edit, setEdit] = useState<{
    hook: string;
    caption: string;
    cta: string;
    keywords: string;
    hashtags: string;
  } | null>(null);

  const { assetsQuery, quotaQuery, todayQuery, uploadMutation, deleteMutation, canCentral } =
    useContentLibrary();
  const { draftsQuery, generateMutation, saveMutation, prepareMutation } = useContentDrafts(
    selectedAssetIds.length ? selectedAssetIds : null
  );

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
  const libraryAssets = useMemo(
    () => filterLibraryAssetsByScope(assets, scope, membership?.id ?? null),
    [assets, scope, membership?.id]
  );
  const today = todayQuery.data;
  const selectedAssets = useMemo(() => {
    const map = new Map(assets.map((a) => [a.id, a]));
    return selectedAssetIds.map((id) => map.get(id)).filter((a): a is ContentAsset => Boolean(a));
  }, [assets, selectedAssetIds]);
  const selectedAsset = selectedAssets[0] ?? null;
  const carouselMode = isCarouselMode(selectedAssets.length);
  const activeDraft: ContentDraft | null = draftsQuery.data?.[0] ?? null;

  useEffect(() => {
    if (suppressStaleDraft) return;
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
    if (activeDraft.analysis_json && Object.keys(activeDraft.analysis_json).length > 0) {
      setAnalysis(activeDraft.analysis_json);
    }
    // Restore carousel order from draft only when selection is empty/single cover.
    if (activeDraft.carousel_asset_ids?.length >= 2) {
      setSelectedAssetIds((curr) =>
        curr.length <= 1 || (curr.length === 1 && curr[0] === activeDraft.asset_id)
          ? activeDraft.carousel_asset_ids
          : curr
      );
    }
  }, [activeDraft?.id, activeDraft?.updated_at, suppressStaleDraft]);

  useEffect(() => {
    if (carouselMode) {
      setFormat('feed');
      return;
    }
    if (!selectedAsset) return;
    const suggested = selectedAsset.suggested_formats?.[0] as ContentFormat | undefined;
    if (suggested === 'story' || suggested === 'feed' || suggested === 'reel') {
      setFormat(suggested);
    }
  }, [selectedAsset?.id, carouselMode]);

  const onPickFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploadError(null);
    setUploadProgress(null);

    const allFiles = Array.from(fileList);
    const used = quota?.used ?? 0;
    const limit = quota?.limit ?? 50;
    const remaining =
      scope === 'personal' ? remainingLibrarySlots(used, limit) : Math.max(allFiles.length, 1);

    const plan = planMultiUpload({
      selectedCount: allFiles.length,
      remainingSlots: remaining,
      maxBatch: CONTENT_UPLOAD_BATCH_MAX,
      usedCount: used,
      libraryLimit: limit,
    });

    if (plan.acceptCount <= 0) {
      if (scope === 'personal' && remaining <= 0) {
        setUploadError(t('contentAssistant.quotaFull'));
      } else {
        setUploadError(
          t('contentAssistant.uploadRemainingSlots', { count: String(Math.max(0, remaining)) })
        );
      }
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    const toUpload = allFiles.slice(0, plan.acceptCount);
    setUploadBusy(true);
    let ok = 0;
    let failed = 0;
    const uploadedAssets: ContentAsset[] = [];

    try {
      for (let i = 0; i < toUpload.length; i += 1) {
        setUploadProgress(
          t('contentAssistant.uploadProgress', {
            done: String(i),
            total: String(toUpload.length),
          })
        );
        try {
          const uploaded = await uploadMutation.mutateAsync({ file: toUpload[i], scope });
          ok += 1;
          uploadedAssets.push(uploaded);
          setUploadProgress(
            t('contentAssistant.uploadProgress', {
              done: String(ok),
              total: String(toUpload.length),
            })
          );
        } catch (e) {
          failed += 1;
          const msg = e instanceof Error ? e.message : '';
          if (msg.includes('content_asset_limit_reached') && ok === 0 && failed === 1) {
            // Stop early only when quota blocks the first file.
            setUploadError(t('contentAssistant.quotaFull'));
            break;
          }
        }
      }

      setSelectedAssetIds((prev) => {
        let next = [...prev];
        const kinds = next
          .map((id) => (assetsQuery.data ?? []).find((a) => a.id === id)?.media_kind)
          .filter(Boolean) as Array<'image' | 'video'>;
        for (const uploaded of uploadedAssets) {
          const gate = canAddToSelection({
            currentIds: next,
            nextId: uploaded.id,
            nextKind: uploaded.media_kind,
            existingKinds: kinds,
          });
          if (!gate.ok) continue;
          next = addToSelection(next, uploaded.id);
          kinds.push(uploaded.media_kind);
        }
        return next;
      });

      const parts: string[] = [];
      if (plan.skippedOverQuota > 0 && plan.libraryWillBeFull) {
        parts.push(
          t('contentAssistant.uploadLibraryFullNow', {
            ok: String(ok),
            selected: String(allFiles.length),
            limit: String(limit),
          })
        );
      } else if (ok > 0 && (failed > 0 || plan.skippedOverBatch > 0 || plan.skippedOverQuota > 0)) {
        parts.push(
          t('contentAssistant.uploadPartialOk', {
            ok: String(ok),
            total: String(allFiles.length),
          })
        );
      }
      if (failed > 0) {
        parts.push(t('contentAssistant.uploadPartialFail', { failed: String(failed) }));
      }
      if (plan.skippedOverQuota > 0 && !plan.libraryWillBeFull) {
        parts.push(t('contentAssistant.uploadRemainingSlots', { count: String(remaining) }));
      }
      if (plan.skippedOverBatch > 0) {
        parts.push(
          t('contentAssistant.uploadBatchCapped', { max: String(CONTENT_UPLOAD_BATCH_MAX) })
        );
      }
      if (parts.length > 0) setUploadError(parts.join(' '));
      else if (ok === 0) setUploadError(t('contentAssistant.uploadFailed'));
    } finally {
      setUploadBusy(false);
      if (fileRef.current) fileRef.current.value = '';
      window.setTimeout(() => setUploadProgress(null), 2500);
    }
  };

  const onReplaceFile = async (file: File | null) => {
    const index = replaceIndexRef.current;
    replaceIndexRef.current = null;
    if (!file || index == null) return;
    setUploadError(null);
    try {
      const uploaded = await uploadMutation.mutateAsync({ file, scope: 'personal' });
      if (uploaded.media_kind !== 'image') {
        setUploadError(t('contentAssistant.carouselImagesOnly'));
        return;
      }
      setSelectedAssetIds((ids) => replaceInSelection(ids, index, uploaded.id));
      setResearch(null);
      setAnalysis(null);
    } catch {
      setUploadError(t('contentAssistant.uploadFailed'));
    } finally {
      if (replaceRef.current) replaceRef.current.value = '';
    }
  };

  const onGenerate = async () => {
    if (!selectedAssetIds.length) return;
    setGenerateError(null);
    setSaveMessage(null);
    setAssetPersistNote(null);
    setSuppressStaleDraft(false);
    setEdit(null);
    setAnalysis(null);
    setResearch(null);
    try {
      const result: ContentGenerateResult = await generateMutation.mutateAsync({
        format: carouselMode ? 'feed' : format,
      });
      setSuppressStaleDraft(false);
      setResearch(result.research ?? result.analysis?.research ?? null);
      setAnalysis(result.analysis ?? null);
      setEdit({
        hook: result.draft.hook ?? '',
        caption: result.draft.caption ?? '',
        cta: result.draft.cta ?? '',
        keywords: (result.draft.keywords ?? []).join(', '),
        hashtags: (result.draft.hashtags ?? [])
          .map((h) => (h.startsWith('#') ? h : `#${h}`))
          .join(' '),
      });
      if (result.assetAnalysisMode === 'draft_only_central_or_foreign') {
        setAssetPersistNote(t('contentAssistant.assetAnalysisDraftOnly'));
      } else if (result.assetAnalysisMode === 'persist_failed') {
        setAssetPersistNote(t('contentAssistant.assetAnalysisPersistFailed'));
      } else {
        setAssetPersistNote(null);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'generate_failed';
      console.error('[content-assistant] KI-Analyse fehlgeschlagen', msg, e);
      setSuppressStaleDraft(true);
      setEdit(null);
      setAnalysis(null);
      setResearch(null);
      if (msg.includes('content_generation_quota_reached'))
        setGenerateError(t('contentAssistant.generationQuotaFull'));
      else if (msg.includes('ai_not_configured'))
        setGenerateError(t('contentAssistant.aiNotConfigured'));
      else if (msg.includes('carousel_images_only'))
        setGenerateError(t('contentAssistant.carouselImagesOnly'));
      else if (msg.includes('VIDEO_TOO_LARGE'))
        setGenerateError(t('contentAssistant.videoTooLarge'));
      else if (msg.includes('VIDEO_UNSUPPORTED_MIME'))
        setGenerateError(t('contentAssistant.videoUnsupportedMime'));
      else if (msg.includes('VIDEO_FETCH_FAILED'))
        setGenerateError(t('contentAssistant.videoFetchFailed'));
      else if (msg.includes('AI_PROVIDER_TIMEOUT'))
        setGenerateError(t('contentAssistant.aiProviderTimeout'));
      else if (msg.includes('AI_PROVIDER_BAD_REQUEST'))
        setGenerateError(t('contentAssistant.aiProviderBadRequest'));
      else if (msg.includes('AI_PROVIDER_CREDITS_EXHAUSTED'))
        setGenerateError(t('contentAssistant.aiProviderCredits'));
      else if (msg.includes('AI_PROVIDER_RATE_LIMIT'))
        setGenerateError(t('contentAssistant.aiProviderRateLimit'));
      else if (msg.includes('AI_PROVIDER_AUTH_ERROR'))
        setGenerateError(t('contentAssistant.aiProviderAuth'));
      else if (msg.includes('AI_PROVIDER_ERROR'))
        setGenerateError(t('contentAssistant.aiProviderError'));
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
            .filter(Boolean)
            .slice(0, 5),
          format: carouselMode ? 'feed' : format,
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

  const toggleAsset = (asset: ContentAsset) => {
    setGenerateError(null);
    setSaveMessage(null);
    setResearch(null);
    setAnalysis(null);
    setAssetPersistNote(null);
    setSuppressStaleDraft(false);
    setSelectedAssetIds((ids) => {
      if (ids.includes(asset.id)) return removeFromSelection(ids, asset.id);
      const existing = ids
        .map((id) => assets.find((a) => a.id === id))
        .filter((a): a is ContentAsset => Boolean(a));
      const gate = canAddToSelection({
        currentIds: ids,
        nextId: asset.id,
        nextKind: asset.media_kind,
        existingKinds: existing.map((a) => a.media_kind),
      });
      if (!gate.ok) {
        if (gate.reason === 'max') setUploadError(t('contentAssistant.carouselMaxReached'));
        else if (gate.reason === 'video_mix' || gate.reason === 'video_limit')
          setUploadError(t('contentAssistant.carouselVideoMix'));
        return ids;
      }
      setUploadError(null);
      return addToSelection(ids, asset.id);
    });
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
          <div className="text-right">
            {quota ? (
              <p className="text-xs font-semibold text-muted">
                {t('contentAssistant.quotaLabel', {
                  used: String(quota.used),
                  limit: String(quota.limit),
                })}
              </p>
            ) : null}
            <p className="text-xs font-semibold tabular-nums text-ink">
              {t('contentAssistant.carouselCounter', {
                count: selectionCounter(selectedAssetIds.length),
              })}
            </p>
          </div>
        </div>
        <p className="text-sm text-muted">{t('contentAssistant.libraryHintCarousel')}</p>

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
            disabled={isLibraryUploadDisabled({
              used: quota?.used ?? 0,
              limit: quota?.limit ?? 50,
              canUpload:
                scope === 'personal' ? quota?.canUploadPersonal !== false : Boolean(canCentral),
              uploading: uploadBusy || uploadMutation.isPending,
            })}
            onClick={() => fileRef.current?.click()}
          >
            {uploadBusy || uploadMutation.isPending
              ? t('contentAssistant.uploading')
              : t('contentAssistant.uploadCta')}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept={CONTENT_ASSET_FILE_ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => void onPickFiles(e.target.files)}
          />
          <input
            ref={replaceRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => void onReplaceFile(e.target.files?.[0] ?? null)}
          />
        </div>
        {uploadProgress ? (
          <p className="text-sm font-medium text-muted" role="status" aria-live="polite">
            {uploadProgress}
          </p>
        ) : null}
        {uploadError ? <p className="text-sm font-medium text-red-700">{uploadError}</p> : null}

        {selectedAssets.length > 0 ? (
          <CarouselTray
            assets={selectedAssets}
            onReorder={setSelectedAssetIds}
            onRemove={(id) => {
              setSelectedAssetIds((ids) => removeFromSelection(ids, id));
              setResearch(null);
              setAnalysis(null);
            }}
            onReplace={(index) => {
              replaceIndexRef.current = index;
              replaceRef.current?.click();
            }}
          />
        ) : null}

        {carouselMode ? <CarouselPreview assets={selectedAssets} /> : null}

        {assetsQuery.isError ? (
          <p className="text-sm text-muted">{t('contentAssistant.loadError')}</p>
        ) : null}
        {assetsQuery.isLoading ? (
          <p className="text-sm text-muted">{t('contentAssistant.loading')}</p>
        ) : libraryAssets.length === 0 ? (
          <p className="text-sm text-muted">{t('contentAssistant.emptyLibrary')}</p>
        ) : (
          <ul className="space-y-2" aria-label={t('contentAssistant.libraryTitle')}>
            {libraryAssets.map((asset) => {
              const selected = selectedAssetIds.includes(asset.id);
              const order = selected ? selectedAssetIds.indexOf(asset.id) + 1 : null;
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
                    onClick={() => toggleAsset(asset)}
                  >
                    <ContentAssetThumb asset={asset} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">
                        {order ? `${order}. ` : ''}
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
                      setSelectedAssetIds((ids) => removeFromSelection(ids, asset.id));
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
          <p className="text-sm text-muted">
            {carouselMode
              ? t('contentAssistant.generateHintCarousel')
              : t('contentAssistant.generateHint')}
          </p>
        </div>

        {!carouselMode ? (
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
        ) : (
          <p className="text-xs font-medium text-muted">
            {t('contentAssistant.carouselFormatLocked')}
          </p>
        )}

        <Button
          type="button"
          size="sm"
          fullWidth={false}
          disabled={!selectedAssetIds.length || generateMutation.isPending}
          onClick={() => void onGenerate()}
        >
          {generateMutation.isPending
            ? t('contentAssistant.generating')
            : carouselMode
              ? t('contentAssistant.generateCarouselCta')
              : t('contentAssistant.generateCta')}
        </Button>
        {!selectedAssetIds.length ? (
          <p className="text-xs text-muted">{t('contentAssistant.selectAssetFirst')}</p>
        ) : null}
        {generateError ? <p className="text-sm font-medium text-red-700">{generateError}</p> : null}
        {saveMessage ? <p className="text-sm font-medium text-ink">{saveMessage}</p> : null}

        {draftsQuery.isLoading && selectedAssetIds.length ? (
          <p className="text-sm text-muted">{t('contentAssistant.draftLoading')}</p>
        ) : null}

        {activeDraft && edit ? (
          <div className="space-y-3 border-t border-line pt-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              {t('contentAssistant.draftTitle')} ·{' '}
              {carouselMode || (activeDraft.carousel_asset_ids?.length ?? 0) >= 2
                ? t('contentAssistant.carouselBadge')
                : activeDraft.format}
            </p>

            <ContentResultPanel draft={activeDraft} analysis={analysis} />

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
                {t('contentAssistant.fieldHashtags')} ({t('contentAssistant.hashtagsExactHint')})
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
                    {research.recommended.slice(0, 5).map((c) => (
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
        ) : selectedAssetIds.length ? (
          <p className="text-sm text-muted">{t('contentAssistant.noDraftYet')}</p>
        ) : null}
      </Card>

      {activeDraft?.status === 'ready' && edit ? (
        <InstagramPublishPreview
          asset={selectedAsset}
          assets={
            (activeDraft.carousel_asset_ids?.length ?? 0) >= 2
              ? activeDraft.carousel_asset_ids
                  .map((id) => assets.find((a) => a.id === id))
                  .filter((a): a is ContentAsset => Boolean(a))
              : selectedAssets
          }
          draft={activeDraft}
          caption={edit.caption}
          cta={edit.cta}
          hashtags={edit.hashtags
            .split(/[\s,;]+/)
            .map((s) => s.trim().replace(/^#/, ''))
            .filter(Boolean)
            .slice(0, 5)}
        />
      ) : null}

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
                if (today.asset_id) setSelectedAssetIds([today.asset_id]);
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

      <AutopilotPanel />

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
