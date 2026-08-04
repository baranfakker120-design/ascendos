import { describe, expect, it, vi } from 'vitest';
import { resolveCurrentRank } from './resolveCurrentRank';

const sampleRank = {
  key: 'starter',
  label: 'Starter',
  threshold_ap: 0,
  frame_asset: 'frame-01',
  sort_order: 1,
};

describe('resolveCurrentRank', () => {
  it('uses display_rank_for_ap when available', async () => {
    const result = await resolveCurrentRank({
      orgId: 'org-1',
      apTotal: 10,
      teamLeaderQualified: false,
      displayRank: async () => ({ data: [sampleRank], error: null }),
      classicRank: async () => ({ data: null, error: null }),
    });
    expect(result.current).toEqual(sampleRank);
    expect(result.warning).toBeNull();
  });

  it('falls back to rank_for_ap when display RPC is missing', async () => {
    const classic = vi.fn(async () => ({ data: [sampleRank], error: null }));
    const result = await resolveCurrentRank({
      orgId: 'org-1',
      apTotal: 10,
      teamLeaderQualified: false,
      displayRank: async () => ({
        data: null,
        error: { code: 'PGRST202', message: 'Could not find the function' },
      }),
      classicRank: classic,
    });
    expect(classic).toHaveBeenCalledOnce();
    expect(result.current).toEqual(sampleRank);
    expect(result.warning).toBe('display_rank_unavailable');
  });

  it('falls back to rank_for_ap on org mismatch (Developer path)', async () => {
    const result = await resolveCurrentRank({
      orgId: 'org-1',
      apTotal: 10,
      teamLeaderQualified: true,
      displayRank: async () => ({
        data: null,
        error: { message: 'AscendOS: display_rank_for_ap org mismatch' },
      }),
      classicRank: async () => ({ data: [sampleRank], error: null }),
    });
    expect(result.current).toEqual(sampleRank);
    expect(result.warning).toBe('display_rank_unavailable');
  });

  it('falls back to classic on unexpected display_rank errors', async () => {
    const result = await resolveCurrentRank({
      orgId: 'org-1',
      apTotal: 10,
      teamLeaderQualified: false,
      displayRank: async () => ({
        data: null,
        error: { code: '57014', message: 'timeout' },
      }),
      classicRank: async () => ({ data: [sampleRank], error: null }),
    });
    expect(result.current).toEqual(sampleRank);
    expect(result.warning).toBe('display_rank_error');
  });

  it('returns empty rank when both RPCs fail (keeps Profile alive)', async () => {
    const result = await resolveCurrentRank({
      orgId: 'org-1',
      apTotal: 10,
      teamLeaderQualified: false,
      displayRank: async () => ({
        data: null,
        error: { code: 'PGRST202', message: 'missing' },
      }),
      classicRank: async () => ({
        data: null,
        error: { code: '42501', message: 'permission denied' },
      }),
    });
    expect(result.current).toBeNull();
    expect(result.warning).toBe('rank_unavailable');
  });
});
