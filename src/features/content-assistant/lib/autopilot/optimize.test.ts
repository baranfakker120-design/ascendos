import { describe, expect, it } from 'vitest';
import {
  aggregatePerformanceContext,
  assessAutopilotOptimizeMode,
  extractAutopilotKeywords,
  REQUIRED_HASHTAG_COUNT,
  runAutopilotQualityCheck,
  selectExactFiveHashtags,
  shouldOptimizeAutopilotSlot,
} from './optimize';

describe('autopilot optimization', () => {
  it('skips stories and reels; optimizes feed', () => {
    expect(shouldOptimizeAutopilotSlot({ slotKind: 'story', contentFormat: 'story' })).toBe(false);
    expect(shouldOptimizeAutopilotSlot({ slotKind: 'feed', contentFormat: 'reel' })).toBe(false);
    expect(shouldOptimizeAutopilotSlot({ slotKind: 'feed', contentFormat: 'feed' })).toBe(true);
  });

  it('reuses good drafts; refreshes weak ones', () => {
    expect(
      assessAutopilotOptimizeMode({
        format: 'story',
        hook: 'x',
        caption: 'y',
        cta: 'z',
        hashtags: ['a', 'b', 'c', 'd', 'e'],
      })
    ).toBe('skip_story');

    expect(
      assessAutopilotOptimizeMode({
        format: 'feed',
        hook: 'Starker Hook hier',
        caption:
          'Eine ausreichend lange Caption die zum Bild und Thema passt und Instagram tauglich ist.',
        cta: 'Speichern für später',
        hashtags: ['teamarbeit', 'businessmindset', 'netzwerk', 'leadership', 'community'],
      })
    ).toBe('reuse');

    expect(
      assessAutopilotOptimizeMode({
        format: 'feed',
        hook: 'Starker Hook hier',
        caption:
          'Eine ausreichend lange Caption die zum Bild und Thema passt und Instagram tauglich ist.',
        cta: 'Speichern für später',
        hashtags: ['teamarbeit'],
      })
    ).toBe('hashtags_only');

    expect(
      assessAutopilotOptimizeMode({
        format: 'feed',
        hook: '',
        caption: '',
        cta: '',
        hashtags: [],
      })
    ).toBe('refresh_copy');

    expect(
      assessAutopilotOptimizeMode({
        format: 'feed',
        hook: 'F92F7B5E-3F63-42FC-8BD7-31071AB7213C',
        caption: 'F92F7B5E-3F63-42FC-8BD7-31071AB7213C',
        cta: 'Speichern für später',
        hashtags: ['teamarbeit', 'businessmindset', 'netzwerk', 'leadership', 'community'],
      })
    ).toBe('refresh_copy');
  });

  it('rejects UUID public copy in quality check', () => {
    expect(
      runAutopilotQualityCheck({
        hook: 'F92F7B5E-3F63-42FC-8BD7-31071AB7213C',
        caption: 'F92F7B5E-3F63-42FC-8BD7-31071AB7213C and more text here',
        cta: 'CTA',
        hashtags: ['a', 'b', 'c', 'd', 'e'],
      }).ok
    ).toBe(false);
  });

  it('extracts keywords from theme/caption — not filenames', () => {
    const kws = extractAutopilotKeywords({
      theme: 'Team Business Motivation',
      caption: 'Heute starten wir mit Fokus und Leadership im Alltag.',
      analysisKeywords: ['photo123.jpg', 'netzwerk', 'abcdef12'],
    });
    expect(kws).toContain('netzwerk');
    expect(kws.some((k) => k.includes('.jpg'))).toBe(false);
    expect(kws).not.toContain('abcdef12');
  });

  it('selects exactly 5 hashtags without fillers or trend claims', () => {
    const tags = selectExactFiveHashtags({
      llmHashtags: ['teamarbeit', 'businessmindset'],
      catalogHashtags: ['netzwerk', 'leadership'],
      recentHashtags: ['teamarbeit'],
    });
    expect(tags).toHaveLength(REQUIRED_HASHTAG_COUNT);
    expect(tags.every((t) => !/^tag\d+$/i.test(t))).toBe(true);
    expect(tags.map((t) => t.toLowerCase())).not.toContain('viral');
    expect(tags.map((t) => t.toLowerCase())).not.toContain('fyp');
    // Prefer not-recent when alternatives exist
    expect(tags[0].toLowerCase()).not.toBe('teamarbeit');
  });

  it('quality check requires caption + hook + cta + exact 5', () => {
    expect(
      runAutopilotQualityCheck({
        hook: 'Hook',
        caption: 'Caption body',
        cta: 'CTA',
        hashtags: ['a', 'b', 'c', 'd', 'e'],
      }).ok
    ).toBe(true);
    expect(
      runAutopilotQualityCheck({
        hook: 'Hook',
        caption: '',
        cta: 'CTA',
        hashtags: ['a', 'b', 'c', 'd', 'e'],
      }).ok
    ).toBe(false);
    expect(
      runAutopilotQualityCheck({
        hook: 'Hook',
        caption: 'Caption',
        cta: 'CTA',
        hashtags: ['a', 'b', 'tag3', 'd', 'e'],
      }).ok
    ).toBe(false);
  });

  it('performance aggregation needs enough real samples; else null fallback', () => {
    expect(aggregatePerformanceContext([])).toBeNull();
    expect(
      aggregatePerformanceContext([
        { performance_json: { metrics: { likes: 1 } } },
        { performance_json: { metrics: { likes: 2 } } },
      ])
    ).toBeNull();
    const agg = aggregatePerformanceContext([
      { performance_json: { metrics: { likes: 10, reach: 100 } } },
      { performance_json: { metrics: { likes: 20, reach: 200 } } },
      { performance_json: { metrics: { likes: 30, reach: 300 } } },
    ]);
    expect(agg?.sampleSize).toBe(3);
    expect(agg?.averages.likes).toBe(20);
    expect(agg?.averages.reach).toBe(200);
  });
});
