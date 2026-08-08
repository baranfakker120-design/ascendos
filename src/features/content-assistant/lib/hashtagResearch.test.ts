import { describe, expect, it } from 'vitest';
import { matchCuratedTopics } from './hashtagResearch/curatedCatalog';
import { runHashtagResearch } from './hashtagResearch/pipeline';

describe('hashtag research pipeline', () => {
  it('matches curated fragrance topics without claiming live trends', () => {
    const topics = matchCuratedTopics('Parfum Flasche mit warmer Duftnote');
    expect(topics.some((t) => t.id === 'fragrance')).toBe(true);

    const result = runHashtagResearch({
      theme: 'Parfum / Duft',
      keywords: ['parfum', 'duft'],
      llmHashtags: ['parfum', 'fyp', 'viral'],
      visualSummary: 'Nahaufnahme einer Parfumflasche im warmen Licht',
    });

    expect(result.liveResearchActive).toBe(false);
    expect(result.mode).toBe('curated_plus_llm');
    expect(result.recommended.some((c) => c.tag === 'parfum')).toBe(true);
    expect(result.recommended.every((c) => c.reasonCode !== 'live_researched')).toBe(true);
    expect(result.rejected.some((c) => c.tag === 'fyp' || c.tag === 'viral')).toBe(true);
    expect(result.notes.some((n) => n.toLowerCase().includes('live'))).toBe(true);
  });

  it('handles low visual context without inventing tags', () => {
    const result = runHashtagResearch({
      theme: null,
      keywords: [],
      llmHashtags: [],
      visualSummary: '?',
    });
    expect(result.mode).toBe('insufficient_context');
    expect(result.recommended).toEqual([]);
  });

  it('keeps asset-derived niche tags (may mix curated if topic matches)', () => {
    const result = runHashtagResearch({
      theme: 'Keramik',
      keywords: ['keramik', 'töpferei'],
      llmHashtags: ['keramik', 'toepfern', 'handgemacht'],
      visualSummary: 'Hände formen Ton auf einer Töpferscheibe',
    });
    expect(result.liveResearchActive).toBe(false);
    expect(result.recommended.map((c) => c.tag)).toEqual(
      expect.arrayContaining(['keramik', 'toepfern', 'handgemacht'])
    );
    expect(result.recommended.some((c) => c.source === 'asset_llm')).toBe(true);
  });

  it('does not enable official meta provider in phase 3', () => {
    const result = runHashtagResearch({
      theme: 'Team Meeting',
      keywords: ['team'],
      llmHashtags: ['teamarbeit'],
      visualSummary: 'Team sitzt am Tisch',
    });
    expect(result.providersUsed).not.toContain('official_meta_hashtag');
    expect(result.liveResearchActive).toBe(false);
  });
});
