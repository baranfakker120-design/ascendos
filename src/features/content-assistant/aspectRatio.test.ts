import { describe, expect, it } from 'vitest';

function guessAspectRatio(width: number | null, height: number | null): string | null {
  if (!width || !height || width <= 0 || height <= 0) return null;
  const r = width / height;
  if (Math.abs(r - 9 / 16) < 0.08) return '9:16';
  if (Math.abs(r - 4 / 5) < 0.08) return '4:5';
  if (Math.abs(r - 1) < 0.08) return '1:1';
  if (Math.abs(r - 16 / 9) < 0.08) return '16:9';
  return 'other';
}

describe('content aspect ratio helper', () => {
  it('detects story/reel 9:16', () => {
    expect(guessAspectRatio(1080, 1920)).toBe('9:16');
  });

  it('detects feed 4:5', () => {
    expect(guessAspectRatio(1080, 1350)).toBe('4:5');
  });

  it('returns null for missing dims', () => {
    expect(guessAspectRatio(null, 100)).toBeNull();
  });
});
