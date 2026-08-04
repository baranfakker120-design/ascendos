import { useMemo, type ReactNode } from 'react';
import { AuthContext } from '@shared/auth/AuthProvider';
import { setActiveOrg } from '@shared/api/supabase';
import {
  presentationMembership,
  presentationProfile,
  presentationSession,
} from './presentationAuth';
import { ORG_ID } from './ids';

/** Static auth context for presentation screenshot capture. */
export function PresentationAuthProvider({ children }: { children: ReactNode }) {
  const value = useMemo(() => {
    setActiveOrg(ORG_ID);
    return {
      session: presentationSession,
      profile: presentationProfile,
      memberships: [presentationMembership],
      membership: presentationMembership,
      role: 'super_admin' as const,
      isSuperAdmin: true,
      canManageCoachContent: true,
      needsOrgSelection: false,
      setActiveOrganization: () => undefined,
      refreshProfile: async () => undefined,
      signOut: async () => undefined,
    };
  }, []);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
