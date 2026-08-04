import { describe, expect, it } from 'vitest';
import { toZoomAppScheme } from './zoomJoin';

describe('toZoomAppScheme', () => {
  it('maps zoom meeting urls to zoomus scheme', () => {
    expect(toZoomAppScheme('https://zoom.us/j/123456789?pwd=abc')).toBe(
      'zoomus://zoom.us/join?confno=123456789&pwd=abc'
    );
  });

  it('returns null for non-zoom urls', () => {
    expect(toZoomAppScheme('https://meet.google.com/abc')).toBeNull();
  });
});
