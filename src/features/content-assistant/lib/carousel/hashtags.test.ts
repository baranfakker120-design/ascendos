import { describe, expect, it } from 'vitest';
import { enforceExactHashtagCount, REQUIRED_HASHTAG_COUNT } from './hashtags';

describe('enforceExactHashtagCount', () => {
  it('always returns exactly 5', () => {
    expect(enforceExactHashtagCount(['a', 'b']).length).toBe(REQUIRED_HASHTAG_COUNT);
    expect(enforceExactHashtagCount(['a', 'b', 'c', 'd', 'e', 'f', 'g'])).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
  });

  it('dedupes and strips #', () => {
    expect(enforceExactHashtagCount(['#Foo', 'foo', 'Bar'], ['baz', 'qux', 'zip'])).toEqual([
      'Foo',
      'Bar',
      'baz',
      'qux',
      'zip',
    ]);
  });
});
