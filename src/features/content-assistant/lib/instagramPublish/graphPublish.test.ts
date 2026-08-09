import { describe, expect, it } from 'vitest';
import {
  buildPublishCaption,
  connectionHasPublishScope,
  publishErrorI18nKey,
  resolveMediaProduct,
} from './graphPublish';

describe('resolveMediaProduct', () => {
  it('maps feed image to image_url without media_type', () => {
    expect(resolveMediaProduct({ mediaKind: 'image', format: 'feed' })).toEqual({
      mediaType: null,
      useImageUrl: true,
      useVideoUrl: false,
    });
  });

  it('maps reel/video to REELS + video_url', () => {
    expect(resolveMediaProduct({ mediaKind: 'video', format: 'reel' })).toEqual({
      mediaType: 'REELS',
      useImageUrl: false,
      useVideoUrl: true,
    });
  });

  it('maps stories correctly', () => {
    expect(resolveMediaProduct({ mediaKind: 'image', format: 'story' }).mediaType).toBe('STORIES');
    expect(resolveMediaProduct({ mediaKind: 'video', format: 'story' }).useVideoUrl).toBe(true);
  });
});

describe('buildPublishCaption', () => {
  it('joins caption, cta, hashtags', () => {
    expect(
      buildPublishCaption({
        caption: 'Hallo',
        cta: 'Link in Bio',
        hashtags: ['duft', '#parfum'],
      })
    ).toBe('Hallo\n\nLink in Bio\n\n#duft #parfum');
  });
});

describe('connectionHasPublishScope', () => {
  it('detects publish scope', () => {
    expect(connectionHasPublishScope(['instagram_business_basic'])).toBe(false);
    expect(
      connectionHasPublishScope([
        'instagram_business_basic',
        'instagram_business_content_publish',
      ])
    ).toBe(true);
  });
});

describe('publishErrorI18nKey', () => {
  it('maps known codes', () => {
    expect(publishErrorI18nKey('missing_publish_permission')).toBe('igPublishNeedPermission');
    expect(publishErrorI18nKey('already_in_progress')).toBe('igPublishInProgress');
  });
});
