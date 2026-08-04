import type { Session } from '@supabase/supabase-js';
import type { Membership, Profile } from '@shared/types/domain';
import { MEMBERSHIP_ID, ORG_ID, TEAM_ID, USER_ID } from './ids';

const now = new Date().toISOString();

export const presentationProfile: Profile = {
  id: USER_ID,
  org_id: ORG_ID,
  team_id: TEAM_ID,
  sponsor_id: null,
  role: 'super_admin',
  first_name: 'Baran',
  last_name: 'Fakker',
  username: 'baran',
  avatar_url: null,
  phone: '+49 170 0000000',
  country: 'DE',
  language: 'de',
  goals: {},
  created_at: '2024-03-12T10:00:00Z',
  updated_at: now,
};

export const presentationMembership: Membership = {
  id: MEMBERSHIP_ID,
  identity_id: USER_ID,
  org_id: ORG_ID,
  team_id: TEAM_ID,
  role: 'super_admin',
  status: 'active',
  sponsor_membership_id: null,
  ap_total: 18450,
  country: 'DE',
  goals: {},
  joined_at: '2024-03-12T10:00:00Z',
  last_app_opened_at: now,
  left_at: null,
  streak_days: 12,
  streak_updated_on: now.slice(0, 10),
  team_leader_qualified_at: '2025-11-01T00:00:00Z',
  created_at: '2024-03-12T10:00:00Z',
  updated_at: now,
};

/** Minimal session object — never sent to the network in capture mode. */
export const presentationSession = {
  access_token: 'presentation-capture',
  refresh_token: 'presentation-capture',
  expires_in: 3600,
  token_type: 'bearer',
  user: {
    id: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'presentation@ascendos.app',
    app_metadata: {},
    user_metadata: {
      first_name: 'Baran',
      last_name: 'Fakker',
      username: 'baran',
    },
    created_at: now,
  },
} as unknown as Session;
