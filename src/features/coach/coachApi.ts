import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@shared/api/supabase';
import { readStoredLocale, type AppLocale } from '@shared/lib/locale';
import { createCoachTranslator } from './i18n';
import { isConversationMissingError } from './workspace/store';

export interface CoachMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

const messagesKey = (conversationId: string | null) =>
  ['coach-messages', conversationId ?? '__pending__'] as const;

export function useCoachMessages(conversationId: string | null) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: messagesKey(conversationId),
    queryFn: async (): Promise<CoachMessage[]> => {
      // Pending / brand-new thread: serve optimistic cache only.
      if (!conversationId) {
        return qc.getQueryData<CoachMessage[]>(messagesKey(null)) ?? [];
      }
      const { data, error } = await supabase
        .from('coach_messages')
        .select('id, role, content, created_at')
        .eq('convo_id', conversationId)
        .order('created_at');
      if (error) throw error;
      return data as CoachMessage[];
    },
    // Keep prior messages visible while refetching after send.
    placeholderData: (prev) => prev,
  });
}

interface SendInput {
  message: string;
  /** Optional bubble text when `message` includes a hidden context brief. */
  displayContent?: string;
  conversationId: string | null;
  contactId: string | null;
}

interface SendResult {
  conversationId: string;
  agentKey: string;
  reply: string;
}

type SendContext = {
  previous: CoachMessage[] | undefined;
  optimisticKey: ReturnType<typeof messagesKey>;
  tempUserId: string;
};

async function invokeCoachChat(input: {
  message: string;
  conversationId: string | null;
  contactId: string | null;
  locale: AppLocale;
}): Promise<SendResult> {
  const { data, error } = await supabase.functions.invoke('coach-chat', {
    body: {
      message: input.message,
      conversationId: input.conversationId,
      contactId: input.contactId,
      locale: input.locale,
    },
  });
  if (error) {
    const context = await (error as { context?: Response }).context?.json?.().catch(() => null);
    const message =
      (context as { error?: string } | null)?.error ??
      createCoachTranslator(input.locale)('chat.unreachable');
    throw new Error(message);
  }
  return data as SendResult;
}

export function useSendToCoach() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SendInput): Promise<SendResult> => {
      // Resolve at send time so a language switch never leaves the mutation
      // with a stale locale captured by an earlier render.
      const locale = readStoredLocale();
      try {
        return await invokeCoachChat({
          message: input.message,
          conversationId: input.conversationId,
          contactId: input.contactId,
          locale,
        });
      } catch (err) {
        // Stale server id after wipe / delete — retry as a brand-new thread.
        const msg = err instanceof Error ? err.message : String(err);
        if (input.conversationId && isConversationMissingError(msg)) {
          return await invokeCoachChat({
            message: input.message,
            conversationId: null,
            contactId: input.contactId,
            locale,
          });
        }
        throw err;
      }
    },
    onMutate: async (input): Promise<SendContext> => {
      const optimisticKey = messagesKey(input.conversationId);
      await qc.cancelQueries({ queryKey: optimisticKey });
      const previous = qc.getQueryData<CoachMessage[]>(optimisticKey);
      const tempUserId = `temp-user-${Date.now()}`;
      const optimisticUser: CoachMessage = {
        id: tempUserId,
        role: 'user',
        content: input.displayContent ?? input.message,
        created_at: new Date().toISOString(),
      };
      qc.setQueryData<CoachMessage[]>(optimisticKey, [...(previous ?? []), optimisticUser]);
      return { previous, optimisticKey, tempUserId };
    },
    onError: (_err, input, ctx) => {
      if (!ctx) return;
      qc.setQueryData(ctx.optimisticKey, ctx.previous);
      // If we were on a real convo id, also restore that key.
      if (input.conversationId) {
        qc.setQueryData(messagesKey(input.conversationId), ctx.previous);
      }
    },
    onSuccess: (result, input, ctx) => {
      const targetKey = messagesKey(result.conversationId);
      const sourceKey = ctx?.optimisticKey ?? messagesKey(input.conversationId);

      const fromSource = qc.getQueryData<CoachMessage[]>(sourceKey) ?? [];
      const withoutTemp = fromSource.filter((m) => !m.id.startsWith('temp-'));
      const visibleUser = input.displayContent ?? input.message;
      const hasUser = withoutTemp.some((m) => m.role === 'user' && m.content === visibleUser);
      const next: CoachMessage[] = [
        ...withoutTemp,
        ...(hasUser
          ? []
          : [
              {
                id: `local-user-${Date.now()}`,
                role: 'user' as const,
                content: visibleUser,
                created_at: new Date().toISOString(),
              },
            ]),
        {
          id: `local-assistant-${Date.now()}`,
          role: 'assistant' as const,
          content: result.reply,
          created_at: new Date().toISOString(),
        },
      ];

      qc.setQueryData(targetKey, next);
      if (sourceKey[1] !== targetKey[1]) {
        qc.removeQueries({ queryKey: sourceKey });
      }

      // Reconcile with server IDs without blanking the thread.
      void qc.invalidateQueries({ queryKey: targetKey });
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
      return {
        ...contact.data,
        phase: (phase.data?.phase ?? 'lead') as import('@shared/types/domain').ContactPhase,
      };
    },
  });
}
