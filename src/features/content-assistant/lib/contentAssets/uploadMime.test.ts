import { describe, expect, it } from 'vitest';
import {
  CONTENT_ASSET_FILE_ACCEPT,
  extForContentAssetMime,
  isAllowedContentAssetMime,
  mediaKindForContentAssetMime,
  mimeFromFileName,
  resolveContentAssetUploadMime,
} from './uploadMime';

function fakeFile(name: string, type: string): { name: string; type: string } {
  return { name, type };
}

describe('content asset upload MIME allowlist', () => {
  it('1) accepts video/mp4', () => {
    expect(resolveContentAssetUploadMime(fakeFile('clip.mp4', 'video/mp4'))).toBe('video/mp4');
    expect(mediaKindForContentAssetMime('video/mp4')).toBe('video');
    expect(extForContentAssetMime('video/mp4')).toBe('mp4');
  });

  it('2) accepts video/quicktime', () => {
    expect(resolveContentAssetUploadMime(fakeFile('IMG_1234.MOV', 'video/quicktime'))).toBe(
      'video/quicktime'
    );
    expect(mediaKindForContentAssetMime('video/quicktime')).toBe('video');
    expect(extForContentAssetMime('video/quicktime')).toBe('mov');
  });

  it('3) accepts iPhone MOV when Safari omits MIME (extension fallback)', () => {
    expect(resolveContentAssetUploadMime(fakeFile('IMG_2599.mov', ''))).toBe('video/quicktime');
    expect(
      resolveContentAssetUploadMime(fakeFile('IMG_2599.MOV', 'application/octet-stream'))
    ).toBe('video/quicktime');
    expect(mimeFromFileName('reel.m4v')).toBe('video/mp4');
  });

  it('4) keeps existing image types working', () => {
    expect(resolveContentAssetUploadMime(fakeFile('a.jpg', 'image/jpeg'))).toBe('image/jpeg');
    expect(resolveContentAssetUploadMime(fakeFile('a.png', 'image/png'))).toBe('image/png');
    expect(resolveContentAssetUploadMime(fakeFile('a.webp', 'image/webp'))).toBe('image/webp');
    expect(mediaKindForContentAssetMime('image/jpeg')).toBe('image');
  });

  it('5) rejects unsupported types', () => {
    expect(resolveContentAssetUploadMime(fakeFile('x.gif', 'image/gif'))).toBeNull();
    expect(resolveContentAssetUploadMime(fakeFile('x.avi', 'video/x-msvideo'))).toBeNull();
    expect(resolveContentAssetUploadMime(fakeFile('x.pdf', 'application/pdf'))).toBeNull();
    expect(resolveContentAssetUploadMime(fakeFile('x.bin', ''))).toBeNull();
    expect(isAllowedContentAssetMime('video/avi')).toBe(false);
  });

  it('6) stores video kind for quicktime/mp4 (asset media_kind)', () => {
    const qt = resolveContentAssetUploadMime(fakeFile('phone.mov', 'video/quicktime'))!;
    expect(mediaKindForContentAssetMime(qt)).toBe('video');
    const mp4 = resolveContentAssetUploadMime(fakeFile('clip.mp4', 'video/mp4'))!;
    expect(mediaKindForContentAssetMime(mp4)).toBe('video');
  });

  it('7) file accept includes mp4 + quicktime + mov for Reel upload path', () => {
    expect(CONTENT_ASSET_FILE_ACCEPT).toContain('video/mp4');
    expect(CONTENT_ASSET_FILE_ACCEPT).toContain('video/quicktime');
    expect(CONTENT_ASSET_FILE_ACCEPT).toContain('.mov');
    expect(CONTENT_ASSET_FILE_ACCEPT).toContain('image/jpeg');
    expect(CONTENT_ASSET_FILE_ACCEPT).not.toContain('*/*');
  });
});
