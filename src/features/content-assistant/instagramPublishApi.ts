import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@shared/api/supabase';
import { useAuth } from '@shared/auth/AuthProvider';
import { assertNoTokenLeak } from './lib/instagramConnect';

export interface InstagramPublishResult {
  ok: boolean;
  status?: 'published' | string;
  alreadyPublished?: boolean;
  attemptId?: string;
  mediaId?: string;
  containerId?: string;
  igUsername?: string | null;
  error?: string;
  message?: string;
  requiredScope?: string;
}

/**
 * Explicit user-confirmed publish — calls Edge `instagram-publish`.
 * Never sends tokens; rejects leaky payloads.
 */
export async function publishDraftToInstagram(params: {
  draftId: string;
  confirmed: true;
}): Promise<InstagramPublishResult> {
  const { data, error } = await supabase.functions.invoke('instagram-publish', {
    body: {
      action: 'publish',
      draftId: params.draftId,
      confirmed: true,
    },
  });

  if (error) {
    const ctx = error as { context?: Response; message?: string };
    let detail = ctx.message ?? 'publish_failed';
    let payload: InstagramPublishResult | null = null;
    try {
      if (ctx.context) {
        payload = (await ctx.context.json()) as InstagramPublishResult;
        detail = payload.error ?? payload.message ?? detail;
      }
    } catch {
      /* keep detail */
    }
    if (payload && assertNoTokenLeak(payload)) {
      return { ...payload, ok: false, error: payload.error ?? detail };
    }
    return { ok: false, error: detail };
  }

  if (!assertNoTokenLeak(data)) {
    throw new Error('token_leak_blocked');
  }

  const payload = data as InstagramPublishResult;
  if (!payload?.ok) {
    return {
      ok: false,
      error: payload?.error ?? 'publish_failed',
      message: payload?.message,
      requiredScope: payload?.requiredScope,
      attemptId: payload?.attemptId,
    };
  }
  return payload;
}

export function useInstagramPublish() {
  const { membership } = useAuth();
  const qc = useQueryClient();

  const publishMutation = useMutation({
    mutationFn: (draftId: string) => publishDraftToInstagram({ draftId, confirmed: true }),
    onSuccess: async (result) => {
      if (result.ok) {
        await qc.invalidateQueries({ queryKey: ['content-drafts'] });
      }
      await qc.invalidateQueries({
        queryKey: ['instagram-connection', membership?.org_id, membership?.id],
      });
    },
  });

  return { publishMutation };
}
