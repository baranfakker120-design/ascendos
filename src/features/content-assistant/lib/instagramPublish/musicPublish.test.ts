import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildMediaContainerFields, publishErrorI18nKey } from './graphPublish';
import {
  buildAudioConfigurationPayload,
  planMusicPublish,
  shouldLoadFacebookConnectionForPublish,
  shouldPlanMusicPublish,
} from './musicPublish';
import { assertNoTokenLeak } from '../instagramAudio';

const validFb = {
  status: 'connected',
  igUserId: '17841400000000000',
  scopes: [
    'instagram_basic',
    'instagram_content_publish',
    'pages_show_list',
    'pages_read_engagement',
  ],
  hasPageToken: true,
};

const validAudio = {
  audio_id: '587784541076604',
  audio_type: 'music',
  title: 'Birthday Wish',
  artist: 'Shuba',
  audio_volume: 80,
  video_volume: 50,
};

function edgePublishSource(): string {
  return readFileSync(join(process.cwd(), 'supabase/functions/instagram-publish/index.ts'), 'utf8');
}

/**
 * Simulate Edge Fix 1/2 gate: alreadyPublished wins; FB/music only when not published + audio.
 */
function resolvePublishMusicGate(params: {
  alreadyPublishedMediaId: string | null | undefined;
  instagramAudioJson: unknown;
  mediaKind: 'image' | 'video';
  format: string;
  facebookConnection: typeof validFb | null;
}):
  | { outcome: 'alreadyPublished' }
  | { outcome: 'music'; plan: ReturnType<typeof planMusicPublish>; loadedFacebook: boolean }
  | { outcome: 'none'; loadedFacebook: boolean } {
  if (!shouldPlanMusicPublish({ alreadyPublishedMediaId: params.alreadyPublishedMediaId })) {
    return { outcome: 'alreadyPublished' };
  }
  const loadedFacebook = shouldLoadFacebookConnectionForPublish(params.instagramAudioJson);
  if (!loadedFacebook) {
    return { outcome: 'none', loadedFacebook: false };
  }
  return {
    outcome: 'music',
    loadedFacebook: true,
    plan: planMusicPublish({
      instagramAudioJson: params.instagramAudioJson,
      mediaKind: params.mediaKind,
      format: params.format,
      facebookConnection: params.facebookConnection,
    }),
  };
}

