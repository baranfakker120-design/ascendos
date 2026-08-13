import type { MessageDraft, MessageDraftKind } from './types';
import { createCoachTranslator, type CoachTranslateFn } from '../i18n';

const DEFAULT_T = createCoachTranslator('de');

/**
 * Ready-to-send message drafts. Sponsor always reviews —
 * never auto-sent unless automation is explicitly enabled later.
 */
export function buildMessageDraft(
  kind: MessageDraftKind,
  opts: { firstName: string; sponsorFirstName?: string; onboardingUrl?: string | null },
  t: CoachTranslateFn = DEFAULT_T
): MessageDraft {
  const name = opts.firstName.trim() || t('common.informalYou');
  const sponsor = opts.sponsorFirstName?.trim() || t('common.firstPerson');
  const onboardingUrl = (opts.onboardingUrl ?? '').trim();
  return {
    kind,
    title: t(`draft.${kind}.title`),
    body: t(`draft.${kind}.body`, { name, sponsor, onboardingUrl }),
    requiresSponsorApproval: true,
  };
}

export function listMessageDraftKinds(): MessageDraftKind[] {
  return [
    'welcome',
    'congratulations',
    'reminder',
    'reactivation',
    'follow_up',
    'onboarding',
    'zoom_invitation',
    'birthday',
    'qualification',
    'recognition',
  ];
}
