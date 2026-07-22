import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@shared/api/supabase';
import type { Profile } from '@shared/types/domain';

/**
 * Liegt bewusst in shared/ (nicht features/): Session-State ist
 * Querschnitts-Infrastruktur wie der Supabase-Client. Features dürfen
 * nur aus shared importieren (ESLint-Grenze, ADR-012).
 */
interface AuthState {
  /** undefined = wird noch geladen, null = nicht eingeloggt */
  session: Session | null | undefined;
  profile: Profile | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!session) {
      setProfile(null);
      return;
    }
    supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        if (cancelled) return;
        setProfile(data);
        // [P-2] app_opened: einziges clientseitiges Tracking-Event;
        // Fehler werden ignoriert — Tracking bricht nie die App.
        if (data) {
          void supabase
            .from('usage_events')
            .insert({ user_id: data.id, org_id: data.org_id, event_type: 'app_opened' })
            .then(
              () => undefined,
              () => undefined
            );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, profile, signOut }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth muss innerhalb von <AuthProvider> verwendet werden.');
  return ctx;
}
