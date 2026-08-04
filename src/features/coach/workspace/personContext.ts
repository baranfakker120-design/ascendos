import type { PersonCoachInsight } from '../intelligence/types';

/**
 * Client-side context brief for person chats.
 * Sent with the first user message so the existing coach-chat history
 * remembers the person — no prompt / RPC / schema changes.
 */
export function buildPersonContextBrief(input: {
  name: string;
  membershipId: string | null;
  insight: PersonCoachInsight | null;
}): string {
  const lines: string[] = [
    `Context for Ascend Coach — conversation about ${input.name}.`,
    'Use this background silently; do not ask me to repeat it.',
  ];

  if (input.membershipId) {
    lines.push(`Membership id: ${input.membershipId}`);
  }

  const insight = input.insight;
  if (insight) {
    lines.push(`Current situation: ${insight.currentSituation}`);
    lines.push(`Next best action: ${insight.nextBestAction}`);
    if (insight.nextBestActionWhy) lines.push(`Why: ${insight.nextBestActionWhy}`);
    if (insight.sponsorRecommendation) lines.push(`Sponsor note: ${insight.sponsorRecommendation}`);
    if (insight.possibleObjection) lines.push(`Possible objection: ${insight.possibleObjection}`);
    if (insight.strengths?.length) lines.push(`Strengths: ${insight.strengths.join(', ')}`);
    if (insight.weaknesses?.length) lines.push(`Weaknesses: ${insight.weaknesses.join(', ')}`);
    lines.push(
      `Signals — registration ${insight.probabilityOfRegistration}% · inactivity ${insight.probabilityOfInactivity}% · risk ${insight.riskScore}`
    );
    if (insight.suggestedWhatsApp) {
      lines.push(`Suggested WhatsApp draft:\n${insight.suggestedWhatsApp}`);
    }
  }

  lines.push(
    'Also consider prior leadership notes, onboarding, activity, stories, and earlier coach threads when relevant.'
  );

  return lines.join('\n');
}

/** Survives refresh, tab switch, lock screen, and browser close (localStorage). */
export const PENDING_SEED_KEY = 'ascendos.coach.pending-seed.v1';

export function readPendingSeed(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(PENDING_SEED_KEY);
    if (v) window.localStorage.removeItem(PENDING_SEED_KEY);
    return v;
  } catch {
    return null;
  }
}

export function writePendingSeed(text: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PENDING_SEED_KEY, text);
  } catch {
    // ignore
  }
}

/** Attach context brief once on first send — keeps UI message clean when possible. */
export function composeOutboundMessage(
  userText: string,
  convo: { contextBrief: string | null; contextAttached: boolean }
): { message: string; attached: boolean } {
  const brief = convo.contextBrief?.trim();
  if (!brief || convo.contextAttached) {
    return { message: userText, attached: false };
  }
  return {
    message: `${brief}\n\n---\n\n${userText}`,
    attached: true,
  };
}
