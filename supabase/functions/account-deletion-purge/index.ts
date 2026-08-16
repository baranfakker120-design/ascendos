/**
 * account-deletion-purge — finalize profiles past the 14-day window.
 *
 * Auth: CRON_SECRET (x-cron-secret / Bearer), same pattern as other AscendOS crons.
 * Uses service role to list due accounts, anonymize (ADR-020), and ban Auth login.
 * Does NOT log secrets or passwords. Does NOT delete genealogy profile rows.
 */

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { handleOptions, json } from '../_shared/cors.ts';

function authorizeCron(req: Request): Response | null {
  const expected = Deno.env.get('CRON_SECRET')?.trim() ?? '';
  if (!expected) return json({ ok: false, error: 'cron_secret_not_configured' }, 503);
  const header =
    req.headers.get('x-cron-secret') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    '';
  if (!header || header !== expected) return json({ ok: false, error: 'unauthorized' }, 401);
  return null;
}

function adminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('missing_supabase_admin_env');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== 'POST' && req.method !== 'GET') {
    return json({ ok: false, error: 'method_not_allowed' }, 405);
  }

  const denied = authorizeCron(req);
  if (denied) return denied;

  let db: SupabaseClient;
  try {
    db = adminClient();
  } catch {
    return json({ ok: false, error: 'missing_supabase_admin_env' }, 503);
  }

  const { data: dueRows, error: listErr } = await db.rpc('list_due_account_deletions', {
    p_limit: 50,
  });
  if (listErr) {
    console.error('account_deletion_list_failed', listErr.message);
    return json({ ok: false, error: 'list_failed' }, 500);
  }

  const due = (dueRows ?? []) as Array<{ user_id: string; deletion_scheduled_for: string }>;
  let finalized = 0;
  let banned = 0;
  let failed = 0;

  for (const row of due) {
    const userId = row.user_id;
    const { data: fin, error: finErr } = await db.rpc('finalize_account_deletion', {
      p_user_id: userId,
    });
    if (finErr) {
      console.error('account_deletion_finalize_failed', finErr.message);
      failed += 1;
      continue;
    }
    const ok = Boolean((fin as { ok?: boolean } | null)?.ok);
    if (!ok) {
      failed += 1;
      continue;
    }
    finalized += 1;

    // Ban Auth login without deleting the auth row (keeps profiles.id FK for genealogy).
    try {
      const { error: banErr } = await db.auth.admin.updateUserById(userId, {
        ban_duration: '876000h',
      });
      if (banErr) {
        console.error('account_deletion_ban_failed', banErr.message);
        failed += 1;
      } else {
        banned += 1;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'ban_error';
      console.error('account_deletion_ban_exception', msg);
      failed += 1;
    }
  }

  console.log(
    'account_deletion_purge_run',
    JSON.stringify({ due: due.length, finalized, banned, failed })
  );

  return json({
    ok: true,
    due: due.length,
    finalized,
    banned,
    failed,
    timestamp: new Date().toISOString(),
  });
});
