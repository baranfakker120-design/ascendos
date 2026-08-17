import { describe, expect, it } from 'vitest';
import { AUTOPILOT_DEFAULT_STORIES_PER_DAY, resolveAutopilotSlotCaps } from './publishingMode';
import {
  buildAutopilotStartPayload,
  classifyInstagramConnection,
  clampUserStoryCount,
  mapAutopilotActionError,
  resolveStoredStoryCount,
  showsStoryCountControl,
} from './startFlow';

describe('autopilot start flow — mode + story count payload', () => {
  it('1-5. Nur Stories + count 4 then 6 → server payload stories/6', () => {
    expect(showsStoryCountControl('stories')).toBe(true);
    const afterSelect = buildAutopilotStartPayload({
      publishingMode: 'stories',
      maxStoriesPerDay: 4,
    });
    expect(afterSelect).toEqual({ publishingMode: 'stories', maxStoriesPerDay: 4 });
    const afterBump = buildAutopilotStartPayload({
      publishingMode: 'stories',
      maxStoriesPerDay: 6,
    });
    expect(afterBump).toEqual({ publishingMode: 'stories', maxStoriesPerDay: 6 });
    const caps = resolveAutopilotSlotCaps({
      publishingMode: afterBump.publishingMode,
      maxFeedPerDay: 3,
      maxStoriesPerDay: afterBump.maxStoriesPerDay,
    });
    expect(caps.maxFeedPerDay).toBe(0);
    expect(caps.maxStoriesPerDay).toBe(6);
    expect(caps.generateStories).toBe(true);
  });

  it('6-10. Nur Feed hides story count and plans no story slots', () => {
    expect(showsStoryCountControl('feed')).toBe(false);
    const payload = buildAutopilotStartPayload({
      publishingMode: 'feed',
      maxStoriesPerDay: 6,
    });
    expect(payload.publishingMode).toBe('feed');
    const caps = resolveAutopilotSlotCaps({
      publishingMode: payload.publishingMode,
      maxFeedPerDay: 3,
      maxStoriesPerDay: payload.maxStoriesPerDay,
    });
    expect(caps.maxStoriesPerDay).toBe(0);
    expect(caps.generateStories).toBe(false);
    expect(caps.generateFeed).toBe(true);
  });

  it('11-13. Full → feed + story slots', () => {
    const payload = buildAutopilotStartPayload({
      publishingMode: 'full',
      maxStoriesPerDay: 4,
    });
    expect(payload).toEqual({ publishingMode: 'full', maxStoriesPerDay: 4 });
    const caps = resolveAutopilotSlotCaps({
      publishingMode: 'full',
      maxFeedPerDay: 3,
      maxStoriesPerDay: 4,
    });
    expect(caps.generateFeed).toBe(true);
    expect(caps.generateStories).toBe(true);
    expect(caps.maxStoriesPerDay).toBe(4);
  });

  it('14-15. Marked Stories stays manual_required', () => {
    const payload = buildAutopilotStartPayload({
      publishingMode: 'marked_stories',
      maxStoriesPerDay: 4,
    });
    const caps = resolveAutopilotSlotCaps({
      publishingMode: payload.publishingMode,
      maxFeedPerDay: 3,
      maxStoriesPerDay: payload.maxStoriesPerDay,
    });
    expect(caps.autoPublish).toBe(false);
    expect(caps.generateFeed).toBe(false);
    expect(caps.generateStories).toBe(true);
  });

  it('16-17. missing stored count defaults to 4; existing 3 is preserved', () => {
    expect(AUTOPILOT_DEFAULT_STORIES_PER_DAY).toBe(4);
    expect(resolveStoredStoryCount(null)).toBe(4);
    expect(resolveStoredStoryCount(undefined)).toBe(4);
    expect(resolveStoredStoryCount(3)).toBe(3);
    expect(resolveStoredStoryCount(6)).toBe(6);
  });

  it('18-19. mode switch payload is the clicked mode, not a stale full/3', () => {
    const stale = { publishingMode: 'full' as const, maxStoriesPerDay: 3 };
    const next = buildAutopilotStartPayload({
      publishingMode: 'stories',
      maxStoriesPerDay: stale.maxStoriesPerDay,
    });
    expect(next.publishingMode).toBe('stories');
    expect(next.publishingMode).not.toBe('full');
  });

  it('20-21. successful start payload has no generic error mapping', () => {
    expect(mapAutopilotActionError('')).toBe('contentAssistant.autopilotActionFailed');
    expect(mapAutopilotActionError('ok')).toBe('contentAssistant.autopilotActionFailed');
  });

  it('22-23. Instagram missing / expired → concrete keys', () => {
    expect(mapAutopilotActionError('instagram_not_connected')).toBe(
      'contentAssistant.autopilotNeedInstagram'
    );
    expect(mapAutopilotActionError('instagram_expired')).toBe(
      'contentAssistant.autopilotNeedInstagramExpired'
    );
    expect(classifyInstagramConnection({ status: 'disconnected' })).toBe('instagram_not_connected');
    expect(
      classifyInstagramConnection({
        status: 'error',
        lastError: 'OAuthException code 190 session has been invalidated',
      })
    ).toBe('instagram_expired');
    expect(
      classifyInstagramConnection({
        status: 'connected',
        igUserId: '1',
        tokenRef: 'vault:x',
        scopes: ['instagram_business_content_publish'],
      })
    ).toBe('ok');
  });

  it('24-25. no suitable assets → concrete key, not generic', () => {
    expect(mapAutopilotActionError('below_min_assets')).toBe(
      'contentAssistant.autopilotNeedAssets'
    );
    expect(mapAutopilotActionError('insufficient_story_assets')).toBe(
      'contentAssistant.autopilotNeedAssets'
    );
  });

  it('clamps user story count 1..10', () => {
    expect(clampUserStoryCount(0, 4)).toBe(1);
    expect(clampUserStoryCount(11)).toBe(10);
    expect(clampUserStoryCount(6)).toBe(6);
  });
});
