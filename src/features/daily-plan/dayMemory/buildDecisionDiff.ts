import type { DailyPlanItem } from '@shared/types/domain';
import type { DayCloseRecord } from './types';

export type DecisionDiffKind =
  'carry_over' | 'missed_priority' | 'team_signal' | 'plan_delta' | 'clean_start';

export interface DecisionDiffLine {
  id: string;
  kind: DecisionDiffKind;
  title: string;
  why: string;
  relatedItemId?: string | null;
  relatedContactId?: string | null;
}

export interface DecisionDiffWarning {
  kind: string;
  title: string;
  name: string;
  action: string;
}

export interface DecisionDiffFollowUp {
  contactId: string;
  name: string;
  heat: string;
  why: string;
}

export interface DecisionDiffInput {
  yesterdayClose: DayCloseRecord | null;
  todayItems: Pick<DailyPlanItem, 'id' | 'title' | 'status' | 'score' | 'position'>[];
  warnings: DecisionDiffWarning[];
  followUps: DecisionDiffFollowUp[];
}

function norm(title: string): string {
  return title.trim().toLowerCase();
}

/**
 * Sprint 5 · L2 Decision Diff — pure day-truth handoff.
 * Max 4 actionable lines (or one clean_start). Never invents close truth.
 */
export function buildDecisionDiff(input: DecisionDiffInput): DecisionDiffLine[] {
  const lines: DecisionDiffLine[] = [];
  const todayByTitle = new Map(input.todayItems.map((i) => [norm(i.title), i]));
  const todayTitles = new Set(todayByTitle.keys());

  if (!input.yesterdayClose) {
    return [
      {
        id: 'clean-start',
        kind: 'clean_start',
        title: 'clean_start',
        why: 'no_close',
      },
    ];
  }

  const close = input.yesterdayClose;
  const priorityNorm = close.priorityTitle ? norm(close.priorityTitle) : '';

  if (close.outcome !== 'done' && close.priorityTitle) {
    const match = todayByTitle.get(priorityNorm);
    lines.push({
      id: `missed:${close.priorityItemId ?? close.priorityTitle}`,
      kind: 'missed_priority',
      title: close.priorityTitle,
      why: close.outcome === 'missed' ? 'priority_missed' : 'priority_partial',
      relatedItemId: match?.id ?? close.priorityItemId,
    });
  }

  const seed = (close.tomorrowSeed.length > 0 ? close.tomorrowSeed : close.openTitles).filter(
    (title) => norm(title) !== priorityNorm
  );
  const carryPreferred = seed.find((title) => todayTitles.has(norm(title))) ?? seed[0] ?? null;

  if (carryPreferred) {
    const match = todayByTitle.get(norm(carryPreferred));
    lines.push({
      id: `carry:${carryPreferred}`,
      kind: 'carry_over',
      title: carryPreferred,
      why: match ? 'still_on_plan' : 'seeded_yesterday',
      relatedItemId: match?.id ?? null,
    });
  }

  const warning = input.warnings[0];
  if (warning) {
    lines.push({
      id: `team:${warning.kind}:${warning.name}`,
      kind: 'team_signal',
      title: warning.name || warning.title,
      why: warning.action || warning.title,
    });
  }

  const covered = new Set(lines.map((l) => norm(l.title)));
  const hot = input.followUps.find(
    (f) =>
      (f.heat === 'forgotten' || f.heat === 'hot' || f.heat === 'lost') &&
      !covered.has(norm(f.name))
  );
  if (hot) {
    lines.push({
      id: `delta:${hot.contactId}`,
      kind: 'plan_delta',
      title: hot.name,
      why: hot.why || hot.heat,
      relatedContactId: hot.contactId,
    });
  }

  if (lines.length === 0 && close.outcome === 'done' && close.tomorrowSeed.length === 0) {
    return [
      {
        id: 'clean-after-done',
        kind: 'clean_start',
        title: 'clean_start',
        why: 'yesterday_clean',
      },
    ];
  }

  return lines.slice(0, 4);
}
