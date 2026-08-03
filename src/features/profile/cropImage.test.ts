import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  coverScaleForImage,
  CROP_INITIAL_ZOOM,
  CROP_MAX_ZOOM_FACTOR,
  CROP_OUTPUT_SIZE,
} from './AvatarCropModal';

const dir = dirname(fileURLToPath(import.meta.url));

describe('cropImage contract', () => {
  const src = readFileSync(join(dir, 'cropImage.ts'), 'utf8');
  const modal = readFileSync(join(dir, 'AvatarCropModal.tsx'), 'utf8');
  const upload = readFileSync(join(dir, 'AvatarUpload.tsx'), 'utf8');

  it('exports circular crop and keeps square helper', () => {
    expect(src).toContain('export async function cropCircleWebp');
    expect(src).toContain('circleDiameter');
    expect(src).toContain('ctx.clip()');
  });

  it('opens crop UI before upload — no immediate save on file pick', () => {
    expect(upload).toContain('AvatarCropModal');
    expect(upload).toContain('setPicked(file)');
    expect(upload).toContain('onConfirm={onConfirm}');
    expect(modal).toContain('kneifen');
    expect(modal).toContain('RankFrame');
  });

  it('uses the same output size for preview and save (1:1 crop)', () => {
    expect(CROP_OUTPUT_SIZE).toBe(512);
    expect(modal).toMatch(/cropCircleWebp\(file,\s*currentTransform,\s*CROP_OUTPUT_SIZE\)/g);
    const matches = modal.match(/cropCircleWebp\([^)]*CROP_OUTPUT_SIZE\)/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('starts tighter than cover and allows deep zoom-in', () => {
    expect(CROP_INITIAL_ZOOM).toBeGreaterThan(1);
    expect(CROP_MAX_ZOOM_FACTOR).toBeGreaterThanOrEqual(5);
    const cover = coverScaleForImage(1200, 800, 280);
    expect(cover).toBeGreaterThan(1);
    expect(cover * CROP_INITIAL_ZOOM).toBeGreaterThan(cover);
  });
});
