import { useMutation } from '@tanstack/react-query';
import { supabase } from '@shared/api/supabase';
import {
  assertNoTokenLeak,
  type InstagramAudioSearchItem,
  type InstagramAudioSearchType,
} from './lib/instagramAudio';

export type InstagramAudioSearchResult = {
  ok: true;
  audioType: InstagramAudioSearchType;
  searchQuery: string | null;
  audio: InstagramAudioSearchItem[];
  audioSearchAvailable: boolean;
};

async function invokeAudioSearch(params: {
  audioType: InstagramAudioSearchType;
  searchQuery?: string;
}): Promise<InstagramAudioSearchResult> {
  const { data, error } = await supabase.functions.invoke('instagram-audio-search', {
    body: {
      action: 'search',
      audioType: params.audioType,
      searchQuery: params.searchQuery ?? '',
    },
  });
  if (error) throw error;
  if (!assertNoTokenLeak(data)) {
    throw new Error('token_leak_blocked');
  }
  const payload = data as {
    ok?: boolean;
    error?: string;
    message?: string;
    audioType?: InstagramAudioSearchType;
    searchQuery?: string | null;
    audio?: InstagramAudioSearchItem[];
    audioSearchAvailable?: boolean;
  };
  if (!payload?.ok || !Array.isArray(payload.audio)) {
    throw new Error(payload?.error ?? payload?.message ?? 'audio_search_failed');
  }
  return {
    ok: true,
    audioType: payload.audioType === 'original_sound' ? 'original_sound' : 'music',
    searchQuery: typeof payload.searchQuery === 'string' ? payload.searchQuery : null,
    audio: payload.audio,
    audioSearchAvailable: payload.audioSearchAvailable !== false,
  };
}

export async function searchInstagramMusic(
  searchQuery?: string
): Promise<InstagramAudioSearchResult> {
  return invokeAudioSearch({ audioType: 'music', searchQuery });
}

export async function searchInstagramOriginalSounds(
  searchQuery?: string
): Promise<InstagramAudioSearchResult> {
  return invokeAudioSearch({ audioType: 'original_sound', searchQuery });
}

export function useInstagramAudioSearch() {
  const searchMutation = useMutation({
    mutationFn: (params: { audioType: InstagramAudioSearchType; searchQuery?: string }) =>
      invokeAudioSearch(params),
  });
  return { searchMutation };
}
