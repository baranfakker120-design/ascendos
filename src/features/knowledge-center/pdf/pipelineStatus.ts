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
