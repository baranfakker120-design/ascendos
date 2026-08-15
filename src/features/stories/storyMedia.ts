/**
 * Ascend Stories — 9:16 media helpers (additive, unit-tested).
 * Canvas target: 1080 × 1920. Does not convert existing assets.
 */

import {
  STORY_MEDIA_ASPECT,
  STORY_MEDIA_HEIGHT,
  STORY_MEDIA_WIDTH,
} from '@features/live-coaching/coachingMedia';

export { STORY_MEDIA_ASPECT, STORY_MEDIA_HEIGHT, STORY_MEDIA_WIDTH };

/** Accept ratios near 9:16 (portrait story). */
export function isStoryAspectRatio(width: number, height: number, tolerance = 0.08): boolean {
  if (width <= 0 || height <= 0) return false;
  const ratio = width / height;
  const target = STORY_MEDIA_WIDTH / STORY_MEDIA_HEIGHT;
  return Math.abs(ratio - target) <= tolerance;
}

export function storyAspectLabel(): string {
  return `${STORY_MEDIA_ASPECT} · ${STORY_MEDIA_WIDTH}×${STORY_MEDIA_HEIGHT}`;
}

/** Optional music suggestion — never sent to Meta as attachable audio. */
export interface StoryMusicSuggestion {
  trackName: string;
  artist: string;
  mood?: string;
  reason?: string;
}

export function formatMusicSuggestionNote(
  music: StoryMusicSuggestion | null | undefined
): string | null {
  if (!music) return null;
  const track = music.trackName.trim();
  const artist = music.artist.trim();
  if (!track && !artist) return null;
  const parts = [
    track && artist ? `♪ ${track} — ${artist}` : `♪ ${track || artist}`,
    music.mood?.trim() ? `Mood: ${music.mood.trim()}` : null,
    music.reason?.trim() ? music.reason.trim() : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

/** Append music note to body without mutating historical rows. */
export function appendMusicNoteToBody(
  body: string,
  music: StoryMusicSuggestion | null | undefined
): string {
  const note = formatMusicSuggestionNote(music);
  if (!note) return body;
  const trimmed = body.trimEnd();
  return `${trimmed}\n\n${note}`;
}
