import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  assertAudioSearchConnection,
  assertNoTokenLeak,
  buildIgAudioSearchUrl,
  classifyMetaAudioSearchError,
  parseIgAudioSearchResponse,
  sanitizeAudioMetaError,
  searchInstagramAudio,
} from './index';
import { resolveInstagramMusicCapability } from '../instagramPublish/instagramMusicFoundation';
import { buildMediaContainerFields } from '../instagramPublish/graphPublish';

const SAMPLE_META_MUSIC = {
  audio: [
    {
      audio_id: '587784541076604',
      cover_artwork_thumbnail_uri: 'https://cdn.example/cover.jpg',
      display_artist: 'Shuba',
      duration_in_ms: 153760,
      audio_type: 'music',
      title: 'Birthday Wish',
      download_url: 'https://cdn.example/preview.mp4',
    },
  ],
};

describe('Instagram Audio Search Phase C', () => {
  it('success: parses Meta music + original_sound results and builds official URL', async () => {
    const url = buildIgAudioSearchUrl({
      audioType: 'music',
      igUserId: '17841400000000000',
      searchQuery: 'birthday',
      accessToken: 'EAA_TEST_TOKEN',
    });
    expect(url.startsWith('https://graph.facebook.com/v25.0/ig_audio?')).toBe(true);
    expect(url).toContain('audio_type=music');
    expect(url).toContain('user_id=17841400000000000');
    expect(url).toContain('search_query=birthday');

    const parsed = parseIgAudioSearchResponse(SAMPLE_META_MUSIC, 'music');
    expect(parsed).toEqual([
      {
        audio_id: '587784541076604',
        audio_type: 'music',
        title: 'Birthday Wish',
        artist: 'Shuba',
        duration_ms: 153760,
        cover_url: 'https://cdn.example/cover.jpg',
        preview_url: 'https://cdn.example/preview.mp4',
        ig_username: null,
      },
    ]);

    const fetchFn = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            audio: [
              {
                audio_id: '99',
                audio_type: 'original_sound',
                title: 'Clip',
                ig_username: 'creator',
                duration_in_ms: 12000,
              },
            ],
          }),
          { status: 200 }
        )
    );
    const result = await searchInstagramAudio({
      accessToken: 'token',
      igUserId: 'ig-1',
      audioType: 'original_sound',
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(result.audio[0]).toMatchObject({
      audio_id: '99',
      audio_type: 'original_sound',
      artist: 'creator',
      ig_username: 'creator',
    });
    expect(assertNoTokenLeak(result)).toBe(true);
  });

  it('missing Facebook connection → search gated', () => {
    expect(
      assertAudioSearchConnection({
        status: 'disconnected',
        igUserId: null,
        scopes: [],
        hasUserToken: false,
      })
    ).toEqual({ ok: false, error: 'facebook_connection_missing' });

    expect(
      assertAudioSearchConnection({
        status: null,
        igUserId: '1',
        scopes: ['instagram_basic', 'instagram_content_publish'],
        hasUserToken: true,
      }).ok
    ).toBe(false);

    expect(resolveInstagramMusicCapability(null).audio_search_available).toBe(false);
  });

  it('missing permission → search blocked even if connected', () => {
    const gate = assertAudioSearchConnection({
      status: 'connected',
      igUserId: 'ig-1',
      scopes: ['instagram_basic', 'pages_show_list', 'pages_read_engagement'],
      hasUserToken: true,
    });
    expect(gate).toEqual({
      ok: false,
      error: 'missing_permission',
      missingScopes: ['instagram_content_publish'],
    });

    const classified = classifyMetaAudioSearchError({
      httpStatus: 403,
      body: {
        error: {
          message: '(#10) Application does not have permission for this action',
          type: 'OAuthException',
          code: 10,
        },
      },
    });
    expect(classified.code).toBe('missing_permission');
    expect(classified.message).toContain('permission');
  });

  it('Meta API error is classified and sanitized (no token leak)', async () => {
    const classified = classifyMetaAudioSearchError({
      httpStatus: 500,
      body: {
        error: {
          message: 'Unexpected failure access_token=EAAsecret12345678901234567890',
          code: 1,
        },
      },
    });
    expect(classified.code).toBe('meta_api_error');
    expect(classified.message).not.toContain('EAAsecret');
    expect(sanitizeAudioMetaError('token=EAAabcdefghijklmnopqr')).toContain('[redacted]');

    const fetchFn = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: { message: 'service unavailable', code: 2 },
          }),
          { status: 503 }
        )
    );
    await expect(
      searchInstagramAudio({
        accessToken: 'EAAxxxxxxxxxxxxxxxxxxxx',
        igUserId: 'ig-1',
        audioType: 'music',
        fetchFn: fetchFn as unknown as typeof fetch,
      })
    ).rejects.toMatchObject({ code: 'meta_api_error' });
  });

  it('does not alter Instagram OAuth / publish / audio_configuration paths', () => {
    const oauth = readFileSync(
      join(process.cwd(), 'supabase/functions/_shared/instagram-oauth/types.ts'),
      'utf8'
    );
    expect(oauth).toMatch(/instagram_business_basic/);
    expect(oauth).not.toMatch(/ig_audio/);

    const fields = buildMediaContainerFields({
      mediaKind: 'video',
      format: 'reel',
      mediaUrl: 'https://example.com/v.mp4',
      caption: 'x',
    });
    expect(fields).not.toHaveProperty('audio_configuration');

    const edgeSearch = readFileSync(
      join(process.cwd(), 'supabase/functions/instagram-audio-search/index.ts'),
      'utf8'
    );
    expect(edgeSearch).toMatch(/content_facebook_business_connections/);
    expect(edgeSearch).toMatch(/searchInstagramAudio/);
    // Search-only: must not build or send publish audio_configuration payloads.
    expect(edgeSearch).not.toMatch(/audio_configuration\s*[:=]/);
    expect(edgeSearch).not.toMatch(/media_publish|createMediaContainer/);
    expect(edgeSearch).not.toMatch(/from '\.\.\/_shared\/instagram-oauth/);
  });

  it('valid FB connection with Audio scopes enables audio_search_available', () => {
    const cap = resolveInstagramMusicCapability({
      status: 'connected',
      fbUserId: 'fb',
      pageId: 'page',
      pageName: 'Page',
      igUserId: 'ig',
      igUsername: 'user',
      scopes: [
        'instagram_basic',
        'instagram_content_publish',
        'pages_show_list',
        'pages_read_engagement',
      ],
      connectedAt: '2026-08-09T00:00:00Z',
      lastError: null,
      oauthConfigured: true,
      instagramMusicAvailable: true,
    });
    expect(cap.instagram_music_available).toBe(true);
    expect(cap.audio_search_available).toBe(true);
    expect(cap.audio_publish_available).toBe(true);
  });
});
