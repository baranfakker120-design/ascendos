import { describe, expect, it } from 'vitest';
import {
  EVENT_LABELS,
  MANUAL_EVENT_TYPES,
  PHASE_LABELS,
  PHASE_ORDER,
  activityLabel,
  daysSince,
  isPhaseAfter,
} from './pipeline';

describe('pipeline phases', () => {
  it('hat für jede Phase genau ein Label', () => {
    for (const phase of PHASE_ORDER) {
      expect(PHASE_LABELS[phase]).toBeTruthy();
    }
    expect(Object.keys(PHASE_LABELS)).toHaveLength(PHASE_ORDER.length);
  });

  it('bildet die Sprint-2-Leiter ab: Fit Check -> 3-Way-Call -> Partner', () => {
    expect(isPhaseAfter('three_way_call', 'fit_check')).toBe(true);
    expect(isPhaseAfter('partner', 'three_way_call')).toBe(true);
    expect(isPhaseAfter('praesentation', 'lead')).toBe(true);
    expect(isPhaseAfter('lead', 'kunde')).toBe(false);
  });

  it('kennt für jeden manuellen Event-Typ ein Label', () => {
    for (const type of MANUAL_EVENT_TYPES) {
      expect(EVENT_LABELS[type]).toBeTruthy();
    }
  });
});

describe('daysSince / activityLabel', () => {
  const now = new Date('2026-07-22T12:00:00Z');

  it('berechnet ganze Tage', () => {
    expect(daysSince('2026-07-22T08:00:00Z', now)).toBe(0);
    expect(daysSince('2026-07-21T11:00:00Z', now)).toBe(1);
    expect(daysSince('2026-07-14T12:00:00Z', now)).toBe(8);
    expect(daysSince(null, now)).toBeNull();
  });

  it('liefert lesbare Aktivitäts-Labels', () => {
    expect(activityLabel(null)).toBe('Noch keine Aktivität');
  });
});
