/** Shared RPC / PostgREST error helpers for leadership / profile surfaces. */

export function isMissingRpcError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; message?: string; details?: string };
  if (e.code === 'PGRST202') return true;
  const hay = `${e.message ?? ''} ${e.details ?? ''}`;
  return /could not find the function/i.test(hay) || /schema cache/i.test(hay);
}

/** Missing relation / view in PostgREST schema cache (PGRST205) or Postgres 42P01. */
export function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; message?: string; details?: string };
  if (e.code === 'PGRST205' || e.code === '42P01') return true;
  const hay = `${e.message ?? ''} ${e.details ?? ''}`;
  return /could not find the table|relation .+ does not exist/i.test(hay);
}

/** Sprint 6 display_rank_for_ap org-binding rejection (non–super_admin). */
export function isOrgMismatchRpcError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { message?: string; details?: string };
  const hay = `${e.message ?? ''} ${e.details ?? ''}`;
  return /org mismatch/i.test(hay);
}

export function isAuthRpcError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; message?: string };
  return (
    e.code === '42501' ||
    /permission denied|jwt|not authenticated|nicht angemeldet/i.test(e.message ?? '')
  );
}
