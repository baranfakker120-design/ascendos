import type { MessageKey } from '@shared/i18n';
import type { ConversationKind } from './workspace/types';

/** Existing shared keys — presentation only, no new translation entries. */
const KIND_HINT: Record<ConversationKind, MessageKey> = {
  ceo: 'coach.ws.kindHint.ceo',
  person: 'coach.ws.kindHint.person',
  marketing: 'coach.ws.kindHint.marketing',
  recruiting: 'coach.ws.kindHint.recruiting',
  story: 'coach.ws.kindHint.story',
  leadership: 'coach.ws.kindHint.leadership',
  general: 'coach.ws.kindHint.general',
};

/** First identity line from the existing welcome string (before em dash / period). */
export function welcomeIdentityLine(welcome: string): string {
  const firstLine =
    welcome
      .split(/\n+/)
      .map((s) => s.trim())
      .find(Boolean) ?? welcome.trim();
  const beforeDash = firstLine.split(/\s*[—–]\s*/)[0]?.trim();
  if (beforeDash) return beforeDash.endsWith('.') ? beforeDash : `${beforeDash}.`;
  const sentence = firstLine.split(/(?<=[.!?])\s+/)[0]?.trim() ?? firstLine;
  return sentence.endsWith('.') || sentence.endsWith('!') || sentence.endsWith('?')
    ? sentence
    : `${sentence}.`;
}

/** Next-step body from the existing welcome string (after the localized next-step label). */
export function welcomeNextStepBody(welcome: string): string {
  const match = welcome.match(
    /(?:Nächster Schritt|Next step|Prochaine étape|Sonraki adım|Bir sonraki adım|Prossimo passo|Il prossimo passo|Następny krok)\s*:\s*([\s\S]+)/i
  );
  if (match?.[1]) return match[1].trim();
  const lines = welcome
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return lines[lines.length - 1] ?? '';
}

export function kindHintKey(kind: ConversationKind): MessageKey {
  return KIND_HINT[kind];
}
