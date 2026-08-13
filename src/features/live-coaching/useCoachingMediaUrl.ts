/**
 * Phase 7 — resolve private coaching-media via signed URL.
 * Never trust stored media_url as a durable public link.
 */

import { useEffect, useState } from 'react';
import { supabase } from '@shared/api/supabase';
import { COACHING_MEDIA_BUCKET } from './coachingMedia';

const SIGNED_TTL_SEC = 3600;

export async function createSignedCoachingMediaUrl(
  mediaPath: string | null | undefined,
  expiresIn = SIGNED_TTL_SEC
): Promise<string | null> {
  if (!mediaPath) return null;
  const { data, error } = await supabase.storage
    .from(COACHING_MEDIA_BUCKET)
    .createSignedUrl(mediaPath, expiresIn);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** Prefer signed media_path; fall back to legacy media_url only if signing fails. */
export function useCoachingMediaUrl(
  mediaPath: string | null | undefined,
  legacyMediaUrl: string | null | undefined
): string | null {
  const [url, setUrl] = useState<string | null>(legacyMediaUrl ?? null);

  useEffect(() => {
    let cancelled = false;
    if (!mediaPath) {
      setUrl(legacyMediaUrl ?? null);
      return;
    }
    void createSignedCoachingMediaUrl(mediaPath).then((signed) => {
      if (cancelled) return;
      setUrl(signed ?? legacyMediaUrl ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [mediaPath, legacyMediaUrl]);

  return url;
}
