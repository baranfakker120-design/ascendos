/**
 * Sprint 5 · L5 Conversation Prep — pure pack composer.
 * No auto-send. Drafts only.
 */

export interface PrepEventLine {
  id: string;
  label: string;
  at: string | null;
}

export interface ConversationPrepInput {
  contactId: string;
  contactName: string;
  phase: string | null;
  nextStep: string | null;
  missionTitle: string | null;
  missionReason: string | null;
  events: PrepEventLine[];
  insight: {
    nextBestAction: string;
    nextBestActionWhy: string;
    possibleObjection: string | null;
    suggestedWhatsApp: string;
    currentSituation: string;
    riskScore: number;
  } | null;
}

export interface ConversationPrepPack {
  contactId: string;
  contactName: string;
  phase: string | null;
  situation: string;
  nextQuestion: string;
  nextWhy: string;
  objection: string | null;
  draft: string;
  recentEvents: PrepEventLine[];
  complianceNote: 'review_before_send';
  riskScore: number | null;
}

export function buildConversationPrep(input: ConversationPrepInput): ConversationPrepPack {
  const insight = input.insight;
  const situation =
    insight?.currentSituation?.trim() || input.missionReason?.trim() || input.phase || 'open';

  const nextQuestion =
    insight?.nextBestAction?.trim() ||
    input.nextStep?.trim() ||
    input.missionTitle?.trim() ||
    'Reach out';

  const nextWhy =
    insight?.nextBestActionWhy?.trim() ||
    input.missionReason?.trim() ||
    'Keep the relationship moving.';

  const draft = insight?.suggestedWhatsApp?.trim() || defaultDraft(input.contactName, nextQuestion);

  return {
    contactId: input.contactId,
    contactName: input.contactName,
    phase: input.phase,
    situation,
    nextQuestion,
    nextWhy,
    objection: insight?.possibleObjection?.trim() || null,
    draft,
    recentEvents: input.events.slice(0, 3),
    complianceNote: 'review_before_send',
    riskScore: insight?.riskScore ?? null,
  };
}

function defaultDraft(name: string, nextQuestion: string): string {
  const first = name.trim().split(/\s+/)[0] || name;
  return `Hi ${first}, kurz zu unserem letzten Austausch — ${nextQuestion}. Passt dir ein kurzer Call heute oder morgen?`;
}
