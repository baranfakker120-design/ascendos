import { Link } from 'react-router-dom';
import { useI18n } from '@shared/i18n';
import { phaseLabel } from '@shared/lib/pipeline';
import type { ContactPhase } from '@shared/types/domain';
import { createCoachTranslator } from '../i18n';
import './contact-coach.css';

export type ContactCoachSummary = {
  id: string;
  name: string;
  phase: ContactPhase;
  notes: string | null;
  next_step: string | null;
  recentEventCount: number;
};

/**
 * Compact CRM header for contact-coach mode.
 * No long greeting — name, phase, and what Ascent already knows.
 */
export function ContactCoachHeader({ contact }: { contact: ContactCoachSummary }) {
  const { locale, t } = useI18n();
  const coachT = createCoachTranslator(locale);
  const facts = [
    coachT('contactCoach.factPhase'),
    coachT('contactCoach.factTimeline'),
    coachT('contactCoach.factNotes'),
    coachT('contactCoach.factActivity'),
    coachT('contactCoach.factNextStep'),
  ];

  return (
    <section className="contact-coach-header" aria-label={contact.name}>
      <div className="contact-coach-header__identity">
        <div className="min-w-0">
          <p className="contact-coach-header__name">{contact.name}</p>
          <p className="contact-coach-header__phase">{phaseLabel(contact.phase, t)}</p>
        </div>
        <Link to={`/kontakte/${contact.id}`} className="contact-coach-header__link">
          {coachT('contactCoach.viewContact')}
        </Link>
      </div>

      <p className="contact-coach-header__knows">{coachT('contactCoach.knowsAlready')}</p>
      <ul className="contact-coach-header__facts">
        {facts.map((fact) => (
          <li key={fact}>
            <span aria-hidden>✓</span>
            <span>{fact}</span>
          </li>
        ))}
      </ul>

      {contact.next_step ? (
        <p className="contact-coach-header__next">
          <span className="contact-coach-header__next-label">
            {coachT('contactCoach.factNextStep')}
          </span>
          <span>{contact.next_step}</span>
        </p>
      ) : null}
    </section>
  );
}
