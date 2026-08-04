import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@shared/api/supabase';
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
  return useQuery({
    queryKey: ['ascend-stories', 'feed'],
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
  return useQuery({
    queryKey: ['ascend-stories', 'admin'],
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
  mediaUrl?: string | null;
  actorId: string | null;
  /** Default 24h from now. */
  ttlMs?: number;
}

export function useStoryMutations() {
  const qc = useQueryClient();
  const invalidate = () => Promise.all([qc.invalidateQueries({ queryKey: ['ascend-stories'] })]);

  const publish = useMutation({
    mutationFn: async (input: PublishStoryInput) => {
      const publishedAt = new Date();
      const expiresAt = new Date(publishedAt.getTime() + (input.ttlMs ?? STORY_TTL_MS));
      const { data, error } = await supabase
        .from('ascend_stories')
        .insert({
          story_type: input.storyType,
          media_kind: input.mediaKind ?? 'text',
          title: input.title,
          body: input.body,
          author_label: input.authorLabel || 'Ascend',
          subject_name: input.subjectName || null,
          media_url: input.mediaUrl ?? null,
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

  return { publish, deactivate };
}
