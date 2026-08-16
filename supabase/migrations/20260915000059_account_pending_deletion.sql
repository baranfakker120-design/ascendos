-- Account deletion with 14-day reactivation window (ADR-020).
-- Soft-deactivate first; permanent anonymization + PII purge via scheduled Edge job.
-- Does NOT immediately delete auth.users (profile kept for genealogy as anonymized node).

-- ---------- columns on existing profiles (no second user table) ----------

alter table public.profiles
  add column if not exists account_status text not null default 'active',
  add column if not exists deletion_requested_at timestamptz,
  add column if not exists deletion_scheduled_for timestamptz;

alter table public.profiles
  drop constraint if exists profiles_account_status_check;

alter table public.profiles
  add constraint profiles_account_status_check
  check (account_status in ('active', 'pending_deletion', 'anonymized'));

comment on column public.profiles.account_status is
  'active | pending_deletion (14d window) | anonymized (finalized)';
comment on column public.profiles.deletion_requested_at is
  'When the user confirmed deletion; null when active/anonymized.';
comment on column public.profiles.deletion_scheduled_for is
  'UTC instant after which purge may run; null when not pending.';

create index if not exists profiles_pending_deletion_due_idx
  on public.profiles (deletion_scheduled_for)
  where account_status = 'pending_deletion';

-- ---------- protect deletion columns from client self-write ----------

create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('ascendos.mirror_sync', true), '') = 'on' then
    return new;
  end if;

  if coalesce(current_setting('ascendos.account_deletion', true), '') = 'on' then
    return new;
  end if;

  if public.is_super_admin() then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.org_id is distinct from old.org_id
     or new.team_id is distinct from old.team_id
     or new.sponsor_id is distinct from old.sponsor_id then
    raise exception 'AscendOS: Rolle, Organisation, Team und Sponsor können nicht selbst geändert werden.';
  end if;

  if new.account_status is distinct from old.account_status
     or new.deletion_requested_at is distinct from old.deletion_requested_at
     or new.deletion_scheduled_for is distinct from old.deletion_scheduled_for then
    raise exception 'AscendOS: Kontolöschungsstatus kann nicht direkt geändert werden.';
  end if;

  return new;
end;
$$;

-- ---------- hide pending / anonymized from org-visible public list ----------

drop policy if exists user_progress_select_own_or_sponsor on public.user_progress;
drop view if exists public.firstline_journey_progress;
drop view if exists public.profiles_public;

create view public.profiles_public as
  select
    p.id,
    m.org_id,
    m.team_id,
    sp.identity_id as sponsor_id,
    p.first_name,
    p.last_name,
    p.username,
    p.avatar_url
  from public.profiles p
  join public.memberships m
    on m.identity_id = p.id
   and m.status = 'active'
   and m.org_id = public.current_org_id()
  left join public.memberships sp
    on sp.id = m.sponsor_membership_id
  where p.account_status = 'active';

comment on view public.profiles_public is
  'Mitgliederliste der aktiven Organisation. OHNE role. Blendet pending_deletion und anonymized aus.';

create view public.firstline_journey_progress as
  select
    p.id                as user_id,
    p.first_name,
    p.username,
    j.id                as journey_id,
    j.title             as journey_title,
    count(s.id)         as total_steps,
    count(up.step_id)   as completed_steps,
    coalesce(
      min(s.day_number) filter (where up.step_id is null),
      max(s.day_number) + 1
    )                   as current_day,
    max(s.day_number)   as total_days
  from public.profiles_public p
  join public.journeys j
    on j.org_id = p.org_id
   and (j.team_id is null or j.team_id = p.team_id)
   and j.is_active
  join public.journey_steps s on s.journey_id = j.id
  left join public.user_progress up on up.step_id = s.id and up.user_id = p.id
  where p.sponsor_id = auth.uid()
  group by p.id, p.first_name, p.username, j.id, j.title;

alter view public.firstline_journey_progress set (security_invoker = true);

create policy user_progress_select_own_or_sponsor
  on public.user_progress
  for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles_public p
      where p.id = user_progress.user_id
        and p.sponsor_id = auth.uid()
    )
  );

grant select on public.profiles_public to anon, authenticated;
grant select on public.firstline_journey_progress to anon, authenticated;

-- ---------- request deletion (auth.uid only; password verified client-side via Supabase Auth) ----------

create or replace function public.request_account_deletion()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
  v_when timestamptz := now();
  v_due timestamptz := now() + interval '14 days';
begin
  if v_uid is null then
    raise exception 'AscendOS: Nicht angemeldet.';
  end if;

  select account_status into v_status from public.profiles where id = v_uid for update;
  if v_status is null then
    raise exception 'AscendOS: Profil nicht gefunden.';
  end if;
  if v_status = 'anonymized' then
    raise exception 'AscendOS: Konto ist bereits gelöscht.';
  end if;
  if v_status = 'pending_deletion' then
    return jsonb_build_object(
      'ok', true,
      'already_pending', true,
      'deletion_scheduled_for', (select deletion_scheduled_for from public.profiles where id = v_uid)
    );
  end if;

  perform set_config('ascendos.account_deletion', 'on', true);

  update public.profiles
  set account_status = 'pending_deletion',
      deletion_requested_at = v_when,
      deletion_scheduled_for = v_due
  where id = v_uid;

  return jsonb_build_object(
    'ok', true,
    'already_pending', false,
    'deletion_requested_at', v_when,
    'deletion_scheduled_for', v_due
  );
