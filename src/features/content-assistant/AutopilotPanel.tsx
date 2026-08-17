import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@shared/i18n';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { ContentAssetThumb } from './ContentAssetThumb';
import { useContentAutopilot, type AutopilotSlot } from './contentAutopilotApi';
import { useContentLibrary, type ContentAsset } from './contentAssetsApi';
import { AUTOPILOT_JOB } from './architecture/autopilotArchitecture';
import {
  AUTOPILOT_PUBLISHING_MODES,
  AUTOPILOT_STORY_COUNT_MAX,
  AUTOPILOT_STORY_COUNT_MIN,
  parseAutopilotPublishingMode,
  type AutopilotPublishingMode,
} from './lib/autopilot/publishingMode';
import {
  buildAutopilotStartPayload,
  clampUserStoryCount,
  mapAutopilotActionError,
  resolveStoredStoryCount,
  showsStoryCountControl,
} from './lib/autopilot/startFlow';

function statusLabel(status: string, t: (key: string) => string): string {
  switch (status) {
    case 'planned':
      return t('contentAssistant.autopilotStatusPlanned');
    case 'ready':
      return t('contentAssistant.autopilotStatusReady');
    case 'publishing':
      return t('contentAssistant.autopilotStatusPublishing');
    case 'published':
      return t('contentAssistant.autopilotStatusPublished');
    case 'failed':
      return t('contentAssistant.autopilotStatusFailed');
    case 'skipped':
      return t('contentAssistant.autopilotStatusSkipped');
    case 'cancelled':
      return t('contentAssistant.autopilotStatusCancelled');
    default:
      return status;
  }
}

