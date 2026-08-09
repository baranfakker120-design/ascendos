import { describe, expect, it } from 'vitest';
import {
  buildReelContainerFields,
  IG_OFFICIAL_AUDIO_CAPABILITY,
  IG_REEL_VIDEO_SPECS,
  isInstagramPublishableVideoMime,
  reelValidationI18nKey,
  validateReelAssetForPublish,
} from './reelVideoValidation';
import {
  buildMediaContainerFields,
  publishErrorI18nKey,
  resolveMediaProduct,
  runPublishPipeline,
} from './graphPublish';

describe('Phase 5D reel video validation (Meta Reel Specifications)', () => {
  it('accepts MP4 / QuickTime mime types only', () => {
    expect(isInstagramPublishableVideoMime('video/mp4')).toBe(true);
    expect(isInstagramPublishableVideoMime('video/quicktime')).toBe(true);
    expect(isInstagramPublishableVideoMime('video/webm')).toBe(false);
    expect(isInstagramPublishableVideoMime('image/jpeg')).toBe(false);
  });

  it('rejects WebM before publish', () => {
    expect(
      validateReelAssetForPublish({
        mediaKind: 'video',
        format: 'reel',
        mimeType: 'video/webm',
        byteSize: 1_000_000,
      })
    ).toBe('unsupported_video_format');
  });

  it('rejects reel draft without video', () => {
    expect(
      validateReelAssetForPublish({
        mediaKind: 'image',
        format: 'reel',
        mimeType: 'image/jpeg',
      })
    ).toBe('missing_media');
  });

  it('enforces Meta duration bounds when known', () => {
    expect(
      validateReelAssetForPublish({
        mediaKind: 'video',
        format: 'reel',
        mimeType: 'video/mp4',
        durationSec: 2,
      })
    ).toBe('video_too_short');
    expect(
      validateReelAssetForPublish({
        mediaKind: 'video',
        format: 'reel',
        mimeType: 'video/mp4',
        durationSec: IG_REEL_VIDEO_SPECS.maxDurationSec + 1,
      })
    ).toBe('video_too_long');
    expect(
      validateReelAssetForPublish({
        mediaKind: 'video',
        format: 'story',
        mimeType: 'video/mp4',
        durationSec: 61,
      })
    ).toBe('video_too_long');
  });

  it('enforces max width and aspect ratio when dims known', () => {
    expect(
      validateReelAssetForPublish({
        mediaKind: 'video',
        format: 'reel',
        mimeType: 'video/mp4',
        widthPx: 2000,
        heightPx: 3000,
      })
    ).toBe('video_resolution_invalid');
    expect(
      validateReelAssetForPublish({
        mediaKind: 'video',
        format: 'reel',
        mimeType: 'video/mp4',
        widthPx: 1080,
        heightPx: 1,
      })
    ).toBe('video_aspect_invalid');
  });

  it('accepts a valid 9:16 MP4 reel', () => {
    expect(
      validateReelAssetForPublish({
        mediaKind: 'video',
        format: 'reel',
        mimeType: 'video/mp4',
        byteSize: 8_000_000,
        widthPx: 1080,
        heightPx: 1920,
        durationSec: 12,
        requireDuration: true,
      })
    ).toBe('ok');
  });

  it('requireDuration fails when metadata missing', () => {
    expect(
      validateReelAssetForPublish({
        mediaKind: 'video',
        format: 'reel',
        mimeType: 'video/mp4',
        requireDuration: true,
      })
    ).toBe('video_not_ready');
  });
});

