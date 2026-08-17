/**
 * Knowledge PDF Fast Scan — Phase A before deep vision analysis.
 *
 * Exact duplicate (same org + same SHA-256) → skip AI.
 * Same filename, different hash → possible_version (admin decides later).
 * Otherwise → new.
 *
 * Pure decision helpers; DB lookup stays in the API layer.
 */

export type FastScanResult = 'new' | 'exact_duplicate' | 'possible_version' | 'conflict_review';

export type FastScanMatch = {
  id: string;
  source_filename: string;
  content_sha256: string | null;
  status: string;
  title: string;
};

export type FastScanDecision = {
  result: FastScanResult;
  matchId: string | null;
  skipDeepAnalysis: boolean;
  /** Admin should review before treating as new knowledge. */
  requiresAdminDecision: boolean;
  reason: string;
};

/**
 * Decide Fast Scan outcome from org-local candidates.
 * Prefer exact hash match; else same normalized filename → possible version.
 */
export function decideKnowledgePdfFastScan(params: {
  contentSha256: string;
  sourceFilename: string;
  exactHashMatch: FastScanMatch | null;
  sameFilenameMatch: FastScanMatch | null;
}): FastScanDecision {
  const { contentSha256, sourceFilename, exactHashMatch, sameFilenameMatch } = params;

  if (!contentSha256 || contentSha256.length < 16) {
    return {
      result: 'conflict_review',
      matchId: null,
      skipDeepAnalysis: false,
      requiresAdminDecision: true,
      reason: 'missing_or_invalid_hash',
    };
  }

  if (exactHashMatch) {
    return {
      result: 'exact_duplicate',
      matchId: exactHashMatch.id,
      skipDeepAnalysis: true,
      requiresAdminDecision: false,
      reason: 'exact_content_sha256',
    };
  }

  if (sameFilenameMatch) {
    // Same name, different bytes → likely new version or conflicting upload.
    const conflictish =
      sameFilenameMatch.status === 'ready_for_review' ||
      sameFilenameMatch.status === 'approved' ||
      sameFilenameMatch.status === 'analyzing';
    return {
      result: conflictish ? 'conflict_review' : 'possible_version',
      matchId: sameFilenameMatch.id,
      skipDeepAnalysis: false,
      requiresAdminDecision: true,
      reason: `same_filename:${sourceFilename}`,
    };
  }

  return {
    result: 'new',
    matchId: null,
    skipDeepAnalysis: false,
    requiresAdminDecision: false,
    reason: 'no_org_match',
  };
}

/** Admin decision options when Fast Scan / deep analysis finds a conflict. */
export const KNOWLEDGE_PDF_ADMIN_DECISIONS = [
  'adopt_as_new_version',
  'create_new_article',
  'keep_existing',
  'compare',
] as const;

export type KnowledgePdfAdminDecision = (typeof KNOWLEDGE_PDF_ADMIN_DECISIONS)[number];
