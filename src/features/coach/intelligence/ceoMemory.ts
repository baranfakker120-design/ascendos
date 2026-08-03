import type { CeoMemoryOutcome, CeoRecommendationMemory } from './types';

const CEO_KEY = 'ascendos.coach-ceo-memory.v1';

function readAll(): CeoRecommendationMemory[] {
  try {
    const raw = localStorage.getItem(CEO_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CeoRecommendationMemory[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(rows: CeoRecommendationMemory[]) {
  localStorage.setItem(CEO_KEY, JSON.stringify(rows.slice(0, 300)));
}

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `ceo-${Date.now()}`;
}

/**
 * CEO memory — what was warned, solved, repeated, ignored, or improved.
 * Local only; no backend.
 */
export function listCeoRecommendationMemory(): CeoRecommendationMemory[] {
  return readAll();
}

export function recordCeoRecommendation(
  recommendationKey: string,
  text: string,
  outcome: CeoMemoryOutcome
): CeoRecommendationMemory {
  const all = readAll();
  const existing = all.find((r) => r.recommendationKey === recommendationKey);
  const now = new Date().toISOString();
  if (existing) {
    const next: CeoRecommendationMemory = {
      ...existing,
      text,
      outcome,
      updatedAt: now,
    };
    writeAll(all.map((r) => (r.id === existing.id ? next : r)));
    return next;
  }
  const created: CeoRecommendationMemory = {
    id: uid(),
    recommendationKey,
    text,
    outcome,
    createdAt: now,
    updatedAt: now,
  };
  writeAll([created, ...all]);
  return created;
}

/** Skip low-value repeats — critical always surfaces. */
export function shouldSurfaceRecommendation(
  recommendationKey: string,
  severity: 'critical' | 'high' | 'medium' | 'low',
  now = Date.now()
): boolean {
  if (severity === 'critical') return true;
  const row = readAll().find((r) => r.recommendationKey === recommendationKey);
  if (!row) return true;
  if (row.outcome === 'solved' || row.outcome === 'improved') {
    const age = now - new Date(row.updatedAt).getTime();
    return age > 7 * 86_400_000;
  }
  if (row.outcome === 'ignored' || row.outcome === 'shown') {
    const age = now - new Date(row.updatedAt).getTime();
    // Don't nag: wait a day before repeating the same tip.
    return age > 86_400_000;
  }
  return true;
}

export function filterManagerMessagesByMemory<
  T extends { id: string; severity: 'critical' | 'high' | 'medium' | 'low' },
>(messages: T[]): T[] {
  return messages.filter((m) => shouldSurfaceRecommendation(m.id, m.severity));
}
