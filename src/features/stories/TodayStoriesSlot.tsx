import { useMemo } from 'react';
import { createCoachTranslator } from '@features/coach/i18n';
import { useCoachOrgIntelligence } from '@features/coach/intelligence/useCoachOrgIntelligence';
import { useI18n } from '@shared/i18n';
import { buildCoachStories, mergeStoryFeeds } from './buildCoachStories';
import { StoriesBar } from './StoriesBar';
import { usePublishedAscendStories } from './storiesApi';

/**
 * Additive Today slot — Stories above Live Coaching / Daily Plan.
 * Merges Admin Stories (DB, 24h) with Coach Stories (verified optimistic insights).
 */
export function TodayStoriesSlot() {
  const { locale } = useI18n();
  const t = useMemo(() => createCoachTranslator(locale), [locale]);
  const admin = usePublishedAscendStories();
  const { intelligence } = useCoachOrgIntelligence(true);

  const stories = useMemo(() => {
    const coach = intelligence ? buildCoachStories(intelligence, 8, t) : [];
    return mergeStoryFeeds(admin.data ?? [], coach);
  }, [admin.data, intelligence, t]);

  if (stories.length === 0) return null;
  return <StoriesBar stories={stories} />;
}
