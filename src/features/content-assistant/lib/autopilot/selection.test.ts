import { describe, expect, it } from 'vitest';

/**
 * Mirrors edge no-repeat / cooldown scoring signals (unit-tested on client).
 * Edge implementation: supabase/functions/_shared/content-autopilot/selection.ts
 */
const COOLDOWN_DAYS = 3;

function daysBetween(isoA: string, isoB: string): number {
  return Math.abs(new Date(isoA).getTime() - new Date(isoB).getTime()) / (24 * 60 * 60 * 1000);
}

function preferFresherAsset(params: {
  candidateId: string;
  candidateLastUsedAt: string | null;
  reserved: Set<string>;
  history: Array<{ assetId: string; publishedAt: string }>;
  nowIso: string;
}): boolean {
  if (params.reserved.has(params.candidateId)) return false;
  const recent = params.history.some(
    (h) =>
      h.assetId === params.candidateId && daysBetween(h.publishedAt, params.nowIso) < COOLDOWN_DAYS
  );
  if (recent) return false;
  if (params.candidateLastUsedAt && daysBetween(params.candidateLastUsedAt, params.nowIso) < 1) {
    return false;
  }
  return true;
}

describe('autopilot no-repeat signals', () => {
  const now = '2026-08-11T12:00:00.000Z';

  it('rejects assets reserved for another planned slot', () => {
    expect(
      preferFresherAsset({
        candidateId: 'a1',
        candidateLastUsedAt: null,
        reserved: new Set(['a1']),
        history: [],
        nowIso: now,
      })
    ).toBe(false);
  });

  it('rejects assets used yesterday when alternatives would be preferred', () => {
    expect(
      preferFresherAsset({
        candidateId: 'a1',
        candidateLastUsedAt: '2026-08-10T19:00:00.000Z',
        reserved: new Set(),
        history: [{ assetId: 'a1', publishedAt: '2026-08-10T19:00:00.000Z' }],
        nowIso: now,
      })
    ).toBe(false);
  });

  it('accepts never-used assets', () => {
    expect(
      preferFresherAsset({
        candidateId: 'a2',
        candidateLastUsedAt: null,
        reserved: new Set(['a1']),
        history: [{ assetId: 'a1', publishedAt: '2026-08-10T19:00:00.000Z' }],
        nowIso: now,
      })
    ).toBe(true);
  });
});
