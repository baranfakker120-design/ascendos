import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  extractPublishingPrefsFromBody,
  parseAutopilotPublishingMode,
  resolvePublishingPrefsPatch,
} from './publishingMode';
import {
  buildAutopilotStartPayload,
  isFullAutopilotState,
  mergeActivateWithGetState,
  rehydrateAutopilotDraft,
  selectDisplayedPublishingMode,
  selectDisplayedStoryCount,
  startPrefsPersistedInSettings,
  toAutopilotInvokeBody,
  type AutopilotStartPrefs,
} from './startFlow';

type DbRow = {
  publishing_mode: string;
  max_stories_per_day: number;
  enabled: boolean;
};

type Draft = {
  mode: ReturnType<typeof selectDisplayedPublishingMode> | null;
  stories: number | null;
  dirty: boolean;
};

function display(draft: Draft, db: DbRow) {
  return {
    mode: selectDisplayedPublishingMode(draft.mode, db.publishing_mode),
    stories: selectDisplayedStoryCount(draft.stories, db.max_stories_per_day),
  };
}

function clickMode(draft: Draft, mode: Draft['mode']): Draft {
  return { ...draft, mode, dirty: true };
}

function setStories(draft: Draft, stories: number): Draft {
  return { ...draft, stories, dirty: true };
}

function applyStartToDb(db: DbRow, requestBody: unknown, requireMode = true): DbRow {
  const resolved = resolvePublishingPrefsPatch({
    body: requestBody,
    storedMode: db.publishing_mode,
    storedStories: db.max_stories_per_day,
    requireMode,
  });
  if (!resolved.ok) {
    throw new Error(resolved.error);
  }
  return {
    ...db,
    publishing_mode: resolved.patch.publishing_mode,
    max_stories_per_day: resolved.patch.max_stories_per_day ?? db.max_stories_per_day,
    enabled: true,
  };
}

function commitAfterStart(draft: Draft, request: AutopilotStartPrefs, db: DbRow): Draft {
  const activateResponse = {
    settings: {
      publishing_mode: db.publishing_mode,
      max_stories_per_day: db.max_stories_per_day,
    },
    eligibility: {
      publishingMode: db.publishing_mode,
      maxStoriesPerDay: db.max_stories_per_day,
    },
  };
  const staleGetState = {
    settings: { publishing_mode: 'full' as const, max_stories_per_day: 4 },
    eligibility: { publishingMode: 'full' as const, maxStoriesPerDay: 4 },
  };
  const cache = isFullAutopilotState(activateResponse)
    ? activateResponse
    : mergeActivateWithGetState(activateResponse, staleGetState);
  if (!startPrefsPersistedInSettings(request, cache.settings)) {
    return draft;
  }
  const next = rehydrateAutopilotDraft({
    dirty: false,
    draftMode: request.publishingMode,
    draftStories: request.maxStoriesPerDay,
    storedMode: cache.settings?.publishing_mode,
    storedStories: cache.settings?.max_stories_per_day,
  });
  return { mode: next.mode, stories: next.stories, dirty: false };
}

function reloadFromDb(db: DbRow): Draft {
  const next = rehydrateAutopilotDraft({
    dirty: false,
    draftMode: null,
    draftStories: null,
    storedMode: db.publishing_mode,
    storedStories: db.max_stories_per_day,
  });
  return { mode: next.mode, stories: next.stories, dirty: false };
}

