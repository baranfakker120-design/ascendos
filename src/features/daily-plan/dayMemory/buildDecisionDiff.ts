import type { DailyPlanItem } from '@shared/types/domain';
import type { DayCloseRecord } from './types';

/** Impact-sorted change kinds from existing truth only. */
export type DecisionDiffKind =
  | 'priority_done'
  | 'priority_open'
  | 'carry_over'
  | 'contact_colder'
  | 'contact_hot'
  | 'follow_up_overdue'
  | 'partner_signal'
  | 'team_warning'
  | 'opportunity'
  | 'stable';

export type DecisionDiffSoWhat = 'follow_today' | 'wait' | 'observe' | 'celebrate' | 'prepare';

export interface DecisionDiffChange {
  id: string;
  kind: DecisionDiffKind;
  /** Higher = more important. Sort descending. */
  impact: number;
  /** Human subject (name / mission title). */
  subject: string;
  /** Evidence-backed WHY (never invented). */
  why: string;
  soWhat: DecisionDiffSoWhat;
  relatedItemId?: string | null;
  relatedContactId?: string | null;
  relatedMembershipId?: string | null;
}

export interface DecisionDiffWarning {
  kind: string;
  title: string;
  name: string;
  action: string;
  severity?: 'critical' | 'high' | 'medium' | 'low';
}

export interface DecisionDiffFollowUp {
  contactId: string;
  name: string;
  heat: string;
  why: string;
}

export interface DecisionDiffPartnerSignal {
  membershipId: string;
  name: string;
  /** inactive | activating */
  tone: 'inactive' | 'activating';
  detail: string;
}

export interface DecisionDiffInput {
  yesterdayClose: DayCloseRecord | null;
  todayItems: Pick<DailyPlanItem, 'id' | 'title' | 'status' | 'score' | 'position'>[];
  warnings: DecisionDiffWarning[];
  followUps: DecisionDiffFollowUp[];
  partnerSignals?: DecisionDiffPartnerSignal[];
  /** Change ids shown yesterday morning — soft-dedupe identical repeats. */
  previouslyShownIds?: string[];
}

