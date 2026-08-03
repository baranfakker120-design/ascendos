/**
 * Share / AP proof verification (client-side until AI vision ships).
 * Does not change RPC or ledger — callers award AP only after `verified`.
 * Never auto-verify screenshots; never award AP twice per contact+action.
 */

export type ShareVerificationStatus = 'pending' | 'pending_review' | 'verified' | 'rejected';

export type ShareChannelHint =
  | 'whatsapp'
  | 'telegram'
  | 'instagram_dm'
  | 'messenger'
  | 'signal'
  | 'sms'
  | 'email'
  | 'imessage'
  | 'native_share'
  | 'unknown';

export interface ShareVerificationRecord {
  id: string;
  contactId: string;
  toolKey: string;
  toolName: string;
  shareUrl: string;
  shareEventType: string;
  status: ShareVerificationStatus;
  shareCompleted: boolean;
  screenshotDataUrl: string | null;
  screenshotFileName: string | null;
  channelHint: ShareChannelHint;
  createdAt: string;
  updatedAt: string;
  /** Future AI notes — never required for current flow. */
  aiSummary: string | null;
  aiDetectedLinks: string[];
}

/** Future vision model contract — no OpenAI wiring yet. */
export interface ShareVisionDetection {
  channel: ShareChannelHint;
  detectedUrls: string[];
  hasOnboardingLink: boolean;
  hasPresentationLink: boolean;
  timestampText: string | null;
  recipientHint: string | null;
  contactNameHint: string | null;
  conversationSummary: string | null;
  repliesDetected: boolean | null;
  followUpOpportunity: string | null;
  /** Screenshot quality signals for future AI. */
  chatAppearsPresent: boolean | null;
  urlVisible: boolean | null;
  timestampVisible: boolean | null;
  screenshotReadable: boolean | null;
  looksEmpty: boolean | null;
  looksBlack: boolean | null;
  looksObviouslyFake: boolean | null;
  taskAppearsCompleted: boolean | null;
  confidence: number;
  /** When confidence is low, prefer pending_review — never auto-verify. */
  suggestedStatus: Extract<ShareVerificationStatus, 'pending' | 'pending_review' | 'rejected'>;
  rawNotes: string | null;
}

export interface ShareVisionVerifier {
  readonly id: string;
  analyzeScreenshot(input: {
    imageDataUrl: string;
    expectedOnboardingUrl: string;
    expectedPresentationUrl: string | null;
    contactName: string;
  }): Promise<ShareVisionDetection>;
}

/** Future coach answers about a verified/pending share proof. */
export interface CoachShareReviewAnswers {
  wasOnboardingReallySent: boolean | null;
  wasPresentationShared: boolean | null;
  salesPhaseHint: string | null;
  objectionAppeared: string | null;
  nextRecommendedAction: string | null;
  shouldCreateFollowUpReminder: boolean | null;
  summary: string;
}

/**
 * Reusable coach-facing vision capabilities for a later model.
 * Not wired to OpenAI — implement against this contract only.
 */
export interface CoachShareVisionCapabilities {
  readScreenshot(imageDataUrl: string): Promise<{ description: string; ocrText: string | null }>;
  readChatConversation(input: {
    imageDataUrl?: string;
    transcriptText?: string;
    channelHint?: ShareChannelHint;
  }): Promise<{ messages: string[]; channel: ShareChannelHint }>;
  recognizeLinks(input: { imageDataUrl?: string; text?: string }): Promise<string[]>;
  recognizePresentations(input: {
    imageDataUrl?: string;
    text?: string;
    expectedUrl?: string | null;
  }): Promise<{ found: boolean; matchedUrl: string | null }>;
  recognizeOnboarding(input: {
    imageDataUrl?: string;
    text?: string;
    expectedUrl: string;
  }): Promise<{ found: boolean; matchedUrl: string | null }>;
  recognizeTimestamps(input: { imageDataUrl?: string; text?: string }): Promise<string[]>;
  recognizeContactNames(input: {
    imageDataUrl?: string;
    text?: string;
    expectedName?: string;
  }): Promise<string[]>;
  summarizeConversation(input: { messages: string[]; channel: ShareChannelHint }): Promise<string>;
  determineTaskCompletion(input: {
    detection: ShareVisionDetection;
    expectedOnboardingUrl: string;
    expectedPresentationUrl: string | null;
  }): Promise<{
    status: ShareVerificationStatus;
    completed: boolean;
    reason: string;
  }>;
  answerShareReviewQuestions(input: {
    detection: ShareVisionDetection;
    toolKey: string;
    contactName: string;
  }): Promise<CoachShareReviewAnswers>;
}

function emptyDetection(): ShareVisionDetection {
  return {
    channel: 'unknown',
    detectedUrls: [],
    hasOnboardingLink: false,
    hasPresentationLink: false,
    timestampText: null,
    recipientHint: null,
    contactNameHint: null,
    conversationSummary: null,
    repliesDetected: null,
    followUpOpportunity: null,
    chatAppearsPresent: null,
    urlVisible: null,
    timestampVisible: null,
    screenshotReadable: null,
    looksEmpty: null,
    looksBlack: null,
    looksObviouslyFake: null,
    taskAppearsCompleted: null,
    confidence: 0,
    suggestedStatus: 'pending_review',
    rawNotes: 'Vision verification not configured yet.',
  };
}

