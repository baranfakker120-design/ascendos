import { describe, expect, it } from 'vitest';
import { BOTTOM_NAV_TABS } from './BottomNav';

describe('BottomNav tab contract', () => {
  it('keeps the required five-tab order and ids', () => {
    expect(BOTTOM_NAV_TABS.map((t) => t.id)).toEqual([
      'heute',
      'kontakte',
      'coach',
      'team',
      'profil',
    ]);
    expect(BOTTOM_NAV_TABS.map((t) => t.to)).toEqual([
      '/',
      '/kontakte',
      '/coach',
      '/team',
      '/profil',
    ]);
  });

  it('routes Team to the Genealogy Engine', () => {
    const team = BOTTOM_NAV_TABS.find((t) => t.id === 'team');
    expect(team?.to).toBe('/team');
    expect(team?.ariaKey).toBe('nav.teamAria');
    expect(team?.externalInApp).toBeFalsy();
  });

  it('keeps Ascend/Coach as the center route', () => {
    expect(BOTTOM_NAV_TABS[2]?.to).toBe('/coach');
  });
});
