/**
 * Curated, evergreen topic → hashtag catalog.
 * NOT a live trend feed. Tags are thematic suggestions only.
 */

export interface CuratedTopic {
  id: string;
  /** Match against theme/category/keywords/summary (lowercase). */
  matchers: string[];
  hashtags: string[];
}

export const CURATED_TOPICS: readonly CuratedTopic[] = [
  {
    id: 'fragrance',
    matchers: ['duft', 'parfum', 'perfume', 'fragrance', 'scent', 'eau de', 'note', 'olfaktor'],
    hashtags: ['parfum', 'duftliebe', 'fragrance', 'scentoftheday', 'perfumelovers'],
  },
  {
    id: 'team_business',
    matchers: [
      'team',
      'network',
      'business',
      'leadership',
      'partner',
      'aufbau',
      'community',
      'mentor',
    ],
    hashtags: ['teamarbeit', 'businessmindset', 'netzwerk', 'leadership', 'community'],
  },
  {
    id: 'lifestyle',
    matchers: ['lifestyle', 'alltag', 'everyday', 'moment', 'leben', 'balance', 'wohlfühl'],
    hashtags: ['lifestyle', 'alltagsmomente', 'mindfulmoments', 'everydaylife'],
  },
  {
    id: 'product_showcase',
    matchers: ['produkt', 'product', 'flasche', 'bottle', 'packaging', 'unboxing', 'neuheit'],
    hashtags: ['productlove', 'newin', 'packagingdesign', 'detailshot'],
  },
  {
    id: 'motivation',
    matchers: ['motivation', 'inspiration', 'ziele', 'focus', 'mindset', 'erfolg'],
    hashtags: ['motivation', 'mindset', 'inspirationdaily', 'fokus'],
  },
  {
    id: 'event_social',
    matchers: ['party', 'event', 'treffen', 'workshop', 'live', 'abend', 'celebration'],
    hashtags: ['eventvibes', 'zusammenkommen', 'workshopday'],
  },
];

export function matchCuratedTopics(blob: string): CuratedTopic[] {
  const text = blob.toLowerCase();
  if (!text.trim()) return [];
  return CURATED_TOPICS.filter((topic) => topic.matchers.some((m) => text.includes(m)));
}
