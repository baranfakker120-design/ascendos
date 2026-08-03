import { useState, type ChangeEvent } from 'react';
import { useAuth } from '@shared/auth/AuthProvider';
import { Alert } from '@shared/ui/Alert';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { Input } from '@shared/ui/Input';
import { Select } from '@shared/ui/Select';
import { TextArea } from '@shared/ui/TextArea';
import { Toggle } from '@shared/ui/Toggle';
import { LiveCoachingCard } from './LiveCoachingCard';
import { useLiveCoachingEvents, useLiveCoachingMutations } from './liveCoachingApi';
import {
  LIVE_COACHING_CATEGORIES,
  LIVE_COACHING_FUTURE,
  type LiveCoachingEvent,
  type LiveMediaType,
  type LiveRepeatRule,
} from './types';

function toLocalInputValue(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date(Date.now() + 60 * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function LiveCoachingAdminPage() {
  const { profile } = useAuth();
  const { data: events = [], isPending } = useLiveCoachingEvents();
  const { saveEvent } = useLiveCoachingMutations();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [description, setDescription] = useState('');
  const [coachName, setCoachName] = useState('Coach');
  const [category, setCategory] = useState<string>(LIVE_COACHING_CATEGORIES[0]);
  const [language, setLanguage] = useState('de');
  const [startsAt, setStartsAt] = useState(toLocalInputValue(null));
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [zoomUrl, setZoomUrl] = useState('');
  const [repeatRule, setRepeatRule] = useState<LiveRepeatRule>('none');
  const [mediaType, setMediaType] = useState<LiveMediaType>('image');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [existingMediaUrl, setExistingMediaUrl] = useState<string | null>(null);
  const [existingMediaPath, setExistingMediaPath] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = (event: LiveCoachingEvent | null) => {
    setSelectedId(event?.id ?? null);
    setTitle(event?.title ?? '');
    setSubtitle(event?.subtitle ?? '');
    setDescription(event?.description ?? '');
    setCoachName(event?.coach_name ?? 'Coach');
    setCategory(event?.category ?? LIVE_COACHING_CATEGORIES[0]);
    setLanguage(event?.language ?? 'de');
    setStartsAt(toLocalInputValue(event?.starts_at ?? null));
    setDurationMinutes(event?.duration_minutes ?? 60);
    setZoomUrl(event?.zoom_url ?? '');
    setRepeatRule((event?.repeat_rule as LiveRepeatRule) ?? 'none');
    setMediaType((event?.media_type as LiveMediaType) ?? 'image');
    setMediaFile(null);
    setExistingMediaUrl(event?.media_url ?? null);
    setExistingMediaPath(event?.media_path ?? null);
    setActive(event?.active ?? false);
    setMessage(null);
    setError(null);
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    e.target.value = '';
    if (!file) return;
    const isVideo = file.type.startsWith('video/') || /\.mp4$/i.test(file.name);
    setMediaType(isVideo ? 'video' : 'image');
    setMediaFile(file);
    setExistingMediaUrl(URL.createObjectURL(file));
  };

  const persist = async (publish: boolean) => {
    setError(null);
    setMessage(null);
    if (!mediaFile && !existingMediaUrl) {
      setError('Bitte 9:16 Bild oder kurzes MP4 wählen.');
      return;
    }
    try {
      const event = await saveEvent.mutateAsync({
        id: selectedId ?? undefined,
        title,
        subtitle,
        description,
        coachName,
        category,
        language,
        startsAt,
        durationMinutes,
        zoomUrl,
        repeatRule,
        mediaType,
        mediaFile,
        existingMediaPath,
        existingMediaUrl: mediaFile ? null : existingMediaUrl,
        active,
        publish,
        actorId: profile?.id ?? null,
      });
      setSelectedId(event.id);
      setExistingMediaPath(event.media_path);
      setExistingMediaUrl(event.media_url);
      setActive(event.active);
      setMessage(
        publish
          ? 'Veröffentlicht — Push an alle geplant (sofort, −30 Min, −5 Min).'
          : 'Gespeichert.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
    }
  };

  const preview: LiveCoachingEvent | null =
    title && (existingMediaUrl || mediaFile)
      ? {
          id: selectedId ?? 'preview',
          title,
          subtitle: subtitle || null,
          description: description || null,
          coach_name: coachName,
          category,
          language,
          starts_at: new Date(startsAt).toISOString(),
          duration_minutes: durationMinutes,
          zoom_url: zoomUrl || null,
          repeat_rule: repeatRule,
          media_type: mediaType,
          media_path: existingMediaPath,
          media_url: existingMediaUrl,
          active,
          published_at: null,
          published_by: null,
          replay_url: null,
          recording_url: null,
          guest_speakers: [],
          library_visible: LIVE_COACHING_FUTURE.library,
          created_by: null,
          updated_by: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      : null;

  return (
    <div className="space-y-4 pb-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Coach</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Live Coaching Center</h1>
        <p className="mt-1 text-sm text-muted">
          9:16 Bild (Gold-Shimmer) oder kurzes MP4 — Publish benachrichtigt alle.
        </p>
      </header>

      {message ? <Alert tone="info">{message}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-semibold">Events</p>
            <Button size="sm" fullWidth={false} variant="secondary" onClick={() => load(null)}>
              Neu
            </Button>
          </div>
          {isPending ? <p className="text-sm text-muted">Laden …</p> : null}
          <ul className="max-h-64 space-y-2 overflow-y-auto">
            {events.map((ev) => (
              <li key={ev.id}>
                <button
                  type="button"
                  className={`w-full rounded-xl border px-3 py-2 text-left ${
                    selectedId === ev.id ? 'border-accent bg-bg' : 'border-line'
                  }`}
                  onClick={() => load(ev)}
                >
                  <p className="font-medium">{ev.title}</p>
                  <p className="text-xs text-muted">
                    {new Date(ev.starts_at).toLocaleString()} · {ev.active ? 'aktiv' : 'entwurf'}
                  </p>
                </button>
              </li>
            ))}
          </ul>

          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input label="Subtitle" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
          <TextArea
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
          <Input label="Coach" value={coachName} onChange={(e) => setCoachName(e.target.value)} />
          <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {LIVE_COACHING_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Input label="Language" value={language} onChange={(e) => setLanguage(e.target.value)} />
          <Input
            label="Date & Time"
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
          <Input
            label="Duration (Min)"
            type="number"
            min={5}
            max={480}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value) || 60)}
          />
          <Input label="Zoom URL" value={zoomUrl} onChange={(e) => setZoomUrl(e.target.value)} />
          <Select
            label="Repeat"
            value={repeatRule}
            onChange={(e) => setRepeatRule(e.target.value as LiveRepeatRule)}
          >
            <option value="none">Keine</option>
            <option value="daily">Täglich</option>
            <option value="weekly">Wöchentlich</option>
            <option value="biweekly">Alle 2 Wochen</option>
            <option value="monthly">Monatlich</option>
          </Select>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">Active</span>
            <Toggle checked={active} onChange={setActive} label="Active" />
          </div>
          <label className="ui-btn ui-btn--secondary ui-btn--sm ui-btn--inline cursor-pointer">
            Bild (9:16) oder MP4
            <input
              type="file"
              accept="image/*,video/mp4,video/webm"
              className="hidden"
              onChange={onFile}
            />
          </label>
          <p className="text-xs text-muted">
            Bilder erhalten Gold-Shimmer. Videos ohne Shimmer/Glow.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              fullWidth={false}
              variant="secondary"
              disabled={saveEvent.isPending}
              onClick={() => void persist(false)}
            >
              Speichern
            </Button>
            <Button
              fullWidth={false}
              disabled={saveEvent.isPending}
              onClick={() => void persist(true)}
            >
              Publish
            </Button>
          </div>
          <p className="text-xs text-muted">
            Future ready (stubs): Replay, Recordings, Guests, Multi-Events, Search, Categories,
            Library.
          </p>
        </Card>

        <div className="space-y-3">
          <p className="font-semibold">Today Preview</p>
          {preview ? (
            <LiveCoachingCard event={preview} />
          ) : (
            <Card>
              <p className="text-sm text-muted">Vorschau erscheint nach Titel + Media.</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
