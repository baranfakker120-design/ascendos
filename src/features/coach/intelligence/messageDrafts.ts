import type { MessageDraft, MessageDraftKind } from './types';

/**
 * Ready-to-send message drafts. Sponsor always reviews —
 * never auto-sent unless automation is explicitly enabled later.
 */
export function buildMessageDraft(
  kind: MessageDraftKind,
  opts: { firstName: string; sponsorFirstName?: string }
): MessageDraft {
  const name = opts.firstName.trim() || 'du';
  const me = opts.sponsorFirstName?.trim() || 'ich';

  const bodies: Record<MessageDraftKind, { title: string; body: string }> = {
    welcome: {
      title: 'Willkommen',
      body: `Hey ${name}, herzlich willkommen im Team. Ich bin ${me} — dein Sponsor. Wenn du magst, schauen wir gemeinsam deine ersten Schritte an. Du bist nicht allein.`,
    },
    congratulations: {
      title: 'Gratulation',
      body: `Hey ${name}, kurze Nachricht: Das hast du richtig gut gemacht. Solche Konsistenz baut echte Führung. Weiter so — ich sehe das.`,
    },
    reminder: {
      title: 'Erinnerung',
      body: `Hey ${name}, nur ein kurzer Reminder zu unserem nächsten Schritt. Wenn es gerade eng ist, sag Bescheid — wir finden eine realistische Variante.`,
    },
    reactivation: {
      title: 'Reaktivierung',
      body: `Hey ${name}, mir ist aufgefallen, dass es eine Weile ruhig war. Kein Druck — ich wollte nur hören, wie es dir geht und ob ich dich irgendwo entlasten kann.`,
    },
    follow_up: {
      title: 'Follow-up',
      body: `Hey ${name}, kurze Nachfrage zu unserem letzten Gespräch. Hast du noch Fragen, oder sollen wir den nächsten Schritt konkret machen?`,
    },
    onboarding: {
      title: 'Onboarding',
      body: `Hey ${name}, hier ist dein Onboarding — der letzte Aktivierungsschritt nach der Registrierung:\nhttp://waytomoon.netlify.app\n\nDarin: Business-Basics, Vergütung, erste Schritte, Team-Erwartungen und der Zugang zur Austauschgruppe sowie zur Nina-Informationsgruppe. Wenn du stecken bleibst, melde dich direkt.`,
    },
    zoom_invitation: {
      title: 'Zoom-Einladung',
      body: `Hey ${name}, ich lade dich zu einem kurzen Zoom ein. Ziel: Klarheit statt Folien-Marathon. Passt dir eher heute Abend oder morgen?`,
    },
    birthday: {
      title: 'Geburtstag',
      body: `Hey ${name}, alles Gute zum Geburtstag. Schön, dass du Teil des Teams bist — ich freue mich auf die nächste Etappe mit dir.`,
    },
    qualification: {
      title: 'Qualifikation',
      body: `Hey ${name}, du bist nah an der nächsten Qualifikation. Lass uns kurz checken, was noch fehlt und wie wir es sauber abschließen.`,
    },
    recognition: {
      title: 'Anerkennung',
      body: `Hey ${name}, ich will dir kurz Anerkennung geben: Deine Haltung und Aktivität fallen positiv auf. Das ist Leadership in der Praxis.`,
    },
  };

  const picked = bodies[kind];
  return {
    kind,
    title: picked.title,
    body: picked.body,
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
