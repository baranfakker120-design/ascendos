// Import idb helpers directly — the @shared/offline barrel eagerly loads
// React/Supabase modules and breaks Node 20 Vitest (no native WebSocket).
import { idbGet, idbSet } from '@shared/offline/idb';
import {
  ARCHIVE_AFTER_MS,
  EMPTY_WORKSPACE,
  newLocalId,
  type ConversationKind,
  type WorkspaceConversation,
  type WorkspaceSnapshot,
} from './types';

const LS_KEY = 'ascendos.coach-workspace.v1';
const IDB_KEY = 'ascendos.offline.coach-workspace.v1';

function nowIso(): string {
  return new Date().toISOString();
}

function isConversation(value: unknown): value is WorkspaceConversation {
  if (!value || typeof value !== 'object') return false;
  const c = value as WorkspaceConversation;
  return typeof c.id === 'string' && typeof c.title === 'string' && typeof c.kind === 'string';
}

export function normalizeSnapshot(raw: unknown): WorkspaceSnapshot {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_WORKSPACE };
  const s = raw as Partial<WorkspaceSnapshot>;
  const conversations = Array.isArray(s.conversations)
    ? s.conversations.filter(isConversation).map((c) => ({
        id: c.id,
        serverConversationId: c.serverConversationId ?? null,
        title: c.title,
        kind: c.kind,
        topic: c.topic ?? null,
        contactId: c.contactId ?? null,
        partnerName: c.partnerName ?? null,
        membershipId: c.membershipId ?? null,
        seedPrompt: c.seedPrompt ?? null,
        contextBrief: c.contextBrief ?? null,
        contextAttached: c.contextAttached === true,
        preview: c.preview ?? null,
        createdAt: c.createdAt ?? nowIso(),
        updatedAt: c.updatedAt ?? c.createdAt ?? nowIso(),
        lastOpenedAt: c.lastOpenedAt ?? c.updatedAt ?? c.createdAt ?? nowIso(),
        archivedAt: c.archivedAt ?? null,
      }))
    : [];
  return consolidateConversations({
    version: 1,
    conversations,
    activeId: typeof s.activeId === 'string' ? s.activeId : null,
    mobilePane: s.mobilePane === 'chat' ? 'chat' : 'list',
    updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : 0,
  });
}

/** Sync bootstrap — avoids flash before IDB resolves. */
export function readWorkspaceSync(): WorkspaceSnapshot {
  if (typeof window === 'undefined') return { ...EMPTY_WORKSPACE };
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return { ...EMPTY_WORKSPACE };
    return normalizeSnapshot(JSON.parse(raw));
  } catch {
    return { ...EMPTY_WORKSPACE };
  }
}

export async function readWorkspace(): Promise<WorkspaceSnapshot> {
  const fromIdb = await idbGet<WorkspaceSnapshot>(IDB_KEY);
  if (fromIdb) {
    const normalized = normalizeSnapshot(fromIdb);
    writeWorkspaceSync(normalized);
    return normalized;
  }
  return readWorkspaceSync();
}

function writeWorkspaceSync(snap: WorkspaceSnapshot): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(snap));
  } catch {
    // private mode
  }
}

export async function writeWorkspace(snap: WorkspaceSnapshot): Promise<WorkspaceSnapshot> {
  const next = { ...snap, updatedAt: Date.now() };
  writeWorkspaceSync(next);
  await idbSet(IDB_KEY, next);
  return next;
}

export function autoArchiveInactive(
  snap: WorkspaceSnapshot,
  now = Date.now(),
  ttl = ARCHIVE_AFTER_MS
): WorkspaceSnapshot {
  let changed = false;
  const conversations = snap.conversations.map((c) => {
    if (c.archivedAt) return c;
    if (c.id === snap.activeId) return c;
    const last = Date.parse(c.lastOpenedAt || c.updatedAt || c.createdAt);
    if (!Number.isFinite(last) || now - last < ttl) return c;
    changed = true;
    return { ...c, archivedAt: new Date(now).toISOString() };
  });
  return changed ? { ...snap, conversations } : snap;
}

export function findActive(snap: WorkspaceSnapshot): WorkspaceConversation | null {
  if (!snap.activeId) return null;
  return snap.conversations.find((c) => c.id === snap.activeId) ?? null;
}

export function findByServerId(
  snap: WorkspaceSnapshot,
  serverId: string
): WorkspaceConversation | null {
  return snap.conversations.find((c) => c.serverConversationId === serverId) ?? null;
}

export function findPersonConversation(
  snap: WorkspaceSnapshot,
  membershipId: string
): WorkspaceConversation | null {
  return (
    snap.conversations.find(
      (c) => c.kind === 'person' && c.membershipId === membershipId && !c.archivedAt
    ) ??
    snap.conversations.find((c) => c.kind === 'person' && c.membershipId === membershipId) ??
    null
  );
}

