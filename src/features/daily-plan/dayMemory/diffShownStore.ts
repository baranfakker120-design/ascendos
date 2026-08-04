import { idbGet, idbSet } from '@shared/offline/idb';

const SHOWN_PREFIX = 'ascendos.decision-diff.shown.v1';

function shownKey(userId: string, planDate: string): string {
  return `${SHOWN_PREFIX}:${userId}:${planDate}`;
}

export async function readDiffShownIds(userId: string, planDate: string): Promise<string[]> {
  const row = await idbGet<string[]>(shownKey(userId, planDate));
  return Array.isArray(row) ? row : [];
}

export async function writeDiffShownIds(
  userId: string,
  planDate: string,
  ids: string[]
): Promise<void> {
  await idbSet(shownKey(userId, planDate), ids.slice(0, 20));
}
