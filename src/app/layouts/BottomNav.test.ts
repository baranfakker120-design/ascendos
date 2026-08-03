import { describe, expect, it } from 'vitest';
import { BOTTOM_NAV_TABS } from './BottomNav';

describe('BottomNav tab contract', () => {
  it('keeps the required five-tab order and labels', () => {
    expect(BOTTOM_NAV_TABS.map((t) => t.id)).toEqual([
      'heute',
      'kontakte',
      'coach',
      'team',
      'profil',
    ]);
    expect(BOTTOM_NAV_TABS.map((t) => t.label)).toEqual([
      'Heute',
      'Kontakte',
      'Coach',
      'Team',
      'Profil',
    ]);
  });

  it('routes Team to the Genealogy Engine', () => {
    const team = BOTTOM_NAV_TABS.find((t) => t.id === 'team');
    expect(team?.to).toBe('/team');
    expect(team?.ariaLabel).toBe('Teambaum');
    expect(team?.externalInApp).toBeFalsy();
  });

  it('keeps Ascend/Coach as the center route', () => {
    expect(BOTTOM_NAV_TABS[2]?.to).toBe('/coach');
  });
});
