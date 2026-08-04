import { idbGet, idbSet } from './idb';
import { OFFLINE_KEYS } from './keys';

export type DraftMap = Record<string, { updatedAt: number; value: unknown }>;

async function readAll(): Promise<DraftMap> {
  return (await idbGet<DraftMap>(OFFLINE_KEYS.drafts)) ?? {};
}

async function writeAll(map: DraftMap): Promise<void> {
  await idbSet(OFFLINE_KEYS.drafts, map);
}

export async function saveDraft(scope: string, value: unknown): Promise<void> {
  const map = await readAll();
  map[scope] = { updatedAt: Date.now(), value };
  await writeAll(map);
}

export async function loadDraft<T>(scope: string): Promise<T | null> {
  const map = await readAll();
  const entry = map[scope];
  return entry ? (entry.value as T) : null;
}

export async function clearDraft(scope: string): Promise<void> {
  const map = await readAll();
  if (!(scope in map)) return;
  delete map[scope];
  await writeAll(map);
}

export async function draftUpdatedAt(scope: string): Promise<number | null> {
  const map = await readAll();
  return map[scope]?.updatedAt ?? null;
}
