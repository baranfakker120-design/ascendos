import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  autoArchiveInactive,
  bindServerId,
  createConversation,
  findActive,
  findCeoConversation,
  findContactConversation,
  findPersonConversation,
  mergeServerConvos,
  openConversation,
  patchConversation,
  readWorkspace,
  readWorkspaceSync,
  setMobilePane,
  writeWorkspace,
} from './store';
import { useCoachConvoIndex } from './convoIndexApi';
import { filterConversations, sortConversations } from './search';
import type { ConversationKind, WorkspaceConversation, WorkspaceSnapshot } from './types';

type Updater = WorkspaceSnapshot | ((prev: WorkspaceSnapshot) => WorkspaceSnapshot);

export function useCoachWorkspace() {
  const [snap, setSnap] = useState<WorkspaceSnapshot>(() =>
    autoArchiveInactive(readWorkspaceSync())
  );
  const [hydrated, setHydrated] = useState(false);
  const [search, setSearch] = useState('');
  const writing = useRef(Promise.resolve());
  const snapRef = useRef(snap);
  snapRef.current = snap;

  const persist = useCallback((updater: Updater) => {
    setSnap((prev) => {
      const draft = typeof updater === 'function' ? updater(prev) : updater;
      const archived = autoArchiveInactive(draft);
      writing.current = writing.current.then(async () => {
        await writeWorkspace(archived);
      });
      snapRef.current = archived;
      return archived;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const fromIdb = autoArchiveInactive(await readWorkspace());
      if (cancelled) return;
      setSnap(fromIdb);
      snapRef.current = fromIdb;
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const { data: serverIndex } = useCoachConvoIndex(hydrated);
  useEffect(() => {
    if (!serverIndex?.length) return;
    persist((prev) => {
      const merged = mergeServerConvos(prev, serverIndex);
      return merged === prev ? prev : merged;
    });
  }, [serverIndex, persist]);

  const active = useMemo(() => findActive(snap), [snap]);

  const visible = useMemo(() => {
    const sorted = sortConversations(snap.conversations);
    return filterConversations(sorted, search);
  }, [snap.conversations, search]);

  const activeList = useMemo(() => visible.filter((c) => !c.archivedAt), [visible]);
  const archivedList = useMemo(() => visible.filter((c) => !!c.archivedAt), [visible]);

  const open = useCallback(
    (id: string) => {
      persist((prev) => openConversation(prev, id));
    },
    [persist]
  );

  const showList = useCallback(() => {
    persist((prev) => setMobilePane(prev, 'list'));
  }, [persist]);

  const updateConversation = useCallback(
    (id: string, patch: Partial<WorkspaceConversation>) => {
      persist((prev) => patchConversation(prev, id, patch));
    },
    [persist]
  );

  const updateActive = useCallback(
    (patch: Partial<WorkspaceConversation>) => {
      const id = snapRef.current.activeId;
      if (!id) return;
      updateConversation(id, patch);
    },
    [updateConversation]
  );

  const ensureKind = useCallback(
    (
      kind: ConversationKind,
      opts: {
        title: string;
        topic?: string | null;
        contactId?: string | null;
        partnerName?: string | null;
        membershipId?: string | null;
        seedPrompt?: string | null;
        contextBrief?: string | null;
        serverConversationId?: string | null;
        forceNew?: boolean;
      }
    ) => {
      persist((prev) => {
        if (!opts.forceNew) {
          if (kind === 'ceo') {
            const existing = findCeoConversation(prev);
            if (existing) {
              let next = openConversation(prev, existing.id);
              if (opts.seedPrompt || opts.contextBrief) {
                next = patchConversation(next, existing.id, {
                  seedPrompt: opts.seedPrompt ?? existing.seedPrompt,
                  contextBrief: opts.contextBrief ?? existing.contextBrief,
                });
              }
              return next;
            }
          }
          if (kind === 'person' && opts.membershipId) {
            const existing = findPersonConversation(prev, opts.membershipId);
            if (existing) {
              let next = openConversation(prev, existing.id);
              next = patchConversation(next, existing.id, {
                title: opts.title || existing.title,
                partnerName: opts.partnerName ?? existing.partnerName,
                seedPrompt: opts.seedPrompt ?? existing.seedPrompt,
                contextBrief: opts.contextBrief ?? existing.contextBrief,
              });
              return next;
            }
          }
          if (opts.contactId) {
            const existing = findContactConversation(prev, opts.contactId);
            if (existing) return openConversation(prev, existing.id);
          }
          if (opts.serverConversationId) {
            const existing = prev.conversations.find(
              (c) => c.serverConversationId === opts.serverConversationId
            );
            if (existing) return openConversation(prev, existing.id);
          }
        }

        return createConversation(prev, {
          kind,
          title: opts.title,
          topic: opts.topic,
          contactId: opts.contactId,
          partnerName: opts.partnerName,
          membershipId: opts.membershipId,
          seedPrompt: opts.seedPrompt,
          contextBrief: opts.contextBrief,
          serverConversationId: opts.serverConversationId,
        }).snap;
      });
    },
    [persist]
  );

  const startNew = useCallback(
    (kind: ConversationKind, title: string) => {
      ensureKind(kind, { title, forceNew: kind !== 'ceo' });
    },
    [ensureKind]
  );

  const bindServer = useCallback(
    (localId: string, serverConversationId: string) => {
      persist((prev) => bindServerId(prev, localId, serverConversationId));
    },
    [persist]
  );

  const afterSend = useCallback(
    (localId: string, serverConversationId: string, preview: string, attached: boolean) => {
      persist((prev) => {
        let next = bindServerId(prev, localId, serverConversationId);
        next = patchConversation(next, localId, {
          preview: preview.slice(0, 140),
          ...(attached ? { contextAttached: true } : {}),
        });
        return next;
      });
    },
    [persist]
  );

  return {
    snap,
    hydrated,
    active,
    search,
    setSearch,
    activeList,
    archivedList,
    open,
    showList,
    updateActive,
    updateConversation,
    ensureKind,
    startNew,
    bindServer,
    afterSend,
  };
}

export type CoachWorkspaceApi = ReturnType<typeof useCoachWorkspace>;
