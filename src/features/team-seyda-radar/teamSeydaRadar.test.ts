import { describe, expect, it } from 'vitest';
import {
  TEAM_SEYDA_ORG_ID,
  getTeamSeydaRadarConfig,
  isTeamSeydaRadarOrg,
  resolveRadarUiOrgId,
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

describe('Radar Today visibility org resolution', () => {
  const other = '00000000-0000-0000-0000-000000000002';

  it('shows Radar for Org #1 membership', () => {
    expect(resolveRadarUiOrgId(TEAM_SEYDA_ORG_ID, other)).toBe(TEAM_SEYDA_ORG_ID);
    expect(resolveRadarUiOrgId(TEAM_SEYDA_ORG_ID, TEAM_SEYDA_ORG_ID)).toBe(TEAM_SEYDA_ORG_ID);
  });

  it('hides Radar for a non-Team-Seyda membership even if profile is Org #1', () => {
    expect(resolveRadarUiOrgId(other, TEAM_SEYDA_ORG_ID)).toBeNull();
  });

  it('falls back to Org #1 profile when membership is not resolved', () => {
    expect(resolveRadarUiOrgId(null, TEAM_SEYDA_ORG_ID)).toBe(TEAM_SEYDA_ORG_ID);
    expect(resolveRadarUiOrgId(undefined, TEAM_SEYDA_ORG_ID)).toBe(TEAM_SEYDA_ORG_ID);
  });

  it('stays hidden without Team Seyda membership or profile', () => {
    expect(resolveRadarUiOrgId(null, other)).toBeNull();
    expect(resolveRadarUiOrgId(null, null)).toBeNull();
  });
});
