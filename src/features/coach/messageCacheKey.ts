/** Stable React Query keys for coach message threads. */

/**
 * Pending (no server id yet) threads MUST be keyed by local workspace id —
 * otherwise every unbound contact chat shares `__pending__` and mixes histories.
 */
export function messagesKey(conversationId: string | null, localId?: string | null) {
  if (conversationId) return ['coach-messages', conversationId] as const;
  if (localId) return ['coach-messages', `local:${localId}`] as const;
  return ['coach-messages', '__pending__'] as const;
}
