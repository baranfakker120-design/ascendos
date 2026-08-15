import { useState, type ChangeEvent } from 'react';
import { useI18n, type MessageKey } from '@shared/i18n';
import { useAuth } from '@shared/auth/AuthProvider';
import { DRAFT_SCOPES, usePersistedDraft } from '@shared/offline';
import { Alert } from '@shared/ui/Alert';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { Input } from '@shared/ui/Input';
import { Select } from '@shared/ui/Select';
import { TextArea } from '@shared/ui/TextArea';
import { uploadStoryMedia, useAllAscendStories, useStoryMutations } from './storiesApi';
import { isStoryAspectRatio, storyAspectLabel } from './storyMedia';
import { STORY_TYPES, type StoryTone, type StoryType } from './types';
import './stories-admin.css';

export function StoriesAdminPage() {
  const { t, locale } = useI18n();
  const { profile, membership } = useAuth();
  const orgId = membership?.org_id ?? null;
  const { data: stories = [], isPending } = useAllAscendStories();
  const { publish, deactivate } = useStoryMutations();
  const {
    value: {
      storyType,
      title,
      body,
      authorLabel,
      subjectName,
      tone,
      musicTrack,
      musicArtist,
      musicMood,
    },
    setValue: setCompose,
    patch,
    clear: clearComposeDraft,
  } = usePersistedDraft(DRAFT_SCOPES.storiesAdmin, {
    storyType: 'admin' as StoryType,
    title: '',
    body: '',
    authorLabel: 'Ascend',
    subjectName: '',
    tone: 'celebrate' as StoryTone,
    musicTrack: '',
    musicArtist: '',
    musicMood: '',
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaAspectOk, setMediaAspectOk] = useState<boolean | null>(null);
  const [uploading, setUploading] = useState(false);

  const onMediaPick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    e.target.value = '';
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaFile(file);
    setMediaAspectOk(null);
    if (!file) {
      setMediaPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setMediaPreview(url);
    const img = new Image();
    img.onload = () => setMediaAspectOk(isStoryAspectRatio(img.naturalWidth, img.naturalHeight));
    img.onerror = () => setMediaAspectOk(null);
    img.src = url;
  };

  const clearMedia = () => {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaFile(null);
    setMediaPreview(null);
    setMediaAspectOk(null);
  };

  const onPublish = async () => {
    setError(null);
    setMessage(null);
    if (!orgId) {
      setError(t('stories.publishFailed'));
      return;
    }
    try {
      setUploading(Boolean(mediaFile));
      let mediaPath: string | null = null;
      if (mediaFile) {
        const uploaded = await uploadStoryMedia({
          orgId,
          actorId: profile?.id ?? null,
          file: mediaFile,
        });
        mediaPath = uploaded.path;
      }
      await publish.mutateAsync({
        storyType,
        title,
        body,
        authorLabel,
        subjectName: subjectName || undefined,
        tone,
        mediaKind: mediaPath ? 'image' : 'text',
        mediaPath,
        musicSuggestion:
          musicTrack.trim() || musicArtist.trim()
            ? {
                trackName: musicTrack,
                artist: musicArtist,
                mood: musicMood || undefined,
              }
            : null,
        actorId: profile?.id ?? null,
        orgId,
      });
      setCompose((prev) => ({
        ...prev,
        title: '',
        body: '',
        subjectName: '',
        musicTrack: '',
        musicArtist: '',
        musicMood: '',
      }));
      clearMedia();
      await clearComposeDraft();
      setMessage(t('stories.publishedHint'));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('stories.publishFailed'));
    } finally {
      setUploading(false);
    }
  };

  const busy = publish.isPending || uploading;
  const canPublish = Boolean(orgId && title.trim() && body.trim() && !busy);

  return (
    <div className="stories-admin">
      <div className="stories-admin__content space-y-4">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
            {t('brand.name')}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{t('stories.adminTitle')}</h1>
          <p className="mt-1 text-sm text-muted">{t('stories.adminSubtitle')}</p>
        </header>

        {message ? <Alert tone="info">{message}</Alert> : null}
        {error ? <Alert tone="error">{error}</Alert> : null}

        <Card className="space-y-3">
          <Select
            label={t('stories.typeLabel')}
            value={storyType}
            onChange={(e) => patch({ storyType: e.target.value as StoryType })}
          >
            {STORY_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`stories.types.${type}` as MessageKey)}
              </option>
            ))}
          </Select>
          <Select
            label={t('stories.toneLabel')}
            value={tone}
            onChange={(e) => patch({ tone: e.target.value as StoryTone })}
          >
            <option value="motivate">{t('stories.toneMotivate')}</option>
            <option value="celebrate">{t('stories.toneCelebrate')}</option>
            <option value="inspire">{t('stories.toneInspire')}</option>
          </Select>
          <Input
            label={t('stories.titleLabel')}
            value={title}
            onChange={(e) => patch({ title: e.target.value })}
          />
          <TextArea
            label={t('stories.bodyLabel')}
            value={body}
            onChange={(e) => patch({ body: e.target.value })}
            rows={4}
          />
          <Input
            label={t('stories.author')}
            value={authorLabel}
            onChange={(e) => patch({ authorLabel: e.target.value })}
          />
          <Input
            label={t('stories.subjectOptional')}
            value={subjectName}
            onChange={(e) => patch({ subjectName: e.target.value })}
          />

          <div className="space-y-2 rounded-xl border border-line p-3">
            <p className="text-sm font-semibold">{t('stories.mediaLabel')}</p>
            <p className="text-xs text-muted">
              {t('stories.mediaHint', { ratio: storyAspectLabel() })}
            </p>
            <label className="ui-btn ui-btn--secondary ui-btn--sm ui-btn--inline cursor-pointer">
              {t('stories.mediaPick')}
              <input type="file" accept="image/*" className="sr-only" onChange={onMediaPick} />
            </label>
            {mediaPreview ? (
              <div className="stories-admin__preview-wrap">
                <div className="stories-admin__preview-frame">
                  <img src={mediaPreview} alt="" className="stories-admin__preview-img" />
                </div>
                <p className="text-xs text-muted">
                  {mediaAspectOk === false
                    ? t('stories.mediaAspectWarn')
                    : mediaAspectOk
                      ? t('stories.mediaAspectOk')
                      : t('stories.mediaPreview')}
                </p>
                <Button size="sm" fullWidth={false} variant="ghost" onClick={clearMedia}>
                  {t('stories.mediaClear')}
                </Button>
              </div>
            ) : null}
          </div>

          <div className="space-y-2 rounded-xl border border-dashed border-line p-3">
            <p className="text-sm font-semibold">{t('stories.musicLabel')}</p>
            <p className="text-xs text-muted">{t('stories.musicHint')}</p>
            <Input
              label={t('stories.musicTrack')}
              value={musicTrack}
              onChange={(e) => patch({ musicTrack: e.target.value })}
            />
            <Input
              label={t('stories.musicArtist')}
              value={musicArtist}
              onChange={(e) => patch({ musicArtist: e.target.value })}
            />
            <Input
              label={t('stories.musicMood')}
              value={musicMood}
              onChange={(e) => patch({ musicMood: e.target.value })}
            />
          </div>
        </Card>

        <Card className="space-y-2">
          <p className="font-semibold">{t('stories.adminTitle')}</p>
          {isPending ? <p className="text-sm text-muted">{t('common.loading')}</p> : null}
          <ul className="space-y-2">
            {stories.map((s) => (
              <li
                key={s.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-line px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="font-medium">{s.title}</p>
                  <p className="text-xs text-muted">
                    {t(`stories.types.${s.story_type as StoryType}` as MessageKey)} ·{' '}
                    {s.active ? t('knowledge.active') : 'off'} ·{' '}
                    {new Date(s.expires_at).toLocaleString(locale)}
                    {s.media_path ? ` · ${t('stories.mediaAttached')}` : ''}
                  </p>
                </div>
                {s.active ? (
                  <Button
                    size="sm"
                    fullWidth={false}
                    variant="ghost"
                    disabled={deactivate.isPending}
                    onClick={() => void deactivate.mutateAsync(s.id)}
                  >
                    {t('stories.hide')}
                  </Button>
                ) : null}
              </li>
            ))}
            {stories.length === 0 && !isPending ? (
              <li className="text-sm text-muted">{t('stories.empty')}</li>
            ) : null}
          </ul>
        </Card>
      </div>

      <div className="stories-admin__cta" role="region" aria-label={t('stories.publish')}>
        <Button disabled={!canPublish} onClick={() => void onPublish()}>
          {busy ? t('stories.publishing') : t('stories.publish')}
        </Button>
      </div>
    </div>
  );
}
