import type { PersistedClient, Persister } from '@tanstack/query-persist-client-core';
import { idbDel, idbGet, idbSet } from './idb';
import { OFFLINE_KEYS } from './keys';

/**
 * Persist React Query cache in IndexedDB.
 * Survives refresh, tab kill, lock screen, and process death.
 */
export function createIdbQueryPersister(key = OFFLINE_KEYS.queryCache): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      await idbSet(key, client);
    },
    restoreClient: async () => {
      return idbGet<PersistedClient>(key);
    },
    removeClient: async () => {
      await idbDel(key);
    },
  };
}

/** Only persist read caches — never mutate payloads / secrets beyond session. */
export function shouldPersistQuery(queryKey: readonly unknown[]): boolean {
  const root = String(queryKey[0] ?? '');
  const allow = new Set([
    'contacts',
    'contact',
    'contact-events',
    'daily-plan',
    'external-tools',
    'organization-profile',
    'profile',
    'profile-detail',
    'genealogy-tree',
    'leader-dashboard',
    'team-insights',
    'smart-warnings',
    'team-leader-progress',
    'leaderboard',
    'ap-tasks',
    'ascend-stories',
    'live-coaching-events',
    'knowledge-center-articles',
    'knowledge-docs',
    'firstline-progress',
    'coach-messages',
    'coach-latest-convo',
    'coach-contact',
    'coach-convos-index',
    'journey',
    'journey-today',
    'qualifications',
    'leadership-note',
    'memberships',
  ]);
  return allow.has(root);
}
