import { isMissingRpcError, isOrgMismatchRpcError } from '@shared/api/rpcErrors';
import type { RankForAp } from '@shared/types/domain';

type RpcResult<T> = { data: T | null; error: unknown };

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

  const soft = isMissingRpcError(display.error) || isOrgMismatchRpcError(display.error);
  if (!soft) {
    throw display.error;
  }

  const classic = await args.classicRank();
  if (classic.error) throw classic.error;
  return {
    current: classic.data?.[0] ?? null,
    warning: 'display_rank_unavailable',
  };
}
