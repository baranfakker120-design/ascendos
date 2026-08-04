import { describe, expect, it } from 'vitest';
import {
  isAuthRpcError,
  isMissingRelationError,
  isMissingRpcError,
  isOrgMismatchRpcError,
} from './rpcErrors';

describe('rpcErrors', () => {
  it('erkennt fehlende RPCs (PGRST202)', () => {
    expect(
      isMissingRpcError({
        code: 'PGRST202',
        message: 'Could not find the function public.get_genealogy_tree',
      })
    ).toBe(true);
    expect(isMissingRpcError({ code: '57014', message: 'timeout' })).toBe(false);
  });

  it('erkennt fehlende Relationen', () => {
    expect(isMissingRelationError({ code: 'PGRST205', message: 'table missing' })).toBe(true);
    expect(isMissingRelationError({ code: '42P01', message: 'relation does not exist' })).toBe(
      true
    );
    expect(isMissingRelationError({ code: 'PGRST202', message: 'fn' })).toBe(false);
  });

  it('erkennt display_rank org mismatch', () => {
    expect(
      isOrgMismatchRpcError({
        message: 'AscendOS: display_rank_for_ap org mismatch',
      })
    ).toBe(true);
    expect(isOrgMismatchRpcError({ message: 'timeout' })).toBe(false);
  });

  it('erkennt Auth-/Permission-Fehler', () => {
    expect(isAuthRpcError({ code: '42501', message: 'permission denied' })).toBe(true);
    expect(isAuthRpcError({ code: 'PGRST202', message: 'missing' })).toBe(false);
  });
});
