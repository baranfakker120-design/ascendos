import type { MessageKey, TranslateFn } from '@shared/i18n';
import type { ContactPhase, PipelineEventType } from '@shared/types/domain';

/** Anzeige-Reihenfolge der Pipeline-Phasen (entspricht event_phase_rank). */
export const PHASE_ORDER: ContactPhase[] = [
  'lead',
  'im_gespraech',
  'praesentation_offen',
  'praesentation',
  'fit_check',
  'three_way_call',
  'kunde',
  'partner',
];

/** Fallback labels (DE) when no translator is provided — e.g. tests / edge functions. */
export const PHASE_LABELS: Record<ContactPhase, string> = {
  lead: 'Lead',
  im_gespraech: 'Im Gespräch',
  praesentation_offen: 'Präsentation gesendet',
  praesentation: 'Präsentation gesehen',
  fit_check: 'Fit Check',
  three_way_call: '3-Way-Call',
  kunde: 'Kunde',
  partner: 'Partner',
};

export const EVENT_LABELS: Record<PipelineEventType, string> = {
  contact_created: 'Kontakt erstellt',
  first_touch: 'Erstes Gespräch',
  follow_up: 'Follow-up',
  presentation_sent: 'Präsentation gesendet',
  presentation_viewed: 'Präsentation angesehen',
  fit_check_sent: 'Fit Check gesendet',
  fit_check_completed: 'Fit Check abgeschlossen',
  waytomoon_sent: 'Onboarding gesendet',
  three_way_call_done: '3-Way-Call durchgeführt',
  party_scheduled: 'Duftparty geplant',
  party_done: 'Duftparty durchgeführt',
  became_customer: 'Kunde geworden',
  registered: 'Als Partner registriert',
  correction: 'Korrektur',
};

/** Events, die der Berater manuell setzen kann (ohne die Sent-Events —
 *  die entstehen über die Teilen-Aktionen). Reihenfolge = Prozess. */
export const MANUAL_EVENT_TYPES: PipelineEventType[] = [
  'first_touch',
  'follow_up',
  'presentation_viewed',
  'fit_check_completed',
  'three_way_call_done',
  'party_scheduled',
  'party_done',
  'became_customer',
  'registered',
];

export function phaseLabel(phase: ContactPhase, t?: TranslateFn): string {
  if (t) return t(`pipeline.phase.${phase}` as MessageKey);
  return PHASE_LABELS[phase];
}

export function eventLabel(type: PipelineEventType, t?: TranslateFn): string {
  if (t) return t(`pipeline.event.${type}` as MessageKey);
  return EVENT_LABELS[type];
}

export function isPhaseAfter(a: ContactPhase, b: ContactPhase): boolean {
  return PHASE_ORDER.indexOf(a) > PHASE_ORDER.indexOf(b);
}

/** Ganze Tage seit einem ISO-Zeitpunkt (lokale Sicht, min. 0). */
export function daysSince(iso: string | null, now: Date = new Date()): number | null {
  if (!iso) return null;
  const then = new Date(iso);
  const ms = now.getTime() - then.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/** Menschlich lesbare Aktivitäts-Angabe für Listen. */
export function activityLabel(iso: string | null, t?: TranslateFn): string {
  const d = daysSince(iso);
  if (t) {
    if (d === null) return t('pipeline.activity.none');
    if (d === 0) return t('pipeline.activity.today');
    if (d === 1) return t('pipeline.activity.yesterday');
    return t('pipeline.activity.daysAgo', { days: d });
  }
  if (d === null) return 'Noch keine Aktivität';
  if (d === 0) return 'Heute aktiv';
  if (d === 1) return 'Gestern aktiv';
  return `Vor ${d} Tagen aktiv`;
}
