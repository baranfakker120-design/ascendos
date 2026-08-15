import { describe, expect, it } from 'vitest';
import {
  appendMusicNoteToBody,
  formatMusicSuggestionNote,
  isStoryAspectRatio,
  storyAspectLabel,
} from './storyMedia';

describe('storyMedia 9:16 helpers', () => {
  it('accepts 1080×1920 and near-9:16 portraits', () => {
    expect(isStoryAspectRatio(1080, 1920)).toBe(true);
    expect(isStoryAspectRatio(720, 1280)).toBe(true);
    expect(isStoryAspectRatio(1080, 1080)).toBe(false);
    expect(isStoryAspectRatio(1080, 1350)).toBe(false);
    expect(isStoryAspectRatio(0, 1920)).toBe(false);
  });

  it('labels the story canvas', () => {
    expect(storyAspectLabel()).toContain('9:16');
    expect(storyAspectLabel()).toContain('1080');
  });

  it('formats music suggestion without claiming Instagram attach', () => {
    expect(formatMusicSuggestionNote({ trackName: 'Sunrise', artist: 'Ada' })).toBe(
      '♪ Sunrise — Ada'
    );
    expect(formatMusicSuggestionNote({ trackName: '', artist: '' })).toBeNull();
    expect(appendMusicNoteToBody('Hello', { trackName: 'Sunrise', artist: 'Ada' })).toContain(
      '♪ Sunrise — Ada'
    );
    expect(appendMusicNoteToBody('Hello', null)).toBe('Hello');
  });
});
