import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '@shared/i18n';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import {
  DAILY_CONTENT_JOB,
  DAILY_CONTENT_COMPLIANCE,
} from './architecture/dailyContentArchitecture';
import {
  INSTAGRAM_META_APP_REVIEW_TODOS,
  isInstagramPublishingEnabled,
} from './architecture/instagramArchitecture';
import { ContentAssetThumb } from './ContentAssetThumb';
import { useContentLibrary, type ContentAssetScope } from './contentAssetsApi';

/**
 * AI Content Assistant — Phase 2 foundation UI.
 * Private library + quota + architecture surfaces. No fake AI generation.
 * Does not modify Coach / Contacts / Team / AP.
 */
export function AiContentAssistantPage() {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const [scope, setScope] = useState<ContentAssetScope>('personal');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { assetsQuery, quotaQuery, todayQuery, uploadMutation, deleteMutation, canCentral } =
    useContentLibrary();

  const formats = [
    {
      id: 'story',
      titleKey: 'todayHub.contentStory' as const,
      subKey: 'todayHub.contentStorySub' as const,
    },
    {
      id: 'feed',
      titleKey: 'todayHub.contentFeed' as const,
      subKey: 'todayHub.contentFeedSub' as const,
    },
    {
      id: 'reel',
      titleKey: 'todayHub.contentReel' as const,
      subKey: 'todayHub.contentReelSub' as const,
    },
  ];

  const quota = quotaQuery.data;
  const assets = assetsQuery.data ?? [];
  const today = todayQuery.data;

  const onPickFile = async (file: File | null) => {
    if (!file) return;
    setUploadError(null);
    try {
      await uploadMutation.mutateAsync({ file, scope });
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
            {assets.map((asset) => (
              <li
                key={asset.id}
                className="flex items-center gap-3 rounded-xl border border-line bg-[rgb(var(--color-bg))]/60 px-2.5 py-2"
              >
                <ContentAssetThumb asset={asset} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">
                    {asset.title || asset.file_name}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {asset.media_kind} · {asset.aspect_ratio || '—'} · {asset.scope}
                    {asset.suggested_formats.length
                      ? ` · ${asset.suggested_formats.join(', ')}`
                      : ''}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  fullWidth={false}
                  disabled={deleteMutation.isPending}
                  onClick={() => void deleteMutation.mutateAsync(asset)}
                >
                  {t('contentAssistant.delete')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-1">
        <p className="font-semibold text-ink">{t('contentAssistant.todayTitle')}</p>
        <p className="text-sm text-muted">
          {t('contentAssistant.todayHint', {
            time: DAILY_CONTENT_JOB.localTime,
            tz: DAILY_CONTENT_JOB.defaultTimezone,
          })}
        </p>
        {today ? (
          <p className="text-sm text-ink">
            {t('contentAssistant.todayStatus', { status: today.status })}
            {today.summary ? ` — ${today.summary}` : ''}
          </p>
        ) : (
          <p className="text-sm text-muted">{t('contentAssistant.todayEmpty')}</p>
        )}
        {!DAILY_CONTENT_COMPLIANCE.autoPublish ? (
          <p className="text-xs text-muted">{t('contentAssistant.noAutoPublish')}</p>
        ) : null}
      </Card>

      <section className="space-y-2" aria-label={t('todayHub.contentFormatsAria')}>
        {formats.map((fmt) => (
          <Card key={fmt.id} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-ink">{t(fmt.titleKey)}</p>
              <p className="mt-0.5 text-sm text-muted">{t(fmt.subKey)}</p>
            </div>
            <span className="shrink-0 rounded-full border border-line px-2.5 py-1 text-[0.68rem] font-semibold tracking-wide text-muted">
              {t('contentAssistant.formatReadyLater')}
            </span>
          </Card>
        ))}
      </section>

      <Card className="space-y-2">
        <p className="font-semibold text-ink">{t('todayHub.contentOpenIg')}</p>
        <p className="text-sm text-muted">{t('contentAssistant.instagramArchitectureHint')}</p>
        {!isInstagramPublishingEnabled() ? (
          <p className="text-xs text-muted">
            {t('contentAssistant.instagramTodoCount', {
              count: String(INSTAGRAM_META_APP_REVIEW_TODOS.length),
            })}
          </p>
        ) : null}
        <Button type="button" size="sm" fullWidth={false} disabled>
          {t('contentAssistant.connectInstagram')}
        </Button>
      </Card>

      <Link
        to="/"
        className="inline-flex text-sm font-semibold text-accent-deep underline-offset-2 hover:underline"
      >
        {t('todayHub.backToToday')}
      </Link>
    </div>
  );
}
