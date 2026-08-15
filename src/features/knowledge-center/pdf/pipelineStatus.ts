/**
 * Knowledge PDF processing status machine (pure).
 */

export type KnowledgePdfStatus =
  | 'uploading'
  | 'extracting'
  | 'analyzing'
  | 'structuring'
  | 'ready_for_review'
  | 'approved'
  | 'vision_failed'
  | 'failed'
  | 'archived';

const FLOW: KnowledgePdfStatus[] = [
  'uploading',
  'extracting',
  'analyzing',
  'structuring',
  'ready_for_review',
];

export function nextKnowledgePdfStatus(current: KnowledgePdfStatus): KnowledgePdfStatus | null {
  const i = FLOW.indexOf(current);
  if (i < 0 || i >= FLOW.length - 1) return null;
  return FLOW[i + 1]!;
}

export function isTerminalKnowledgePdfStatus(status: KnowledgePdfStatus): boolean {
  return (
    status === 'ready_for_review' ||
    status === 'approved' ||
    status === 'vision_failed' ||
    status === 'failed' ||
    status === 'archived'
  );
}

export function canRetryKnowledgePdf(status: KnowledgePdfStatus): boolean {
  return status === 'vision_failed' || status === 'failed';
}

/** Coach RAG stays opt-in — never auto from upload/approve alone. */
export function shouldAutoEnableCoachRag(_status?: KnowledgePdfStatus): false {
  void _status;
  return false;
}

/** Normalize extraction errors for UI + DB persistence (never leave status=extracting). */
export function formatKnowledgePdfExtractionError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    const msg = error.message.trim();
    if (/undefined is not a function/i.test(msg) || /Promise\.withResolvers/i.test(msg)) {
      return 'PDF konnte auf diesem Gerät nicht gelesen werden. Bitte App aktualisieren oder Desktop-Browser versuchen.';
    }
    return msg.slice(0, 500);
  }
  return 'pdf_extraction_failed';
}

export function buildKnowledgePdfExtractionFailureUpdate(
  error: unknown,
  updatedBy: string | null
): {
  status: 'failed';
  error_message: string;
  page_count: number;
  text_page_count: number;
  vision_page_count: number;
  image_page_count: number;
  table_count: number;
  updated_by: string | null;
  updated_at: string;
} {
  return {
    status: 'failed',
    error_message: formatKnowledgePdfExtractionError(error),
    page_count: 0,
    text_page_count: 0,
    vision_page_count: 0,
    image_page_count: 0,
    table_count: 0,
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  };
}
