import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@shared/auth/AuthProvider';
import { supabase } from '@shared/api/supabase';
import {
  assertNoTokenLeak,
  toSafeConnection,
  type SafeInstagramConnection,
} from './lib/instagramConnect';

async function invokeInstagramOAuth<T>(
  action: 'status' | 'start' | 'disconnect',
  body: Record<string, unknown> = {}
): Promise<T> {
  const { data, error } = await supabase.functions.invoke('instagram-oauth', {
    body: { action, ...body },
  });
  if (error) throw error;
  if (!assertNoTokenLeak(data)) {
    throw new Error('token_leak_blocked');
  }
  return data as T;
}

export async function fetchInstagramConnection(): Promise<SafeInstagramConnection> {
  const data = await invokeInstagramOAuth<{
    ok: boolean;
    connection: Record<string, unknown>;
  }>('status');
  return toSafeConnection(data.connection);
}

export async function startInstagramConnect(
  returnOrigin = window.location.origin
): Promise<{ authorizeUrl: string; connection: SafeInstagramConnection }> {
  const data = await invokeInstagramOAuth<{
    ok: boolean;
    authorizeUrl: string;
    connection: Record<string, unknown>;
    error?: string;
  }>('start', { returnOrigin });
  if (!data?.authorizeUrl) {
    throw new Error(data?.error ?? 'instagram_oauth_start_failed');
  }
  return {
    authorizeUrl: data.authorizeUrl,
    connection: toSafeConnection(data.connection),
  };
}

export async function disconnectInstagram(): Promise<SafeInstagramConnection> {
  const data = await invokeInstagramOAuth<{
    ok: boolean;
    connection: Record<string, unknown>;
  }>('disconnect');
  return toSafeConnection(data.connection);
}

export function useInstagramConnection() {
  const { session, membership } = useAuth();
  const qc = useQueryClient();
  const orgId = membership?.org_id ?? null;
  const membershipId = membership?.id ?? null;

  const connectionQuery = useQuery({
    queryKey: ['instagram-connection', orgId, membershipId],
    enabled: Boolean(session?.user?.id && orgId && membershipId),
    queryFn: fetchInstagramConnection,
  });

  const startMutation = useMutation({
    mutationFn: () => startInstagramConnect(),
    onSuccess: async (result) => {
      await qc.invalidateQueries({ queryKey: ['instagram-connection', orgId, membershipId] });
      // Full redirect to Meta — leave AscendOS.
      window.location.assign(result.authorizeUrl);
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: disconnectInstagram,
    onSuccess: (connection) => {
      qc.setQueryData(['instagram-connection', orgId, membershipId], connection);
    },
  });

  return { connectionQuery, startMutation, disconnectMutation };
}