describe('Phase 5D reel container fields', () => {
  it('maps reel/video to REELS + video_url + share_to_feed', () => {
    expect(resolveMediaProduct({ mediaKind: 'video', format: 'reel' })).toEqual({
      mediaType: 'REELS',
      useImageUrl: false,
      useVideoUrl: true,
      shareToFeed: true,
    });
    expect(
      buildMediaContainerFields({
        mediaKind: 'video',
        format: 'reel',
        mediaUrl: 'https://example.com/v.mp4',
        caption: 'Hello #tag',
      })
    ).toEqual({
      media_type: 'REELS',
      video_url: 'https://example.com/v.mp4',
      share_to_feed: 'true',
      caption: 'Hello #tag',
    });
    expect(
      buildReelContainerFields({
        mediaUrl: 'https://cdn.example/reel.mp4',
        caption: 'Cap',
      })
    ).toMatchObject({
      media_type: 'REELS',
      video_url: 'https://cdn.example/reel.mp4',
      share_to_feed: 'true',
      caption: 'Cap',
    });
  });
});

describe('Phase 5D reel status polling / publish decisions', () => {
  const noopSleep = async () => undefined;

  it('FINISHED → media_publish for reel video', async () => {
    const result = await runPublishPipeline({
      statusSequence: ['IN_PROGRESS', 'FINISHED'],
      mediaKind: 'video',
      sleepFn: noopSleep,
    });
    expect(result.published).toBe(true);
    expect(result.mediaPublishCalled).toBe(true);
  });

  it('IN_PROGRESS → keep polling then publish', async () => {
    const result = await runPublishPipeline({
      statusSequence: ['IN_PROGRESS', 'IN_PROGRESS', 'PUBLISHED'],
      mediaKind: 'video',
      sleepFn: noopSleep,
    });
    expect(result.published).toBe(true);
    expect(result.mediaPublishCalled).toBe(true);
  });

  it('ERROR → no publish', async () => {
    const result = await runPublishPipeline({
      statusSequence: ['ERROR'],
      mediaKind: 'video',
      sleepFn: noopSleep,
    });
    expect(result.published).toBe(false);
    expect(result.mediaPublishCalled).toBe(false);
    expect(result.error).toBe('container_error');
  });

  it('EXPIRED → no publish', async () => {
    const result = await runPublishPipeline({
      statusSequence: ['EXPIRED'],
      mediaKind: 'video',
      sleepFn: noopSleep,
    });
    expect(result.published).toBe(false);
    expect(result.mediaPublishCalled).toBe(false);
    expect(result.error).toBe('container_expired');
  });

  it('timeout → no publish', async () => {
    const result = await runPublishPipeline({
      statusSequence: ['IN_PROGRESS'],
      mediaKind: 'video',
      sleepFn: noopSleep,
      maxAttempts: 2,
    });
    expect(result.published).toBe(false);
    expect(result.mediaPublishCalled).toBe(false);
    expect(result.error).toBe('container_timeout');
  });

  it('already published → no second media_publish', async () => {
    const result = await runPublishPipeline({
      statusSequence: ['FINISHED'],
      mediaKind: 'video',
      alreadyPublishedMediaId: 'm1',
      sleepFn: noopSleep,
    });
    expect(result.mediaPublishCalled).toBe(false);
    expect(result.mediaId).toBe('m1');
  });
});

describe('Phase 5D audio capability (official Meta constraint)', () => {
  it('does not claim Music API is available with Instagram Login', () => {
    expect(IG_OFFICIAL_AUDIO_CAPABILITY.instagram_music_available).toBe(false);
    expect(IG_OFFICIAL_AUDIO_CAPABILITY.availableWithCurrentOAuth).toBe(false);
    expect(IG_OFFICIAL_AUDIO_CAPABILITY.canSearchMusic).toBe(false);
    expect(IG_OFFICIAL_AUDIO_CAPABILITY.canAttachLibraryAudioToReel).toBe(false);
    expect(IG_OFFICIAL_AUDIO_CAPABILITY.requiredLoginPath).toBe('facebook_login_for_business');
  });

  it('maps audio_unavailable and video validation errors to i18n keys', () => {
    expect(publishErrorI18nKey('audio_unavailable')).toBe('igAudioUnavailable');
    expect(publishErrorI18nKey('unsupported_video_format')).toBe('igPublishVideoFormat');
    expect(reelValidationI18nKey('video_too_short')).toBe('igPublishVideoTooShort');
  });
});
