import { describe, expect, it } from 'vitest';
import {
  aspectFitsAutopilotSlot,
  assessMediaCompatibility,
  canvasForAutopilotSlot,
  AUTOPILOT_STORY_ASPECT,
} from './formatAspect';

describe('autopilot formatAspect hard gates', () => {
  it('requires 9:16 for story when aspect is known', () => {
    expect(aspectFitsAutopilotSlot('story', '9:16', ['feed'])).toBe(true);
    expect(aspectFitsAutopilotSlot('story', '1:1', ['story'])).toBe(false);
    expect(aspectFitsAutopilotSlot('story', '4:5', null)).toBe(false);
  });

  it('requires 1:1 or 4:5 for feed when aspect is known', () => {
    expect(aspectFitsAutopilotSlot('feed', '1:1', null)).toBe(true);
    expect(aspectFitsAutopilotSlot('feed', '4:5', null)).toBe(true);
    expect(aspectFitsAutopilotSlot('feed', '9:16', ['feed'])).toBe(false);
    expect(aspectFitsAutopilotSlot('feed', '16:9', ['feed'])).toBe(false);
  });

  it('soft-allows unknown aspect via suggested_formats', () => {
    expect(aspectFitsAutopilotSlot('story', null, ['story'])).toBe(true);
    expect(aspectFitsAutopilotSlot('story', null, ['feed'])).toBe(false);
    expect(aspectFitsAutopilotSlot('feed', null, ['feed'])).toBe(true);
    expect(aspectFitsAutopilotSlot('feed', null, ['story'])).toBe(false);
    expect(aspectFitsAutopilotSlot('story', null, [])).toBe(true);
  });

  it('safe-rejects landscape dims for story even with story suggestion', () => {
    const fit = assessMediaCompatibility({
      slotKind: 'story',
      aspectRatio: null,
      suggestedFormats: ['story'],
      widthPx: 1920,
      heightPx: 1080,
    });
    expect(fit.compatible).toBe(false);
    expect(aspectFitsAutopilotSlot('story', null, ['story'], 1920, 1080)).toBe(false);
  });

  it('returns story/feed canvas targets', () => {
    expect(canvasForAutopilotSlot('story')).toEqual({
      width: 1080,
      height: 1920,
      aspect: AUTOPILOT_STORY_ASPECT,
    });
    expect(canvasForAutopilotSlot('feed', '1:1')).toEqual({
      width: 1080,
      height: 1080,
      aspect: '1:1',
    });
    expect(canvasForAutopilotSlot('feed', '4:5').height).toBe(1350);
  });
});
