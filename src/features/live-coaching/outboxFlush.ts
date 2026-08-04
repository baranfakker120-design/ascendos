import { supabase } from '@shared/api/supabase';
import { showCoachingNotification } from './notifications';

/** Fire due outbox reminders for the current user (per-user receipts). */
export async function flushDueOutboxNotifications(): Promise<number> {
  const { data, error } = await supabase.rpc('claim_due_coaching_notifications', {
    p_limit: 20,
  });
  if (error) {
    console.warn('claim_due_coaching_notifications', error.message);
    return 0;
  }
  const rows = (data ?? []) as Array<{ title: string; body: string }>;
  let fired = 0;
  for (const row of rows) {
    const ok = await showCoachingNotification(row.title, row.body);
    if (ok) fired += 1;
  }
  return fired;
}
