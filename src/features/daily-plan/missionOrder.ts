import type { DailyPlanItem } from '@shared/types/domain';

/**
 * Lokale Umsortierung (ADR-006): reine Darstellungslogik im Client,
 * deterministisch und sofort. Die Wahrheit (Status) liegt in der DB.
 *
 * Regeln:
 * - Aktuelle Mission = erste offene (pending) nach Position;
 *   sind alle offenen erledigt, rücken die verschobenen (deferred) nach.
 * - "Später heute" wandert ans Ende der Warteschlange, bleibt sichtbar.
 * - done/skipped bleiben sichtbar (abgehakt), zählen aber nicht mehr.
 */
export interface OrderedMissions {
  current: DailyPlanItem | null;
  queue: DailyPlanItem[]; // wartende Missionen nach der aktuellen
  resolved: DailyPlanItem[]; // done + skipped, in Erledigungs-Reihenfolge
  dayComplete: boolean;
}

export function orderMissions(items: DailyPlanItem[]): OrderedMissions {
  const byPosition = [...items].sort((a, b) => a.position - b.position);
  const pending = byPosition.filter((i) => i.status === 'pending');
  const deferred = byPosition.filter((i) => i.status === 'deferred');
  const resolved = [...items]
    .filter((i) => i.status === 'done' || i.status === 'skipped')
    .sort((a, b) => (a.resolved_at ?? '').localeCompare(b.resolved_at ?? ''));

  const workQueue = [...pending, ...deferred];
  const current = workQueue[0] ?? null;

  return {
    current,
    queue: workQueue.slice(1),
    resolved,
    dayComplete: workQueue.length === 0 && items.length > 0,
  };
}

/** Fortschritt für die Anzeige: erledigt / relevante Gesamtzahl. */
export function missionProgress(items: DailyPlanItem[]): { done: number; total: number } {
  const total = items.filter((i) => i.status !== 'skipped').length;
  const done = items.filter((i) => i.status === 'done').length;
  return { done, total };
}