/** CRM contact chat only — never matches team_chat (membership) or free/ceo. */
export function findContactConversation(
  snap: WorkspaceSnapshot,
  contactId: string
): WorkspaceConversation | null {
  const isContactChat = (c: WorkspaceConversation) =>
    c.kind === 'person' && c.contactId === contactId && !c.membershipId;
  return (
    snap.conversations.find((c) => isContactChat(c) && !c.archivedAt) ??
    snap.conversations.find(isContactChat) ??
    null
  );
}

export function findCeoConversation(snap: WorkspaceSnapshot): WorkspaceConversation | null {
  return (
    snap.conversations.find((c) => c.kind === 'ceo' && !c.archivedAt) ??
    snap.conversations.find((c) => c.kind === 'ceo') ??
    null
  );
}

export function findFreeChatConversation(snap: WorkspaceSnapshot): WorkspaceConversation | null {
  return (
    snap.conversations.find((c) => c.kind === 'general' && !c.archivedAt) ??
    snap.conversations.find((c) => c.kind === 'general') ??
    null
  );
}

function conversationScore(c: WorkspaceConversation): number {
  const opened = Date.parse(c.lastOpenedAt || c.updatedAt || c.createdAt) || 0;
  return (c.serverConversationId ? 1_000_000_000_000 : 0) + opened;
}

/**
 * One contact = one conversation, one team member = one conversation.
 * Keeps the strongest row and drops duplicates (list + context isolation).
 */
export function consolidateConversations(snap: WorkspaceSnapshot): WorkspaceSnapshot {
  const contactBest = new Map<string, WorkspaceConversation>();
  const memberBest = new Map<string, WorkspaceConversation>();
  const others: WorkspaceConversation[] = [];
  let changed = false;

  for (const c of snap.conversations) {
    if (c.kind === 'person' && c.membershipId) {
      const prev = memberBest.get(c.membershipId);
      if (!prev) {
        memberBest.set(c.membershipId, c);
        continue;
      }
      changed = true;
      const winner = conversationScore(c) >= conversationScore(prev) ? c : prev;
      const loser = winner.id === c.id ? prev : c;
      memberBest.set(
        c.membershipId,
        winner.serverConversationId || !loser.serverConversationId
          ? winner
          : { ...winner, serverConversationId: loser.serverConversationId }
      );
      continue;
    }
    if (c.kind === 'person' && c.contactId && !c.membershipId) {
      const prev = contactBest.get(c.contactId);
      if (!prev) {
        contactBest.set(c.contactId, c);
        continue;
      }
      changed = true;
      const winner = conversationScore(c) >= conversationScore(prev) ? c : prev;
      const loser = winner.id === c.id ? prev : c;
      contactBest.set(
        c.contactId,
        winner.serverConversationId || !loser.serverConversationId
          ? winner
          : { ...winner, serverConversationId: loser.serverConversationId }
      );
      continue;
    }
    others.push(c);
  }

  if (!changed) return snap;

  const conversations = [
    ...others,
    ...Array.from(contactBest.values()),
    ...Array.from(memberBest.values()),
  ];
  const ids = new Set(conversations.map((c) => c.id));
  let activeId = snap.activeId && ids.has(snap.activeId) ? snap.activeId : null;
  if (!activeId && snap.activeId) {
    const dropped = snap.conversations.find((c) => c.id === snap.activeId);
    if (dropped?.kind === 'person' && dropped.membershipId) {
      activeId = memberBest.get(dropped.membershipId)?.id ?? null;
    } else if (dropped?.kind === 'person' && dropped.contactId) {
      activeId = contactBest.get(dropped.contactId)?.id ?? null;
    }
  }
  return { ...snap, conversations, activeId };
}

export function createConversation(
  snap: WorkspaceSnapshot,
  input: {
    title: string;
    kind: ConversationKind;
    topic?: string | null;
    contactId?: string | null;
    partnerName?: string | null;
    membershipId?: string | null;
    seedPrompt?: string | null;
    contextBrief?: string | null;
    serverConversationId?: string | null;
  }
): { snap: WorkspaceSnapshot; conversation: WorkspaceConversation } {
  const ts = nowIso();
  const conversation: WorkspaceConversation = {
    id: newLocalId(),
    serverConversationId: input.serverConversationId ?? null,
    title: input.title.trim() || '',
    kind: input.kind,
    topic: input.topic ?? null,
    contactId: input.contactId ?? null,
    partnerName: input.partnerName ?? null,
    membershipId: input.membershipId ?? null,
    seedPrompt: input.seedPrompt ?? null,
    contextBrief: input.contextBrief ?? null,
    contextAttached: false,
    preview: null,
    createdAt: ts,
    updatedAt: ts,
    lastOpenedAt: ts,
    archivedAt: null,
  };
  const next: WorkspaceSnapshot = {
    ...snap,
    conversations: [conversation, ...snap.conversations],
    activeId: conversation.id,
    mobilePane: 'chat',
  };
  return { snap: next, conversation };
}

