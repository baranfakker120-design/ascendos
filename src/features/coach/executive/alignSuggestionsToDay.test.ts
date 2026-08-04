import { describe, expect, it } from 'vitest';
import { prioritizeSuggestionsForDay } from './alignSuggestionsToDay';
import type { ProactiveSuggestion } from './proactiveSuggestions';

const sample: ProactiveSuggestion[] = [
  {
    id: 'static-today',
    horizon: 'today',
    label: 'What is today’s highest priority?',
    prompt: 'priority prompt',
  },
  {
    id: 'follow-maya',
    horizon: 'today',
    label: 'Follow up with Maya',
    prompt: 'Follow up with Maya Stone',
  },
  {
    id: 'static-week',
    horizon: 'week',
    label: 'Plan my week',
    prompt: 'week',
  },
];

describe('prioritizeSuggestionsForDay', () => {
  it('lifts suggestions matching the day priority', () => {
    const ranked = prioritizeSuggestionsForDay(sample, { priorityTitle: 'Maya' });
    expect(ranked[0]?.id).toBe('follow-maya');
  });

  it('after close, prefers week reflection over today chatter', () => {
    const ranked = prioritizeSuggestionsForDay(sample, {
      isClosed: true,
      tomorrowSeed: ['Follow up Sam'],
    });
    expect(ranked[0]?.id).toBe('static-week');
  });
});
