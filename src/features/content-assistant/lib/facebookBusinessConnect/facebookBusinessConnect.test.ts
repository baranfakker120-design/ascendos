import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertNoTokenLeak,
  buildFacebookBusinessAuthorizeUrl,
  FB_MUSIC_CONNECT_SCOPES,
  parseFbCallbackParam,
  resolveInstagramMusicAvailable,
  selectPageForConnection,
  toSafeFacebookBusinessConnection,
} from './index';
import {
  INSTAGRAM_MUSIC_CAPABILITY,
  buildAudioConfigurationForPublish,
  resolveInstagramMusicCapability,
} from '../instagramPublish/instagramMusicFoundation';
import { buildAuthorizeUrl } from '../instagramConnect';
import { buildMediaContainerFields, resolveMediaProduct } from '../instagramPublish/graphPublish';

describe('Facebook Login for Business Phase B', () => {
  it('existing Instagram OAuth authorize path remains Instagram Login', () => {
    const url = buildAuthorizeUrl({
      appId: '990602627938098',
      redirectUri: 'https://example.supabase.co/functions/v1/instagram-oauth',
      state: 'abc.def',
    });
    expect(url.startsWith('https://www.instagram.com/oauth/authorize?')).toBe(true);
    expect(url).toContain('instagram_business_basic');
    expect(url).toContain('instagram_business_content_publish');
    expect(url).not.toContain('facebook.com/v25.0/dialog/oauth');

    const oauthTypes = readFileSync(
      join(process.cwd(), 'supabase/functions/_shared/instagram-oauth/types.ts'),
      'utf8'
    );
    expect(oauthTypes).toMatch(/instagram_business_basic/);
    expect(oauthTypes).not.toMatch(/FB_MUSIC_CONNECT_SCOPES/);
  });

  it('Facebook connection authorize URL is separate (facebook.com dialog)', () => {
    const url = buildFacebookBusinessAuthorizeUrl({
      appId: '990602627938098',
      redirectUri: 'https://example.supabase.co/functions/v1/facebook-business-oauth',
      state: 'state.sig',
    });
    expect(url.startsWith('https://www.facebook.com/v25.0/dialog/oauth?')).toBe(true);
    expect(url).toContain('response_type=code');
    expect(url).toContain('display=page');
    expect(url).toContain('instagram_basic');
    expect(url).toContain('instagram_content_publish');
    expect(url).toContain('pages_show_list');
    expect(url).toContain('pages_read_engagement');
    expect(url).toContain('IG_API_ONBOARDING');
    expect(url).not.toContain('instagram.com/oauth/authorize');
    expect(url).not.toContain('config_id=');
    expect(FB_MUSIC_CONNECT_SCOPES).toEqual([
      'instagram_basic',
      'instagram_content_publish',
      'pages_show_list',
      'pages_read_engagement',
    ]);
  });

  it('Facebook Login for Business authorize URL uses config_id when Configuration ID is set', () => {
    const configId = '1338226758054489';
    const url = buildFacebookBusinessAuthorizeUrl({
      appId: '990602627938098',
      redirectUri: 'https://shaydtihwicnocjjlnjm.supabase.co/functions/v1/facebook-business-oauth',
      state: 'state.sig',
      configId,
    });
    expect(url.startsWith('https://www.facebook.com/v25.0/dialog/oauth?')).toBe(true);
    expect(url).toContain(`config_id=${configId}`);
    expect(url).toContain('response_type=code');
    expect(url).toContain('state=state.sig');
    expect(url).toContain(
      'redirect_uri=' +
        encodeURIComponent(
          'https://shaydtihwicnocjjlnjm.supabase.co/functions/v1/facebook-business-oauth'
        )
    );
    // Meta recommends omitting scope when config_id drives the login configuration.
    expect(url).not.toContain('scope=');
    expect(url).toContain('IG_API_ONBOARDING');
  });

  it('missing Facebook connection → music capability false', () => {
    expect(INSTAGRAM_MUSIC_CAPABILITY.instagram_music_available).toBe(false);
    expect(resolveInstagramMusicCapability(null).instagram_music_available).toBe(false);
    expect(
      resolveInstagramMusicCapability(
        toSafeFacebookBusinessConnection({
          status: 'disconnected',
          instagramMusicAvailable: false,
        })
      ).instagram_music_available
    ).toBe(false);
    expect(
      resolveInstagramMusicAvailable({
        status: 'connected',
        pageId: null,
        igUserId: '1',
        scopes: [...FB_MUSIC_CONNECT_SCOPES],
        hasEncryptedPageToken: true,
      })
    ).toBe(false);
  });

  it('valid Facebook connection → music can be activated', () => {
    expect(
      resolveInstagramMusicAvailable({
        status: 'connected',
        pageId: 'page-1',
        igUserId: 'ig-1',
        scopes: [...FB_MUSIC_CONNECT_SCOPES],
        hasEncryptedPageToken: true,
      })
    ).toBe(true);

    const safe = toSafeFacebookBusinessConnection({
      status: 'connected',
      pageId: 'page-1',
      pageName: 'Demo Page',
      igUserId: 'ig-1',
      igUsername: 'demo',
      scopes: [...FB_MUSIC_CONNECT_SCOPES],
      instagramMusicAvailable: true,
      oauthConfigured: true,
    });
    expect(safe.instagramMusicAvailable).toBe(true);
    const cap = resolveInstagramMusicCapability(safe);
    expect(cap.instagram_music_available).toBe(true);
    expect(cap.facebook_login_connected).toBe(true);
    // Phase C/D: search + publish attach enabled when Audio API scopes present.
    expect(cap.audio_search_available).toBe(true);
    expect(cap.audio_publish_available).toBe(true);
  });

  it('no tokens in client-safe connection payloads', () => {
    const safe = toSafeFacebookBusinessConnection({
      status: 'connected',
      pageId: 'p',
      igUserId: 'i',
      scopes: [...FB_MUSIC_CONNECT_SCOPES],
      instagramMusicAvailable: true,
      page_token_ref: 'v1.should.not.leak',
      user_token_ref: 'v1.nope',
      access_token: 'EAAxxxxxxxxxxxxxxxxxxxxxxxx',
      accessToken: 'secret',
    } as Record<string, unknown>);
    expect(assertNoTokenLeak(safe)).toBe(true);
    expect(JSON.stringify(safe)).not.toMatch(/token_ref|access_token|EAA/);
    expect(assertNoTokenLeak({ connection: { page_token_ref: 'x' } })).toBe(false);
    expect(assertNoTokenLeak({ connection: { accessToken: 'x' } })).toBe(false);
  });

  it('existing publish without music unchanged', () => {
    expect(resolveMediaProduct({ mediaKind: 'image', format: 'feed' })).toEqual({
      mediaType: null,
      useImageUrl: true,
      useVideoUrl: false,
      shareToFeed: false,
    });
    expect(resolveMediaProduct({ mediaKind: 'video', format: 'reel' })).toEqual({
      mediaType: 'REELS',
      useImageUrl: false,
      useVideoUrl: true,
      shareToFeed: true,
    });
    const fields = buildMediaContainerFields({
      mediaKind: 'video',
      format: 'reel',
      mediaUrl: 'https://example.com/v.mp4',
      caption: 'hi',
    });
    expect(fields).not.toHaveProperty('audio_configuration');
    expect(
      buildAudioConfigurationForPublish({
        musicAvailable: true,
        selection: null,
      })
    ).toBeNull();
    expect(
      buildAudioConfigurationForPublish({
        selection: {
          audio_id: '1',
          audio_type: 'music',
        },
      })
    ).toBeNull();

    const edgeGraph = readFileSync(
      join(process.cwd(), 'supabase/functions/_shared/instagram-publish/graph.ts'),
      'utf8'
    );
    // Without a selection, container fields must stay identical to pre-music publish.
    expect(edgeGraph).toMatch(/audio_configuration/);
    expect(fields).not.toHaveProperty('audio_configuration');
  });

  it('selects preferred IG page when multiple pages exist', () => {
    const selected = selectPageForConnection({
      pages: [
        { pageId: 'p1', igUserId: 'ig-a' },
        { pageId: 'p2', igUserId: 'ig-b' },
      ],
      preferredIgUserId: 'ig-b',
    });
    expect(selected).toEqual({ pageId: 'p2', igUserId: 'ig-b' });
  });

  it('parses fb callback query params', () => {
    expect(parseFbCallbackParam('connected')).toBe('connected');
    expect(parseFbCallbackParam('cancelled')).toBe('cancelled');
    expect(parseFbCallbackParam('nope')).toBeNull();
  });

  it('does not invent music availability from incomplete connected rows', () => {
    expect(
      toSafeFacebookBusinessConnection({
        status: 'connected',
        pageId: 'p',
        igUserId: 'i',
        scopes: [...FB_MUSIC_CONNECT_SCOPES],
        // server did not confirm token-backed eligibility
        instagramMusicAvailable: false,
      }).instagramMusicAvailable
    ).toBe(false);
    expect(
      toSafeFacebookBusinessConnection({
        status: 'connected',
        pageId: 'p',
        // missing ig
        scopes: [...FB_MUSIC_CONNECT_SCOPES],
        instagramMusicAvailable: true,
      }).instagramMusicAvailable
    ).toBe(false);
  });
});
