import { describe, expect, it } from 'vitest';
import { avatarInitials } from './Avatar';

describe('avatarInitials', () => {
  it('nimmt erste Buchstaben von Vor- und Nachname', () => {
    expect(avatarInitials('Seyda Yilmaz')).toBe('SY');
  });

  it('nimmt zwei Zeichen bei einem Wort', () => {
    expect(avatarInitials('AscendOS')).toBe('AS');
  });

  it('liefert Ersatz bei leerem Namen', () => {
    expect(avatarInitials('   ')).toBe('?');
  });
});
