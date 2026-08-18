import { describe, expect, it } from 'vitest';
import {
  TEAM_SEYDA_ORG_ID,
  filterItemsByRadarStartpoint,
  isOnOrAfterRadarStartpoint,
  mapMediaToContentType,
  mapUsernameToSource,
  partitionNewVsDuplicate,
  resolveRadarWriteOrgId,
  sanitizeRadarCanonicalUrl,
} from './radarInsertGate';

describe('RADAR startpoint gate (server-side)', () => {
  const start = '2026-08-15T14:32:18.000Z';

  it('TEST 1: content older than radar_started_at is not eligible', () => {
    expect(isOnOrAfterRadarStartpoint('2026-08-14T23:59:59.000Z', start)).toBe(false);
    const kept = filterItemsByRadarStartpoint(
      [
        { external_id: 'old', published_at: '2026-08-01T00:00:00.000Z' },
        { external_id: 'new', published_at: '2026-08-16T00:00:00.000Z' },
      ],
      start
    );
    expect(kept.map((i) => i.external_id)).toEqual(['new']);
  });

  it('TEST 2: content newer than (or equal to) radar_started_at is eligible', () => {
    expect(isOnOrAfterRadarStartpoint(start, start)).toBe(true);
    expect(isOnOrAfterRadarStartpoint('2026-08-15T14:32:18.001Z', start)).toBe(true);
  });
});

describe('RADAR deduplication partition', () => {
  it('TEST 3: existing external_id is duplicate, not fresh', () => {
    const { fresh, duplicates } = partitionNewVsDuplicate(
      [{ external_id: 'a' }, { external_id: 'b' }, { external_id: 'c' }],
      new Set(['b'])
    );
    expect(fresh.map((i) => i.external_id)).toEqual(['a', 'c']);
    expect(duplicates.map((i) => i.external_id)).toEqual(['b']);
  });

  it('TEST 4: second run with all known ids yields zero fresh', () => {
    const ids = ['1', '2', '3'];
    const { fresh, duplicates } = partitionNewVsDuplicate(
      ids.map((external_id) => ({ external_id })),
      new Set(ids)
    );
    expect(fresh).toHaveLength(0);
    expect(duplicates).toHaveLength(3);
  });
});

describe('RADAR user startpoint isolation', () => {
  it('TEST 5: two users with different startpoints get different eligible sets', () => {
    const items = [
      { external_id: 'early', published_at: '2026-08-10T00:00:00.000Z' },
      { external_id: 'late', published_at: '2026-08-20T00:00:00.000Z' },
    ];
    const userA = filterItemsByRadarStartpoint(items, '2026-08-01T00:00:00.000Z');
    const userB = filterItemsByRadarStartpoint(items, '2026-08-15T00:00:00.000Z');
    expect(userA.map((i) => i.external_id)).toEqual(['early', 'late']);
    expect(userB.map((i) => i.external_id)).toEqual(['late']);
    // A seeing early must not force B to see early
    expect(userB.some((i) => i.external_id === 'early')).toBe(false);
  });
});

describe('RADAR org hard-gate', () => {
  it('TEST 6: forged organization_id is denied; Org #1 / absent allowed', () => {
    expect(resolveRadarWriteOrgId(undefined)).toBe(TEAM_SEYDA_ORG_ID);
    expect(resolveRadarWriteOrgId(null)).toBe(TEAM_SEYDA_ORG_ID);
    expect(resolveRadarWriteOrgId('')).toBe(TEAM_SEYDA_ORG_ID);
    expect(resolveRadarWriteOrgId(TEAM_SEYDA_ORG_ID)).toBe(TEAM_SEYDA_ORG_ID);
    expect(resolveRadarWriteOrgId('00000000-0000-0000-0000-000000000002')).toBeNull();
    expect(resolveRadarWriteOrgId({ org: TEAM_SEYDA_ORG_ID })).toBeNull();
  });
});

describe('RADAR source / content mapping', () => {
  it('maps verified discovery usernames and media types', () => {
    expect(mapUsernameToSource('chogangroupofficial')).toBe('chogan');
    expect(mapUsernameToSource('essencetribe.network')).toBe('essence_tribe');
    expect(mapUsernameToSource('random')).toBeNull();
    expect(mapMediaToContentType('IMAGE', 'https://www.instagram.com/p/x/')).toBe('POST');
    expect(mapMediaToContentType('VIDEO', 'https://www.instagram.com/reel/x/')).toBe('REEL');
  });
});

describe('RADAR canonical URL sanitizer', () => {
  it('allows official Instagram feed and reel permalinks only', () => {
    expect(sanitizeRadarCanonicalUrl('https://www.instagram.com/p/DcJf4g0DFcp/')).toBe(
      'https://www.instagram.com/p/DcJf4g0DFcp/'
    );
    expect(sanitizeRadarCanonicalUrl('https://instagram.com/reel/DcG8CzaMbUC/')).toBe(
      'https://instagram.com/reel/DcG8CzaMbUC/'
    );
  });

  it('rejects non-https, non-Instagram, stories, and poisoned hrefs', () => {
    expect(sanitizeRadarCanonicalUrl('http://www.instagram.com/p/x/')).toBeNull();
    expect(sanitizeRadarCanonicalUrl('https://evil.example/p/x/')).toBeNull();
    expect(sanitizeRadarCanonicalUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeRadarCanonicalUrl('https://www.instagram.com/stories/x/1/')).toBeNull();
    expect(sanitizeRadarCanonicalUrl('https://www.instagram.com/essencetribe.network/')).toBeNull();
    expect(sanitizeRadarCanonicalUrl(null)).toBeNull();
  });
});