end;
$$;

revoke all on function public.request_account_deletion() from public;
grant execute on function public.request_account_deletion() to authenticated;

-- ---------- cancel deletion (owner only) ----------

create or replace function public.cancel_account_deletion()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
begin
  if v_uid is null then
    raise exception 'AscendOS: Nicht angemeldet.';
  end if;

  select account_status into v_status from public.profiles where id = v_uid for update;
  if v_status is null then
    raise exception 'AscendOS: Profil nicht gefunden.';
  end if;
  if v_status = 'anonymized' then
    raise exception 'AscendOS: Konto ist bereits endgültig gelöscht.';
  end if;
  if v_status <> 'pending_deletion' then
    return jsonb_build_object('ok', true, 'was_pending', false);
  end if;

  perform set_config('ascendos.account_deletion', 'on', true);

  update public.profiles
  set account_status = 'active',
      deletion_requested_at = null,
      deletion_scheduled_for = null
  where id = v_uid;

  return jsonb_build_object('ok', true, 'was_pending', true);
end;
$$;

revoke all on function public.cancel_account_deletion() from public;
grant execute on function public.cancel_account_deletion() to authenticated;

-- ---------- finalize one due account (service_role only; called by Edge purge) ----------

create or replace function public.finalize_account_deletion(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_due timestamptz;
  v_anon_username text;
  v_contacts int := 0;
  v_convos int := 0;
begin
  if auth.uid() is not null then
    raise exception 'AscendOS: finalize_account_deletion nur serverseitig.';
  end if;

  if p_user_id is null then
    raise exception 'AscendOS: user_id fehlt.';
  end if;

  select account_status, deletion_scheduled_for
    into v_status, v_due
  from public.profiles
  where id = p_user_id
  for update;

  if v_status is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_status = 'anonymized' then
    return jsonb_build_object('ok', true, 'already_done', true);
  end if;
  if v_status <> 'pending_deletion' then
    return jsonb_build_object('ok', false, 'error', 'not_pending');
  end if;
  if v_due is null or v_due > now() then
    return jsonb_build_object('ok', false, 'error', 'not_due');
  end if;

  -- Hard-delete personal PII datasets (ADR-020).
  delete from public.contacts where owner_id = p_user_id;
  get diagnostics v_contacts = row_count;

  delete from public.coach_convos where user_id = p_user_id;
  get diagnostics v_convos = row_count;

  delete from public.push_subscriptions where user_id = p_user_id;

  -- End memberships so genealogy helpers stop treating as active.
  update public.memberships
  set status = 'ended',
      left_at = coalesce(left_at, now())
  where identity_id = p_user_id
    and status = 'active';

  v_anon_username := 'former_' || replace(left(p_user_id::text, 8), '-', '');

  perform set_config('ascendos.account_deletion', 'on', true);

  update public.profiles
  set account_status = 'anonymized',
      deletion_requested_at = null,
      deletion_scheduled_for = null,
      first_name = 'Ehemaliges',
      last_name = 'Mitglied',
      username = v_anon_username,
      phone = null,
      avatar_url = null,
      country = null,
      goals = '{}'::jsonb
  where id = p_user_id;

  return jsonb_build_object(
    'ok', true,
    'user_id', p_user_id,
    'contacts_deleted', v_contacts,
    'coach_convos_deleted', v_convos
  );
end;
$$;

revoke all on function public.finalize_account_deletion(uuid) from public;
grant execute on function public.finalize_account_deletion(uuid) to service_role;

-- List due identities for the purge worker (service-only).
create or replace function public.list_due_account_deletions(p_limit int default 50)
returns table (user_id uuid, deletion_scheduled_for timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    raise exception 'AscendOS: list_due_account_deletions nur serverseitig.';
  end if;

  return query
  select p.id, p.deletion_scheduled_for
  from public.profiles p
  where p.account_status = 'pending_deletion'
    and p.deletion_scheduled_for is not null
    and p.deletion_scheduled_for <= now()
  order by p.deletion_scheduled_for asc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;

revoke all on function public.list_due_account_deletions(int) from public;
grant execute on function public.list_due_account_deletions(int) to service_role;

-- ---------- hourly cron (reuse Vault secrets; do not touch other jobs) ----------

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'account-deletion-purge') THEN
    PERFORM cron.unschedule('account-deletion-purge');
  END IF;
END
$$;

SELECT cron.schedule(
  'account-deletion-purge',
  '20 * * * *', -- hourly at :20 (staggered from radar :00)
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/account-deletion-purge',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'content_daily_prepare_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) as request_id;
  $cron$
);
