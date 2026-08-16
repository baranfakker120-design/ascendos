/**
 * Client helpers for 14-day account deletion (no password storage).
 * Password re-check uses Supabase Auth signInWithPassword only.
 */

import { supabase } from '@shared/api/supabase';

export type DeletionScheduleResult = {
  ok: boolean;
  already_pending?: boolean;
  deletion_requested_at?: string;
  deletion_scheduled_for?: string;
};

export type DeletionCancelResult = {
  ok: boolean;
  was_pending?: boolean;
};

/** Re-verify password via Supabase Auth — never persist or log the password. */
export async function verifyAccountPassword(params: {
  email: string;
  password: string;
}): Promise<{ ok: true } | { ok: false; code: 'invalid' | 'missing_email' }> {
  const email = params.email.trim();
  if (!email) return { ok: false, code: 'missing_email' };
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: params.password,
  });
  if (error) return { ok: false, code: 'invalid' };
  return { ok: true };
}

export async function requestAccountDeletion(): Promise<
  { ok: true; data: DeletionScheduleResult } | { ok: false; message: string }
> {
  const { data, error } = await supabase.rpc('request_account_deletion');
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: data as DeletionScheduleResult };
}

export async function cancelAccountDeletion(): Promise<
  { ok: true; data: DeletionCancelResult } | { ok: false; message: string }
> {
  const { data, error } = await supabase.rpc('cancel_account_deletion');
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: data as DeletionCancelResult };
}

/** Whole days remaining until scheduled deletion (ceil). Min 0. */
export function daysUntilDeletion(
  scheduledForIso: string | null | undefined,
  now = new Date()
): number {
  if (!scheduledForIso) return 0;
  const due = Date.parse(scheduledForIso);
  if (!Number.isFinite(due)) return 0;
  const ms = due - now.getTime();
  if (ms <= 0) return 0;
  return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}
