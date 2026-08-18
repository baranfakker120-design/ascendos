import type { MessageKey } from '@shared/i18n';

export type NavTabId = 'heute' | 'kontakte' | 'coach' | 'team' | 'profil';

export interface NavTab {
  id: NavTabId;
  to: string;
  labelKey: MessageKey;
  ariaKey: MessageKey;
  end?: boolean;
  externalInApp?: boolean;
}

/** Tab contract — kept in a module without Auth/Supabase so unit tests can import it on Node 20. */
export const BOTTOM_NAV_TABS: readonly NavTab[] = [
  { id: 'heute', to: '/', labelKey: 'nav.today', ariaKey: 'nav.today', end: true },
  { id: 'kontakte', to: '/kontakte', labelKey: 'nav.contacts', ariaKey: 'nav.contacts' },
  { id: 'coach', to: '/coach', labelKey: 'nav.coach', ariaKey: 'nav.coachAria' },
  {
    id: 'team',
    to: '/team',
    labelKey: 'nav.team',
    ariaKey: 'nav.teamAria',
  },
  { id: 'profil', to: '/profil', labelKey: 'nav.profile', ariaKey: 'nav.profile' },
] as const;
