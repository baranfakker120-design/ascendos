import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@shared/auth/AuthProvider';
import { supabase } from '@shared/api/supabase';
import {
  buildStoryMediaObjectPath,
  COACHING_MEDIA_BUCKET,
} from '@features/live-coaching/coachingMedia';
import { createSignedCoachingMediaUrl } from '@features/live-coaching/useCoachingMediaUrl';
import { appendMusicNoteToBody, type StoryMusicSuggestion } from './storyMedia';
import {
  STORY_TTL_MS,
  type AscendStory,
  type StoryCard,
  type StoryMediaKind,
  type StoryTone,
  type StoryType,
} from './types';
import { toStoryCardFromRow } from './buildCoachStories';

export function usePublishedAscendStories() {
  const { membership } = useAuth();
  const orgId = membership?.org_id ?? null;
  return useQuery({
    queryKey: ['ascend-stories', 'feed', orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<StoryCard[]> => {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('ascend_stories')
        .select('*')
        .eq('active', true)
        .gt('expires_at', now)
        .order('published_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as AscendStory[]).map(toStoryCardFromRow);
    },
    refetchInterval: 60_000,
  });
}

export function useAllAscendStories() {
  const { membership } = useAuth();
  const orgId = membership?.org_id ?? null;
  return useQuery({
    queryKey: ['ascend-stories', 'admin', orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<AscendStory[]> => {
      const { data, error } = await supabase
        .from('ascend_stories')
        .select('*')
        .order('published_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as AscendStory[];
    },
  });
}

export interface PublishStoryInput {
  storyType: StoryType;
  title: string;
  body: string;
  authorLabel: string;
  subjectName?: string;
  tone: StoryTone;
  mediaKind?: StoryMediaKind;
  mediaPath?: string | null;
  /** Never persist public durable URLs — signed at read time. */
  mediaUrl?: string | null;
  musicSuggestion?: StoryMusicSuggestion | null;
  actorId: string | null;
  orgId: string;
  /** Default 24h from now. */
  ttlMs?: number;
}

export async function uploadStoryMedia(params: {
  orgId: string;
  actorId: string | null;
  file: File;
}): Promise<{ path: string }> {
  const path = buildStoryMediaObjectPath(params.orgId, params.actorId, params.file.name);
  const { error } = await supabase.storage.from(COACHING_MEDIA_BUCKET).upload(path, params.file, {
    cacheControl: '3600',
    upsert: false,
    contentType: params.file.type || undefined,
  });
  if (error) throw error;
  return { path };
}

export function useStoryMutations() {
  const qc = useQueryClient();
  const invalidate = () => Promise.all([qc.invalidateQueries({ queryKey: ['ascend-stories'] })]);

  const publish = useMutation({
    mutationFn: async (input: PublishStoryInput) => {
      if (!input.orgId.trim()) throw new Error('org_required');
      const publishedAt = new Date();
      const expiresAt = new Date(publishedAt.getTime() + (input.ttlMs ?? STORY_TTL_MS));
      const body = appendMusicNoteToBody(input.body, input.musicSuggestion);
      const { data, error } = await supabase
        .from('ascend_stories')
        .insert({
          org_id: input.orgId,
          story_type: input.storyType,
          media_kind: input.mediaKind ?? (input.mediaPath ? 'image' : 'text'),
          title: input.title,
          body,
          author_label: input.authorLabel || 'Ascend',
          subject_name: input.subjectName || null,
          media_path: input.mediaPath ?? null,
          media_url: null,
          tone: input.tone,
          source: 'admin',
          active: true,
          published_at: publishedAt.toISOString(),
          expires_at: expiresAt.toISOString(),
          created_by: input.actorId,
          updated_by: input.actorId,
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as AscendStory;
    },
    onSuccess: () => void invalidate(),
  });

  const deactivate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('ascend_stories')
        .update({ active: false })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => void invalidate(),
  });

  return { publish, deactivate, createSignedCoachingMediaUrl };
}
