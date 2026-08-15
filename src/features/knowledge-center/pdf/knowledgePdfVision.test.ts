import { describe, expect, it } from 'vitest';
import {
  assertTextPdfZeroVision,
  classifyKnowledgePdfPage,
  countVisionPages,
  pageNeedsVision,
} from './pageClassify';
import {
  assertKnowledgePdfHeaderMatch,
  assertKnowledgePdfOrgMatch,
  buildKnowledgePdfObjectPath,
  knowledgePdfPathBelongsToOrg,
} from './knowledgePdfStorage';
import { buildDocumentChunks, buildPageChunks, pagesToReviewMarkdown } from './semanticChunk';
import { parseKnowledgePdfVisionResult, parseVisionModelText } from './visionSchema';
import {
  canRetryKnowledgePdf,
  nextKnowledgePdfStatus,
  shouldAutoEnableCoachRag,
  buildKnowledgePdfExtractionFailureUpdate,
  formatKnowledgePdfExtractionError,
} from './pipelineStatus';
import { PDFJS_LEGACY_MODULE, PDFJS_LEGACY_WORKER_MODULE } from '@shared/pdf/pdfjsLegacy';
import { summarizeExtractStats, type ExtractedPdfPage } from './extractPages';

describe('knowledge PDF classification + cost gate', () => {
  it('classifies text / scanned / mixed / image-heavy', () => {
    expect(classifyKnowledgePdfPage({ textLength: 400, imageCount: 0 })).toBe('TEXT');
    expect(classifyKnowledgePdfPage({ textLength: 0, imageCount: 1 })).toBe('SCANNED');
    expect(classifyKnowledgePdfPage({ textLength: 200, imageCount: 1 })).toBe('MIXED');
    expect(classifyKnowledgePdfPage({ textLength: 50, imageCount: 3 })).toBe('IMAGE_HEAVY');
  });

  it('cost gate: pure TEXT PDF → 0 vision calls', () => {
    const types = ['TEXT', 'TEXT', 'TEXT'] as const;
    expect(assertTextPdfZeroVision([...types])).toBe(true);
    expect(countVisionPages([...types])).toBe(0);
    expect(pageNeedsVision('TEXT')).toBe(false);
    expect(pageNeedsVision('SCANNED')).toBe(true);
    expect(pageNeedsVision('MIXED')).toBe(true);
    expect(pageNeedsVision('IMAGE_HEAVY')).toBe(true);
  });
});

describe('knowledge PDF vision schema', () => {
  it('parses structured vision output and tables', () => {
    const parsed = parseKnowledgePdfVisionResult(
      {
        page_number: 12,
        detected_type: 'diagram',
        extracted_text: 'June above May',
        visual_summary: 'Revenue chart Jan–Jun; June above May.',
        tables: [
          {
            headers: ['Product', 'Price'],
            rows: [['A', '10']],
            caption: 'Prices',
            confidence: 'medium',
          },
        ],
        key_facts: ['June > May'],
        important_terms: ['revenue'],
        confidence: 'high',
        needs_review: false,
      },
      12
    );
    expect(parsed.visual_summary).toContain('June');
    expect(parsed.tables[0]?.headers).toEqual(['Product', 'Price']);
    expect(parsed.tables[0]?.page_number).toBe(12);
  });

  it('marks low confidence as needs_review', () => {
    const parsed = parseVisionModelText(
      '```json\n{"extracted_text":"","visual_summary":"unclear","tables":[],"key_facts":[],"important_terms":[],"confidence":"needs_review"}\n```',
      3
    );
    expect(parsed.needs_review).toBe(true);
    expect(parsed.page_number).toBe(3);
  });

  it('rejects invalid vision payload', () => {
    expect(() => parseKnowledgePdfVisionResult(null, 1)).toThrow('vision_result_invalid');
  });
});

