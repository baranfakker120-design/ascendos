import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { setActiveOrg, supabase } from '@shared/api/supabase';
import type { Membership, Profile } from '@shared/types/domain';
import { canManageCoachContent } from './coachContentAuthority';
import { isOrganizationAdminRole } from './organizationAdminAuthority';
import {
  isSuperAdminRole,
  pickActiveMembership,
  readStoredActiveOrg,
  resolveActiveOrgId,
  writeStoredActiveOrg,
  type AuthorityRole,
} from './membershipAuthority';

/**
 * Session + membership-backed authorization.
 * Canonical role: memberships.role (active membership).
 * profiles.role is display mirror only — never used for gates.
 */
interface AuthState {
  /** undefined = wird noch geladen, null = nicht eingeloggt */
  session: Session | null | undefined;
  profile: Profile | null;
  /** Alle aktiven Mitgliedschaften der Identität. */
  memberships: Membership[];
  /** Aktive Mitgliedschaft (nach Org-Selektor). */
  membership: Membership | null;
  /** Rolle der aktiven Mitgliedschaft — einzige Auth-Wahrheit im Client. */
  role: AuthorityRole | null;
  isSuperAdmin: boolean;
  /** Phase 9 — org admin for active membership (super_admin|admin). Not platform. */
  isOrganizationAdmin: boolean;
  /** Sprint 5.1 — Knowledge Center & Live Coaching editors. */
  canManageCoachContent: boolean;
  /** Mehrere Orgs → Nutzer muss wählen / gespeicherte Wahl gilt. */
  needsOrgSelection: boolean;
  setActiveOrganization: (orgId: string) => void;
  /** Profil + Mitgliedschaften neu laden. */
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (error) return null;
  return data;
}

async function fetchActiveMemberships(userId: string): Promise<Membership[]> {
  const { data, error } = await supabase
    .from('memberships')
    .select('*')
    .eq('identity_id', userId)
    .eq('status', 'active')
    .order('joined_at', { ascending: true });
  if (error || !data) return [];
  return data;
}

function applyOrgSelection(
  userId: string,
  memberships: Membership[],
  mirrorOrgId: string | null,
  preferredOrgId?: string | null
): { orgId: string | null; membership: Membership | null } {
  const orgId = resolveActiveOrgId(memberships, {
    storedOrgId: preferredOrgId ?? readStoredActiveOrg(userId),
    mirrorOrgId,
  });
  if (orgId) {
    setActiveOrg(orgId);
    writeStoredActiveOrg(userId, orgId);
  } else {
    setActiveOrg(null);
  }
  const membership = pickActiveMembership(memberships, orgId);
  return { orgId, membership };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadAuth = useCallback(async (userId: string, trackOpen: boolean) => {
    const [profileRow, membershipRows] = await Promise.all([
      fetchProfile(userId),
      fetchActiveMemberships(userId),
    ]);
    setProfile(profileRow);
    setMemberships(membershipRows);

    const { membership: active } = applyOrgSelection(
      userId,
      membershipRows,
      profileRow?.org_id ?? null
    );
    setMembership(active);
    setAuthReady(true);

    if (trackOpen && profileRow) {
      const orgId = active?.org_id ?? profileRow.org_id;
      void supabase
        .from('usage_events')
        .insert({ user_id: profileRow.id, org_id: orgId, event_type: 'app_opened' })
        .then(
          () => undefined,
          () => undefined
        );
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!session) {
      setProfile(null);
      setMemberships([]);
      setMembership(null);
      setActiveOrg(null);
      setAuthReady(session === null);
      return;
    }
    setAuthReady(false);
    void loadAuth(session.user.id, true).then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [session, loadAuth]);

  const setActiveOrganization = useCallback(
    (orgId: string) => {
      if (!session?.user.id) return;
      if (!memberships.some((m) => m.org_id === orgId && m.status === 'active')) return;
      const { membership: next } = applyOrgSelection(
        session.user.id,
        memberships,
        profile?.org_id ?? null,
        orgId
      );
      setMembership(next);
    },
    [session, memberships, profile?.org_id]
  );

  const refreshProfile = useCallback(async () => {
    const userId = (await supabase.auth.getSession()).data.session?.user.id;
    if (!userId) {
      setProfile(null);
      setMemberships([]);
      setMembership(null);
      setActiveOrg(null);
      return;
    }
    await loadAuth(userId, false);
  }, [loadAuth]);

  const signOut = useCallback(async () => {
    setActiveOrg(null);
    await supabase.auth.signOut();
  }, []);

  const role = membership?.role ?? null;
  const isSuperAdmin = isSuperAdminRole(role);
  const isOrganizationAdmin = isOrganizationAdminRole(role);
  const coachContentManager = canManageCoachContent(role);
  const needsOrgSelection = memberships.length > 1 && !membership;

  const value = useMemo<AuthState>(
    () => ({
      session: session === undefined || (session && !authReady) ? undefined : session,
      profile,
      memberships,
      membership,
      role,
      isSuperAdmin,
      isOrganizationAdmin,
      canManageCoachContent: coachContentManager,
      needsOrgSelection,
      setActiveOrganization,
      refreshProfile,
      signOut,
    }),
    [
      session,
      authReady,
      profile,
      memberships,
      membership,
      role,
      isSuperAdmin,
      isOrganizationAdmin,
      coachContentManager,
      needsOrgSelection,
      setActiveOrganization,
      refreshProfile,
      signOut,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth muss innerhalb von <AuthProvider> verwendet werden.');
  return ctx;
}