export interface DecisionDiffResult {
  mode: 'changes' | 'stable' | 'no_close';
  changes: DecisionDiffChange[];
  /** Highest-impact subject — input seed for One-Tap (PR #35). */
  suggestedFocus: string | null;
  suggestedFocusItemId: string | null;
  suggestedFocusContactId: string | null;
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function heatImpact(heat: string): number {
  if (heat === 'lost') return 88;
  if (heat === 'forgotten') return 84;
  if (heat === 'hot') return 86;
  if (heat === 'interested') return 55;
  return 40;
}

/**
 * Sprint 5 · Decision Diff — morning reader of real change.
 * Max 5 changes, impact-sorted, evidence-only. Never invents AI deltas.
 */
export function buildDecisionDiff(input: DecisionDiffInput): DecisionDiffResult {
  const previous = new Set(input.previouslyShownIds ?? []);
  const candidates: DecisionDiffChange[] = [];
  const coveredSubjects = new Set<string>();

  const push = (change: DecisionDiffChange) => {
    const key = norm(change.subject);
    if (coveredSubjects.has(key)) return;
    coveredSubjects.add(key);
    // Soft-dedupe: identical id shown yesterday drops impact slightly, not removed if still true
    const adjusted = previous.has(change.id)
      ? { ...change, impact: Math.max(10, change.impact - 15) }
      : change;
    candidates.push(adjusted);
  };

  const close = input.yesterdayClose;

  if (!close) {
    // Still surface urgent real signals even without a close — but mode notes no close
    collectLiveSignals(input, push);
    const ranked = rankAndCap(candidates, 5);
    if (ranked.length === 0) {
      return {
        mode: 'no_close',
        changes: [
          {
            id: 'stable-no-close',
            kind: 'stable',
            impact: 1,
            subject: 'stable',
            why: 'no_close',
            soWhat: 'prepare',
          },
        ],
        suggestedFocus: null,
        suggestedFocusItemId: null,
        suggestedFocusContactId: null,
      };
    }
    return resultFromChanges('no_close', ranked);
  }

  // Closing Loop truth
  if (close.outcome === 'done' && close.priorityTitle) {
    push({
      id: `priority-done:${close.priorityItemId ?? close.priorityTitle}`,
      kind: 'priority_done',
      impact: 70,
      subject: close.priorityTitle,
      why: 'priority_completed',
      soWhat: 'celebrate',
      relatedItemId: close.priorityItemId,
    });
  } else if (close.priorityTitle && close.outcome !== 'done') {
    const match = input.todayItems.find((i) => norm(i.title) === norm(close.priorityTitle!));
    push({
      id: `priority-open:${close.priorityItemId ?? close.priorityTitle}`,
      kind: 'priority_open',
      impact: close.outcome === 'missed' ? 92 : 80,
      subject: close.priorityTitle,
      why: close.outcome === 'missed' ? 'priority_missed' : 'priority_partial',
      soWhat: 'follow_today',
      relatedItemId: match?.id ?? close.priorityItemId,
    });
  }

  const seed = [
    ...((close as { tomorrowNote?: string | null }).tomorrowNote
      ? [(close as { tomorrowNote?: string | null }).tomorrowNote!]
      : []),
    ...(close.tomorrowSeed.length > 0 ? close.tomorrowSeed : close.openTitles),
  ].filter(Boolean);

  for (const title of seed) {
    if (close.priorityTitle && norm(title) === norm(close.priorityTitle)) continue;
    const match = input.todayItems.find((i) => norm(i.title) === norm(title));
    push({
      id: `carry:${title}`,
      kind: 'carry_over',
      impact: 72,
      subject: title,
      why: match ? 'still_on_plan' : 'seeded_yesterday',
      soWhat: 'prepare',
      relatedItemId: match?.id ?? null,
    });
  }

  collectLiveSignals(input, push);

  const ranked = rankAndCap(candidates, 5);

  if (ranked.length === 0) {
    return {
      mode: 'stable',
      changes: [
        {
          id: 'stable-day',
          kind: 'stable',
          impact: 1,
          subject: 'stable',
          why: 'yesterday_stable',
          soWhat: 'prepare',
        },
      ],
      suggestedFocus: close.priorityTitle,
      suggestedFocusItemId: close.priorityItemId,
      suggestedFocusContactId: null,
    };
  }

  // If only celebrate + nothing else urgent, still ok
  return resultFromChanges('changes', ranked);
}

function collectLiveSignals(input: DecisionDiffInput, push: (c: DecisionDiffChange) => void): void {
  for (const fu of input.followUps) {
    if (fu.heat === 'forgotten' || fu.heat === 'lost') {
      push({
        id: `colder:${fu.contactId}`,
        kind: 'contact_colder',
        impact: heatImpact(fu.heat),
        subject: fu.name,
        why: fu.why || fu.heat,
        soWhat: 'follow_today',
        relatedContactId: fu.contactId,
      });
    } else if (fu.heat === 'hot') {
      push({
        id: `hot:${fu.contactId}`,
        kind: 'contact_hot',
        impact: heatImpact(fu.heat),
        subject: fu.name,
        why: fu.why || 'hot',
        soWhat: 'prepare',
        relatedContactId: fu.contactId,
      });
    } else if (fu.heat === 'interested') {
      push({
        id: `overdue:${fu.contactId}`,
        kind: 'follow_up_overdue',
        impact: 68,
        subject: fu.name,
        why: fu.why || 'interested',
        soWhat: 'follow_today',
        relatedContactId: fu.contactId,
      });
    }
  }

  // Mission titles that look like overdue follow-ups on today's plan
  for (const item of input.todayItems) {
    if (item.status !== 'pending' && item.status !== 'deferred') continue;
    // score already encodes urgency from plan engine
    if (item.score >= 70) {
      push({
        id: `mission-urgent:${item.id}`,
        kind: 'follow_up_overdue',
        impact: Math.min(90, 50 + item.score / 5),
        subject: item.title,
        why: 'plan_urgent',
        soWhat: 'follow_today',
        relatedItemId: item.id,
      });
    }
  }

  for (const w of input.warnings) {
    const sev = w.severity ?? 'medium';
    const impact = sev === 'critical' ? 95 : sev === 'high' ? 82 : sev === 'medium' ? 60 : 40;
    push({
      id: `warn:${w.kind}:${w.name}`,
      kind: 'team_warning',
      impact,
      subject: w.name || w.title,
      why: w.action || w.title,
      soWhat: sev === 'critical' || sev === 'high' ? 'follow_today' : 'observe',
    });
  }

  for (const p of input.partnerSignals ?? []) {
    if (p.tone === 'inactive') {
      push({
        id: `partner-inactive:${p.membershipId}`,
        kind: 'partner_signal',
        impact: 83,
        subject: p.name,
        why: p.detail,
        soWhat: 'follow_today',
        relatedMembershipId: p.membershipId,
      });
    } else {
      push({
        id: `partner-active:${p.membershipId}`,
        kind: 'opportunity',
        impact: 65,
        subject: p.name,
        why: p.detail,
        soWhat: 'celebrate',
        relatedMembershipId: p.membershipId,
      });
    }
  }
}

function rankAndCap(changes: DecisionDiffChange[], max: number): DecisionDiffChange[] {
  return [...changes]
    .sort((a, b) => b.impact - a.impact || a.subject.localeCompare(b.subject))
    .slice(0, max);
}

function resultFromChanges(
  mode: DecisionDiffResult['mode'],
  changes: DecisionDiffChange[]
): DecisionDiffResult {
  const actionable =
    changes.find((c) => c.soWhat === 'follow_today' || c.soWhat === 'prepare') ??
    changes[0] ??
    null;
  return {
    mode: changes.length === 1 && changes[0]?.kind === 'stable' ? 'stable' : mode,
    changes,
    suggestedFocus: actionable && actionable.kind !== 'stable' ? actionable.subject : null,
    suggestedFocusItemId: actionable?.relatedItemId ?? null,
    suggestedFocusContactId: actionable?.relatedContactId ?? null,
  };
}

/** @deprecated Prefer buildDecisionDiff(...).changes — kept for older call sites during transition. */
export function buildDecisionDiffLines(input: DecisionDiffInput): DecisionDiffChange[] {
  return buildDecisionDiff(input).changes;
}
