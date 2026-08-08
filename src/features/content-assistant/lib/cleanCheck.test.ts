import { describe, expect, it } from 'vitest';
import { CLEAN_CHECK_DISCLAIMER, formatCleanCheckNotes, runCleanCheck } from './cleanCheck';

describe('runCleanCheck', () => {
  it('marks focused natural copy as clean (disclaimer only)', () => {
    const result = runCleanCheck({
      hook: 'Der Duft, der im Raum bleibt',
      caption: 'Ein ruhiger Moment mit einem klaren Duft. Was riechst du zuerst?',
      cta: 'Schreib mir, wenn du die Note testen willst.',
      keywords: ['duft', 'abend'],
      hashtags: ['parfum', 'duftliebe'],
    });
    expect(result.status).toBe('clean');
    expect(result.isGuarantee).toBe(false);
    expect(result.notes).toContain(CLEAN_CHECK_DISCLAIMER);
  });

  it('flags spam hashtags and engagement bait', () => {
    const result = runCleanCheck({
      hook: 'WAIT',
      caption: 'Like and share this now!!!',
      cta: 'Tag 3 friends',
      keywords: ['viral'],
      hashtags: ['fyp', 'viral', 'fyp', 'parfum'],
    });
    expect(result.status).toBe('attention');
    expect(result.notes.some((n) => n.includes('spam-leaning'))).toBe(true);
    expect(result.notes.some((n) => n.includes('engagement-bait'))).toBe(true);
    expect(result.notes.some((n) => n.includes('Repeated'))).toBe(true);
  });

  it('flags misleading absolute claims and keyword stuffing', () => {
    const result = runCleanCheck({
      hook: 'Shadowban-proof growth',
      caption:
        'Guaranteed income this week with this miracle cure. parfum duft luxury scent bottle',
      cta: 'Start now',
      keywords: ['parfum', 'duft', 'luxury', 'scent', 'bottle'],
      hashtags: ['business'],
    });
    expect(result.status).toBe('attention');
    expect(result.notes.some((n) => n.includes('misleading'))).toBe(true);
    expect(result.notes.some((n) => n.includes('keyword-stuffed'))).toBe(true);
  });

  it('formats notes for storage', () => {
    const result = runCleanCheck({
      caption: 'Like and share this',
      hashtags: ['fyp', 'parfum'],
    });
    const formatted = formatCleanCheckNotes(result);
    expect(formatted).toContain('·');
    expect(formatted).toContain('technical precaution');
  });
});
