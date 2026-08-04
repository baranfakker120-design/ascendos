import { supabase } from '@shared/api/supabase';
import type { MissionStatus, PipelineEventType } from '@shared/types/domain';
import { registerSyncHandler } from './syncQueue';
import { registerUploadHandler } from './uploadQueue';

/**
 * Bind outbox jobs to EXISTING client API calls — no new RPCs/schema.
 * Handlers are pure retries of the same operations the online path uses.
 */
export function registerOfflineHandlers(): void {
  registerSyncHandler('mission_status', async (job) => {
    const p = job.payload as { itemId: string; status: MissionStatus; reason?: string };
    const { error } = await supabase.rpc('update_mission_status', {
      p_item_id: p.itemId,
      p_status: p.status,
      p_reason: p.reason,
    });
    if (error) throw error;
  });

  registerSyncHandler('contact_create', async (job) => {
    const p = job.payload as {
      name: string;
      phone?: string | null;
      email?: string | null;
      notes?: string | null;
      next_step?: string | null;
      next_step_due?: string | null;
      owner_id: string;
      org_id: string;
      clientMutationId: string;
    };
    const { error } = await supabase.from('contacts').insert({
      name: p.name,
      phone: p.phone,
      email: p.email,
      notes: p.notes,
      next_step: p.next_step,
      next_step_due: p.next_step_due,
      owner_id: p.owner_id,
      org_id: p.org_id,
    });
    if (error) throw error;
  });

  registerSyncHandler('contact_update', async (job) => {
    const p = job.payload as {
      id: string;
      name?: string;
      phone?: string | null;
      email?: string | null;
      notes?: string | null;
      next_step?: string | null;
      next_step_due?: string | null;
    };
    const { id, ...input } = p;
    const { error } = await supabase.from('contacts').update(input).eq('id', id);
    if (error) throw error;
  });

  registerSyncHandler('pipeline_event', async (job) => {
    const p = job.payload as {
      contact_id: string;
      org_id: string;
      event_type: PipelineEventType;
      source?: string;
      created_by: string;
      clientMutationId: string;
    };
    const { error } = await supabase.from('pipeline_events').insert({
      contact_id: p.contact_id,
      org_id: p.org_id,
      event_type: p.event_type,
      source: p.source ?? 'manual',
      created_by: p.created_by,
    });
    if (error) throw error;
  });

  registerSyncHandler('leadership_note', async (job) => {
    const p = job.payload as { targetMembershipId: string; body: string };
    const { error } = await supabase.rpc('upsert_leadership_note', {
      p_target_membership: p.targetMembershipId,
      p_body: p.body,
    });
    if (error) throw error;
  });

  registerSyncHandler('profile_update', async (job) => {
    const p = job.payload as {
      id: string;
      patch: {
        first_name?: string;
        last_name?: string;
        phone?: string | null;
        country?: string | null;
        language?: string;
      };
    };
    const { error } = await supabase.from('profiles').update(p.patch).eq('id', p.id);
    if (error) throw error;
  });

  registerSyncHandler('journey_complete_step', async (job) => {
    const p = job.payload as { stepId: string };
    const { error } = await supabase.rpc('complete_journey_step', { p_step_id: p.stepId });
    if (error) throw error;
  });

  registerUploadHandler('avatar', async (job, file) => {
    const userId = String(job.meta.userId ?? '');
    if (!userId) throw new Error('avatar upload missing userId');
    const path = `${userId}/avatar.webp`;
    const { error: upErr } = await supabase.storage.from('avatare').upload(path, file, {
      upsert: true,
      contentType: 'image/webp',
      cacheControl: '3600',
    });
    if (upErr) throw upErr;
    const { data } = supabase.storage.from('avatare').getPublicUrl(path);
    const url = `${data.publicUrl}?v=${Date.now()}`;
    const { error } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId);
    if (error) throw error;
  });

  registerUploadHandler('generic', async () => {
    // Features can register richer handlers; generic is a no-op sink.
  });
}
