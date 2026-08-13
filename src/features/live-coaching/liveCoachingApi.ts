import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@shared/auth/AuthProvider';
import { supabase } from '@shared/api/supabase';
import {
  COACHING_MEDIA_BUCKET,
  buildCoachingMediaObjectPath,
  coachingMediaPathBelongsToOrg,
} from './coachingMedia';
import { assertValidDuration } from './duration';
import {
  buildCoachingNotificationPlan,
  clearLocalNotificationsForEvent,
  showCoachingNotification,
  upsertLocalNotificationPlan,
} from './notifications';
import type { LiveCoachingEvent, LiveMediaType, LiveRepeatRule } from './types';
import { createSignedCoachingMediaUrl } from './useCoachingMediaUrl';

export {
  isLiveCoachingPresentable,
  listPresentableCoachingEvents,
  pickTodayCoachingEvent,
} from './pickTodayEvent';
export { assertValidDuration } from './duration';

const IMAGE_ACCEPT = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

export function useLiveCoachingEvents(opts?: { activeOnly?: boolean }) {
  const activeOnly = opts?.activeOnly ?? false;
  const { membership } = useAuth();
  const orgId = membership?.org_id ?? null;
  return useQuery({
    queryKey: ['live-coaching-events', orgId, activeOnly],
    enabled: Boolean(orgId),
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
  /** Server-resolved active org — never trust a client org picker alone. */
  orgId: string;
}

export function isAllowedLiveCoachingImage(file: File): boolean {
  const mime = (file.type || '').toLowerCase();
  if (IMAGE_ACCEPT.includes(mime)) return true;
  return /\.(jpe?g|png|webp)$/i.test(file.name);
}

async function uploadMedia(
  file: File,
  orgId: string,
  actorId: string | null
): Promise<{ path: string }> {
  const path = buildCoachingMediaObjectPath(orgId, actorId, file.name);
  if (!coachingMediaPathBelongsToOrg(path, orgId)) {
    throw new Error('media_org_mismatch');
  }
  const { error } = await supabase.storage.from(COACHING_MEDIA_BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;
  return { path };
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
  const { membership } = useAuth();
  const orgId = membership?.org_id ?? null;
  const invalidate = () => qc.invalidateQueries({ queryKey: ['live-coaching-events'] });

  const saveEvent = useMutation({
    mutationFn: async (input: SaveLiveCoachingInput) => {
      assertValidDuration(input.durationMinutes);
      if (!input.orgId || (orgId && input.orgId !== orgId)) {
        throw new Error('org_mismatch');
      }

      let mediaPath = input.existingMediaPath ?? null;
      if (input.mediaFile) {
        const uploaded = await uploadMedia(input.mediaFile, input.orgId, input.actorId);
        mediaPath = uploaded.path;
      }

      if (!mediaPath) {
        throw new Error('media_required');
      }

      // Signed URL for immediate preview; not a durable public link.
      const mediaUrl = await createSignedCoachingMediaUrl(mediaPath);

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
      qc.setQueryData<LiveCoachingEvent[]>(['live-coaching-events', orgId, true], (prev) => {
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