/** Stub verifier — never auto-verifies; low confidence → pending_review. */
export class PendingShareVisionVerifier implements ShareVisionVerifier {
  readonly id = 'pending-vision-stub';

  async analyzeScreenshot(input: {
    imageDataUrl: string;
    expectedOnboardingUrl: string;
    expectedPresentationUrl: string | null;
    contactName: string;
  }): Promise<ShareVisionDetection> {
    void input;
    return emptyDetection();
  }
}

/** Stub coach vision — no model calls; returns empty / pending results. */
export class PendingCoachShareVision implements CoachShareVisionCapabilities {
  async readScreenshot(
    imageDataUrl: string
  ): Promise<{ description: string; ocrText: string | null }> {
    void imageDataUrl;
    return { description: 'Vision not configured yet.', ocrText: null };
  }

  async readChatConversation(input: {
    imageDataUrl?: string;
    transcriptText?: string;
    channelHint?: ShareChannelHint;
  }): Promise<{ messages: string[]; channel: ShareChannelHint }> {
    return {
      messages: input.transcriptText ? [input.transcriptText] : [],
      channel: input.channelHint ?? 'unknown',
    };
  }

  async recognizeLinks(input: { imageDataUrl?: string; text?: string }): Promise<string[]> {
    void input;
    return [];
  }

  async recognizePresentations(input: {
    imageDataUrl?: string;
    text?: string;
    expectedUrl?: string | null;
  }): Promise<{ found: boolean; matchedUrl: string | null }> {
    void input;
    return { found: false, matchedUrl: null };
  }

  async recognizeOnboarding(input: {
    imageDataUrl?: string;
    text?: string;
    expectedUrl: string;
  }): Promise<{ found: boolean; matchedUrl: string | null }> {
    void input;
    return { found: false, matchedUrl: null };
  }

  async recognizeTimestamps(input: { imageDataUrl?: string; text?: string }): Promise<string[]> {
    void input;
    return [];
  }

  async recognizeContactNames(input: {
    imageDataUrl?: string;
    text?: string;
    expectedName?: string;
  }): Promise<string[]> {
    void input;
    return [];
  }

  async summarizeConversation(input: {
    messages: string[];
    channel: ShareChannelHint;
  }): Promise<string> {
    void input;
    return 'Vision summary not configured yet.';
  }

  async determineTaskCompletion(input: {
    detection: ShareVisionDetection;
    expectedOnboardingUrl: string;
    expectedPresentationUrl: string | null;
  }): Promise<{
    status: ShareVerificationStatus;
    completed: boolean;
    reason: string;
  }> {
    void input;
    return {
      status: 'pending_review',
      completed: false,
      reason: 'Automatic verification not configured yet — never auto-verify.',
    };
  }

  async answerShareReviewQuestions(input: {
    detection: ShareVisionDetection;
    toolKey: string;
    contactName: string;
  }): Promise<CoachShareReviewAnswers> {
    void input;
    return {
      wasOnboardingReallySent: null,
      wasPresentationShared: null,
      salesPhaseHint: null,
      objectionAppeared: null,
      nextRecommendedAction: null,
      shouldCreateFollowUpReminder: null,
      summary: 'Coach vision review not configured yet.',
    };
  }
}

const STORAGE_KEY = 'ascendos.share-verifications.v1';

/** Catalog key: contacts.shareAlreadyConfirmed — prefer `t()` in UI. */
export const ALREADY_CONFIRMED_MESSAGE = 'Already confirmed for this contact.';

