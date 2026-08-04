import { isMissingRpcError, isOrgMismatchRpcError } from '@shared/api/rpcErrors';
import type { RankForAp } from '@shared/types/domain';

type RpcResult<T> = { data: T | null; error: unknown };

function isSoftDisplayError(error: unknown): boolean {
  return isMissingRpcError(error) || isOrgMismatchRpcError(error);
}

/** Soft-fail Sprint 6 display rank; fall back to classic rank_for_ap. */
export async function resolveCurrentRank(args: {
  orgId: string;
  apTotal: number;
  teamLeaderQualified: boolean;
  displayRank: () => Promise<RpcResult<RankForAp[]>>;
  classicRank: () => Promise<RpcResult<RankForAp[]>>;
}): Promise<{ current: RankForAp | null; warning: string | null }> {
  const display = await args.displayRank();
  if (!display.error) {
    return { current: display.data?.[0] ?? null, warning: null };
  }

  if (!isSoftDisplayError(display.error)) {
    // Unexpected display_rank failure — still try classic before giving up.
  }

  const classic = await args.classicRank();
  if (!classic.error) {
    return {
      current: classic.data?.[0] ?? null,
      warning: isSoftDisplayError(display.error)
        ? 'display_rank_unavailable'
        : 'display_rank_error',
    };
  }

  // Neither RPC usable — keep Profile alive with empty rank.
  return { current: null, warning: 'rank_unavailable' };
}
