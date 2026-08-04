import { describe, expect, it } from 'vitest';
import { createTranslator } from '@shared/i18n';
import { buildProactiveSuggestions, filterByHorizon } from './proactiveSuggestions';
import type { CoachOrgIntelligence, PersonCoachInsight } from '../intelligence/types';

const t = createTranslator('de');

const person: PersonCoachInsight = {
  membershipId: 'm1',
  name: 'Şeyda Tatar',
  headline: 'h',
  bullets: [],
  recommendation: 'reactivation',
  severity: 'high',
  currentSituation: 'inactive',
  nextBestAction: 'Anrufen',
  nextBestActionWhy: '14 Tage still',
  possibleObjection: null,
  suggestedWhatsApp: 'Hi',
  probabilityOfRegistration: 20,
  probabilityOfInactivity: 80,
  riskScore: 70,
  strengths: [],
  weaknesses: [],
  sponsorRecommendation: 'Call',
};

describe('buildProactiveSuggestions', () => {
  it('always returns static executive starters', () => {
    const list = buildProactiveSuggestions(null, t);
    expect(list.some((s) => s.id === 'static-teamleader')).toBe(true);
    expect(list.some((s) => s.horizon === 'today')).toBe(true);
  });

  it('adds activation suggestion from person insights', () => {
    const intel = {
      personInsights: [person],
      teamHealth: { grade: 'growing', score: 60, why: ['Linie A schwach'] },
      executive: {
        bottlenecks: [{ id: 'b1', area: 'depth', title: 'Schwache Linie', why: 'x', unlock: 'y' }],
      },
      followUps: [],
      onboarding: [],
    } as unknown as CoachOrgIntelligence;

    const list = buildProactiveSuggestions(intel, t);
    expect(list.some((s) => s.id.startsWith('activate-'))).toBe(true);
    expect(filterByHorizon(list, 'today').length).toBeGreaterThan(0);
    expect(filterByHorizon(list, 'week').some((s) => s.id === 'weak-line')).toBe(true);
  });
});
