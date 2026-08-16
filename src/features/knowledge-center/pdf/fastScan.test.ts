import { describe, expect, it } from 'vitest';
import { bytesToHex, normalizePdfFilename } from './contentHash';
import { decideKnowledgePdfFastScan } from './fastScan';

describe('contentHash helpers', () => {
  it('bytesToHex encodes stably', () => {
    expect(bytesToHex(new Uint8Array([0, 15, 255]))).toBe('000fff');
  });

  it('normalizePdfFilename lowercases', () => {
    expect(normalizePdfFilename('  Katalog.PDF ')).toBe('katalog.pdf');
  });
});

describe('decideKnowledgePdfFastScan', () => {
  const existing = {
    id: 'doc-1',
    source_filename: 'katalog.pdf',
    content_sha256: 'abc123def4567890',
    status: 'ready_for_review',
    title: 'Katalog',
  };

  it('skips deep analysis on exact hash match (same org candidate)', () => {
    const d = decideKnowledgePdfFastScan({
      contentSha256: 'abc123def4567890',
      sourceFilename: 'katalog.pdf',
      exactHashMatch: existing,
      sameFilenameMatch: existing,
    });
    expect(d.result).toBe('exact_duplicate');
    expect(d.skipDeepAnalysis).toBe(true);
    expect(d.matchId).toBe('doc-1');
  });

  it('flags possible version / conflict on same filename different hash', () => {
    const d = decideKnowledgePdfFastScan({
      contentSha256: 'ffffffffffffffff',
      sourceFilename: 'katalog.pdf',
      exactHashMatch: null,
      sameFilenameMatch: existing,
    });
    expect(d.result).toBe('conflict_review');
    expect(d.skipDeepAnalysis).toBe(false);
    expect(d.requiresAdminDecision).toBe(true);
  });

  it('marks new when no org match', () => {
    const d = decideKnowledgePdfFastScan({
      contentSha256: 'ffffffffffffffff',
      sourceFilename: 'neu.pdf',
      exactHashMatch: null,
      sameFilenameMatch: null,
    });
    expect(d.result).toBe('new');
    expect(d.skipDeepAnalysis).toBe(false);
  });

  it('requires review when hash missing', () => {
    const d = decideKnowledgePdfFastScan({
      contentSha256: '',
      sourceFilename: 'x.pdf',
      exactHashMatch: null,
      sameFilenameMatch: null,
    });
    expect(d.result).toBe('conflict_review');
  });
});
