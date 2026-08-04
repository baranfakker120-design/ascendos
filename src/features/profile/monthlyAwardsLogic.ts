/**
 * Pure helpers for Advisor of the Month period math (UTC).
 * SQL compute_monthly_awards is the source of truth for scoring;
 * these helpers keep the client/docs aligned.
 */

/** First day of the UTC month containing `d` (YYYY-MM-DD). */
export function utcMonthStart(d: Date = new Date()): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

/** First day of the previous UTC month (activity window start for current title). */
export function utcPreviousMonthStart(d: Date = new Date()): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
}

/**
 * Title period = month the badge is held (current UTC month).
 * Activity period = previous UTC month (AP source).
 */
export function monthlyAwardPeriods(d: Date = new Date()): {
  titlePeriod: string;
  activityStart: string;
  activityEnd: string;
} {
  const titlePeriod = utcMonthStart(d);
  const activityStart = utcPreviousMonthStart(d);
  return { titlePeriod, activityStart, activityEnd: titlePeriod };
}

export type AwardCandidate = {
  membershipId: string;
  apInPeriod: number;
  createdAt: string;
};

/**
 * Deterministic podium: AP desc → earlier created_at → membershipId asc.
 * Only positive AP; max 3 places.
 */
export function rankMonthlyAwardCandidates(candidates: AwardCandidate[]): AwardCandidate[] {
  return [...candidates]
    .filter((c) => c.apInPeriod > 0)
    .sort((a, b) => {
      if (b.apInPeriod !== a.apInPeriod) return b.apInPeriod - a.apInPeriod;
      const t = a.createdAt.localeCompare(b.createdAt);
      if (t !== 0) return t;
      return a.membershipId.localeCompare(b.membershipId);
    })
    .slice(0, 3);
}