describe('autopilot start user flow — mode must not revert to full', () => {
  it('full/4 → Nur Stories → 6 → Autopilot starten → request, DB, UI, refetch, reload stay stories/6', () => {
    let db: DbRow = { publishing_mode: 'full', max_stories_per_day: 4, enabled: false };
    let draft: Draft = { mode: null, stories: null, dirty: false };
    draft = reloadFromDb(db);
    expect(display(draft, db)).toEqual({ mode: 'full', stories: 4 });

    draft = clickMode(draft, 'stories');
    expect(display(draft, db).mode).toBe('stories');
    expect(display(draft, db).mode).not.toBe('full');

    draft = setStories(draft, 6);
    expect(display(draft, db).stories).toBe(6);

    const request = buildAutopilotStartPayload({
      publishingMode: display(draft, db).mode,
      maxStoriesPerDay: display(draft, db).stories,
    });
    expect(request).toEqual({ publishingMode: 'stories', maxStoriesPerDay: 6 });

    const invokeBody = toAutopilotInvokeBody('activate', request);
    expect(invokeBody.action).toBe('activate');
    expect(invokeBody.publishingMode).toBe('stories');
    expect(invokeBody.publishing_mode).toBe('stories');
    expect(invokeBody.maxStoriesPerDay).toBe(6);
    expect(invokeBody.max_stories_per_day).toBe(6);
    expect(extractPublishingPrefsFromBody(invokeBody)).toEqual({
      publishingMode: 'stories',
      maxStoriesPerDay: 6,
    });

    db = applyStartToDb(db, invokeBody);
    expect(db.publishing_mode).toBe('stories');
    expect(db.max_stories_per_day).toBe(6);
    expect(db.publishing_mode).not.toBe('full');

    draft = commitAfterStart(draft, request, db);
    expect(draft.dirty).toBe(false);
    expect(display(draft, db)).toEqual({ mode: 'stories', stories: 6 });

    const afterRefetch = rehydrateAutopilotDraft({
      dirty: false,
      draftMode: draft.mode,
      draftStories: draft.stories,
      storedMode: db.publishing_mode,
      storedStories: db.max_stories_per_day,
    });
    expect(afterRefetch.mode).toBe('stories');
    expect(afterRefetch.stories).toBe(6);

    const afterReload = reloadFromDb(db);
    expect(display(afterReload, db)).toEqual({ mode: 'stories', stories: 6 });
  });

  it('stories/6 → click feed → start → feed, not full', () => {
    let db: DbRow = { publishing_mode: 'stories', max_stories_per_day: 6, enabled: true };
    let draft = reloadFromDb(db);
    draft = clickMode(draft, 'feed');
    const request = buildAutopilotStartPayload({
      publishingMode: display(draft, db).mode,
      maxStoriesPerDay: display(draft, db).stories,
    });
    expect(request.publishingMode).toBe('feed');
    expect(request.publishingMode).not.toBe('full');
    db = applyStartToDb(db, toAutopilotInvokeBody('activate', request));
    expect(db.publishing_mode).toBe('feed');
    draft = commitAfterStart(draft, request, db);
    expect(display(draft, db).mode).toBe('feed');
    expect(display(reloadFromDb(db), db).mode).toBe('feed');
  });

  it('feed → click full → start → full', () => {
    let db: DbRow = { publishing_mode: 'feed', max_stories_per_day: 6, enabled: true };
    let draft = reloadFromDb(db);
    draft = clickMode(draft, 'full');
    const request = buildAutopilotStartPayload({
      publishingMode: display(draft, db).mode,
      maxStoriesPerDay: display(draft, db).stories,
    });
    expect(request.publishingMode).toBe('full');
    db = applyStartToDb(db, toAutopilotInvokeBody('activate', request));
    expect(db.publishing_mode).toBe('full');
    draft = commitAfterStart(draft, request, db);
    expect(display(draft, db).mode).toBe('full');
    expect(display(reloadFromDb(db), db).mode).toBe('full');
  });

  it('stale get_state full cannot overwrite activate write-result stories/6', () => {
    const activated = {
      settings: { publishing_mode: 'stories', max_stories_per_day: 6 },
    };
    const stale = {
      settings: { publishing_mode: 'full', max_stories_per_day: 4 },
      eligibility: { publishingMode: 'full', maxStoriesPerDay: 4 },
    };
    const merged = mergeActivateWithGetState(activated, stale);
    expect(merged.settings?.publishing_mode).toBe('stories');
    expect(merged.settings?.max_stories_per_day).toBe(6);
    expect(merged.eligibility?.publishingMode).toBe('stories');
    expect(
      startPrefsPersistedInSettings(
        { publishingMode: 'stories', maxStoriesPerDay: 6 },
        merged.settings
      )
    ).toBe(true);
  });

  it('activate full-state response is source of truth — skip stale refetch', () => {
    const activateResponse = {
      settings: { publishing_mode: 'stories', max_stories_per_day: 6 },
      eligibility: { publishingMode: 'stories', maxStoriesPerDay: 6 },
    };
    expect(isFullAutopilotState(activateResponse)).toBe(true);
    const used = activateResponse;
    expect(used.settings.publishing_mode).toBe('stories');
    expect(used.settings.publishing_mode).not.toBe('full');
  });

  it('missing activate mode is required — never silently written as full', () => {
    const resolved = resolvePublishingPrefsPatch({
      body: { action: 'activate', maxStoriesPerDay: 6 },
      storedMode: 'full',
      storedStories: 4,
      requireMode: true,
    });
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) expect(resolved.error).toBe('publishing_mode_required');
  });

  it('nested gateway body still extracts stories/6', () => {
    expect(
      extractPublishingPrefsFromBody({
        action: 'activate',
        body: { publishingMode: 'stories', maxStoriesPerDay: 6 },
      })
    ).toEqual({ publishingMode: 'stories', maxStoriesPerDay: 6 });
    expect(
      extractPublishingPrefsFromBody({
        action: 'activate',
        publishing_mode: 'stories',
        max_stories_per_day: 6,
      })
    ).toEqual({ publishingMode: 'stories', maxStoriesPerDay: 6 });
  });

  it('parse(undefined) default full is not used as a write when the request sent stories', () => {
    expect(parseAutopilotPublishingMode(undefined)).toBe('full');
    const patch = resolvePublishingPrefsPatch({
      body: { publishingMode: 'stories', maxStoriesPerDay: 6 },
      storedMode: 'full',
      storedStories: 4,
      requireMode: true,
    });
    expect(patch.ok).toBe(true);
    if (patch.ok) {
      expect(patch.patch.publishing_mode).toBe('stories');
      expect(patch.patch.max_stories_per_day).toBe(6);
      expect(patch.skip).toBe(false);
    }
  });

  it('mismatch keeps draft stories instead of snapping UI to stale full', () => {
    const draft: Draft = { mode: 'stories', stories: 6, dirty: true };
    const staleDb: DbRow = { publishing_mode: 'full', max_stories_per_day: 4, enabled: true };
    const request: AutopilotStartPrefs = { publishingMode: 'stories', maxStoriesPerDay: 6 };
    expect(startPrefsPersistedInSettings(request, staleDb)).toBe(false);
    expect(display(draft, staleDb).mode).toBe('stories');
    expect(display(draft, staleDb).stories).toBe(6);
  });
});

describe('content-autopilot edge source — no silent full coercion', () => {
  it('activate uses resolvePublishingPrefsPatch with requireMode and does not parse(body.publishingMode ?? stored)', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'supabase/functions/content-autopilot/index.ts'),
      'utf8'
    );
    expect(src).toContain('resolvePublishingPrefsPatch');
    expect(src).toContain('requireMode');
    expect(src).toContain('publishing_mode_required');
    expect(src).toContain('normalizeAutopilotRequestBody');
    expect(src).not.toMatch(/parseAutopilotPublishingMode\(body\.publishingMode \?\?/);
    expect(src).not.toMatch(/publishing_mode \|\| ['"]full['"]/);
    expect(src).not.toMatch(/publishingMode \|\| ['"]full['"]/);
  });
});
