import { describe, expect, it } from 'vitest';
import { mapRadarItemRow } from './radarItemsMap';
import { RADAR_DISCOVERY_JOB } from './radarDiscoveryArchitecture';
import { isTeamSeydaRadarOrg, resolveRadarUiOrgId, TEAM_SEYDA_ORG_ID } from './teamSeydaRadar';

describe('Radar item row mapping', () => {
  it('keeps Chogan/Essence Tribe feed and reel rows', () => {
    const row = mapRadarItemRow({
      id: '1',
      source: 'essence_tribe',
      content_type: 'POST',
      published_at: '2026-08-17T16:45:30.000Z',
      canonical_url: 'https://www.instagram.com/p/DcJf4g0DFcp/',
      resolved_at: null,
    });
    expect(row?.source).toBe('essence_tribe');
    expect(row?.content_type).toBe('POST');
  });

  it('drops unknown sources so other-org data cannot leak into the slot', () => {
    expect(
      mapRadarItemRow({
        id: '2',
        source: 'other',
        content_type: 'POST',
        published_at: '2026-08-18T00:00:00.000Z',
        canonical_url: 'https://www.instagram.com/p/x/',
        resolved_at: null,
      })
    ).toBeNull();
  });
});

describe('Radar product gates', () => {
  it('shows the Today slot only for Org #1', () => {
    expect(isTeamSeydaRadarOrg(TEAM_SEYDA_ORG_ID)).toBe(true);
    expect(isTeamSeydaRadarOrg('00000000-0000-0000-0000-000000000002')).toBe(false);
    expect(resolveRadarUiOrgId(TEAM_SEYDA_ORG_ID, null)).toBe(TEAM_SEYDA_ORG_ID);
    expect(
      resolveRadarUiOrgId('00000000-0000-0000-0000-000000000002', TEAM_SEYDA_ORG_ID)
    ).toBeNull();
  });

  it('does not claim Stories ingestion', () => {
    expect(RADAR_DISCOVERY_JOB.includesStories).toBe(false);
    expect(RADAR_DISCOVERY_JOB.mediaCopy).toBe(false);
    expect(RADAR_DISCOVERY_JOB.surface).toBe('TodayRadarSlot');
  });
});
