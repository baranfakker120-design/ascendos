import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@shared/api/supabase';
import { useAuth } from '@shared/auth/AuthProvider';
import { buildCoachingNotificationPlan, showCoachingNotification } from './notifications';
import type { LiveCoachingEvent, LiveMediaType, LiveRepeatRule } from './types';

export { pickTodayCoachingEvent } from './pickTodayEvent';

const MEDIA_BUCKET = 'coaching-media';

export function useLiveCoachingEvents(opts?: { activeOnly?: boolean }) {
  const activeOnly = opts?.activeOnly ?? false;
  const { membership } = useAuth();
  return useQuery({
    queryKey: ['live-coaching-events', membership?.org_id, activeOnly],
    enabled: !!membership?.org_id,
    refetchInterval: 60_000,
    queryFn: async (): Promise<LiveCoachingEvent[]> => {
      await supabase.rpc('maintain_live_coaching_events', {
        p_org: membership!.org_id,
      });
      let q = supabase
        .from('live_coaching_events')
        .select('*')
        .eq('org_id', membership!.org_id)
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

export function useLiveCoachingMutations() {
  const qc = useQueryClient();
  const { membership } = useAuth();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['live-coaching-events'] });

  const saveEvent = useMutation({
    mutationFn: async (input: SaveLiveCoachingInput) => {
      if (!membership?.org_id) throw new Error('Keine Organisation aktiv.');
      let mediaPath = input.existingMediaPath ?? null;
      let mediaUrl = input.existingMediaUrl ?? null;
      if (input.mediaFile) {
        const uploaded = await uploadMedia(input.mediaFile, input.actorId);
        mediaPath = uploaded.path;
        mediaUrl = uploaded.url;
      }

      const publishedAt = input.publish ? new Date().toISOString() : null;
      const payload = {
        org_id: membership.org_id,
        title: input.title,
        subtitle: input.subtitle || null,
        description: input.description || null,
        coach_name: input.coachName || 'Coach',
        category: input.category,
        language: input.language || 'de',
        starts_at: new Date(input.startsAt).toISOString(),
        duration_minutes: input.durationMinutes,
        zoom_url: input.zoomUrl || null,
        repeat_rule: input.repeatRule,
        media_type: input.mediaType,
        media_path: mediaPath,
        media_url: mediaUrl,
        active: input.publish ? true : input.active,
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
          .eq('org_id', membership.org_id)
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
            active: input.publish ? true : input.active,
          })
          .select('*')
          .single();
        if (error) throw error;
        event = data as LiveCoachingEvent;
      }

      if (input.publish) {
        const plan = buildCoachingNotificationPlan({
          eventId: event.id,
          title: event.title,
          startsAt: event.starts_at,
          publishedAt: event.published_at ?? new Date().toISOString(),
        });
        // Publisher gets immediate local banner; audience via outbox + receipts.
        await showCoachingNotification(plan[0].title, plan[0].body);

        const rows = plan.map((p) => ({
          event_id: event.id,
          org_id: membership.org_id,
          kind: p.kind,
          scheduled_for: p.scheduledFor.toISOString(),
          title: p.title,
          body: p.body,
          sent_at: null as string | null,
        }));
        const { error: outboxErr } = await supabase
          .from('coaching_notification_outbox')
          .upsert(rows, { onConflict: 'event_id,kind' });
        if (outboxErr) {
          console.warn('coaching outbox', outboxErr.message);
        }
      }

      return event;
    },
    onSuccess: () => void invalidate(),
  });

  return { saveEvent };
}
