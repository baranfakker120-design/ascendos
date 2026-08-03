import { useState } from 'react';
import { useAuth } from '@shared/auth/AuthProvider';
import { Alert } from '@shared/ui/Alert';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { Input } from '@shared/ui/Input';
import { Select } from '@shared/ui/Select';
import { TextArea } from '@shared/ui/TextArea';
import { useAllAscendStories, useStoryMutations } from './storiesApi';
import { STORY_TYPE_LABELS, type StoryTone, type StoryType } from './types';

const TYPES = Object.keys(STORY_TYPE_LABELS) as StoryType[];

export function StoriesAdminPage() {
  const { profile } = useAuth();
  const { data: stories = [], isPending } = useAllAscendStories();
  const { publish, deactivate } = useStoryMutations();
  const [storyType, setStoryType] = useState<StoryType>('admin');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [authorLabel, setAuthorLabel] = useState('Ascend');
  const [subjectName, setSubjectName] = useState('');
  const [tone, setTone] = useState<StoryTone>('celebrate');
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
      setTitle('');
      setBody('');
      setSubjectName('');
      setMessage('Story published — visible for 24 hours. Motivate · Celebrate · Inspire.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Publish failed.');
    }
  };

  return (
    <div className="space-y-4 pb-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Ascend</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Stories</h1>
        <p className="mt-1 text-sm text-muted">
          Premium Admin Stories. Never shame. Never compare negatively. Expire after 24h.
        </p>
      </header>

      {message ? <Alert tone="info">{message}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      <Card className="space-y-3">
        <Select
          label="Type"
          value={storyType}
          onChange={(e) => setStoryType(e.target.value as StoryType)}
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {STORY_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
        <Select label="Tone" value={tone} onChange={(e) => setTone(e.target.value as StoryTone)}>
          <option value="motivate">Motivate</option>
          <option value="celebrate">Celebrate</option>
          <option value="inspire">Inspire</option>
        </Select>
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <TextArea label="Body" value={body} onChange={(e) => setBody(e.target.value)} rows={4} />
        <Input
          label="Author"
          value={authorLabel}
          onChange={(e) => setAuthorLabel(e.target.value)}
        />
        <Input
          label="Subject (optional)"
          value={subjectName}
          onChange={(e) => setSubjectName(e.target.value)}
        />
        <p className="text-xs text-muted">
          Future-ready: Image · Video · Voice media kinds are reserved in the schema.
        </p>
        <Button
          disabled={publish.isPending || !title.trim() || !body.trim()}
          onClick={() => void onPublish()}
        >
          Publish Story
        </Button>
      </Card>

      <Card className="space-y-2">
        <p className="font-semibold">Recent</p>
        {isPending ? <p className="text-sm text-muted">Loading …</p> : null}
        <ul className="space-y-2">
          {stories.map((s) => (
            <li
              key={s.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-line px-3 py-2"
            >
              <div className="min-w-0">
                <p className="font-medium">{s.title}</p>
                <p className="text-xs text-muted">
                  {STORY_TYPE_LABELS[s.story_type as StoryType] ?? s.story_type} ·{' '}
                  {s.active ? 'active' : 'off'} · expires {new Date(s.expires_at).toLocaleString()}
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
                  Hide
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
