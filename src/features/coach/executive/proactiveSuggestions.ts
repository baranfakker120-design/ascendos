import type { TranslateFn } from '@shared/i18n';
import type { CoachOrgIntelligence } from '../intelligence/types';

export type SuggestionHorizon = 'today' | 'week' | 'month';

export type ProactiveSuggestion = {
  id: string;
  horizon: SuggestionHorizon;
  label: string;
  prompt: string;
};

/**
 * Proactive conversation starters from existing org intelligence.
 * Does not modify analyzeOrg / executive engines — read-only mapping.
 */
export function buildProactiveSuggestions(
  intelligence: CoachOrgIntelligence | null,
  t: TranslateFn
): ProactiveSuggestion[] {
  const out: ProactiveSuggestion[] = [];

  const activate = intelligence?.personInsights.find(
    (p) => p.recommendation === 'reactivation' || p.riskScore >= 60
  );
  if (activate) {
    out.push({
      id: `activate-${activate.membershipId}`,
      horizon: 'today',
      label: t('coach.exec.suggestActivateLabel', { name: firstName(activate.name) }),
      prompt: t('coach.exec.suggestActivatePrompt', {
        name: activate.name,
        action: activate.nextBestAction,
        why: activate.nextBestActionWhy,
      }),
    });
  }

  const coachingNeed =
    intelligence?.personInsights.find((p) => p.recommendation === 'onboarding') ??
    intelligence?.onboarding.find((o) => o.needsHelp);
  if (coachingNeed) {
    const name =
      'name' in coachingNeed ? coachingNeed.name : (coachingNeed as { name: string }).name;
    out.push({
      id: `coach-need-${'membershipId' in coachingNeed ? coachingNeed.membershipId : name}`,
      horizon: 'today',
      label: t('coach.exec.suggestWhoNeedsLabel'),
      prompt: t('coach.exec.suggestWhoNeedsPrompt', { name }),
    });
  }

  const weak =
    intelligence?.executive?.bottlenecks?.[0]?.title || intelligence?.teamHealth?.why?.[0] || null;
  if (weak) {
    out.push({
      id: 'weak-line',
      horizon: 'week',
      label: t('coach.exec.suggestWeakLineLabel'),
      prompt: t('coach.exec.suggestWeakLinePrompt', { detail: weak }),
    });
  }

  const nextLeader = intelligence?.personInsights.find(
    (p) => p.recommendation === 'promotion' || p.recommendation === 'recognition'
  );
  if (nextLeader) {
    out.push({
      id: `next-leader-${nextLeader.membershipId}`,
      horizon: 'month',
      label: t('coach.exec.suggestNextLeaderLabel'),
      prompt: t('coach.exec.suggestNextLeaderPrompt', { name: nextLeader.name }),
    });
  }

  const follow = intelligence?.followUps?.[0];
  if (follow) {
    out.push({
      id: `follow-${follow.contactId}`,
      horizon: 'today',
      label: t('coach.exec.suggestFollowUpLabel', { name: firstName(follow.name) }),
      prompt: t('coach.exec.suggestFollowUpPrompt', {
        name: follow.name,
        why: follow.why,
        action: follow.nextAction,
      }),
    });
  }

  // Always-available executive prompts (ChatGPT-style starters).
  const fallbacks: ProactiveSuggestion[] = [
    {
      id: 'static-teamleader',
      horizon: 'month',
      label: t('coach.exec.suggestTeamLeaderLabel'),
      prompt: t('coach.exec.suggestTeamLeaderPrompt'),
    },
    {
      id: 'static-today',
      horizon: 'today',
      label: t('coach.exec.suggestTodayFocusLabel'),
      prompt: t('coach.exec.suggestTodayFocusPrompt'),
    },
    {
      id: 'static-week',
      horizon: 'week',
      label: t('coach.exec.suggestWeekPlanLabel'),
      prompt: t('coach.exec.suggestWeekPlanPrompt'),
    },
    {
      id: 'static-momentum',
      horizon: 'week',
      label: t('coach.exec.suggestMomentumLabel'),
      prompt: t('coach.exec.suggestMomentumPrompt'),
    },
  ];

  for (const f of fallbacks) {
    if (!out.some((s) => s.id === f.id)) out.push(f);
  }

  return out.slice(0, 8);
}

export function filterByHorizon(
  suggestions: ProactiveSuggestion[],
  horizon: SuggestionHorizon
): ProactiveSuggestion[] {
  const matched = suggestions.filter((s) => s.horizon === horizon);
  return matched.length ? matched : suggestions.slice(0, 4);
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}
