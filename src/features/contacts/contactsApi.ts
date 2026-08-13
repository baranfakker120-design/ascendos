import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@shared/api/supabase';
import { useAuth } from '@shared/auth/AuthProvider';
import { runOrEnqueue } from '@shared/offline';
import type {
  Contact,
  ContactPhaseRow,
  ExternalTool,
  PipelineEvent,
  PipelineEventType,
} from '@shared/types/domain';

export interface ContactWithPhase extends Contact {
  phase: ContactPhaseRow['phase'];
  last_event_at: string | null;
}

export const CONTACTS_PAGE_SIZE = 50;

/** [F-3] Kontakte + Phase: serverseitig gesucht und paginiert.
 *  Suche läuft per ilike auf dem Server (nicht nur im geladenen
 *  Ausschnitt); ohne Suchbegriff wird seitenweise nachgeladen. */
export function useContacts(options: { search?: string; limit?: number } = {}) {
  const { profile } = useAuth();
  const search = options.search?.trim() ?? '';
  const limit = options.limit ?? CONTACTS_PAGE_SIZE;
  return useQuery({
    queryKey: ['contacts', profile?.id, search, limit],
    enabled: !!profile,
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<{ items: ContactWithPhase[]; hasMore: boolean }> => {
      let query = supabase
        .from('contacts')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(limit + 1); // +1 als hasMore-Sonde
      if (search) query = query.ilike('name', `%${search}%`);
      const contacts = await query;
      if (contacts.error) throw contacts.error;

      const hasMore = contacts.data.length > limit;
      const items = contacts.data.slice(0, limit);
      const ids = items.map((c) => c.id);
      const phases = ids.length
        ? await supabase.from('contact_phases').select('*').in('contact_id', ids)
        : { data: [], error: null };
      if (phases.error) throw phases.error;

      const phaseById = new Map((phases.data ?? []).map((p) => [p.contact_id, p]));
      return {
        items: items.map((c) => ({
          ...c,
          phase: (phaseById.get(c.id)?.phase ?? 'lead') as ContactWithPhase['phase'],
          last_event_at: phaseById.get(c.id)?.last_event_at ?? null,
        })),
        hasMore,
      };
    },
  });
}

/** Einzelner Kontakt mit eigener Query (nicht mehr über die Liste). */
export function useContact(contactId: string) {
  return useQuery({
    queryKey: ['contact', contactId],
    enabled: !!contactId,
    queryFn: async (): Promise<ContactWithPhase | null> => {
      const [contact, phase] = await Promise.all([
        supabase.from('contacts').select('*').eq('id', contactId).maybeSingle(),
        supabase.from('contact_phases').select('*').eq('contact_id', contactId).maybeSingle(),
      ]);
      if (contact.error) throw contact.error;
      if (!contact.data) return null;
      return {
        ...contact.data,
        phase: (phase.data?.phase ?? 'lead') as ContactWithPhase['phase'],
        last_event_at: phase.data?.last_event_at ?? null,
      };
    },
  });
}

export function useContactEvents(contactId: string) {
  return useQuery({
    queryKey: ['contact-events', contactId],
    queryFn: async (): Promise<PipelineEvent[]> => {
      const { data, error } = await supabase
        .from('pipeline_events')
        .select('*')
        .eq('contact_id', contactId)
        .order('occurred_at', { ascending: false });
      if (error) throw error;
      return data as PipelineEvent[];
    },
  });
}

export function useExternalTools() {
  const { membership } = useAuth();
  const orgId = membership?.org_id ?? null;
  return useQuery({
    queryKey: ['external-tools', orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<ExternalTool[]> => {
      const { data, error } = await supabase.from('external_tools').select('*').order('sort_order');
      if (error) throw error;
      return data as ExternalTool[];
    },
    staleTime: 5 * 60_000,
  });
}

interface ContactInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  next_step?: string | null;
  next_step_due?: string | null;
}

export function useContactMutations() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['contacts'] });
    void qc.invalidateQueries({ queryKey: ['contact'] });
    void qc.invalidateQueries({ queryKey: ['contact-events'] });
  };

  const createContact = useMutation({
    mutationFn: async (input: ContactInput): Promise<Contact> => {
      const clientMutationId = crypto.randomUUID();
      const payload = {
        ...input,
        owner_id: profile!.id,
        org_id: profile!.org_id,
        clientMutationId,
      };
      const result = await runOrEnqueue({
        type: 'contact_create',
        dedupeKey: `contact:create:${clientMutationId}`,
        payload,
        execute: async () => {
          const { data, error } = await supabase
            .from('contacts')
            .insert({ ...input, owner_id: profile!.id, org_id: profile!.org_id })
            .select()
            .single();
          if (error) throw error;
          return data;
        },
      });
      if (result.status === 'synced') return result.data;

      const now = new Date().toISOString();
      return {
        id: `local-${clientMutationId}`,
        name: input.name,
        phone: input.phone ?? null,
        email: input.email ?? null,
        notes: input.notes ?? null,
        next_step: input.next_step ?? null,
        next_step_due: input.next_step_due ?? null,
        owner_id: profile!.id,
        org_id: profile!.org_id,
        created_at: now,
        updated_at: now,
      };
    },
    onSuccess: invalidate,
  });

  const updateContact = useMutation({
    mutationFn: async ({ id, ...input }: ContactInput & { id: string }) => {
      const result = await runOrEnqueue({
        type: 'contact_update',
        dedupeKey: `contact:update:${id}`,
        payload: { id, ...input },
        execute: async () => {
          const { error } = await supabase.from('contacts').update(input).eq('id', id);
          if (error) throw error;
        },
      });
      return result.status;
    },
    onSuccess: invalidate,
  });

  const deleteContact = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('contacts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const addEvent = useMutation({
    mutationFn: async (input: {
      contactId: string;
      eventType: PipelineEventType;
      source?: string;
    }) => {
      const clientMutationId = crypto.randomUUID();
      const payload = {
        contact_id: input.contactId,
        org_id: profile!.org_id,
        event_type: input.eventType,
        source: input.source ?? 'manual',
        created_by: profile!.id,
        clientMutationId,
      };
      const result = await runOrEnqueue({
        type: 'pipeline_event',
        dedupeKey: `event:${input.contactId}:${input.eventType}:${clientMutationId}`,
        payload,
        execute: async () => {
          const { error } = await supabase.from('pipeline_events').insert({
            contact_id: input.contactId,
            org_id: profile!.org_id,
            event_type: input.eventType,
            source: input.source ?? 'manual',
            created_by: profile!.id,
          });
          if (error) throw error;
        },
      });
      return result.status;
    },
    onSuccess: invalidate,
  });

  const correctEvent = useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase.rpc('correct_pipeline_event', { p_event_id: eventId });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { createContact, updateContact, deleteContact, addEvent, correctEvent };
}
