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
  return {
    version: 1,
    conversations,
    activeId: typeof s.activeId === 'string' ? s.activeId : null,
    mobilePane: s.mobilePane === 'chat' ? 'chat' : 'list',
    updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : 0,
  };
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

export function findContactConversation(
  snap: WorkspaceSnapshot,
  contactId: string
): WorkspaceConversation | null {
  return (
    snap.conversations.find((c) => c.contactId === contactId && !c.archivedAt) ??
    snap.conversations.find((c) => c.contactId === contactId) ??
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
    title: input.title.trim() || 'Chat',
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

export function mergeServerConvos(
  snap: WorkspaceSnapshot,
  rows: Array<{ id: string; contact_id: string | null; created_at: string }>
): WorkspaceSnapshot {
  const known = new Set(
    snap.conversations.map((c) => c.serverConversationId).filter(Boolean) as string[]
  );
  const additions: WorkspaceConversation[] = [];
  for (const row of rows) {
    if (known.has(row.id)) continue;
    const ts = row.created_at || nowIso();
    additions.push({
      id: newLocalId(),
      serverConversationId: row.id,
      title: row.contact_id ? 'Contact' : 'Freier Chat',
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
  }
  if (!additions.length) return snap;
  return { ...snap, conversations: [...snap.conversations, ...additions] };
}
