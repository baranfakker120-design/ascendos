import { describe, expect, it } from 'vitest';
import {
  buildPublishCaption,
  classifyContainerStatus,
  connectionHasPublishScope,
  publishErrorI18nKey,
  resolveMediaProduct,
  runPublishPipeline,
  waitForContainerReady,
} from './graphPublish';

describe('resolveMediaProduct', () => {
  it('maps feed image to image_url without media_type', () => {
    expect(resolveMediaProduct({ mediaKind: 'image', format: 'feed' })).toEqual({
      mediaType: null,
      useImageUrl: true,
      useVideoUrl: false,
      shareToFeed: false,
    });
  });

  it('maps reel/video to REELS + video_url + share_to_feed', () => {
    expect(resolveMediaProduct({ mediaKind: 'video', format: 'reel' })).toEqual({
      mediaType: 'REELS',
      useImageUrl: false,
      useVideoUrl: true,
      shareToFeed: true,
    });
  });
});

describe('classifyContainerStatus', () => {
  it('treats FINISHED and PUBLISHED as ready', () => {
    expect(classifyContainerStatus('FINISHED')).toBe('ready');
    expect(classifyContainerStatus('published')).toBe('ready');
  });

  it('treats IN_PROGRESS and unknown as pending', () => {
    expect(classifyContainerStatus('IN_PROGRESS')).toBe('pending');
    expect(classifyContainerStatus('PENDING')).toBe('pending');
    expect(classifyContainerStatus('')).toBe('pending');
  });

  it('treats ERROR and EXPIRED as terminal', () => {
    expect(classifyContainerStatus('ERROR')).toBe('error');
    expect(classifyContainerStatus('EXPIRED')).toBe('expired');
  });
});

describe('waitForContainerReady / publish pipeline', () => {
  const noopSleep = async () => undefined;

  it('A) feed image: not ready → poll → FINISHED → media_publish', async () => {
    const result = await runPublishPipeline({
      statusSequence: ['IN_PROGRESS', 'FINISHED'],
      mediaKind: 'image',
      sleepFn: noopSleep,
    });
    expect(result.published).toBe(true);
    expect(result.mediaPublishCalled).toBe(true);
    expect(result.mediaId).toBe('media-test-1');
  });

  it('B) feed image: several IN_PROGRESS then FINISHED', async () => {
    const statuses: string[] = [];
    await waitForContainerReady({
      initialDelayMs: 0,
      intervalMs: 0,
      maxAttempts: 10,
      sleepFn: noopSleep,
      getStatus: async () => {
        const next =
          statuses.length < 3 ? 'IN_PROGRESS' : statuses.length === 3 ? 'IN_PROGRESS' : 'FINISHED';
        statuses.push(next);
        return next;
      },
    });
    expect(statuses.filter((s) => s === 'IN_PROGRESS').length).toBeGreaterThanOrEqual(3);
    expect(statuses.at(-1)).toBe('FINISHED');
  });

  it('C) container ERROR → no media_publish', async () => {
    const result = await runPublishPipeline({
      statusSequence: ['IN_PROGRESS', 'ERROR'],
      sleepFn: noopSleep,
    });
    expect(result.published).toBe(false);
    expect(result.mediaPublishCalled).toBe(false);
    expect(result.error).toBe('container_error');
  });

  it('D) timeout → no media_publish', async () => {
    const result = await runPublishPipeline({
      statusSequence: ['IN_PROGRESS'],
      sleepFn: noopSleep,
      maxAttempts: 3,
    });
    expect(result.published).toBe(false);
    expect(result.mediaPublishCalled).toBe(false);
    expect(result.error).toBe('container_timeout');
  });

  it('E/F) already published → no second media_publish', async () => {
    const result = await runPublishPipeline({
      statusSequence: ['FINISHED'],
      alreadyPublishedMediaId: 'existing-media',
      sleepFn: noopSleep,
    });
    expect(result.published).toBe(true);
    expect(result.mediaId).toBe('existing-media');
    expect(result.mediaPublishCalled).toBe(false);
  });
});

describe('buildPublishCaption / scopes / errors', () => {
  it('joins caption, cta, hashtags', () => {
    expect(
      buildPublishCaption({
        caption: 'Hallo',
        cta: 'Link in Bio',
        hashtags: ['duft', '#parfum'],
      })
    ).toBe('Hallo\n\nLink in Bio\n\n#duft #parfum');
  });

  it('detects publish scope', () => {
    expect(connectionHasPublishScope(['instagram_business_basic'])).toBe(false);
    expect(
      connectionHasPublishScope(['instagram_business_basic', 'instagram_business_content_publish'])
    ).toBe(true);
  });

  it('maps known codes', () => {
    expect(publishErrorI18nKey('missing_publish_permission')).toBe('igPublishNeedPermission');
    expect(publishErrorI18nKey('container_timeout')).toBe('igPublishContainerTimeout');
  });
});
