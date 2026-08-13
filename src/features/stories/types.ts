/**
 * Ascend Stories — pure domain types.
 * Motivate · Celebrate · Inspire. Never shame. Never compare negatively.
 */

export type StoryType =
  | 'achievements'
  | 'onboarding'
  | 'presentations'
  | 'zoom'
  | 'qualifications'
  | 'customers'
  | 'partners'
  | 'coach_highlights'
  | 'admin';

/** Future architecture — Sprint 5.2 ships text; media columns ready. */
export type StoryMediaKind = 'text' | 'image' | 'video' | 'voice';

export type StoryTone = 'motivate' | 'celebrate' | 'inspire';
export type StorySource = 'coach' | 'admin' | 'system';

export interface AscendStory {
  id: string;
  org_id: string;
  story_type: StoryType;
  media_kind: StoryMediaKind;
  title: string;
  body: string;
  author_label: string;
  subject_name: string | null;
  subject_membership_id: string | null;
  media_path: string | null;
  media_url: string | null;
  tone: StoryTone;
  source: StorySource;
  active: boolean;
  published_at: string;
  expires_at: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Client-side story card (admin DB rows + coach-generated insights). */
export interface StoryCard {
  id: string;
  type: StoryType;
  mediaKind: StoryMediaKind;
  title: string;
  body: string;
  authorLabel: string;
  subjectName: string | null;
  mediaUrl: string | null;
  tone: StoryTone;
  source: StorySource;
  publishedAt: string;
  expiresAt: string;
  /** Ring accent for unread / active. */
  accent: 'gold' | 'champagne' | 'ink';
}

/** Story type keys for iteration — translate in UI via `t(\`stories.types.${type}\`)`. */
export const STORY_TYPES: StoryType[] = [
  'achievements',
  'onboarding',
  'presentations',
  'zoom',
  'qualifications',
  'customers',
  'partners',
  'coach_highlights',
  'admin',
];

/** @deprecated Use STORY_TYPES + `t(\`stories.types.${type}\`)` in UI. */
export const STORY_TYPE_LABELS: Record<StoryType, string> = {
  achievements: 'stories.types.achievements',
  onboarding: 'stories.types.onboarding',
  presentations: 'stories.types.presentations',
  zoom: 'stories.types.zoom',
  qualifications: 'stories.types.qualifications',
  customers: 'stories.types.customers',
  partners: 'stories.types.partners',
  coach_highlights: 'stories.types.coach_highlights',
  admin: 'stories.types.admin',
};

export const STORY_TTL_MS = 24 * 60 * 60 * 1000;
