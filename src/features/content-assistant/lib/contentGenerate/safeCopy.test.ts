import { describe, expect, it } from 'vitest';
import {
  filterInternalIdHashtags,
  looksLikeInternalId,
  pickSafePublicCopy,
  textContainsInternalId,
} from './safeCopy';

const SAMPLE = 'F92F7B5E-3F63-42FC-8BD7-31071AB7213C';

describe('safeCopy', () => {
  it('detects bare UUIDs and UUID filenames', () => {
    expect(looksLikeInternalId(SAMPLE)).toBe(true);
    expect(looksLikeInternalId(SAMPLE.toLowerCase())).toBe(true);
    expect(looksLikeInternalId(`${SAMPLE}.JPG`)).toBe(true);
    expect(looksLikeInternalId('AscendOS Update')).toBe(false);
    expect(looksLikeInternalId('')).toBe(false);
  });

  it('detects UUID tokens inside captions', () => {
    expect(textContainsInternalId(`Caption with ${SAMPLE} inside`)).toBe(true);
    expect(textContainsInternalId('Normal caption without ids')).toBe(false);
  });

  it('picks first safe public copy candidate', () => {
    expect(pickSafePublicCopy(SAMPLE, `${SAMPLE}.png`, 'Team Fokus')).toBe('Team Fokus');
    expect(pickSafePublicCopy(SAMPLE, null, undefined)).toBeNull();
  });

  it('filters UUID hashtags', () => {
    expect(filterInternalIdHashtags(['teamarbeit', SAMPLE, '#netzwerk'])).toEqual([
      'teamarbeit',
      '#netzwerk',
    ]);
  });
});
