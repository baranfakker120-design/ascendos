import { idbGet, idbSet } from './idb';
import { OFFLINE_KEYS } from './keys';

export interface TeamUiState {
  collapsedIds: string[];
  camera?: { x: number; y: number; zoom: number };
  mode?: 'tree' | 'list';
  search?: string;
}

export interface UiStateSnapshot {
  team?: TeamUiState;
  contactsSearch?: string;
  contactsPhaseFilter?: string;
  knowledgeSearch?: string;
  moreScrollY?: number;
  updatedAt: number;
}

async function read(): Promise<UiStateSnapshot> {
  return (await idbGet<UiStateSnapshot>(OFFLINE_KEYS.uiState)) ?? { updatedAt: 0 };
}

async function write(next: UiStateSnapshot): Promise<void> {
  await idbSet(OFFLINE_KEYS.uiState, { ...next, updatedAt: Date.now() });
}

export async function loadUiState(): Promise<UiStateSnapshot> {
  return read();
}

export async function patchUiState(partial: Partial<UiStateSnapshot>): Promise<void> {
  const prev = await read();
  await write({ ...prev, ...partial });
}

export async function saveTeamUiState(team: TeamUiState): Promise<void> {
  await patchUiState({ team });
}

export async function loadTeamUiState(): Promise<TeamUiState | null> {
  const snap = await read();
  return snap.team ?? null;
}