describe('knowledge PDF page metadata + chunking', () => {
  it('keeps page metadata on chunks', () => {
    const chunks = buildPageChunks({
      page_number: 7,
      page_type: 'TEXT',
      section: 'Produktbeschreibung',
      extracted_text: 'Parfum notes…',
      visual_summary: null,
      table_data: [],
      key_facts: ['long lasting'],
      important_terms: ['Parfum'],
      source_filename: 'katalog.pdf',
      source_document_id: 'doc-1',
      organization_id: 'org-a',
    });
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks.every((c) => c.metadata.page_number === 7)).toBe(true);
    expect(chunks.every((c) => c.metadata.organization_id === 'org-a')).toBe(true);
    expect(chunks.every((c) => c.metadata.source_document_id === 'doc-1')).toBe(true);
  });

  it('separates table and visual chunks for multi-page docs', () => {
    const pages = [
      {
        page_number: 1,
        page_type: 'MIXED' as const,
        extracted_text: 'Intro',
        visual_summary: 'Photo of bottle',
        table_data: [
          {
            headers: ['SKU', 'Pts'],
            rows: [['X', '5']],
            page_number: 1,
          },
        ],
        source_filename: 'mixed.pdf',
        source_document_id: 'd2',
        organization_id: 'org-a',
      },
      {
        page_number: 2,
        page_type: 'SCANNED' as const,
        extracted_text: 'OCR line',
        source_filename: 'mixed.pdf',
        source_document_id: 'd2',
        organization_id: 'org-a',
      },
    ];
    const chunks = buildDocumentChunks(pages);
    expect(chunks.some((c) => c.metadata.chunk_kind === 'table')).toBe(true);
    expect(chunks.some((c) => c.metadata.chunk_kind === 'visual')).toBe(true);
    expect(pagesToReviewMarkdown(pages)).toContain('Page 1');
    expect(pagesToReviewMarkdown(pages)).toContain('OCR line');
  });
});

describe('knowledge PDF storage + org isolation', () => {
  it('builds private {org}/knowledge/… paths', () => {
    const path = buildKnowledgePdfObjectPath('org-a', 'user-1', 'Produktkatalog.pdf', 1000, 'abc');
    expect(path).toBe('org-a/knowledge/user-1/1000-abc-Produktkatalog.pdf');
    expect(knowledgePdfPathBelongsToOrg(path, 'org-a')).toBe(true);
    expect(knowledgePdfPathBelongsToOrg(path, 'org-b')).toBe(false);
  });

  it('denies forged organization_id and org header', () => {
    expect(assertKnowledgePdfOrgMatch('org-b', 'org-a')).toEqual({
      ok: false,
      error: 'org_mismatch',
    });
    expect(assertKnowledgePdfOrgMatch(null, 'org-a')).toEqual({ ok: true });
    expect(assertKnowledgePdfHeaderMatch('org-b', 'org-a')).toEqual({
      ok: false,
      error: 'org_header_mismatch',
    });
    expect(assertKnowledgePdfHeaderMatch('org-a', 'org-a')).toEqual({ ok: true });
  });

  it('requires org for path builder', () => {
    expect(() => buildKnowledgePdfObjectPath('', 'u', 'a.pdf')).toThrow('org_required');
  });
});

describe('knowledge PDF review + coach RAG separation', () => {
  it('status flow reaches ready_for_review and never auto-enables RAG', () => {
    expect(nextKnowledgePdfStatus('uploading')).toBe('extracting');
    expect(nextKnowledgePdfStatus('extracting')).toBe('analyzing');
    expect(nextKnowledgePdfStatus('analyzing')).toBe('structuring');
    expect(nextKnowledgePdfStatus('structuring')).toBe('ready_for_review');
    expect(shouldAutoEnableCoachRag('ready_for_review')).toBe(false);
    expect(shouldAutoEnableCoachRag('approved')).toBe(false);
    expect(canRetryKnowledgePdf('vision_failed')).toBe(true);
  });
});

