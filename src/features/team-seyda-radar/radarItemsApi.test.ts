import { describe, expect, it } from 'vitest';
import { mapRadarItemRow } from './radarItemsMap';
import { RADAR_DISCOVERY_JOB } from './radarDiscoveryArchitecture';
import { RADAR_DISCOVERY_TARGETS } from './radarInsertGate';
import { isTeamSeydaRadarOrg, TEAM_SEYDA_ORG_ID } from './teamSeydaRadar';

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

  it('keeps Chogan Beauty rows from the same ledger', () => {
    const row = mapRadarItemRow({
      id: '3',
      source: 'chogan_beauty',
      content_type: 'REEL',
      published_at: '2026-08-18T12:00:00.000Z',
      canonical_url: 'https://www.instagram.com/reel/x/',
      resolved_at: null,
    });
    expect(row?.source).toBe('chogan_beauty');
    expect(row?.content_type).toBe('REEL');
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
  });

  it('does not claim Stories ingestion', () => {
    expect(RADAR_DISCOVERY_JOB.includesStories).toBe(false);
    expect(RADAR_DISCOVERY_JOB.mediaCopy).toBe(false);
    expect(RADAR_DISCOVERY_JOB.surface).toBe('TodayRadarSlot');
  });

  it('keeps the existing hourly cron and edge function while adding the third target', () => {
    expect(RADAR_DISCOVERY_JOB.edgeFunction).toBe('radar-discovery-test');
    expect(RADAR_DISCOVERY_JOB.cronJobName).toBe('radar-discovery-hourly');
    expect(RADAR_DISCOVERY_JOB.schedule).toBe('0 * * * *');
    expect(RADAR_DISCOVERY_JOB.targets).toHaveLength(3);
    expect([...RADAR_DISCOVERY_JOB.targets]).toEqual(
      RADAR_DISCOVERY_TARGETS.map((t) => t.username)
    );
    expect(RADAR_DISCOVERY_JOB.targets[0]).toBe('chogangroupofficial');
    expect(RADAR_DISCOVERY_JOB.targets[1]).toBe('essencetribe.network');
    expect(RADAR_DISCOVERY_JOB.targets[2]).toBe('choganbeautyofficial');
  });
});
