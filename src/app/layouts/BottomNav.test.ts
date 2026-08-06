import { describe, expect, it } from 'vitest';
import { createTranslator } from '@shared/i18n/translate';
import { APP_LOCALES } from '@shared/lib/locale';
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

  it('resolves localized labels for every supported language', () => {
    for (const locale of APP_LOCALES) {
      const t = createTranslator(locale.code);
      for (const tab of BOTTOM_NAV_TABS) {
        const label = t(tab.labelKey);
        expect(label.length).toBeGreaterThan(0);
        expect(label).not.toBe(tab.labelKey);
      }
    }
    const tr = createTranslator('tr');
    expect(tr('nav.today')).toBe('Bugün');
    expect(tr('nav.contacts')).toBe('Kişiler');
    expect(tr('nav.team')).toBe('Takım');
    expect(tr('nav.today')).not.toBe('Heute');
  });
});
