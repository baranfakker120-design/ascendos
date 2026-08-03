import type { Json } from '@shared/types/database.types';
import type { ContradictionFlag } from './types';

export function asFlagsDisplay(value: ContradictionFlag[] | Json): ContradictionFlag[] {
  if (!Array.isArray(value)) return [];
  return value as ContradictionFlag[];
}
