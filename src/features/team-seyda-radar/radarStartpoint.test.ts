import { describe, expect, it } from 'vitest';
import {
  assertStartpointUnchangedByPoll,
  coachARadarIndicator,
  countUnresolvedRadarHits,
  createRadarStartpoint,
  decideRadarItemAgainstStartpoint,
  dedupeRadarItemsForUser,
  filterNewRadarItems,
  pauseRadar,
  reactivateRadarWithNewStart,
  resumeRadar,
  selectRadarHitsForUser,
  type RadarPublishedItem,
  type RadarUserStartpoint,
} from './radarStartpoint';

const USER_A = 'user-a';
const USER_B = 'user-b';
const ORG = '00000000-0000-0000-0000-000000000001';
const START = '2026-08-15T14:32:18.000Z';

function item(
  partial: Partial<RadarPublishedItem> & Pick<RadarPublishedItem, 'external_id' | 'published_at'>
): RadarPublishedItem {
  return {
    source: 'chogan',
    content_type: 'POST',
    ...partial,
  };
}

describe('radar startpoint — no old posts', () => {
  const start: RadarUserStartpoint = createRadarStartpoint({
    userId: USER_A,
    organizationId: ORG,
    activatedAtUtcIso: START,
  });

  it('TEST 1: 1000 old posts → 0 new hits', () => {
    const old = Array.from({ length: 1000 }, (_, i) =>
      item({
        external_id: `old-${i}`,
        published_at: '2026-08-15T14:31:00.000Z',
      })
    );
    expect(selectRadarHitsForUser({ userId: USER_A, start, candidates: old })).toHaveLength(0);
    expect(coachARadarIndicator(0)).toBe('normal');
  });

  it('TEST 2: new Chogan post after start → 1 hit', () => {
    const hits = selectRadarHitsForUser({
      userId: USER_A,
      start,
      candidates: [
        item({
          external_id: 'new-1',
          source: 'chogan',
          content_type: 'POST',
          published_at: '2026-08-15T14:33:00.000Z',
        }),
      ],
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]!.external_id).toBe('new-1');
  });

  it('TEST 3: new Essence Tribe reel after start → 1 hit', () => {
    const hits = selectRadarHitsForUser({
      userId: USER_A,
      start,
      candidates: [
        item({
          external_id: 'reel-1',
          source: 'essence_tribe',
          content_type: 'REEL',
          published_at: '2026-08-15T15:00:00.000Z',
        }),
      ],
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]!.content_type).toBe('REEL');
  });

  it('TEST 4: late detect but published_at before start → ignore', () => {
    const decision = decideRadarItemAgainstStartpoint(
      item({
        external_id: 'late',
        published_at: '2026-08-15T15:00:00.000Z',
        detected_at: '2026-08-15T15:07:00.000Z',
      }),
      { ...start, radar_started_at: '2026-08-15T15:05:00.000Z' }
    );
    // published 15:00 < start 15:05 → ignore even if detected later
    expect(decision).toEqual({ accept: false, reason: 'before_start' });
  });

  it('TEST 4b: explicit published before start with late detect', () => {
    expect(
      decideRadarItemAgainstStartpoint(
        item({
          external_id: 'x',
          published_at: '2026-08-15T14:31:00.000Z',
          detected_at: '2026-08-15T16:00:00.000Z',
        }),
        start
      ).accept
    ).toBe(false);
  });

  it('TEST 5: detected late but published_at after start → hit', () => {
    const decision = decideRadarItemAgainstStartpoint(
      item({
        external_id: 'late-new',
        published_at: '2026-08-15T15:06:00.000Z',
        detected_at: '2026-08-15T15:16:00.000Z',
      }),
      { ...start, radar_started_at: '2026-08-15T15:05:00.000Z' }
    );
    expect(decision.accept).toBe(true);
  });

  it('TEST 6: User B later start ignores post that is new for User A', () => {
    const post = item({
      external_id: 'shared',
      published_at: '2026-08-15T15:30:00.000Z',
    });
    const startA = createRadarStartpoint({
      userId: USER_A,
      organizationId: ORG,
      activatedAtUtcIso: '2026-08-15T15:00:00.000Z',
    });
    const startB = createRadarStartpoint({
      userId: USER_B,
      organizationId: ORG,
      activatedAtUtcIso: '2026-08-15T16:00:00.000Z',
    });
    expect(filterNewRadarItems([post], startA)).toHaveLength(1);
    expect(filterNewRadarItems([post], startB)).toHaveLength(0);
  });

  it('TEST 7+8: refresh/logout keep same startpoint identity', () => {
    const again = { ...start };
    expect(again.radar_started_at).toBe(START);
    expect(assertStartpointUnchangedByPoll(start, again)).toBe(true);
  });

  it('TEST 9: poll must not move radar_started_at', () => {
    const afterPoll = { ...start };
    // simulate mistaken NOW() rewrite
    const broken = { ...start, radar_started_at: new Date().toISOString() };
    expect(assertStartpointUnchangedByPoll(start, afterPoll)).toBe(true);
    expect(assertStartpointUnchangedByPoll(start, broken)).toBe(false);
  });

  it('TEST 10: same post twice → one item', () => {
    const dup = [
      item({ external_id: 'dup', published_at: '2026-08-15T14:40:00.000Z' }),
      item({ external_id: 'dup', published_at: '2026-08-15T14:40:00.000Z' }),
    ];
    expect(dedupeRadarItemsForUser(USER_A, filterNewRadarItems(dup, start))).toHaveLength(1);
  });

  it('TEST 11: 1000 old posts → A does not blink', () => {
    const old = Array.from({ length: 1000 }, (_, i) =>
      item({ external_id: `o${i}`, published_at: '2026-08-01T00:00:00.000Z' })
    );
    const hits = selectRadarHitsForUser({ userId: USER_A, start, candidates: old });
    expect(hits).toHaveLength(0);
    expect(coachARadarIndicator(hits.length)).toBe('normal');
  });

  it('TEST 12: new post → A blinks', () => {
    const hits = selectRadarHitsForUser({
      userId: USER_A,
      start,
      candidates: [item({ external_id: 'n', published_at: '2026-08-15T18:00:00.000Z' })],
    });
    expect(coachARadarIndicator(hits.length)).toBe('blink_red');
  });

  it('TEST 13: all resolved → A normal', () => {
    const unresolved = countUnresolvedRadarHits([
      { resolved: true },
      { resolved: true },
      { resolved: false },
    ]);
    expect(unresolved).toBe(1);
    expect(coachARadarIndicator(unresolved)).toBe('blink_red');
    expect(coachARadarIndicator(countUnresolvedRadarHits([{ resolved: true }]))).toBe('normal');
  });

  it('inclusive boundary: published_at === radar_started_at accepted', () => {
    expect(
      decideRadarItemAgainstStartpoint(item({ external_id: 'eq', published_at: START }), start)
        .accept
    ).toBe(true);
  });

  it('one second before start ignored', () => {
    expect(
      decideRadarItemAgainstStartpoint(
        item({ external_id: 'pre', published_at: '2026-08-15T14:32:17.000Z' }),
        start
      ).accept
    ).toBe(false);
  });

  it('pause keeps startpoint; resume keeps startpoint', () => {
    const paused = pauseRadar(start);
    expect(paused.radar_started_at).toBe(START);
    expect(
      decideRadarItemAgainstStartpoint(
        item({ external_id: 'n', published_at: '2026-08-15T18:00:00.000Z' }),
        paused
      ).reason
    ).toBe('paused');
    const resumed = resumeRadar(paused);
    expect(resumed.radar_started_at).toBe(START);
    expect(
      decideRadarItemAgainstStartpoint(
        item({ external_id: 'n', published_at: '2026-08-15T18:00:00.000Z' }),
        resumed
      ).accept
    ).toBe(true);
  });

  it('explicit new start only via reactivateRadarWithNewStart', () => {
    const next = reactivateRadarWithNewStart(start, '2026-08-16T10:00:00.000Z');
    expect(next.radar_started_at).toBe('2026-08-16T10:00:00.000Z');
    expect(start.radar_started_at).toBe(START);
  });

  it('7 new hits mix (5 posts + 2 reels) after start', () => {
    const candidates = [
      ...Array.from({ length: 5 }, (_, i) =>
        item({
          external_id: `c${i}`,
          source: 'chogan',
          content_type: 'POST',
          published_at: `2026-08-15T16:0${i}:00.000Z`,
        })
      ),
      item({
        external_id: 'e1',
        source: 'essence_tribe',
        content_type: 'REEL',
        published_at: '2026-08-15T19:00:00.000Z',
      }),
      item({
        external_id: 'e2',
        source: 'essence_tribe',
        content_type: 'REEL',
        published_at: '2026-08-15T19:30:00.000Z',
      }),
      // old noise
      item({ external_id: 'old', published_at: '2026-01-01T00:00:00.000Z' }),
    ];
    const hits = selectRadarHitsForUser({ userId: USER_A, start, candidates });
    expect(hits).toHaveLength(7);
    expect(coachARadarIndicator(hits.length)).toBe('blink_red');
  });
});