describe('Instagram Music Publish Phase D', () => {
  it('A) Reel without music → old publish request fields (no audio_configuration)', () => {
    const plan = planMusicPublish({
      instagramAudioJson: null,
      mediaKind: 'video',
      format: 'reel',
      facebookConnection: validFb,
    });
    expect(plan.mode).toBe('none');
    const fields = buildMediaContainerFields({
      mediaKind: 'video',
      format: 'reel',
      mediaUrl: 'https://example.com/v.mp4',
      caption: 'hello',
    });
    expect(fields).toEqual({
      video_url: 'https://example.com/v.mp4',
      media_type: 'REELS',
      share_to_feed: 'true',
      caption: 'hello',
    });
    expect(fields).not.toHaveProperty('audio_configuration');
  });

  it('B) Reel with valid music → audio_configuration present', () => {
    const plan = planMusicPublish({
      instagramAudioJson: validAudio,
      mediaKind: 'video',
      format: 'reel',
      facebookConnection: validFb,
    });
    expect(plan.mode).toBe('attach');
    if (plan.mode !== 'attach') throw new Error('expected attach');
    expect(plan.graphHost).toBe('https://graph.facebook.com');
    expect(plan.audioConfiguration).toEqual({
      audio_id: '587784541076604',
      audio_volume: 80,
      video_volume: 50,
    });
    const fields = buildMediaContainerFields({
      mediaKind: 'video',
      format: 'reel',
      mediaUrl: 'https://example.com/v.mp4',
      caption: 'hello',
      audioConfiguration: plan.audioConfiguration,
    });
    expect(fields.audio_configuration).toBe(
      JSON.stringify({
        audio_id: '587784541076604',
        audio_volume: 80,
        video_volume: 50,
      })
    );
  });

  it('C) Feed + music → controlled error / no audio_configuration', () => {
    const plan = planMusicPublish({
      instagramAudioJson: validAudio,
      mediaKind: 'image',
      format: 'feed',
      facebookConnection: validFb,
    });
    expect(plan).toMatchObject({ mode: 'error', error: 'MUSIC_NOT_SUPPORTED_FOR_FEED' });
    const fields = buildMediaContainerFields({
      mediaKind: 'image',
      format: 'feed',
      mediaUrl: 'https://example.com/i.jpg',
      caption: 'hello',
      audioConfiguration: buildAudioConfigurationPayload(validAudio),
    });
    expect(fields).not.toHaveProperty('audio_configuration');
  });

  it('D) Music without FB connection → MUSIC_CONNECTION_REQUIRED', () => {
    expect(
      planMusicPublish({
        instagramAudioJson: validAudio,
        mediaKind: 'video',
        format: 'reel',
        facebookConnection: null,
      })
    ).toMatchObject({ mode: 'error', error: 'MUSIC_CONNECTION_REQUIRED' });
    expect(
      planMusicPublish({
        instagramAudioJson: validAudio,
        mediaKind: 'video',
        format: 'reel',
        facebookConnection: {
          status: 'connected',
          igUserId: '1',
          scopes: ['instagram_basic'],
          hasPageToken: true,
        },
      })
    ).toMatchObject({ mode: 'error', error: 'MUSIC_CONNECTION_REQUIRED' });
  });

  it('E) missing / invalid audio_id → MUSIC_AUDIO_INVALID', () => {
    expect(
      planMusicPublish({
        instagramAudioJson: { audio_type: 'music' },
        mediaKind: 'video',
        format: 'reel',
        facebookConnection: validFb,
      })
    ).toMatchObject({ mode: 'error', error: 'MUSIC_AUDIO_INVALID' });
    expect(
      planMusicPublish({
        instagramAudioJson: { audio_id: 'not-a-number', audio_type: 'music' },
        mediaKind: 'video',
        format: 'reel',
        facebookConnection: validFb,
      })
    ).toMatchObject({ mode: 'error', error: 'MUSIC_AUDIO_INVALID' });
  });

  it('F) Meta audio error maps to sanitized i18n key (no tokens)', () => {
    expect(publishErrorI18nKey('MUSIC_META_REJECTED')).toBe('igMusicMetaRejected');
    expect(publishErrorI18nKey('MUSIC_CONNECTION_REQUIRED')).toBe('igMusicConnectionRequired');
    expect(publishErrorI18nKey('MUSIC_AUDIO_INVALID')).toBe('igMusicAudioInvalid');
    const payload = {
      ok: false,
      error: 'MUSIC_META_REJECTED',
      message: 'Invalid parameter access_token=[redacted]',
    };
    expect(assertNoTokenLeak(payload)).toBe(true);
  });

  it('G/H) Idempotency guards remain in Edge publish function', () => {
    const edge = edgePublishSource();
    expect(edge).toMatch(/already_in_progress/);
    expect(edge).toMatch(/alreadyPublished/);
    expect(edge).toMatch(/meta_media_id/);
    expect(edge).toMatch(/23505/);
  });

  it('I) Instagram OAuth unchanged', () => {
    const oauth = readFileSync(
      join(process.cwd(), 'supabase/functions/_shared/instagram-oauth/types.ts'),
      'utf8'
    );
    expect(oauth).toMatch(/instagram_business_basic/);
    expect(oauth).toMatch(/instagram_business_content_publish/);
    expect(oauth).not.toMatch(/audio_configuration/);
  });

  it('J) Feed publish fields unchanged without music', () => {
    expect(
      buildMediaContainerFields({
        mediaKind: 'image',
        format: 'feed',
        mediaUrl: 'https://example.com/i.jpg',
        caption: 'cap',
      })
    ).toEqual({
      image_url: 'https://example.com/i.jpg',
      caption: 'cap',
    });
  });

  it('K) Reel without music fields unchanged', () => {
    expect(
      buildMediaContainerFields({
        mediaKind: 'video',
        format: 'reel',
        mediaUrl: 'https://example.com/v.mp4',
        caption: 'cap',
        audioConfiguration: null,
      })
    ).toEqual({
      video_url: 'https://example.com/v.mp4',
      media_type: 'REELS',
      share_to_feed: 'true',
      caption: 'cap',
    });
  });

  it('L/M) Secrets / tokens never appear in client plan payloads', () => {
    const plan = planMusicPublish({
      instagramAudioJson: validAudio,
      mediaKind: 'video',
      format: 'reel',
      facebookConnection: validFb,
    });
    expect(assertNoTokenLeak(plan)).toBe(true);
    expect(JSON.stringify(plan)).not.toMatch(/access_token|token_ref|EAA/);
  });
});

