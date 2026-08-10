import { describe, expect, it } from 'vitest';
import type { ContentAsset } from '../../contentAssetsApi';
import { filterLibraryAssetsByScope } from './scopeFilter';

function asset(partial: Pick<ContentAsset, 'id' | 'scope' | 'owner_membership_id'>): ContentAsset {
  return {
    org_id: 'org',
    created_by: 'user',
    media_kind: 'image',
    storage_path: 'p',
    file_name: 'f.jpg',
    mime_type: 'image/jpeg',
    byte_size: 10,
    width_px: null,
    height_px: null,
    aspect_ratio: null,
    suggested_formats: [],
    title: null,
    theme: null,
    keywords: [],
    analysis_status: 'pending',
    last_used_at: null,
    usage_count: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('filterLibraryAssetsByScope', () => {
  const mine = asset({ id: 'p1', scope: 'personal', owner_membership_id: 'me' });
  const otherPersonal = asset({ id: 'p2', scope: 'personal', owner_membership_id: 'other' });
  const central = asset({ id: 'c1', scope: 'central', owner_membership_id: 'me' });
  const all = [mine, otherPersonal, central];

  it('Meine shows only own personal assets, never central', () => {
    expect(filterLibraryAssetsByScope(all, 'personal', 'me').map((a) => a.id)).toEqual(['p1']);
  });

  it('Zentrale shows only central assets, never personal', () => {
    expect(filterLibraryAssetsByScope(all, 'central', 'me').map((a) => a.id)).toEqual(['c1']);
  });

  it('does not drop rows from the source array', () => {
    const source = [...all];
    filterLibraryAssetsByScope(source, 'personal', 'me');
    filterLibraryAssetsByScope(source, 'central', 'me');
    expect(source).toHaveLength(3);
  });
});
