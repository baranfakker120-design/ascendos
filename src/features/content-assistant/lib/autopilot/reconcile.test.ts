import { describe, expect, it } from 'vitest';
import {
  canReplaceSlotWith,
  decideSlotReconcile,
  shouldResetPlanOnUpload,
  type ReconcileSlotInput,
} from './reconcile';

function slot(partial: Partial<ReconcileSlotInput> & { id: string }): ReconcileSlotInput {
  return {
    status: 'ready',
    slotKind: 'feed',
    assetId: 'a1',
    carouselAssetIds: [],
    plannedFor: '2026-08-12T09:30:00.000Z',
    ...partial,
  };
}

describe('autopilot plan reconciliation', () => {
  it('A/B: deleted unpublished image → replace ready feed slot', () => {
    const assets = new Map<string, { media_kind: string }>([['a2', { media_kind: 'image' }]]);
    const d = decideSlotReconcile({
      slot: slot({ id: 's1', assetId: 'deleted', status: 'ready' }),
      assets,
    });
    expect(d).toEqual({ action: 'replace', reason: 'asset_missing_or_ineligible' });
  });

  it('C: published asset delete → historical slot ignored', () => {
    const d = decideSlotReconcile({
      slot: slot({ id: 's1', status: 'published', assetId: null }),
      assets: new Map(),
    });
    expect(d.action).toBe('ignore_published');
  });

  it('E: active plan not reset on upload', () => {
    expect(shouldResetPlanOnUpload(true)).toBe(false);
  });

  it('F/G: video can replace story only — never feed/carousel', () => {
    expect(canReplaceSlotWith({ slotKind: 'story', candidateMediaKind: 'video' })).toBe(true);
    expect(canReplaceSlotWith({ slotKind: 'feed', candidateMediaKind: 'video' })).toBe(false);
    expect(canReplaceSlotWith({ slotKind: 'feed', candidateMediaKind: 'image' })).toBe(true);
  });

  it('H: feed slot with video primary → replace', () => {
    const assets = new Map([['v1', { media_kind: 'video' }]]);
    expect(
      decideSlotReconcile({
        slot: slot({ id: 's', assetId: 'v1', slotKind: 'feed' }),
        assets,
      }).action
    ).toBe('replace');
  });

  it('I: story slot missing asset → replace (image or video eligible)', () => {
    const d = decideSlotReconcile({
      slot: slot({ id: 's', slotKind: 'story', assetId: null }),
      assets: new Map(),
    });
    expect(d.action).toBe('replace');
    expect(canReplaceSlotWith({ slotKind: 'story', candidateMediaKind: 'image' })).toBe(true);
    expect(canReplaceSlotWith({ slotKind: 'story', candidateMediaKind: 'video' })).toBe(true);
  });

  it('J: multiple deleted assets → each ready slot independently replace', () => {
    const assets = new Map<string, { media_kind: string }>();
    const slots = [
      slot({ id: 's1', assetId: 'gone1' }),
      slot({ id: 's2', assetId: 'gone2' }),
      slot({ id: 's3', assetId: 'ok', status: 'ready' }),
    ];
    assets.set('ok', { media_kind: 'image' });
    const actions = slots.map((s) => decideSlotReconcile({ slot: s, assets }).action);
    expect(actions).toEqual(['replace', 'replace', 'keep']);
  });

  it('carousel child invalid → repair_carousel', () => {
    const assets = new Map([
      ['a1', { media_kind: 'image' }],
      // a2 missing
    ]);
    const d = decideSlotReconcile({
      slot: slot({
        id: 'c1',
        assetId: 'a1',
        carouselAssetIds: ['a1', 'a2', 'a3'],
      }),
      assets,
    });
    expect(d.action).toBe('repair_carousel');
    expect(d).toMatchObject({ reason: 'autopilot_collapse_to_single', keepPrimary: true });
  });

  it('9. valid Autopilot READY carousel (all children ok) → still collapse to single', () => {
    const assets = new Map([
      ['a1', { media_kind: 'image' }],
      ['a2', { media_kind: 'image' }],
      ['a3', { media_kind: 'image' }],
      ['a4', { media_kind: 'image' }],
      ['a5', { media_kind: 'image' }],
    ]);
    const evening = decideSlotReconcile({
      slot: slot({
        id: 'a51ea327-4ac2-4149-addc-c4bf7777e91e',
        assetId: 'a1',
        carouselAssetIds: ['a1', 'a2'],
        status: 'ready',
      }),
      assets,
    });
    expect(evening).toEqual({
      action: 'repair_carousel',
      reason: 'autopilot_collapse_to_single',
      keepPrimary: true,
    });

    const midday = decideSlotReconcile({
      slot: slot({
        id: '03f0b3b3-450c-4d90-8155-ac079f78e9e2',
        assetId: 'a1',
        carouselAssetIds: ['a1', 'a2', 'a3', 'a4', 'a5'],
        status: 'ready',
      }),
      assets,
    });
    expect(midday.action).toBe('repair_carousel');
  });

  it('10. published carousel → ignore_published (unverändert)', () => {
    const assets = new Map([
      ['a1', { media_kind: 'image' }],
      ['a2', { media_kind: 'image' }],
    ]);
    const d = decideSlotReconcile({
      slot: slot({
        id: '950a34c8-published',
        status: 'published',
        assetId: 'a1',
        carouselAssetIds: ['a1', 'a2', 'a3', 'a4', 'a5'],
      }),
      assets,
    });
    expect(d.action).toBe('ignore_published');
  });

  it('single-image feed with empty carousel stays keep', () => {
    const assets = new Map([['a1', { media_kind: 'image' }]]);
    expect(
      decideSlotReconcile({
        slot: slot({ id: 's', assetId: 'a1', carouselAssetIds: [] }),
        assets,
      }).action
    ).toBe('keep');
  });

  it('failed/publishing terminal statuses are not rewritten', () => {
    expect(
      decideSlotReconcile({
        slot: slot({ id: 'f', status: 'failed', assetId: null }),
        assets: new Map(),
      }).action
    ).toBe('ignore_terminal');
    expect(
      decideSlotReconcile({
        slot: slot({ id: 'p', status: 'publishing', assetId: null }),
        assets: new Map(),
      }).action
    ).toBe('ignore_terminal');
  });
});
