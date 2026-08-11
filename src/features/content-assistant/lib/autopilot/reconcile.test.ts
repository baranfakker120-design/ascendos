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
