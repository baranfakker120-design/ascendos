import { clearDraft, loadDraft, saveDraft } from '@shared/offline/draftStore';
import { DRAFT_SCOPES } from '@shared/offline/keys';

export interface OverlayDismissRecord {
  eventId: string;
  /** ISO end of event window — dismiss expires after event ends. */
  untilIso: string;
}

const SCOPE = DRAFT_SCOPES.liveCoachingOverlayDismiss;

export async function readOverlayDismiss(): Promise<OverlayDismissRecord | null> {
  return loadDraft<OverlayDismissRecord>(SCOPE);
}

export async function dismissOverlayForEvent(eventId: string, untilIso: string): Promise<void> {
  await saveDraft(SCOPE, { eventId, untilIso });
}

export async function clearOverlayDismiss(): Promise<void> {
  await clearDraft(SCOPE);
}

export function isOverlayDismissed(
  record: OverlayDismissRecord | null,
  eventId: string,
  now: Date = new Date()
): boolean {
  if (!record || record.eventId !== eventId) return false;
  if (new Date(record.untilIso).getTime() < now.getTime()) return false;
  return true;
}
