import { describe, expect, it } from 'vitest';
import {
  computeFeedImageCrop,
  feedImageEncodeWidth,
  IG_FEED_IMAGE_SPECS,
  isFeedImageAspectAllowed,
  isMetaFeedImageAspectError,
} from './feedImageFit';

describe('Instagram feed image aspect fit', () => {
  it('allows Meta feed range 4:5 … 1.91:1', () => {
    expect(isFeedImageAspectAllowed(1080, 1350)).toBe(true); // 4:5
    expect(isFeedImageAspectAllowed(1080, 1080)).toBe(true); // 1:1
    expect(isFeedImageAspectAllowed(1080, 566)).toBe(true); // ~1.91:1
  });

  it('rejects 9:16 and ultra-wide before crop', () => {
    expect(isFeedImageAspectAllowed(1080, 1920)).toBe(false);
    expect(isFeedImageAspectAllowed(1920, 800)).toBe(false);
  });

  it('center-crops tall 9:16 to 4:5', () => {
    const crop = computeFeedImageCrop(1080, 1920);
    const ratio = crop.width / crop.height;
    expect(ratio).toBeCloseTo(IG_FEED_IMAGE_SPECS.minAspectRatio, 2);
    expect(crop.x).toBe(0);
    expect(crop.y).toBeGreaterThan(0);
    expect(isFeedImageAspectAllowed(crop.width, crop.height)).toBe(true);
  });

  it('center-crops wide landscape to 1.91:1', () => {
    const crop = computeFeedImageCrop(2000, 800);
    const ratio = crop.width / crop.height;
    expect(ratio).toBeCloseTo(IG_FEED_IMAGE_SPECS.maxAspectRatio, 2);
    expect(crop.y).toBe(0);
    expect(crop.x).toBeGreaterThan(0);
    expect(isFeedImageAspectAllowed(crop.width, crop.height)).toBe(true);
  });

  it('leaves valid frames unchanged', () => {
    expect(computeFeedImageCrop(1080, 1080)).toEqual({
      x: 0,
      y: 0,
      width: 1080,
      height: 1080,
    });
  });

  it('clamps encode width to Meta 320–1440', () => {
    expect(feedImageEncodeWidth(2000)).toBe(1440);
    expect(feedImageEncodeWidth(800)).toBe(800);
    expect(feedImageEncodeWidth(200)).toBe(320);
  });

  it('detects Meta aspect-ratio rejection messages', () => {
    expect(
      isMetaFeedImageAspectError(
        'The submitted image with aspect ratio {} cannot be published. Please submit an image with a valid aspect ratio.'
      )
    ).toBe(true);
    expect(isMetaFeedImageAspectError('container timeout')).toBe(false);
  });
});