function formatWhen(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function modeTitleKey(
  mode: AutopilotPublishingMode
):
  | 'contentAssistant.autopilotModeStories'
  | 'contentAssistant.autopilotModeFeed'
  | 'contentAssistant.autopilotModeFull'
  | 'contentAssistant.autopilotModeMarked' {
  switch (mode) {
    case 'stories':
      return 'contentAssistant.autopilotModeStories';
    case 'feed':
      return 'contentAssistant.autopilotModeFeed';
    case 'full':
      return 'contentAssistant.autopilotModeFull';
    case 'marked_stories':
      return 'contentAssistant.autopilotModeMarked';
  }
}

function modeHintKey(
  mode: AutopilotPublishingMode
):
  | 'contentAssistant.autopilotModeStoriesHint'
  | 'contentAssistant.autopilotModeFeedHint'
  | 'contentAssistant.autopilotModeFullHint'
  | 'contentAssistant.autopilotModeMarkedHint' {
  switch (mode) {
    case 'stories':
      return 'contentAssistant.autopilotModeStoriesHint';
    case 'feed':
      return 'contentAssistant.autopilotModeFeedHint';
    case 'full':
      return 'contentAssistant.autopilotModeFullHint';
    case 'marked_stories':
      return 'contentAssistant.autopilotModeMarkedHint';
  }
}

/**
 * Additive Autopilot card — Instagram only. No Facebook. No layout redesign.
 */
export function AutopilotPanel() {
  const { t, locale } = useI18n();
  const { assetsQuery } = useContentLibrary();
  const {
    stateQuery,
    activateMutation,
    pauseMutation,
    resumeMutation,
    deactivateMutation,
    replanMutation,
  } = useContentAutopilot();
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [draftMode, setDraftMode] = useState<AutopilotPublishingMode | null>(null);
  const [draftStories, setDraftStories] = useState<number | null>(null);
  const [draftDirty, setDraftDirty] = useState(false);

  const assetMap = useMemo(
    () => new Map((assetsQuery.data ?? []).map((a) => [a.id, a])),
    [assetsQuery.data]
  );
  const state = stateQuery.data;
  const selectedSlot: AutopilotSlot | null =
    state?.slots.find((s) => s.id === selectedSlotId) ?? null;
  const selectedAsset: ContentAsset | null = selectedSlot?.asset_id
    ? (assetMap.get(selectedSlot.asset_id) ?? null)
    : null;

  const enabled = Boolean(state?.settings?.enabled);
  const paused = Boolean(state?.settings?.paused);
  const active = enabled && !paused;
  const serverMode = parseAutopilotPublishingMode(
    state?.settings?.publishing_mode ?? state?.eligibility?.publishingMode
  );
  const serverStories = resolveStoredStoryCount(
    state?.settings?.max_stories_per_day ?? state?.eligibility?.maxStoriesPerDay
  );

  useEffect(() => {
    if (!state || draftDirty) return;
    setDraftMode(serverMode);
    setDraftStories(serverStories);
  }, [state, draftDirty, serverMode, serverStories]);

  const publishingMode = draftMode ?? serverMode;
  const storyCount = draftStories ?? serverStories;
  const showStoryCount = showsStoryCountControl(publishingMode);
  const markedManual = publishingMode === 'marked_stories';
  const startPrefs = buildAutopilotStartPayload({
    publishingMode,
    maxStoriesPerDay: storyCount,
  });

  const run = async (fn: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await fn();
      setDraftDirty(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setActionError(t(mapAutopilotActionError(msg)));
    }
  };

  const setMode = (mode: AutopilotPublishingMode) => {
    setDraftDirty(true);
    setDraftMode(mode);
    setActionError(null);
  };

  const bumpStories = (delta: number) => {
    const next = clampUserStoryCount(storyCount + delta, storyCount);
    if (next === storyCount) return;
    setDraftDirty(true);
    setDraftStories(next);
  };

  const upcoming = (state?.slots ?? []).filter((s) => s.status !== 'cancelled').slice(0, 14);

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-ink">{t('contentAssistant.autopilotTitle')}</p>
          <p className="text-sm text-muted">{t('contentAssistant.autopilotHint')}</p>
        </div>
        <p
          className={`text-xs font-semibold uppercase tracking-wide ${
            active ? 'text-ink' : 'text-muted'
          }`}
        >
          {active
            ? t('contentAssistant.autopilotActive')
            : paused
              ? t('contentAssistant.autopilotPaused')
              : t('contentAssistant.autopilotOff')}
        </p>
      </div>

      {stateQuery.isLoading ? (
        <p className="text-sm text-muted">{t('contentAssistant.loading')}</p>
      ) : null}

      {state ? (
        <div className="space-y-2 border-b border-line pb-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            {t('contentAssistant.autopilotPublishingMode')}
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {AUTOPILOT_PUBLISHING_MODES.map((mode) => {
              const selected = publishingMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setMode(mode)}
                  className={`rounded-xl border px-3 py-2.5 text-left transition ${
                    selected
                      ? 'border-accent bg-accent/10'
                      : 'border-line bg-[rgb(var(--color-bg))]/60'
                  }`}
                  aria-pressed={selected}
                >
                  <p className="text-sm font-semibold text-ink">{t(modeTitleKey(mode))}</p>
                  <p className="mt-0.5 text-xs text-muted">{t(modeHintKey(mode))}</p>
                </button>
              );
            })}
          </div>

          {publishingMode === 'feed' ? (
            <p className="text-sm text-ink">{t('contentAssistant.autopilotFeedOnlyNote')}</p>
          ) : null}

          {publishingMode === 'full' ? (
            <p className="text-sm text-muted">
              {t('contentAssistant.autopilotFullSummary', { n: String(storyCount) })}
            </p>
          ) : null}

          {showStoryCount ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2">
              <p className="text-sm text-ink">
                {markedManual
                  ? t('contentAssistant.autopilotMarkedPrepare', { n: String(storyCount) })
                  : t('contentAssistant.autopilotStoriesPerDay')}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  fullWidth={false}
                  disabled={storyCount <= AUTOPILOT_STORY_COUNT_MIN}
                  onClick={() => bumpStories(-1)}
                  aria-label={t('contentAssistant.autopilotStoriesMinus')}
                >
                  −
                </Button>
                <span className="min-w-[1.5rem] text-center text-sm font-semibold text-ink">
                  {storyCount}
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  fullWidth={false}
                  disabled={storyCount >= AUTOPILOT_STORY_COUNT_MAX}
                  onClick={() => bumpStories(1)}
                  aria-label={t('contentAssistant.autopilotStoriesPlus')}
                >
                  +
                </Button>
              </div>
            </div>
          ) : null}

          {markedManual ? (
            <p className="text-sm font-medium text-muted">
              {t('contentAssistant.autopilotMarkedManual')}
            </p>
          ) : null}
        </div>
      ) : null}

      {state ? (
        <div className="grid grid-cols-2 gap-2 text-xs text-muted">
          <p>
            {t('contentAssistant.autopilotAssets', {
              count: String(state.eligibility.total),
              min: String(state.eligibility.minRequired ?? AUTOPILOT_JOB.minEligibleAssets),
            })}
          </p>
          <p>
            {t('contentAssistant.autopilotScopeSplit', {
              personal: String(state.eligibility.personal),
              central: String(state.eligibility.central),
            })}
          </p>
          <p>
            {t('contentAssistant.autopilotTodayFeed', {
              n: String(state.stats.todayFeed),
              max: String(state.eligibility.maxFeedPerDay),
            })}
          </p>
          <p>
            {t('contentAssistant.autopilotTodayStories', {
              n: String(state.stats.todayStories),
              max: String(state.eligibility.maxStoriesPerDay),
            })}
          </p>
          <p>
            {t('contentAssistant.autopilotWeekFeed', {
              n: String(state.stats.feedPublished),
              max: String(state.stats.feedPlanned),
            })}
          </p>
          <p>
            {t('contentAssistant.autopilotWeekStories', {
              n: String(state.stats.storiesPublished),
              max: String(state.stats.storiesPlanned),
            })}
          </p>
          <p>
            {t('contentAssistant.autopilotWeekSkipped', {
              n: String(state.stats.skipped),
            })}
          </p>
          <p>
            {t('contentAssistant.autopilotWeekFailed', {
              n: String(state.stats.failed),
            })}
          </p>
        </div>
      ) : null}

      {state?.nextSlot ? (
        <p className="text-sm text-ink">
          {t('contentAssistant.autopilotNext', {
            when: formatWhen(state.nextSlot.planned_for, locale),
            kind: state.nextSlot.slot_kind,
          })}
        </p>
      ) : null}

      {!state?.instagramConnected ? (
        <p className="text-sm font-medium text-muted">
          {t(
            state?.instagramStatus === 'instagram_expired'
              ? 'contentAssistant.autopilotNeedInstagramExpired'
              : 'contentAssistant.autopilotNeedInstagram'
          )}
        </p>
      ) : null}

      {state && !state.eligibility.ok && !enabled ? (
        <p className="text-sm font-medium text-muted">
          {t('contentAssistant.autopilotNeedAssets')}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {!active ? (
          <Button
            type="button"
            size="sm"
            fullWidth={false}
            disabled={activateMutation.isPending || resumeMutation.isPending}
            onClick={() =>
              void run(() =>
                paused
                  ? resumeMutation.mutateAsync(startPrefs)
                  : activateMutation.mutateAsync(startPrefs)
              )
            }
          >
            {paused
              ? t('contentAssistant.autopilotResume')
              : t('contentAssistant.autopilotActivate')}
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            fullWidth={false}
            disabled={pauseMutation.isPending}
            onClick={() => void run(() => pauseMutation.mutateAsync())}
          >
            {t('contentAssistant.autopilotPause')}
          </Button>
        )}
        {enabled ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              fullWidth={false}
              disabled={replanMutation.isPending}
              onClick={() => void run(() => replanMutation.mutateAsync(startPrefs))}
            >
              {t('contentAssistant.autopilotReplan')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              fullWidth={false}
              disabled={deactivateMutation.isPending}
              onClick={() => void run(() => deactivateMutation.mutateAsync())}
            >
              {t('contentAssistant.autopilotDeactivate')}
            </Button>
          </>
        ) : null}
      </div>

      {actionError ? <p className="text-sm font-medium text-red-700">{actionError}</p> : null}

      {upcoming.length > 0 ? (
        <div className="space-y-2 border-t border-line pt-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            {t('contentAssistant.autopilotCalendarTitle')}
          </p>
          <ul className="space-y-2">
            {upcoming.map((slot) => {
              const asset = slot.asset_id ? assetMap.get(slot.asset_id) : null;
              return (
                <li key={slot.id}>
                  <button
                    type="button"
                    className={`flex w-full items-center gap-3 rounded-xl border px-2.5 py-2 text-left ${
                      selectedSlotId === slot.id
                        ? 'border-accent bg-accent/10'
                        : 'border-line bg-[rgb(var(--color-bg))]/60'
                    }`}
                    onClick={() => setSelectedSlotId(slot.id)}
                  >
                    {asset ? (
                      <ContentAssetThumb asset={asset} />
                    ) : (
                      <div className="h-12 w-12 rounded-lg bg-line/40" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">
                        {formatWhen(slot.planned_for, locale)} · {slot.content_format}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {slot.category || '—'} ·{' '}
                        {statusLabel(slot.status, t as (key: string) => string)}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {selectedSlot ? (
        <div className="space-y-2 rounded-xl border border-line px-3 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
            {t('contentAssistant.autopilotDetailTitle')}
          </p>
          {selectedAsset ? (
            <div className="flex justify-center">
              <ContentAssetThumb asset={selectedAsset} />
            </div>
          ) : null}
          <p className="text-sm text-ink">{formatWhen(selectedSlot.planned_for, locale)}</p>
          <p className="text-xs text-muted">
            {selectedSlot.content_format} · {selectedSlot.category || '—'} ·{' '}
            {statusLabel(selectedSlot.status, t as (key: string) => string)}
          </p>
          {selectedSlot.selection_reason ? (
            <p className="text-xs text-muted">
              {t('contentAssistant.autopilotWhy')} {selectedSlot.selection_reason}
            </p>
          ) : null}
          {selectedSlot.error_message ? (
            <p className="text-xs font-medium text-red-700">{selectedSlot.error_message}</p>
          ) : null}
        </div>
      ) : null}

      <p className="text-[0.68rem] text-muted">{t('contentAssistant.autopilotServerNote')}</p>
    </Card>
  );
}
