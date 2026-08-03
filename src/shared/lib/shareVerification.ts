/**
 * Share / AP proof verification (client-side until AI vision ships).
 * Does not change RPC or ledger — callers award AP only after `verified`.
 */

export type ShareVerificationStatus = 'pending' | 'verified' | 'rejected';

export type ShareChannelHint =
  | 'whatsapp'
  | 'telegram'
  | 'instagram_dm'
  | 'messenger'
  | 'sms'
  | 'email'
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
  taskAppearsCompleted: boolean | null;
  confidence: number;
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
}

/** Stub verifier — replace with real vision provider later. */
export class PendingShareVisionVerifier implements ShareVisionVerifier {
  readonly id = 'pending-vision-stub';

  async analyzeScreenshot(_input: {
    imageDataUrl: string;
    expectedOnboardingUrl: string;
    expectedPresentationUrl: string | null;
    contactName: string;
  }): Promise<ShareVisionDetection> {
    return {
      channel: 'unknown',
      detectedUrls: [],
      hasOnboardingLink: false,
      hasPresentationLink: false,
      timestampText: null,
      recipientHint: null,
      contactNameHint: null,
      conversationSummary: null,
      taskAppearsCompleted: null,
      confidence: 0,
      rawNotes: 'Vision verification not configured yet.',
    };
  }
}

/** Stub coach vision — no model calls; returns empty / pending results. */
export class PendingCoachShareVision implements CoachShareVisionCapabilities {
  async readScreenshot(
    _imageDataUrl: string
  ): Promise<{ description: string; ocrText: string | null }> {
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

  async recognizeLinks(_input: { imageDataUrl?: string; text?: string }): Promise<string[]> {
    return [];
  }

  async recognizePresentations(_input: {
    imageDataUrl?: string;
    text?: string;
    expectedUrl?: string | null;
  }): Promise<{ found: boolean; matchedUrl: string | null }> {
    return { found: false, matchedUrl: null };
  }

  async recognizeOnboarding(_input: {
    imageDataUrl?: string;
    text?: string;
    expectedUrl: string;
  }): Promise<{ found: boolean; matchedUrl: string | null }> {
    return { found: false, matchedUrl: null };
  }

  async recognizeTimestamps(_input: { imageDataUrl?: string; text?: string }): Promise<string[]> {
    return [];
  }

  async recognizeContactNames(_input: {
    imageDataUrl?: string;
    text?: string;
    expectedName?: string;
  }): Promise<string[]> {
    return [];
  }

  async summarizeConversation(_input: {
    messages: string[];
    channel: ShareChannelHint;
  }): Promise<string> {
    return 'Vision summary not configured yet.';
  }

  async determineTaskCompletion(_input: {
    detection: ShareVisionDetection;
    expectedOnboardingUrl: string;
    expectedPresentationUrl: string | null;
  }): Promise<{
    status: ShareVerificationStatus;
    completed: boolean;
    reason: string;
  }> {
    return {
      status: 'pending',
      completed: false,
      reason: 'Automatic verification not configured yet.',
    };
  }
}

const STORAGE_KEY = 'ascendos.share-verifications.v1';

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
  return listShareVerifications(contactId).filter((r) => r.status === 'pending');
}

export function getShareVerification(id: string): ShareVerificationRecord | null {
  return readAll().find((r) => r.id === id) ?? null;
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

export function markShareCompleted(id: string): ShareVerificationRecord | null {
  const row = getShareVerification(id);
  if (!row) return null;
  return upsertShareVerification({
    ...row,
    shareCompleted: true,
    status: 'pending',
    channelHint: row.channelHint === 'unknown' ? 'native_share' : row.channelHint,
  });
}

export function attachScreenshot(
  id: string,
  screenshotDataUrl: string,
  screenshotFileName: string
): ShareVerificationRecord | null {
  const row = getShareVerification(id);
  if (!row) return null;
  return upsertShareVerification({
    ...row,
    screenshotDataUrl,
    screenshotFileName,
    status: 'pending',
  });
}

export function canConfirmShareVerification(row: ShareVerificationRecord): boolean {
  return row.shareCompleted || Boolean(row.screenshotDataUrl);
}

export function confirmShareVerification(id: string): ShareVerificationRecord | null {
  const row = getShareVerification(id);
  if (!row || !canConfirmShareVerification(row)) return null;
  return upsertShareVerification({
    ...row,
    status: 'verified',
  });
}

export function rejectShareVerification(id: string): ShareVerificationRecord | null {
  const row = getShareVerification(id);
  if (!row) return null;
  return upsertShareVerification({
    ...row,
    status: 'rejected',
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
