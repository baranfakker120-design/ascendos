import { del, get, set, update } from 'idb-keyval';

/** Thin IndexedDB helpers — durable across refresh, crash, and lock screen. */
export async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    return await get<T>(key);
  } catch {
    return undefined;
  }
}

export async function idbSet<T>(key: string, value: T): Promise<void> {
  try {
    await set(key, value);
  } catch {
    // Quota / private mode — best effort; never throw into UI.
  }
}

export async function idbDel(key: string): Promise<void> {
  try {
    await del(key);
  } catch {
    // ignore
  }
}

export async function idbUpdate<T>(
  key: string,
  updater: (prev: T | undefined) => T
): Promise<void> {
  try {
    await update<T | undefined>(key, (prev) => updater(prev));
  } catch {
    // ignore
  }
}
