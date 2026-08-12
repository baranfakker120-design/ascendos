import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useI18n } from '@shared/i18n';
import { useAuth } from '@shared/auth/AuthProvider';
import { Alert } from '@shared/ui/Alert';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { Input } from '@shared/ui/Input';
import { Select } from '@shared/ui/Select';
import { TextArea } from '@shared/ui/TextArea';
import { Toggle } from '@shared/ui/Toggle';
import { formatEndClock } from './berlinTime';
import {
  clearLiveCoachingFormDraft,
  dataUrlToFile,
  fileToDataUrl,
  loadLiveCoachingFormDraft,
  saveLiveCoachingFormDraft,
  type LiveCoachingFormDraft,
} from './formDraft';
import { LiveCoachingCard } from './LiveCoachingCard';
import {
  assertValidDuration,
  isAllowedLiveCoachingImage,
  useLiveCoachingEvents,
  useLiveCoachingMutations,
} from './liveCoachingApi';
import {
  LIVE_COACHING_CATEGORIES,
  type LiveCoachingEvent,
  type LiveMediaType,
  type LiveRepeatRule,
} from './types';

const DURATION_PRESETS = [30, 45, 60, 75, 90, 120];

function toLocalInputValue(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date(Date.now() + 60 * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function emptyForm() {
  return {
    selectedId: null as string | null,
    title: '',
    subtitle: '',
    description: '',
    coachName: 'Coach',
    category: LIVE_COACHING_CATEGORIES[0] as string,
    language: 'de',
    startsAt: toLocalInputValue(null),
    durationMinutes: 60,
    durationText: '60',
    zoomUrl: '',
    repeatRule: 'none' as LiveRepeatRule,
    mediaType: 'image' as LiveMediaType,
    mediaFile: null as File | null,
    existingMediaUrl: null as string | null,
    existingMediaPath: null as string | null,
    pendingMediaDataUrl: null as string | null,
    pendingMediaName: null as string | null,
    pendingMediaMime: null as string | null,
    active: true,
  };
}

export function LiveCoachingAdminPage() {
  const { t, locale } = useI18n();
  const { profile } = useAuth();
  const { data: events = [], isPending } = useLiveCoachingEvents();
  const { saveEvent } = useLiveCoachingMutations();

  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const skipNextAutosave = useRef(false);
  const blobUrlRef = useRef<string | null>(null);

  const patch = useCallback((partial: Partial<typeof form>) => {
    setForm((prev) => ({ ...prev, ...partial }));
  }, []);

  const loadEvent = useCallback((event: LiveCoachingEvent | null) => {
    skipNextAutosave.current = true;
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    if (!event) {
      setForm(emptyForm());
    } else {
      setForm({
        ...emptyForm(),
        selectedId: event.id,
        title: event.title,
        subtitle: event.subtitle ?? '',
        description: event.description ?? '',
        coachName: event.coach_name ?? 'Coach',
        category: event.category ?? LIVE_COACHING_CATEGORIES[0],
        language: event.language ?? 'de',
        startsAt: toLocalInputValue(event.starts_at),
        durationMinutes: event.duration_minutes,
        durationText: String(event.duration_minutes),
        zoomUrl: event.zoom_url ?? '',
        repeatRule: (event.repeat_rule as LiveRepeatRule) ?? 'none',
        mediaType: (event.media_type as LiveMediaType) ?? 'image',
        mediaFile: null,
        existingMediaUrl: event.media_url,
        existingMediaPath: event.media_path,
        pendingMediaDataUrl: null,
        pendingMediaName: null,
        pendingMediaMime: null,
        active: event.active,
      });
    }
    setMessage(null);
    setError(null);
    setFieldError(null);
  }, []);

  // Restore draft once on mount (before user edits).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const draft = await loadLiveCoachingFormDraft();
        if (cancelled || !draft) {
          setDraftReady(true);
          return;
        }
        skipNextAutosave.current = true;
        let mediaFile: File | null = null;
        let previewUrl = draft.existingMediaUrl;
        if (draft.pendingMediaDataUrl) {
          mediaFile = await dataUrlToFile(
            draft.pendingMediaDataUrl,
            draft.pendingMediaName ?? 'flyer.jpg',
            draft.pendingMediaMime ?? 'image/jpeg'
          );
          previewUrl = draft.pendingMediaDataUrl;
        }
        if (cancelled) return;
        setForm({
          selectedId: draft.selectedId,
          title: draft.title,
          subtitle: draft.subtitle,
          description: draft.description,
          coachName: draft.coachName,
          category: draft.category,
          language: draft.language,
          startsAt: draft.startsAt,
          durationMinutes: draft.durationMinutes,
          durationText: String(draft.durationMinutes),
          zoomUrl: draft.zoomUrl,
          repeatRule: draft.repeatRule,
          mediaType: draft.mediaType,
          mediaFile,
          existingMediaUrl: previewUrl,
          existingMediaPath: draft.existingMediaPath,
          pendingMediaDataUrl: draft.pendingMediaDataUrl,
          pendingMediaName: draft.pendingMediaName,
          pendingMediaMime: draft.pendingMediaMime,
          active: draft.active,
        });
      } finally {
        if (!cancelled) setDraftReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Autosave draft on every change (and on visibility hide / pagehide).
  useEffect(() => {
    if (!draftReady) return;
    if (skipNextAutosave.current) {
      skipNextAutosave.current = false;
      return;
    }
    const id = window.setTimeout(() => {
      const payload: Omit<LiveCoachingFormDraft, 'updatedAt'> = {
        selectedId: form.selectedId,
        title: form.title,
        subtitle: form.subtitle,
        description: form.description,
        coachName: form.coachName,
        category: form.category,
        language: form.language,
        startsAt: form.startsAt,
        durationMinutes: form.durationMinutes,
        zoomUrl: form.zoomUrl,
        repeatRule: form.repeatRule,
        mediaType: form.mediaType,
        existingMediaUrl: form.pendingMediaDataUrl ? null : form.existingMediaUrl,
        existingMediaPath: form.existingMediaPath,
        pendingMediaDataUrl: form.pendingMediaDataUrl,
        pendingMediaName: form.pendingMediaName,
        pendingMediaMime: form.pendingMediaMime,
        active: form.active,
      };
      void saveLiveCoachingFormDraft(payload);
    }, 250);
    return () => window.clearTimeout(id);
  }, [form, draftReady]);

  useEffect(() => {
    const persistNow = () => {
      void saveLiveCoachingFormDraft({
        selectedId: form.selectedId,
        title: form.title,
        subtitle: form.subtitle,
        description: form.description,
        coachName: form.coachName,
        category: form.category,
        language: form.language,
        startsAt: form.startsAt,
        durationMinutes: form.durationMinutes,
        zoomUrl: form.zoomUrl,
        repeatRule: form.repeatRule,
        mediaType: form.mediaType,
        existingMediaUrl: form.pendingMediaDataUrl ? null : form.existingMediaUrl,
        existingMediaPath: form.existingMediaPath,
        pendingMediaDataUrl: form.pendingMediaDataUrl,
        pendingMediaName: form.pendingMediaName,
        pendingMediaMime: form.pendingMediaMime,
        active: form.active,
      });
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') persistNow();
    };
    window.addEventListener('pagehide', persistNow);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', persistNow);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [form]);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    e.target.value = '';
    if (!file) return;
    setFieldError(null);
    const isVideo = file.type.startsWith('video/') || /\.mp4$/i.test(file.name);
    if (!isVideo && !isAllowedLiveCoachingImage(file)) {
      setFieldError(t('liveCoaching.mediaTypeError'));
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      patch({
        mediaType: isVideo ? 'video' : 'image',
        mediaFile: file,
        existingMediaUrl: dataUrl,
        pendingMediaDataUrl: dataUrl,
        pendingMediaName: file.name,
        pendingMediaMime: file.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
      });
    } catch {
      setFieldError(t('liveCoaching.mediaUploadError'));
    }
  };

  const clearMedia = () => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    patch({
      mediaFile: null,
      existingMediaUrl: null,
      existingMediaPath: null,
      pendingMediaDataUrl: null,
      pendingMediaName: null,
      pendingMediaMime: null,
    });
  };

  const setDurationFromText = (raw: string) => {
    setFieldError(null);
    // Allow empty while typing — do not snap to 60.
    if (raw.trim() === '') {
      patch({ durationText: '', durationMinutes: 0 });
      return;
    }
    if (!/^\d+$/.test(raw.trim())) {
      patch({ durationText: raw });
      return;
    }
    const n = Number(raw);
    patch({ durationText: raw, durationMinutes: n });
  };

  const persist = async (publish: boolean) => {
    setError(null);
    setMessage(null);
    setFieldError(null);

    if (!form.title.trim()) {
      setFieldError(t('liveCoaching.titleRequired'));
      return;
    }
    try {
      assertValidDuration(form.durationMinutes);
    } catch {
      setFieldError(t('liveCoaching.durationInvalid'));
      return;
    }
    if (!form.mediaFile && !form.existingMediaUrl && !form.existingMediaPath) {
      setFieldError(t('liveCoaching.mediaHint'));
      return;
    }

    try {
      const event = await saveEvent.mutateAsync({
        id: form.selectedId ?? undefined,
        title: form.title,
        subtitle: form.subtitle,
        description: form.description,
        coachName: form.coachName,
        category: form.category,
        language: form.language,
        startsAt: form.startsAt,
        durationMinutes: form.durationMinutes,
        zoomUrl: form.zoomUrl,
        repeatRule: form.repeatRule,
        mediaType: form.mediaType,
        mediaFile: form.mediaFile,
        existingMediaPath: form.existingMediaPath,
        existingMediaUrl: form.mediaFile ? null : form.existingMediaUrl,
        active: form.active,
        publish,
        actorId: profile?.id ?? null,
      });
      await clearLiveCoachingFormDraft();
      skipNextAutosave.current = true;
      patch({
        selectedId: event.id,
        mediaFile: null,
        pendingMediaDataUrl: null,
        pendingMediaName: null,
        pendingMediaMime: null,
        existingMediaPath: event.media_path,
        existingMediaUrl: event.media_url,
        active: event.active,
        durationText: String(event.duration_minutes),
        durationMinutes: event.duration_minutes,
      });
      setMessage(
        publish || event.active ? t('liveCoaching.publishedPush') : t('liveCoaching.saved')
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'invalid_duration') setFieldError(t('liveCoaching.durationInvalid'));
      else if (msg === 'media_required') setFieldError(t('liveCoaching.mediaHint'));
      else setError(msg || t('liveCoaching.error'));
    }
  };

  const discardDraft = async () => {
    await clearLiveCoachingFormDraft();
    loadEvent(null);
    setMessage(t('liveCoaching.draftDiscarded'));
  };

  const endClock = useMemo(
    () => formatEndClock(form.startsAt, form.durationMinutes, locale),
    [form.startsAt, form.durationMinutes, locale]
  );

  const preview: LiveCoachingEvent | null =
    form.title && form.existingMediaUrl
      ? {
          id: form.selectedId ?? 'preview',
          title: form.title,
          subtitle: form.subtitle || null,
          description: form.description || null,
          coach_name: form.coachName,
          category: form.category,
          language: form.language,
          starts_at: new Date(form.startsAt).toISOString(),
          duration_minutes: Math.max(form.durationMinutes, 1),
          zoom_url: form.zoomUrl || null,
          repeat_rule: form.repeatRule,
          media_type: form.mediaType,
          media_path: form.existingMediaPath,
          media_url: form.existingMediaUrl,
          active: form.active,
          published_at: null,
          published_by: null,
          replay_url: null,
          recording_url: null,
          guest_speakers: [],
          library_visible: false,
          created_by: null,
          updated_by: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      : null;

  return (
    <div className="space-y-4 pb-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
          {t('liveCoaching.eyebrow')}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">
          {t('liveCoaching.adminCenterTitle')}
        </h1>
        <p className="mt-1 text-sm text-muted">{t('liveCoaching.adminSubtitle')}</p>
      </header>

      {message ? <Alert tone="info">{message}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      {fieldError ? <Alert tone="error">{fieldError}</Alert> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold">{t('liveCoaching.events')}</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                fullWidth={false}
                variant="secondary"
                onClick={() => void discardDraft()}
              >
                {t('liveCoaching.discardDraft')}
              </Button>
              <Button
                size="sm"
                fullWidth={false}
                variant="secondary"
                onClick={() => loadEvent(null)}
              >
                {t('liveCoaching.newEvent')}
              </Button>
            </div>
          </div>
          {isPending ? <p className="text-sm text-muted">{t('liveCoaching.loading')}</p> : null}
          <ul className="max-h-48 space-y-2 overflow-y-auto">
            {events.map((ev) => (
              <li key={ev.id}>
                <button
                  type="button"
                  className={`w-full rounded-xl border px-3 py-2 text-left ${
                    form.selectedId === ev.id ? 'border-accent bg-bg' : 'border-line'
                  }`}
                  onClick={() => loadEvent(ev)}
                >
                  <p className="font-medium">{ev.title}</p>
                  <p className="text-xs text-muted">
                    {new Date(ev.starts_at).toLocaleString()} ·{' '}
                    {ev.active ? t('liveCoaching.statusActive') : t('liveCoaching.statusDraft')}
                  </p>
                </button>
              </li>
            ))}
          </ul>

          <div className="space-y-2 rounded-xl border border-line p-3">
            <p className="text-sm font-medium">{t('liveCoaching.flyerLabel')}</p>
            {form.existingMediaUrl ? (
              <div
                className="overflow-hidden rounded-lg bg-ink/5"
                style={{ aspectRatio: '9 / 16', maxHeight: '16rem' }}
              >
                {form.mediaType === 'video' ? (
                  <video
                    src={form.existingMediaUrl}
                    className="h-full w-full object-contain"
                    controls
                  />
                ) : (
                  <img
                    src={form.existingMediaUrl}
                    alt=""
                    className="h-full w-full object-contain"
                  />
                )}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <label className="ui-btn ui-btn--secondary ui-btn--sm ui-btn--inline cursor-pointer">
                {form.existingMediaUrl
                  ? t('liveCoaching.mediaReplace')
                  : t('liveCoaching.mediaPick')}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/jpg,video/mp4,video/webm"
                  className="hidden"
                  onChange={(e) => void onFile(e)}
                />
              </label>
              {form.existingMediaUrl ? (
                <Button size="sm" fullWidth={false} variant="secondary" onClick={clearMedia}>
                  {t('liveCoaching.mediaRemove')}
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-muted">{t('liveCoaching.mediaShimmerHint')}</p>
          </div>

          <Input
            label={t('liveCoaching.titleLabel')}
            value={form.title}
            onChange={(e) => patch({ title: e.target.value })}
            autoComplete="off"
          />
          <Input
            label={t('liveCoaching.subtitle')}
            value={form.subtitle}
            onChange={(e) => patch({ subtitle: e.target.value })}
          />
          <TextArea
            label={t('liveCoaching.description')}
            value={form.description}
            onChange={(e) => patch({ description: e.target.value })}
            rows={8}
            hint={t('liveCoaching.descriptionHint')}
          />
          <Input
            label={t('liveCoaching.zoomUrl')}
            value={form.zoomUrl}
            onChange={(e) => patch({ zoomUrl: e.target.value })}
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            hint={t('liveCoaching.zoomHint')}
          />
          <Input
            label={t('liveCoaching.coach')}
            value={form.coachName}
            onChange={(e) => patch({ coachName: e.target.value })}
          />
          <Select
            label={t('liveCoaching.category')}
            value={form.category}
            onChange={(e) => patch({ category: e.target.value })}
          >
            {LIVE_COACHING_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Input
            label={t('liveCoaching.language')}
            value={form.language}
            onChange={(e) => patch({ language: e.target.value })}
          />
          <Input
            label={t('liveCoaching.datetime')}
            type="datetime-local"
            value={form.startsAt}
            onChange={(e) => patch({ startsAt: e.target.value })}
          />
          <div className="space-y-1.5">
            <Input
              label={t('liveCoaching.duration')}
              type="number"
              min={5}
              max={480}
              step={1}
              value={form.durationText}
              onChange={(e) => setDurationFromText(e.target.value)}
              hint={
                endClock
                  ? t('liveCoaching.endsAtHint', { time: endClock })
                  : t('liveCoaching.durationHint')
              }
            />
            <div className="flex flex-wrap gap-1.5">
              {DURATION_PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`rounded-full border px-2.5 py-1 text-xs ${
                    form.durationMinutes === m ? 'border-accent bg-bg font-semibold' : 'border-line'
                  }`}
                  onClick={() => patch({ durationMinutes: m, durationText: String(m) })}
                >
                  {m} {t('liveCoaching.min')}
                </button>
              ))}
            </div>
          </div>
          <Select
            label={t('liveCoaching.repeat')}
            value={form.repeatRule}
            onChange={(e) => patch({ repeatRule: e.target.value as LiveRepeatRule })}
          >
            <option value="none">{t('liveCoaching.repeatNone')}</option>
            <option value="daily">{t('liveCoaching.repeatDaily')}</option>
            <option value="weekly">{t('liveCoaching.repeatWeekly')}</option>
            <option value="biweekly">{t('liveCoaching.repeatBiweekly')}</option>
            <option value="monthly">{t('liveCoaching.repeatMonthly')}</option>
          </Select>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">{t('liveCoaching.active')}</span>
            <Toggle
              checked={form.active}
              onChange={(v) => patch({ active: v })}
              label={t('liveCoaching.active')}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              fullWidth={false}
              variant="secondary"
              disabled={saveEvent.isPending}
              onClick={() => void persist(false)}
            >
              {t('common.save')}
            </Button>
            <Button
              fullWidth={false}
              disabled={saveEvent.isPending}
              onClick={() => void persist(true)}
            >
              {t('liveCoaching.publish')}
            </Button>
          </div>
          <p className="text-xs text-muted">{t('liveCoaching.draftHint')}</p>
        </Card>

        <div className="space-y-3">
          <p className="font-semibold">{t('liveCoaching.todayPreview')}</p>
          {preview ? (
            <LiveCoachingCard event={preview} />
          ) : (
            <Card>
              <p className="text-sm text-muted">{t('liveCoaching.previewHint')}</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
