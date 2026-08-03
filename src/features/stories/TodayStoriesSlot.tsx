import { useMemo } from 'react';
import { useCoachOrgIntelligence } from '@features/coach/intelligence/useCoachOrgIntelligence';
import { buildCoachStories, mergeStoryFeeds } from './buildCoachStories';
import { StoriesBar } from './StoriesBar';
import { usePublishedAscendStories } from './storiesApi';

/**
 * Additive Today slot — Stories above Live Coaching / Daily Plan.
 * Merges Admin Stories (DB, 24h) with Coach Stories (verified optimistic insights).
 */
export function TodayStoriesSlot() {
  const admin = usePublishedAscendStories();
  const { intelligence } = useCoachOrgIntelligence(true);

  const stories = useMemo(() => {
    const coach = intelligence ? buildCoachStories(intelligence, 8) : [];
    return mergeStoryFeeds(admin.data ?? [], coach);
  }, [admin.data, intelligence]);

  if (stories.length === 0) return null;
  return <StoriesBar stories={stories} />;
}
