import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  INSTAGRAM_MUSIC_CAPABILITY,
  buildAudioConfigurationForPublish,
  isInstagramMusicAvailable,
  parseInstagramAudioJson,
  serializeInstagramAudioJson,
} from './instagramMusicFoundation';
import { IG_OFFICIAL_AUDIO_CAPABILITY } from './reelVideoValidation';
import { buildMediaContainerFields, resolveMediaProduct } from './graphPublish';

describe('Instagram Music Phase A foundation', () => {
  it('A) Capability false by default', () => {
    expect(INSTAGRAM_MUSIC_CAPABILITY.instagram_music_available).toBe(false);
    expect(isInstagramMusicAvailable()).toBe(false);
    expect(IG_OFFICIAL_AUDIO_CAPABILITY.instagram_music_available).toBe(false);
    expect(INSTAGRAM_MUSIC_CAPABILITY.audio_publish_available).toBe(false);
    expect(INSTAGRAM_MUSIC_CAPABILITY.audio_search_available).toBe(false);
    expect(INSTAGRAM_MUSIC_CAPABILITY.facebook_login_connected).toBe(false);
  });

  it('B) No audio selected → no audio_configuration (existing publish path)', () => {
    expect(
      buildAudioConfigurationForPublish({
        musicAvailable: true,
        selection: null,
      })
    ).toBeNull();
    expect(
      buildAudioConfigurationForPublish({
        musicAvailable: true,
        selection: undefined,
      })
    ).toBeNull();
  });

  it('C) instagram_audio_json null → existing publish path', () => {
    expect(parseInstagramAudioJson(null)).toBeNull();
    expect(parseInstagramAudioJson(undefined)).toBeNull();
    expect(parseInstagramAudioJson({})).toBeNull();
    expect(parseInstagramAudioJson('null')).toBeNull();
    expect(
      buildAudioConfigurationForPublish({
        musicAvailable: INSTAGRAM_MUSIC_CAPABILITY.instagram_music_available,
        selection: parseInstagramAudioJson(null),
      })
    ).toBeNull();
  });

  it('D) Audio data serializes / deserializes correctly', () => {
    const raw = {
      audio_id: '587784541076604',
      audio_type: 'music',
      title: 'Birthday Wish',
      artist: 'Shuba',
      audio_volume: 80,
      video_volume: 50,
    };
    const parsed = parseInstagramAudioJson(raw);
    expect(parsed).toEqual(raw);
    const serialized = serializeInstagramAudioJson(parsed);
    expect(serialized).toEqual(raw);
    expect(parseInstagramAudioJson(JSON.stringify(raw))).toEqual(raw);
    expect(parseInstagramAudioJson({ audio_id: 'x', audio_type: 'nope' })).toBeNull();
    expect(parseInstagramAudioJson({ audio_type: 'music' })).toBeNull();
  });

  it('E) No audio_configuration when music not enabled', () => {
    const selection = parseInstagramAudioJson({
      audio_id: '587784541076604',
      audio_type: 'original_sound',
      title: 'Clip',
      artist: null,
      audio_volume: 100,
      video_volume: 0,
    });
    expect(
      buildAudioConfigurationForPublish({
        musicAvailable: false,
        selection,
      })
    ).toBeNull();
    expect(
      buildAudioConfigurationForPublish({
        selection,
      })
    ).toBeNull();
  });

  it('F) existing Instagram OAuth scopes / host unchanged', () => {
    const oauthTypes = readFileSync(
      join(process.cwd(), 'supabase/functions/_shared/instagram-oauth/types.ts'),
      'utf8'
    );
    const oauthMeta = readFileSync(
      join(process.cwd(), 'supabase/functions/_shared/instagram-oauth/meta.ts'),
      'utf8'
    );
    expect(oauthTypes).toMatch(/instagram_business_basic/);
    expect(oauthTypes).toMatch(/instagram_business_content_publish/);
    expect(oauthTypes).not.toMatch(/audio_configuration/);
    expect(oauthTypes).not.toMatch(/ig_audio/);
    expect(oauthMeta).not.toMatch(/audio_configuration/);
    expect(oauthMeta).not.toMatch(/facebook_login_for_business/);
  });

  it('G) existing Feed publish product mapping unchanged', () => {
    expect(resolveMediaProduct({ mediaKind: 'image', format: 'feed' })).toEqual({
      mediaType: null,
      useImageUrl: true,
      useVideoUrl: false,
      shareToFeed: false,
    });
  });

  it('H) existing Reel publish product mapping unchanged', () => {
    expect(resolveMediaProduct({ mediaKind: 'video', format: 'reel' })).toEqual({
      mediaType: 'REELS',
      useImageUrl: false,
      useVideoUrl: true,
      shareToFeed: true,
    });
    const reelFields = buildMediaContainerFields({
      mediaKind: 'video',
      format: 'reel',
      mediaUrl: 'https://example.com/v.mp4',
      caption: 'hello',
    });
    expect(reelFields).toMatchObject({
      media_type: 'REELS',
      video_url: 'https://example.com/v.mp4',
      share_to_feed: 'true',
    });
    expect(reelFields).not.toHaveProperty('audio_configuration');
    const edgeGraph = readFileSync(
      join(process.cwd(), 'supabase/functions/_shared/instagram-publish/graph.ts'),
      'utf8'
    );
    expect(edgeGraph).toMatch(/share_to_feed/);
    expect(edgeGraph).toMatch(/media_type.*REELS|REELS/);
    // Phase D adds optional audio_configuration only when explicitly provided.
    expect(edgeGraph).toMatch(/audio_configuration/);
  });
});
