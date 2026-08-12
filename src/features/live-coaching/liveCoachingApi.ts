import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@shared/api/supabase';
import {
  buildCoachingNotificationPlan,
  clearLocalNotificationsForEvent,
  showCoachingNotification,
  upsertLocalNotificationPlan,
} from './notifications';
import type { LiveCoachingEvent, LiveMediaType, LiveRepeatRule } from './types';

export { pickTodayCoachingEvent } from './pickTodayEvent';

const MEDIA_BUCKET = 'coaching-media';
const IMAGE_ACCEPT = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

export function useLiveCoachingEvents(opts?: { activeOnly?: boolean }) {
  const activeOnly = opts?.activeOnly ?? false;
  return useQuery({
    queryKey: ['live-coaching-events', activeOnly],
    queryFn: async (): Promise<LiveCoachingEvent[]> => {
      let q = supabase
        .from('live_coaching_events')
        .select('*')
        .order('starts_at', { ascending: true });
      if (activeOnly) q = q.eq('active', true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as LiveCoachingEvent[];
    },
  });
}

export interface SaveLiveCoachingInput {
  id?: string;
  title: string;
  subtitle: string;
  description: string;
  coachName: string;
  category: string;
  language: string;
  startsAt: string;
  durationMinutes: number;
  zoomUrl: string;
  repeatRule: LiveRepeatRule;
  mediaType: LiveMediaType;
  mediaFile?: File | null;
  existingMediaPath?: string | null;
  existingMediaUrl?: string | null;
  active: boolean;
  publish: boolean;
  actorId: string | null;
}

export function assertValidDuration(minutes: number): void {
  if (!Number.isFinite(minutes) || minutes < 5 || minutes > 480) {
    throw new Error('invalid_duration');
  }
}

export function isAllowedLiveCoachingImage(file: File): boolean {
  const mime = (file.type || '').toLowerCase();
  if (IMAGE_ACCEPT.includes(mime)) return true;
  return /\.(jpe?g|png|webp)$/i.test(file.name);
}

async function uploadMedia(
  file: File,
  actorId: string | null
): Promise<{ path: string; url: string }> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
  const path = `${actorId ?? 'anon'}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  return { path, url: data.publicUrl };
}

async function scheduleReminders(event: LiveCoachingEvent): Promise<void> {
  const plan = buildCoachingNotificationPlan({
    eventId: event.id,
    title: event.title,
    startsAt: event.starts_at,
    publishedAt: event.published_at ?? new Date().toISOString(),
  });
  upsertLocalNotificationPlan(event.id, plan);
  const published = plan.find((p) => p.kind === 'published');
  if (published) {
    await showCoachingNotification(
      published.title,
      published.body,
      `coaching-${event.id}-published`
    );
  }

  const rows = plan.map((p) => ({
    event_id: event.id,
    kind: p.kind,
    scheduled_for: p.scheduledFor.toISOString(),
    title: p.title,
    body: p.body,
    sent_at: p.kind === 'published' ? new Date().toISOString() : null,
  }));
  const { error: outboxErr } = await supabase
    .from('coaching_notification_outbox')
    .upsert(rows, { onConflict: 'event_id,kind' });
  if (outboxErr) {
    console.warn('coaching outbox', outboxErr.message);
  }
}

export function useLiveCoachingMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['live-coaching-events'] });

  const saveEvent = useMutation({
    mutationFn: async (input: SaveLiveCoachingInput) => {
      assertValidDuration(input.durationMinutes);

      let mediaPath = input.existingMediaPath ?? null;
      let mediaUrl = input.existingMediaUrl ?? null;
      if (input.mediaFile) {
        const uploaded = await uploadMedia(input.mediaFile, input.actorId);
        mediaPath = uploaded.path;
        mediaUrl = uploaded.url;
      }

      if (!mediaPath || !mediaUrl) {
        throw new Error('media_required');
      }

      const publishedAt = input.publish ? new Date().toISOString() : null;
      const becomesActive = input.publish ? true : input.active;
      const payload = {
        title: input.title.trim(),
        subtitle: input.subtitle || null,
        description: input.description || null,
        coach_name: input.coachName || 'Coach',
        category: input.category,
        language: input.language || 'de',
        starts_at: new Date(input.startsAt).toISOString(),
        duration_minutes: input.durationMinutes,
        zoom_url: input.zoomUrl.trim() || null,
        repeat_rule: input.repeatRule,
        media_type: input.mediaType,
        media_path: mediaPath,
        media_url: mediaUrl,
        active: becomesActive,
        published_at: input.publish ? publishedAt : undefined,
        published_by: input.publish ? input.actorId : undefined,
        updated_by: input.actorId,
      };

      let event: LiveCoachingEvent;
      if (input.id) {
        const { data, error } = await supabase
          .from('live_coaching_events')
          .update(payload)
          .eq('id', input.id)
          .select('*')
          .single();
        if (error) throw error;
        event = data as LiveCoachingEvent;
      } else {
        const { data, error } = await supabase
          .from('live_coaching_events')
          .insert({
            ...payload,
            created_by: input.actorId,
            published_at: publishedAt,
            published_by: input.publish ? input.actorId : null,
            active: becomesActive,
          })
          .select('*')
          .single();
        if (error) throw error;
        event = data as LiveCoachingEvent;
      }

      if (becomesActive) {
        await scheduleReminders(event);
      } else {
        clearLocalNotificationsForEvent(event.id);
        // Drop unsent outbox rows so inactive/archived events never push.
        const { error: clearErr } = await supabase
          .from('coaching_notification_outbox')
          .delete()
          .eq('event_id', event.id)
          .is('sent_at', null);
        if (clearErr) console.warn('coaching outbox clear', clearErr.message);
      }

      return event;
    },
    onSuccess: (event) => {
      void invalidate();
      // Optimistic Today refresh
      qc.setQueryData<LiveCoachingEvent[]>(['live-coaching-events', true], (prev) => {
        const list = prev ? [...prev] : [];
        const idx = list.findIndex((e) => e.id === event.id);
        if (event.active) {
          if (idx >= 0) list[idx] = event;
          else list.push(event);
          return list.sort(
            (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
          );
        }
        if (idx >= 0) list.splice(idx, 1);
        return list;
      });
    },
  });

  return { saveEvent };
}
