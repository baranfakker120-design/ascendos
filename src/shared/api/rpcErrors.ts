/** Shared RPC / PostgREST error helpers for leadership surfaces. */

export function isMissingRpcError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; message?: string; details?: string };
  if (e.code === 'PGRST202') return true;
  const hay = `${e.message ?? ''} ${e.details ?? ''}`;
  return /could not find the function/i.test(hay) || /schema cache/i.test(hay);
}

export function isAuthRpcError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; message?: string };
  return (
    e.code === '42501' ||
    /permission denied|jwt|not authenticated|nicht angemeldet/i.test(e.message ?? '')
  );
}
