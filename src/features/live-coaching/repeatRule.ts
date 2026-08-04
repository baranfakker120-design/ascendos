/** Advance a coaching start by the repeat rule (UTC-safe Date math). */
export function nextLiveCoachingStartsAt(startsAt: Date, rule: string): Date {
  const next = new Date(startsAt.getTime());
  switch (rule) {
    case 'daily':
      next.setUTCDate(next.getUTCDate() + 1);
      break;
    case 'weekly':
      next.setUTCDate(next.getUTCDate() + 7);
      break;
    case 'biweekly':
      next.setUTCDate(next.getUTCDate() + 14);
      break;
    case 'monthly':
      next.setUTCMonth(next.getUTCMonth() + 1);
      break;
    default:
      break;
  }
  return next;
}
