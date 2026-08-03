export type LiveMediaType = 'image' | 'video';
export type LiveRepeatRule = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly';
export type LiveCoachingState = 'countdown' | 'live' | 'finished';

export interface LiveCoachingEvent {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  coach_name: string;
  category: string;
  language: string;
  starts_at: string;
  duration_minutes: number;
  zoom_url: string | null;
  repeat_rule: LiveRepeatRule;
  media_type: LiveMediaType;
  media_path: string | null;
  media_url: string | null;
  active: boolean;
  published_at: string | null;
  published_by: string | null;
  replay_url: string | null;
  recording_url: string | null;
  guest_speakers: unknown;
  library_visible: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export const LIVE_COACHING_CATEGORIES = [
  'Live Coaching',
  'Business',
  'Produkt',
  'Leadership',
  'Guest',
] as const;

/** Future-ready surface — additive stubs only. */
export const LIVE_COACHING_FUTURE = {
  replay: false,
  recordings: false,
  guestSpeakers: false,
  multipleEvents: false,
  search: false,
  categoriesLibrary: false,
  library: false,
} as const;
