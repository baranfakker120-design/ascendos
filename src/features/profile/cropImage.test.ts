import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
    expect(upload).toMatch(/const onConfirm = async \(blob: Blob\)/);
    expect(modal).toContain('kneifen');
    expect(modal).toContain('RankFrame');
    expect(modal).toContain('onConfirm');
  });
});
