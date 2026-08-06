import type { MessageKey, TranslateFn } from '@shared/i18n';
import type { ConversationKind, WorkspaceConversation } from './types';

/**
 * Default titles historically stored as plain text in every locale.
 * Matching any of these means the title is generated and must be
 * re-translated at render time when the UI language changes.
 */
export const KNOWN_GENERATED_TITLES: ReadonlySet<string> = new Set([
  // Sentinels / legacy hardcodes
  'Freier Chat',
  'Contact',
  'Chat',
  // de
  'CEO',
  'Person',
  'Marketing',
  'Recruiting',
  'Story Ideen',
  'Leadership',
  // en
  'Open chat',
  'Story ideas',
  // fr
  'Personne',
  'Recrutement',
  'Idées Story',
  'Général',
  'Chat libre',
  // it
  'Persona',
  'Idee Story',
  'Generale',
  'Chat libera',
  // tr
  'Kişi',
  'Pazarlama',
  'İşe alım',
  'Hikaye fikirleri',
  'Liderlik',
  'Genel',
  'Serbest sohbet',
  // pl
  'Osoba',
  'Rekrutacja',
  'Pomysły na historie',
  'Przywództwo',
  'Ogólne',
  'Otwarta rozmowa',
]);

export function isGeneratedConversationTitle(
  conversation: Pick<WorkspaceConversation, 'title' | 'kind' | 'partnerName' | 'contactId'>
): boolean {
  const title = conversation.title.trim();
  if (!title) return true;
  if (KNOWN_GENERATED_TITLES.has(title)) return true;
  // Person chats that still show the generic kind label are generated.
  if (
    conversation.kind === 'person' &&
    !conversation.partnerName &&
    KNOWN_GENERATED_TITLES.has(title)
  ) {
    return true;
  }
  // Free chat without contact/partner — always treat as kind default.
  if (conversation.kind === 'general' && !conversation.contactId && !conversation.partnerName) {
    return true;
  }
  return false;
}

/** Locale-aware title for list + chat header. */
export function displayConversationTitle(
  conversation: WorkspaceConversation,
  t: TranslateFn
): string {
  if (conversation.partnerName?.trim()) return conversation.partnerName.trim();
  if (isGeneratedConversationTitle(conversation)) {
    return t(`coach.ws.defaultTitle.${conversation.kind}` as MessageKey);
  }
  return conversation.title.trim() || t(`coach.ws.defaultTitle.${conversation.kind}` as MessageKey);
}

export function defaultTitleKey(kind: ConversationKind): MessageKey {
  return `coach.ws.defaultTitle.${kind}` as MessageKey;
}
