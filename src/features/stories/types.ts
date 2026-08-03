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

export const STORY_TYPE_LABELS: Record<StoryType, string> = {
  achievements: 'Achievements',
  onboarding: 'Onboarding',
  presentations: 'Presentations',
  zoom: 'Zoom',
  qualifications: 'Qualifications',
  customers: 'Customers',
  partners: 'Partners',
  coach_highlights: 'Coach Highlights',
  admin: 'Admin Stories',
};

export const STORY_TTL_MS = 24 * 60 * 60 * 1000;
