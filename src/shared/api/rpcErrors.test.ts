import { describe, expect, it } from 'vitest';
import { isAuthRpcError, isMissingRpcError } from './rpcErrors';

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

  it('erkennt Auth-/Permission-Fehler', () => {
    expect(isAuthRpcError({ code: '42501', message: 'permission denied' })).toBe(true);
    expect(isAuthRpcError({ code: 'PGRST202', message: 'missing' })).toBe(false);
  });
});