export function openConversation(snap: WorkspaceSnapshot, id: string): WorkspaceSnapshot {
  const ts = nowIso();
  return {
    ...snap,
    activeId: id,
    mobilePane: 'chat',
    conversations: snap.conversations.map((c) =>
      c.id === id ? { ...c, lastOpenedAt: ts, archivedAt: null } : c
    ),
  };
}

export function patchConversation(
  snap: WorkspaceSnapshot,
  id: string,
  patch: Partial<WorkspaceConversation>
): WorkspaceSnapshot {
  const ts = nowIso();
  return {
    ...snap,
    conversations: snap.conversations.map((c) =>
      c.id === id ? { ...c, ...patch, updatedAt: ts } : c
    ),
  };
}

export function setMobilePane(snap: WorkspaceSnapshot, pane: 'list' | 'chat'): WorkspaceSnapshot {
  return { ...snap, mobilePane: pane };
}

export function bindServerId(
  snap: WorkspaceSnapshot,
  localId: string,
  serverConversationId: string
): WorkspaceSnapshot {
  // Deduplicate: if another local row already points at this server id, drop the duplicate.
  const conversations = snap.conversations
    .filter((c) => c.id === localId || c.serverConversationId !== serverConversationId)
    .map((c) => (c.id === localId ? { ...c, serverConversationId, updatedAt: nowIso() } : c));
  return { ...snap, conversations };
}

/** Permanently remove a local conversation row (and clear active if needed). */
export function removeConversation(snap: WorkspaceSnapshot, id: string): WorkspaceSnapshot {
  const conversations = snap.conversations.filter((c) => c.id !== id);
  if (conversations.length === snap.conversations.length) return snap;
  const activeId =
    snap.activeId === id
      ? (conversations.find((c) => !c.archivedAt)?.id ?? conversations[0]?.id ?? null)
      : snap.activeId;
  return {
    ...snap,
    conversations,
    activeId,
    mobilePane: activeId ? (snap.activeId === id ? 'list' : snap.mobilePane) : 'list',
  };
}

export function mergeServerConvos(
  snap: WorkspaceSnapshot,
  rows: Array<{ id: string; contact_id: string | null; created_at: string }>
): WorkspaceSnapshot {
  const liveIds = new Set(rows.map((r) => r.id));
  let changed = false;

  // Drop bindings to server threads that no longer exist (demo wipe / delete).
  let conversations = snap.conversations.map((c) => {
    if (!c.serverConversationId || liveIds.has(c.serverConversationId)) return c;
    changed = true;
    return { ...c, serverConversationId: null };
  });

  const known = new Set(
    conversations.map((c) => c.serverConversationId).filter(Boolean) as string[]
  );
  const additions: WorkspaceConversation[] = [];
  for (const row of rows) {
    if (known.has(row.id)) continue;

    // Attach to existing CRM contact chat instead of creating a duplicate list row.
    if (row.contact_id) {
      const existingIdx = conversations.findIndex(
        (c) => c.kind === 'person' && c.contactId === row.contact_id && !c.membershipId
      );
      if (existingIdx >= 0) {
        const existing = conversations[existingIdx];
        if (!existing.serverConversationId) {
          conversations = conversations.map((c, i) =>
            i === existingIdx ? { ...c, serverConversationId: row.id, updatedAt: nowIso() } : c
          );
          known.add(row.id);
          changed = true;
        }
        // Already bound (or bound to another server id): never list a second contact row.
        continue;
      }
    } else {
      // Bind first unbound free chat rather than spawning a twin.
      const freeIdx = conversations.findIndex(
        (c) => c.kind === 'general' && !c.serverConversationId
      );
      if (freeIdx >= 0) {
        conversations = conversations.map((c, i) =>
          i === freeIdx ? { ...c, serverConversationId: row.id, updatedAt: nowIso() } : c
        );
        known.add(row.id);
        changed = true;
        continue;
      }
    }

    const ts = row.created_at || nowIso();
    additions.push({
      id: newLocalId(),
      serverConversationId: row.id,
      // Title is generated at render time from kind — never hardcode a locale.
      title: '',
      kind: row.contact_id ? 'person' : 'general',
      topic: null,
      contactId: row.contact_id,
      partnerName: null,
      membershipId: null,
      seedPrompt: null,
      contextBrief: null,
      contextAttached: false,
      preview: null,
      createdAt: ts,
      updatedAt: ts,
      lastOpenedAt: ts,
      archivedAt: null,
    });
    known.add(row.id);
    changed = true;
  }
  if (!changed) return snap;
  const merged: WorkspaceSnapshot = {
    ...snap,
    conversations: additions.length ? [...conversations, ...additions] : conversations,
  };
  return consolidateConversations(merged);
}

/** True when the edge function reported a missing / wiped conversation. */
export function isConversationMissingError(message: string): boolean {
  return /konversation nicht gefunden|conversation not found|conversation introuvable|conversazione non trovata|konuşma bulunamadı|nie znaleziono rozmowy/i.test(
    message
  );
}