describe('Phase D blocker fixes — regression', () => {
  it('1) already published + audio + no FB → alreadyPublished, no MUSIC_*', () => {
    const gate = resolvePublishMusicGate({
      alreadyPublishedMediaId: '17841499999999999',
      instagramAudioJson: validAudio,
      mediaKind: 'video',
      format: 'reel',
      facebookConnection: null,
    });
    expect(gate).toEqual({ outcome: 'alreadyPublished' });
    expect(shouldPlanMusicPublish({ alreadyPublishedMediaId: '17841499999999999' })).toBe(false);
  });

  it('2) already published + invalid audio_id → alreadyPublished, no MUSIC_AUDIO_INVALID', () => {
    const gate = resolvePublishMusicGate({
      alreadyPublishedMediaId: 'media-already',
      instagramAudioJson: { audio_id: 'not-digits', audio_type: 'music' },
      mediaKind: 'video',
      format: 'reel',
      facebookConnection: null,
    });
    expect(gate.outcome).toBe('alreadyPublished');
    // If music were planned, this would be MUSIC_AUDIO_INVALID — gate must skip that.
    expect(
      planMusicPublish({
        instagramAudioJson: { audio_id: 'not-digits', audio_type: 'music' },
        mediaKind: 'video',
        format: 'reel',
        facebookConnection: validFb,
      })
    ).toMatchObject({ mode: 'error', error: 'MUSIC_AUDIO_INVALID' });
  });

  it('3) Reel without audio → no FB query; IG path fields only', () => {
    expect(shouldLoadFacebookConnectionForPublish(null)).toBe(false);
    expect(shouldLoadFacebookConnectionForPublish({})).toBe(false);
    const gate = resolvePublishMusicGate({
      alreadyPublishedMediaId: null,
      instagramAudioJson: null,
      mediaKind: 'video',
      format: 'reel',
      facebookConnection: null,
    });
    expect(gate).toEqual({ outcome: 'none', loadedFacebook: false });
    expect(
      buildMediaContainerFields({
        mediaKind: 'video',
        format: 'reel',
        mediaUrl: 'https://example.com/v.mp4',
        caption: 'cap',
      })
    ).not.toHaveProperty('audio_configuration');
  });

  it('4) Feed without audio → no FB query; IG path fields only', () => {
    expect(shouldLoadFacebookConnectionForPublish(null)).toBe(false);
    const gate = resolvePublishMusicGate({
      alreadyPublishedMediaId: null,
      instagramAudioJson: null,
      mediaKind: 'image',
      format: 'feed',
      facebookConnection: null,
    });
    expect(gate).toEqual({ outcome: 'none', loadedFacebook: false });
    expect(
      buildMediaContainerFields({
        mediaKind: 'image',
        format: 'feed',
        mediaUrl: 'https://example.com/i.jpg',
        caption: 'cap',
      })
    ).toEqual({
      image_url: 'https://example.com/i.jpg',
      caption: 'cap',
    });
  });

  it('5) Reel with audio + no FB connection → MUSIC_CONNECTION_REQUIRED', () => {
    const gate = resolvePublishMusicGate({
      alreadyPublishedMediaId: null,
      instagramAudioJson: validAudio,
      mediaKind: 'video',
      format: 'reel',
      facebookConnection: null,
    });
    expect(gate.outcome).toBe('music');
    if (gate.outcome !== 'music') throw new Error('expected music');
    expect(gate.loadedFacebook).toBe(true);
    expect(gate.plan).toMatchObject({ mode: 'error', error: 'MUSIC_CONNECTION_REQUIRED' });
  });

  it('6) Reel with audio + valid FB → graph.facebook.com + audio_configuration', () => {
    const gate = resolvePublishMusicGate({
      alreadyPublishedMediaId: null,
      instagramAudioJson: validAudio,
      mediaKind: 'video',
      format: 'reel',
      facebookConnection: validFb,
    });
    expect(gate.outcome).toBe('music');
    if (gate.outcome !== 'music') throw new Error('expected music');
    expect(gate.plan.mode).toBe('attach');
    if (gate.plan.mode !== 'attach') throw new Error('expected attach');
    expect(gate.plan.graphHost).toBe('https://graph.facebook.com');
    expect(gate.plan.audioConfiguration).toEqual({
      audio_id: '587784541076604',
      audio_volume: 80,
      video_volume: 50,
    });
  });

  it('7) Feed with audio → MUSIC_NOT_SUPPORTED_FOR_FEED', () => {
    const gate = resolvePublishMusicGate({
      alreadyPublishedMediaId: null,
      instagramAudioJson: validAudio,
      mediaKind: 'image',
      format: 'feed',
      facebookConnection: validFb,
    });
    expect(gate.outcome).toBe('music');
    if (gate.outcome !== 'music') throw new Error('expected music');
    expect(gate.plan).toMatchObject({ mode: 'error', error: 'MUSIC_NOT_SUPPORTED_FOR_FEED' });
  });

  it('8) Doppelklick/Parallel-Publish — bestehende Idempotenz unverändert', () => {
    const edge = edgePublishSource();
    expect(edge).toMatch(/already_in_progress/);
    expect(edge).toMatch(/alreadyPublished:\s*true/);
    expect(edge).toMatch(/23505/);
    expect(edge).toMatch(/re-check before media_publish/);
    // Fix 1 order: published lookup returns before music / FB table.
    const alreadyBlock = edge.indexOf(
      'Idempotency: already published for this draft → return success, no second post.'
    );
    const musicBlock = edge.indexOf('Phase D: music attach only when not already published.');
    const fbTable = edge.indexOf("from('content_facebook_business_connections')");
    const planCall = edge.indexOf('planMusicPublish({');
    expect(alreadyBlock).toBeGreaterThan(-1);
    expect(musicBlock).toBeGreaterThan(alreadyBlock);
    expect(fbTable).toBeGreaterThan(musicBlock);
    expect(planCall).toBeGreaterThan(fbTable);
    // Fix 2: FB table only inside draftHasAudioSelection gate.
    expect(edge).toMatch(
      /if \(draftHasAudioSelection\(draft\.instagram_audio_json\)\) \{[\s\S]*?content_facebook_business_connections/
    );
    // Single runtime query (comment may also mention the table name).
    expect(edge.match(/\.from\('content_facebook_business_connections'\)/g)?.length).toBe(1);
  });
});
