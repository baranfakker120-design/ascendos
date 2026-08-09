import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@shared/auth/AuthProvider';
import { supabase } from '@shared/api/supabase';
import {
  assertNoTokenLeak,
  toSafeFacebookBusinessConnection,
  type SafeFacebookBusinessConnection,
} from './lib/facebookBusinessConnect';

async function invokeFacebookBusinessOAuth<T>(
  action: 'status' | 'start' | 'disconnect',
  body: Record<string, unknown> = {}
): Promise<T> {
  const { data, error } = await supabase.functions.invoke('facebook-business-oauth', {
    body: { action, ...body },
  });
  if (error) throw error;
  if (!assertNoTokenLeak(data)) {
    throw new Error('token_leak_blocked');
  }
  return data as T;
}

export async function fetchFacebookBusinessConnection(): Promise<SafeFacebookBusinessConnection> {
  const data = await invokeFacebookBusinessOAuth<{
    ok: boolean;
    connection: Record<string, unknown>;
  }>('status');
  return toSafeFacebookBusinessConnection(data.connection);
}

export async function startFacebookBusinessConnect(
  returnOrigin = window.location.origin
): Promise<{ authorizeUrl: string; connection: SafeFacebookBusinessConnection }> {
  const data = await invokeFacebookBusinessOAuth<{
    ok: boolean;
    authorizeUrl: string;
    connection: Record<string, unknown>;
    error?: string;
  }>('start', { returnOrigin });
  if (!data?.authorizeUrl) {
    throw new Error(data?.error ?? 'facebook_business_oauth_start_failed');
  }
  return {
    authorizeUrl: data.authorizeUrl,
    connection: toSafeFacebookBusinessConnection(data.connection),
  };
}

export async function disconnectFacebookBusiness(): Promise<SafeFacebookBusinessConnection> {
  const data = await invokeFacebookBusinessOAuth<{
    ok: boolean;
    connection: Record<string, unknown>;
  }>('disconnect');
  return toSafeFacebookBusinessConnection(data.connection);
}

export function useFacebookBusinessConnection() {
  const { session, membership } = useAuth();
  const qc = useQueryClient();
  const orgId = membership?.org_id ?? null;
  const membershipId = membership?.id ?? null;

  const connectionQuery = useQuery({
    queryKey: ['facebook-business-connection', orgId, membershipId],
    enabled: Boolean(session?.user?.id && orgId && membershipId),
    queryFn: fetchFacebookBusinessConnection,
  });

  const startMutation = useMutation({
    mutationFn: () => startFacebookBusinessConnect(),
    onSuccess: async (result) => {
      await qc.invalidateQueries({
        queryKey: ['facebook-business-connection', orgId, membershipId],
      });
      window.location.assign(result.authorizeUrl);
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: disconnectFacebookBusiness,
    onSuccess: (connection) => {
      qc.setQueryData(['facebook-business-connection', orgId, membershipId], connection);
    },
  });

  return { connectionQuery, startMutation, disconnectMutation };
}
