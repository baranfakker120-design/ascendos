/**
 * Live Coaching admin draft — uses existing IndexedDB draft store.
 * Survives app switch, tab blur, and route remounts.
 */

import { clearDraft, loadDraft, saveDraft } from '@shared/offline/draftStore';
import { DRAFT_SCOPES } from '@shared/offline/keys';
import type { LiveMediaType, LiveRepeatRule } from './types';

export const LIVE_COACHING_DRAFT_SCOPE = DRAFT_SCOPES.liveCoachingAdmin;

export interface LiveCoachingFormDraft {
  selectedId: string | null;
  title: string;
  subtitle: string;
  description: string;
  coachName: string;
  category: string;
  language: string;
  startsAt: string;
  durationMinutes: number;
  zoomUrl: string;
  repeatRule: LiveRepeatRule;
  mediaType: LiveMediaType;
  existingMediaUrl: string | null;
  existingMediaPath: string | null;
  /** Pending new upload as data URL (optional). */
  pendingMediaDataUrl: string | null;
  pendingMediaName: string | null;
  pendingMediaMime: string | null;
  active: boolean;
  updatedAt: number;
}

export async function loadLiveCoachingFormDraft(): Promise<LiveCoachingFormDraft | null> {
  return loadDraft<LiveCoachingFormDraft>(LIVE_COACHING_DRAFT_SCOPE);
}

export async function saveLiveCoachingFormDraft(
  draft: Omit<LiveCoachingFormDraft, 'updatedAt'>
): Promise<void> {
  await saveDraft(LIVE_COACHING_DRAFT_SCOPE, { ...draft, updatedAt: Date.now() });
}

export async function clearLiveCoachingFormDraft(): Promise<void> {
  await clearDraft(LIVE_COACHING_DRAFT_SCOPE);
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('read_failed'));
    reader.readAsDataURL(file);
  });
}

export async function dataUrlToFile(
  dataUrl: string,
  fileName: string,
  mime: string
): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], fileName || 'flyer.jpg', { type: mime || blob.type || 'image/jpeg' });
}
