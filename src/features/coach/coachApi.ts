import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@shared/api/supabase';

export interface CoachMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export function useCoachMessages(conversationId: string | null) {
  return useQuery({
    queryKey: ['coach-messages', conversationId],
    enabled: !!conversationId,
    queryFn: async (): Promise<CoachMessage[]> => {
      const { data, error } = await supabase
        .from('coach_messages')
        .select('id, role, content, created_at')
        .eq('convo_id', conversationId!)
        .order('created_at');
      if (error) throw error;
      return data as CoachMessage[];
    },
  });
}

interface SendInput {
  message: string;
  conversationId: string | null;
  contactId: string | null;
}

interface SendResult {
  conversationId: string;
  agentKey: string;
  reply: string;
}

export function useSendToCoach() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SendInput): Promise<SendResult> => {
      const { data, error } = await supabase.functions.invoke('coach-chat', {
        body: {
          message: input.message,
          conversationId: input.conversationId,
          contactId: input.contactId,
        },
      });
      if (error) {
        // Fehlertext der Function (z. B. Tageslimit) durchreichen
        const context = await (error as { context?: Response }).context?.json?.().catch(() => null);
        throw new Error(context?.error ?? 'Ascent ist gerade nicht erreichbar.');
      }
      return data as SendResult;
    },
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ['coach-messages', result.conversationId] });
    },
  });
}

/** [F-1] Jüngste Konversation laden (passend zum Kontakt-Kontext),
 *  damit ein Tab-Wechsel nie den Gesprächsfaden verliert. */
export function useLatestConvo(contactId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['coach-latest-convo', contactId],
    enabled,
    queryFn: async (): Promise<string | null> => {
      let query = supabase
        .from('coach_convos')
        .select('id')
        .order('created_at', { ascending: false })
        .limit(1);
      query = contactId ? query.eq('contact_id', contactId) : query.is('contact_id', null);
      const { data, error } = await query;
      if (error) throw error;
      return data?.[0]?.id ?? null;
    },
  });
}

/** Kontakt-Kontext für das Banner — bewusst eigene Query statt Import
 *  aus dem contacts-Feature (Feature-Grenzen, ADR-012). */
export function useCoachContact(contactId: string | null) {
  return useQuery({
    queryKey: ['coach-contact', contactId],
    enabled: !!contactId,
    queryFn: async () => {
      const [contact, phase] = await Promise.all([
        supabase.from('contacts').select('id, name').eq('id', contactId!).single(),
        supabase.from('contact_phases').select('phase').eq('contact_id', contactId!).single(),
      ]);
      if (contact.error) throw contact.error;
      return { ...contact.data, phase: phase.data?.phase ?? 'lead' };
    },
  });
}
