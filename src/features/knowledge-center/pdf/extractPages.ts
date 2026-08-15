/**
 * Browser PDF page extract + classification signals (ADR-style client work).
 * Vision images are produced only for pages that pass the cost gate.
 *
 * Uses pdfjs-dist LEGACY build for iOS/Safari (Promise.withResolvers polyfill).
 */

import { loadPdfjsLegacy } from '@shared/pdf/pdfjsLegacy';
import {
  classifyKnowledgePdfPage,
  pageNeedsVision,
  type KnowledgePdfPageType,
} from './pageClassify';

export interface ExtractedPdfPage {
  page_number: number;
  page_type: KnowledgePdfPageType;
  extracted_text: string;
  image_detected: boolean;
  image_count: number;
  /** JPEG data URL for vision — only when needsVision. */
  visionImageDataUrl: string | null;
  needsVision: boolean;
}

function countImageOps(ops: { fnArray: number[] } | null | undefined): number {
  if (!ops?.fnArray?.length) return 0;
  // pdfjs OPS.paintImageXObject = 85, paintInlineImageXObject = 86, paintImageMaskXObject = 83
  const IMAGE_OPS = new Set([83, 85, 86]);
  return ops.fnArray.filter((fn) => IMAGE_OPS.has(fn)).length;
}

async function renderPageJpeg(page: unknown, scale = 1.25): Promise<string> {
  const pdfPage = page as {
    getViewport: (p: { scale: number }) => { width: number; height: number };
    render: (p: {
      canvas: HTMLCanvasElement;
      canvasContext: CanvasRenderingContext2D;
      viewport: { width: number; height: number };
    }) => { promise: Promise<void> };
  };
  const viewport = pdfPage.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_unavailable');
  await pdfPage.render({ canvas, canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL('image/jpeg', 0.82);
}

export async function extractKnowledgePdfPages(file: File): Promise<{
  pages: ExtractedPdfPage[];
  pageCount: number;
}> {
  const pdfjs = await loadPdfjsLegacy();
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  const doc = await loadingTask.promise;
  const pages: ExtractedPdfPage[] = [];

  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const items = Array.isArray(content?.items) ? content.items : [];
      const text = items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      let imageCount = 0;
      try {
        const ops = await page.getOperatorList();
        imageCount = countImageOps(ops);
      } catch {
        imageCount = 0;
      }

      const page_type = classifyKnowledgePdfPage({
        textLength: text.length,
        imageCount,
      });
      const needsVision = pageNeedsVision(page_type);
      let visionImageDataUrl: string | null = null;
      if (needsVision) {
        try {
          visionImageDataUrl = await renderPageJpeg(page);
        } catch {
          visionImageDataUrl = null;
        }
      }

      pages.push({
        page_number: n,
        page_type,
        extracted_text: text,
        image_detected: imageCount > 0 || page_type !== 'TEXT',
        image_count: imageCount,
        visionImageDataUrl,
        needsVision,
      });
    }
  } finally {
    await loadingTask.destroy();
  }

  return { pages, pageCount: doc.numPages };
}

export function summarizeExtractStats(pages: ExtractedPdfPage[]) {
  return {
    page_count: pages.length,
    text_page_count: pages.filter((p) => p.page_type === 'TEXT').length,
    vision_page_count: pages.filter((p) => p.needsVision).length,
    image_page_count: pages.filter((p) => p.image_detected).length,
  };
}
