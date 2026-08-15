import { describe, expect, it } from 'vitest';
import {
  TEAM_SEYDA_ORG_ID,
  getTeamSeydaRadarConfig,
  isTeamSeydaRadarOrg,
  teamSeydaRadarQueryKey,
} from './teamSeydaRadar';

describe('Team Seyda Radar org isolation', () => {
  it('enables only Org #1', () => {
    expect(isTeamSeydaRadarOrg(TEAM_SEYDA_ORG_ID)).toBe(true);
    expect(isTeamSeydaRadarOrg('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')).toBe(false);
    expect(isTeamSeydaRadarOrg(null)).toBe(false);
  });

  it('never returns Chogan/Essence config for other orgs', () => {
    expect(getTeamSeydaRadarConfig('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')).toBeNull();
    const cfg = getTeamSeydaRadarConfig(TEAM_SEYDA_ORG_ID);
    expect(cfg?.orgId).toBe(TEAM_SEYDA_ORG_ID);
    expect(cfg?.sources.some((s) => s.kind === 'chogan')).toBe(true);
    expect(
      cfg?.ideas.every((i) => i.suggestedFormat === 'story' || i.suggestedFormat === 'feed')
    ).toBe(true);
  });

  it('keeps query keys org-aware', () => {
    expect(teamSeydaRadarQueryKey(TEAM_SEYDA_ORG_ID)).toEqual([
      'team-seyda-radar',
      TEAM_SEYDA_ORG_ID,
    ]);
    expect(teamSeydaRadarQueryKey(null)[1]).toBe('none');
  });
});
