import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  autoArchiveInactive,
  bindServerId,
  createConversation,
  findActive,
  findCeoConversation,
  findContactConversation,
  findFreeChatConversation,
  findPersonConversation,
  mergeServerConvos,
  openConversation,
  patchConversation,
  readWorkspace,
  readWorkspaceSync,
  removeConversation,
  setMobilePane,
  writeWorkspace,
} from './store';
import { useCoachConvoIndex } from './convoIndexApi';
import { filterConversations, sortConversations } from './search';
import type { ConversationKind, WorkspaceConversation, WorkspaceSnapshot } from './types';
import { supabase } from '@shared/api/supabase';
import { useQueryClient } from '@tanstack/react-query';

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
  const queryClient = useQueryClient();

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

  const { data: serverIndex, isSuccess: serverIndexReady } = useCoachConvoIndex(hydrated);
  useEffect(() => {
    // Run on empty arrays too — demo wipe must clear stale serverConversationId bindings.
    if (!serverIndexReady || serverIndex === undefined) return;
    persist((prev) => {
      const merged = mergeServerConvos(prev, serverIndex);
      return merged === prev ? prev : merged;
    });
  }, [serverIndex, serverIndexReady, persist]);

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
          if (kind === 'general') {
            const existing = findFreeChatConversation(prev);
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
          // Team chat: keyed by membershipId — never share with CRM contact chats.
          if (kind === 'person' && opts.membershipId) {
            const existing = findPersonConversation(prev, opts.membershipId);
            if (existing) {
              let next = openConversation(prev, existing.id);
              next = patchConversation(next, existing.id, {
                title: opts.title || existing.title,
                partnerName: opts.partnerName ?? existing.partnerName,
                membershipId: opts.membershipId,
                seedPrompt: opts.seedPrompt ?? existing.seedPrompt,
                contextBrief: opts.contextBrief ?? existing.contextBrief,
              });
              return next;
            }
          }
          // Contact chat: keyed by contactId — one conversation per contact.
          if (kind === 'person' && opts.contactId && !opts.membershipId) {
            const existing = findContactConversation(prev, opts.contactId);
            if (existing) {
              let next = openConversation(prev, existing.id);
              next = patchConversation(next, existing.id, {
                title: opts.title || existing.title,
                partnerName: opts.partnerName ?? existing.partnerName,
                contactId: opts.contactId,
                seedPrompt: opts.seedPrompt ?? existing.seedPrompt,
                contextBrief: opts.contextBrief ?? existing.contextBrief,
              });
              return next;
            }
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
          contactId: opts.membershipId ? null : (opts.contactId ?? null),
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
      // Singletons stay singletons. Topic kinds may open a fresh sheet.
      // Contact / team chats are created only via deep links with identity keys.
      if (kind === 'ceo' || kind === 'general') {
        ensureKind(kind, { title, forceNew: false });
        return;
      }
      ensureKind(kind, { title, forceNew: true });
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

  const remove = useCallback(
    async (localId: string) => {
      const row = snapRef.current.conversations.find((c) => c.id === localId);
      const serverId = row?.serverConversationId ?? null;
      if (serverId) {
        const { error } = await supabase.from('coach_convos').delete().eq('id', serverId);
        if (error) throw error;
        queryClient.removeQueries({ queryKey: ['coach-messages', serverId] });
        await queryClient.invalidateQueries({ queryKey: ['coach-convos-index'] });
      }
      queryClient.removeQueries({ queryKey: ['coach-messages', `local:${localId}`] });
      persist((prev) => removeConversation(prev, localId));
    },
    [persist, queryClient]
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
    remove,
  };
}

export type CoachWorkspaceApi = ReturnType<typeof useCoachWorkspace>;
