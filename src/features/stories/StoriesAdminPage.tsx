import { useState } from 'react';
import { useI18n, type MessageKey } from '@shared/i18n';
import { useAuth } from '@shared/auth/AuthProvider';
import { DRAFT_SCOPES, usePersistedDraft } from '@shared/offline';
import { Alert } from '@shared/ui/Alert';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { Input } from '@shared/ui/Input';
import { Select } from '@shared/ui/Select';
import { TextArea } from '@shared/ui/TextArea';
import { useAllAscendStories, useStoryMutations } from './storiesApi';
import { STORY_TYPES, type StoryTone, type StoryType } from './types';

export function StoriesAdminPage() {
  const { t, locale } = useI18n();
  const { profile } = useAuth();
  const { data: stories = [], isPending } = useAllAscendStories();
  const { publish, deactivate } = useStoryMutations();
  const {
    value: { storyType, title, body, authorLabel, subjectName, tone },
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
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onPublish = async () => {
    setError(null);
    setMessage(null);
    try {
      await publish.mutateAsync({
        storyType,
        title,
        body,
        authorLabel,
        subjectName: subjectName || undefined,
        tone,
        actorId: profile?.id ?? null,
      });
      setCompose((prev) => ({ ...prev, title: '', body: '', subjectName: '' }));
      await clearComposeDraft();
      setMessage(t('stories.publishedHint'));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('stories.publishFailed'));
    }
  };

  return (
    <div className="space-y-4 pb-8">
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
        <p className="text-xs text-muted">
          Future-ready: Image · Video · Voice media kinds are reserved in the schema.
        </p>
        <Button
          disabled={publish.isPending || !title.trim() || !body.trim()}
          onClick={() => void onPublish()}
        >
          {t('stories.publish')}
        </Button>
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
        </ul>
      </Card>
    </div>
  );
}
