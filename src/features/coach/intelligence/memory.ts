import type { CoachMemoryEntry } from './types';

const MEMORY_KEY = 'ascendos.coach-memory.v1';

function readAll(): CoachMemoryEntry[] {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CoachMemoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(rows: CoachMemoryEntry[]) {
  localStorage.setItem(MEMORY_KEY, JSON.stringify(rows.slice(0, 500)));
}

/**
 * Lightweight AI memory for objections, promises, meetings, onboarding notes.
 * Client-side until a durable store exists — no schema change.
 */
export function listCoachMemory(filter?: {
  contactId?: string;
  membershipId?: string;
}): CoachMemoryEntry[] {
  const all = readAll();
  if (!filter) return all;
  return all.filter((row) => {
    if (filter.contactId && row.contactId !== filter.contactId) return false;
    if (filter.membershipId && row.membershipId !== filter.membershipId) return false;
    return true;
  });
}

export function rememberCoachFact(
  input: Omit<CoachMemoryEntry, 'id' | 'createdAt'>
): CoachMemoryEntry {
  const entry: CoachMemoryEntry = {
    ...input,
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `mem-${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
  writeAll([entry, ...readAll()]);
  return entry;
}

export function forgetCoachFact(id: string): void {
  writeAll(readAll().filter((r) => r.id !== id));
}