describe('pdfjs legacy iOS/Safari compatibility wiring', () => {
  it('uses matching legacy module + legacy worker (no modern mix)', () => {
    expect(PDFJS_LEGACY_MODULE).toBe('pdfjs-dist/legacy/build/pdf.mjs');
    expect(PDFJS_LEGACY_WORKER_MODULE).toBe('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
    expect(PDFJS_LEGACY_MODULE.includes('/legacy/')).toBe(true);
    expect(PDFJS_LEGACY_WORKER_MODULE.includes('/legacy/')).toBe(true);
    expect(PDFJS_LEGACY_MODULE.includes('/build/pdf.mjs')).toBe(true);
    expect(
      PDFJS_LEGACY_MODULE.includes('/build/pdf.mjs') && !PDFJS_LEGACY_MODULE.includes('legacy')
        ? false
        : true
    ).toBe(true);
    // Modern path must not be selected
    expect(PDFJS_LEGACY_MODULE).not.toBe('pdfjs-dist');
    expect(PDFJS_LEGACY_WORKER_MODULE).not.toContain('pdfjs-dist/build/pdf.worker');
  });
});

describe('knowledge PDF extraction failure persistence', () => {
  it('maps Safari TypeError to failed status + error_message (not extracting)', () => {
    const update = buildKnowledgePdfExtractionFailureUpdate(
      new TypeError("undefined is not a function (near '...n of e...')"),
      'user-1'
    );
    expect(update.status).toBe('failed');
    expect(update.page_count).toBe(0);
    expect(update.text_page_count).toBe(0);
    expect(update.vision_page_count).toBe(0);
    expect(update.table_count).toBe(0);
    expect(update.error_message.length).toBeGreaterThan(10);
    expect(update.status).not.toBe('extracting');
    expect(canRetryKnowledgePdf(update.status)).toBe(true);
  });

  it('persists plain extraction errors verbatim (truncated)', () => {
    const msg = 'PDF konnte nicht gelesen werden: boom';
    expect(formatKnowledgePdfExtractionError(new Error(msg))).toBe(msg);
    const update = buildKnowledgePdfExtractionFailureUpdate(new Error(msg), null);
    expect(update.error_message).toBe(msg);
    expect(update.updated_by).toBeNull();
  });
});

describe('post-extract vision path gates (text vs scan/image)', () => {
  it('text pages skip vision; scanned/mixed/image reach vision path', () => {
    const textPage: ExtractedPdfPage = {
      page_number: 1,
      page_type: 'TEXT',
      extracted_text: 'Hello '.repeat(40),
      image_detected: false,
      image_count: 0,
      visionImageDataUrl: null,
      needsVision: false,
    };
    const scanPage: ExtractedPdfPage = {
      page_number: 2,
      page_type: 'SCANNED',
      extracted_text: '',
      image_detected: true,
      image_count: 1,
      visionImageDataUrl: 'data:image/jpeg;base64,xx',
      needsVision: true,
    };
    const imagePage: ExtractedPdfPage = {
      page_number: 3,
      page_type: classifyKnowledgePdfPage({ textLength: 20, imageCount: 3 }),
      extracted_text: 'x',
      image_detected: true,
      image_count: 3,
      visionImageDataUrl: 'data:image/jpeg;base64,yy',
      needsVision: pageNeedsVision('IMAGE_HEAVY'),
    };
    expect(textPage.needsVision).toBe(false);
    expect(pageNeedsVision(scanPage.page_type)).toBe(true);
    expect(imagePage.page_type).toBe('IMAGE_HEAVY');
    expect(imagePage.needsVision).toBe(true);
    const stats = summarizeExtractStats([textPage, scanPage, imagePage]);
    expect(stats.page_count).toBe(3);
    expect(stats.text_page_count).toBe(1);
    expect(stats.vision_page_count).toBe(2);
  });
});
