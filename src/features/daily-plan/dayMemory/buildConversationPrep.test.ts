import { describe, expect, it } from 'vitest';
import { buildConversationPrep } from './buildConversationPrep';

describe('buildConversationPrep', () => {
  it('composes insight + events into a reviewable pack', () => {
    const pack = buildConversationPrep({
      contactId: 'c1',
      contactName: 'Maya Stone',
      phase: 'fit_check',
      nextStep: 'Schedule 3-way',
      missionTitle: 'Fit-Check follow-up',
      missionReason: 'Window closing',
      events: [
        { id: 'e1', label: 'Fit-Check done', at: '2026-08-01T10:00:00.000Z' },
        { id: 'e2', label: 'Presentation sent', at: '2026-07-28T10:00:00.000Z' },
      ],
      insight: {
        nextBestAction: 'Ask about her timeline',
        nextBestActionWhy: 'She went quiet after fit-check',
        possibleObjection: 'No time this week',
        suggestedWhatsApp: 'Hey Maya, kurz check-in — wann passt ein Call?',
        currentSituation: 'Warm but stalled',
        riskScore: 62,
      },
    });

    expect(pack.complianceNote).toBe('review_before_send');
    expect(pack.draft).toContain('Maya');
    expect(pack.nextQuestion).toBe('Ask about her timeline');
    expect(pack.recentEvents).toHaveLength(2);
    expect(pack.objection).toBe('No time this week');
  });

  it('falls back without insight and never auto-sends', () => {
    const pack = buildConversationPrep({
      contactId: 'c2',
      contactName: 'Sam',
      phase: 'lead',
      nextStep: null,
      missionTitle: 'First touch',
      missionReason: 'New contact',
      events: [],
      insight: null,
    });
    expect(pack.draft.length).toBeGreaterThan(10);
    expect(pack.complianceNote).toBe('review_before_send');
    expect(pack.nextQuestion).toBe('First touch');
  });
});
