import type { CoachTranslateFn } from '../i18n';

export type ContactCoachSuggestion = {
  id: string;
  label: string;
  prompt: string;
};

/** Contact-coach chips only — never reuse free-chat / org-wide prompts. */
export function buildContactCoachSuggestions(
  coachT: CoachTranslateFn,
  contactName: string
): ContactCoachSuggestion[] {
  const first = contactName.split(/\s+/)[0] || contactName;
  const name = first;
  return [
    {
      id: 'whatsapp',
      label: coachT('contactCoach.chipWhatsApp', { name }),
      prompt: coachT('contactCoach.promptWhatsApp', { name }),
    },
    {
      id: 'zoom',
      label: coachT('contactCoach.chipZoom', { name }),
      prompt: coachT('contactCoach.promptZoom', { name }),
    },
    {
      id: 'next',
      label: coachT('contactCoach.chipNextStep'),
      prompt: coachT('contactCoach.promptNextStep', { name }),
    },
    {
      id: 'objection',
      label: coachT('contactCoach.chipObjection'),
      prompt: coachT('contactCoach.promptObjection', { name }),
    },
    {
      id: 'followup',
      label: coachT('contactCoach.chipFollowUp'),
      prompt: coachT('contactCoach.promptFollowUp', { name }),
    },
    {
      id: 'activate',
      label: coachT('contactCoach.chipActivate', { name }),
      prompt: coachT('contactCoach.promptActivate', { name }),
    },
    {
      id: 'close',
      label: coachT('contactCoach.chipClose', { name }),
      prompt: coachT('contactCoach.promptClose', { name }),
    },
    {
      id: 'knows',
      label: coachT('contactCoach.chipKnows', { name }),
      prompt: coachT('contactCoach.promptKnows', { name }),
    },
  ];
}
