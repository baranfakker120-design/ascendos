/** Local coach conversation workspace — additive metadata over server threads. */

export type ConversationKind =
  'ceo' | 'person' | 'marketing' | 'recruiting' | 'story' | 'leadership' | 'general';

export const CONVERSATION_KINDS: readonly ConversationKind[] = [
  'ceo',
  'person',
  'marketing',
  'recruiting',
  'story',
  'leadership',
  'general',
] as const;

export type WorkspaceConversation = {
  /** Stable local id (never reuse). */
  id: string;
  /** Server `coach_convos.id` once the first message is sent. */
  serverConversationId: string | null;
  title: string;
  kind: ConversationKind;
  topic: string | null;
  contactId: string | null;
  partnerName: string | null;
  membershipId: string | null;
  /** Composer seed when opening from genealogy / new chat. */
  seedPrompt: string | null;
  /** Optional brief attached once on first send (client-only memory aid). */
  contextBrief: string | null;
  contextAttached: boolean;
  preview: string | null;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
  /** Set when inactive — hidden from the primary list until reopened. */
  archivedAt: string | null;
};

export type WorkspaceSnapshot = {
  version: 1;
  conversations: WorkspaceConversation[];
  activeId: string | null;
  mobilePane: 'list' | 'chat';
  updatedAt: number;
};

export const ARCHIVE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

export const EMPTY_WORKSPACE: WorkspaceSnapshot = {
  version: 1,
  conversations: [],
  activeId: null,
  mobilePane: 'list',
  updatedAt: 0,
};

export function newLocalId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `ws-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