function readAll(): ShareVerificationRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ShareVerificationRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(rows: ShareVerificationRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `sv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function listShareVerifications(contactId?: string): ShareVerificationRecord[] {
  const all = readAll();
  if (!contactId) return all;
  return all.filter((r) => r.contactId === contactId);
}

export function listPendingShareVerifications(contactId?: string): ShareVerificationRecord[] {
  return listShareVerifications(contactId).filter(
    (r) => r.status === 'pending' || r.status === 'pending_review'
  );
}

export function getShareVerification(id: string): ShareVerificationRecord | null {
  return readAll().find((r) => r.id === id) ?? null;
}

export function findVerifiedShareAction(
  contactId: string,
  toolKey: string
): ShareVerificationRecord | null {
  return (
    listShareVerifications(contactId).find(
      (r) => r.toolKey === toolKey && r.status === 'verified'
    ) ?? null
  );
}

/**
 * Duplicate protection: one AP award per contact + action.
 * `pipelineEventTypes` = event types already logged for this contact (from timeline).
 */
export function isShareActionAlreadyAwarded(
  contactId: string,
  toolKey: string,
  shareEventType: string,
  pipelineEventTypes: Iterable<string> = []
): boolean {
  if (findVerifiedShareAction(contactId, toolKey)) return true;
  for (const type of pipelineEventTypes) {
    if (type === shareEventType) return true;
  }
  return false;
}

export function upsertShareVerification(
  input: Omit<
    ShareVerificationRecord,
    'id' | 'createdAt' | 'updatedAt' | 'aiSummary' | 'aiDetectedLinks'
  > & {
    id?: string;
  }
): ShareVerificationRecord {
  const now = new Date().toISOString();
  const all = readAll();
  const existingIdx = input.id ? all.findIndex((r) => r.id === input.id) : -1;
  if (existingIdx >= 0) {
    const prev = all[existingIdx]!;
    const next: ShareVerificationRecord = {
      ...prev,
      ...input,
      id: prev.id,
      createdAt: prev.createdAt,
      updatedAt: now,
      aiSummary: prev.aiSummary,
      aiDetectedLinks: prev.aiDetectedLinks,
    };
    all[existingIdx] = next;
    writeAll(all);
    return next;
  }
  const created: ShareVerificationRecord = {
    id: input.id ?? uid(),
    contactId: input.contactId,
    toolKey: input.toolKey,
    toolName: input.toolName,
    shareUrl: input.shareUrl,
    shareEventType: input.shareEventType,
    status: input.status,
    shareCompleted: input.shareCompleted,
    screenshotDataUrl: input.screenshotDataUrl,
    screenshotFileName: input.screenshotFileName,
    channelHint: input.channelHint,
    createdAt: now,
    updatedAt: now,
    aiSummary: null,
    aiDetectedLinks: [],
  };
  all.unshift(created);
  writeAll(all);
  return created;
}

/** Reuse open pending row for contact+tool; never create if already verified. */
export function getOrCreatePendingShareVerification(input: {
  contactId: string;
  toolKey: string;
  toolName: string;
  shareUrl: string;
  shareEventType: string;
}): ShareVerificationRecord | null {
  if (findVerifiedShareAction(input.contactId, input.toolKey)) return null;
  const pending = listPendingShareVerifications(input.contactId).find(
    (r) => r.toolKey === input.toolKey
  );
  if (pending) return pending;
  return upsertShareVerification({
    contactId: input.contactId,
    toolKey: input.toolKey,
    toolName: input.toolName,
    shareUrl: input.shareUrl,
    shareEventType: input.shareEventType,
    status: 'pending',
    shareCompleted: false,
    screenshotDataUrl: null,
    screenshotFileName: null,
    channelHint: 'unknown',
  });
}

export function markShareCompleted(id: string): ShareVerificationRecord | null {
  const row = getShareVerification(id);
  if (!row || row.status === 'verified') return null;
  return upsertShareVerification({
    ...row,
    shareCompleted: true,
    status: 'pending',
    channelHint: row.channelHint === 'unknown' ? 'native_share' : row.channelHint,
  });
}

/** Screenshot always stays pending (or pending_review later) — never auto-verify. */
export function attachScreenshot(
  id: string,
  screenshotDataUrl: string,
  screenshotFileName: string
): ShareVerificationRecord | null {
  const row = getShareVerification(id);
  if (!row || row.status === 'verified') return null;
  if (!screenshotDataUrl || screenshotDataUrl.length < 32) return null;
  return upsertShareVerification({
    ...row,
    screenshotDataUrl,
    screenshotFileName,
    status: 'pending',
  });
}

export function canConfirmShareVerification(row: ShareVerificationRecord): boolean {
  if (row.status === 'verified' || row.status === 'rejected') return false;
  return row.shareCompleted || Boolean(row.screenshotDataUrl);
}

/**
 * Marks verified once. Returns null if already verified / not confirmable
 * (blocks duplicate AP confirmations).
 */
export function confirmShareVerification(id: string): ShareVerificationRecord | null {
  const row = getShareVerification(id);
  if (!row || !canConfirmShareVerification(row)) return null;
  if (findVerifiedShareAction(row.contactId, row.toolKey)) return null;
  return upsertShareVerification({
    ...row,
    status: 'verified',
  });
}

export function rejectShareVerification(id: string): ShareVerificationRecord | null {
  const row = getShareVerification(id);
  if (!row || row.status === 'verified') return null;
  return upsertShareVerification({
    ...row,
    status: 'rejected',
  });
}

export function markPendingReview(id: string): ShareVerificationRecord | null {
  const row = getShareVerification(id);
  if (!row || row.status === 'verified') return null;
  return upsertShareVerification({
    ...row,
    status: 'pending_review',
  });
}

export function contactHasPendingShareProof(contactId: string): boolean {
  return listPendingShareVerifications(contactId).length > 0;
}

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('screenshot-read-failed'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsDataURL(file);
  });
}

export const defaultShareVisionVerifier: ShareVisionVerifier = new PendingShareVisionVerifier();
export const defaultCoachShareVision: CoachShareVisionCapabilities = new PendingCoachShareVision();
