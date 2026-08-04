import type { ProactiveSuggestion } from './proactiveSuggestions';

export interface DayCoachContext {
  priorityTitle?: string | null;
  diffTitles?: string[];
  isClosed?: boolean;
  tomorrowSeed?: string[];
}

/**
 * Sprint 5 · L6 — Coach suggestions follow the day's one action, not chat menus.
 */
export function prioritizeSuggestionsForDay(
  suggestions: ProactiveSuggestion[],
  ctx: DayCoachContext
): ProactiveSuggestion[] {
  const needles = [
    ctx.priorityTitle,
    ...(ctx.diffTitles ?? []),
    ...(ctx.isClosed ? (ctx.tomorrowSeed ?? []) : []),
  ]
    .filter(Boolean)
    .map((s) => String(s).trim().toLowerCase());

  if (needles.length === 0 && !ctx.isClosed) return suggestions;

  const scored = suggestions.map((s, index) => {
    const hay = `${s.label} ${s.prompt}`.toLowerCase();
    const hit = needles.some((n) => n.length > 2 && hay.includes(n));
    let rank = index;
    if (hit) rank -= 100;
    if (ctx.isClosed && s.horizon === 'today') rank += 20; // de-emphasize today chatter after close
    if (ctx.isClosed && (s.id === 'static-week' || s.id === 'static-momentum')) rank -= 40;
    if (!ctx.isClosed && s.id === 'static-today') rank -= 30;
    return { s, rank };
  });

  return scored.sort((a, b) => a.rank - b.rank).map((x) => x.s);
}
