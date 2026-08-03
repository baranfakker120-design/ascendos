-- ============================================================
-- AscendOS — PRODUCTION MANUAL PACKAGE: Migrations 26 → 27 (fixed-v2)
-- ============================================================
-- PURPOSE
--   Apply Genealogy Engine (4.1) + Leader Experience (4.2) to an
--   existing Production database that is missing:
--     - public.get_genealogy_tree
--     - memberships.streak_days / team_leader_qualified_at
--     - leadership_* / ap_task_* / leader RPCs
--
-- HOW TO RUN
--   1. Supabase Dashboard → project shaydtihwicnocjjlnjm
--   2. SQL Editor → New query
--   3. Paste THIS ENTIRE file → Run
--   4. Optional: Settings → API → Reload schema (usually automatic)
--
-- VERIFY (run after)
--   select proname from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and proname in ('get_genealogy_tree','get_qualification_progress',
--                      'get_leader_dashboard','complete_ap_task');
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='memberships'
--      and column_name in ('streak_days','team_leader_qualified_at','last_app_opened_at');
-- ============================================================

-- ################################################################
-- MIGRATION 26
-- ################################################################

-- ============================================================
-- Migration 26: Genealogy Engine — tree payload + last seen
--
-- Sprint 4.1. get_downline returns (user_id, depth). Leaders need
-- one enriched, authorization-safe payload for the canvas.
-- Sidelines stay invisible: CTE is rooted in an authorized membership.
-- ============================================================

alter table public.memberships
  add column if not exists last_app_opened_at timestamptz;

comment on column public.memberships.last_app_opened_at is
  'Last app_opened usage_event for this membership (presence proxy).';

update public.memberships m
set last_app_opened_at = sub.mx
from (
  select ue.user_id, ue.org_id, max(ue.created_at) as mx
  from public.usage_events ue
  where ue.event_type = 'app_opened'
  group by ue.user_id, ue.org_id
) sub
where m.identity_id = sub.user_id
  and m.org_id = sub.org_id
  and m.last_app_opened_at is null;

create or replace function public.sync_membership_last_app_opened()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.event_type is distinct from 'app_opened' then
    return new;
  end if;

  update public.memberships
  set last_app_opened_at = greatest(
    coalesce(last_app_opened_at, new.created_at),
    new.created_at
  )
  where identity_id = new.user_id
    and org_id = new.org_id
    and status = 'active';

  return new;
end;
$$;

drop trigger if exists usage_events_sync_last_app_opened on public.usage_events;
create trigger usage_events_sync_last_app_opened
  after insert on public.usage_events
  for each row execute function public.sync_membership_last_app_opened();

create or replace function public.get_genealogy_tree(p_root_identity uuid default null)
returns table (
  membership_id uuid,
  identity_id uuid,
  sponsor_membership_id uuid,
  depth int,
  first_name text,
  last_name text,
  username text,
  avatar_url text,
  phone text,
  role text,
  ap_total int,
  rank_key text,
  rank_label text,
  frame_asset text,
  direct_count int,
  team_count int,
  last_app_opened_at timestamptz,
  is_berater_des_monats boolean,
  joined_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_org uuid := public.current_org_id();
  v_root_identity uuid;
  v_root_membership uuid;
  v_period date := date_trunc('month', now())::date;
begin
  if v_caller is null or v_org is null then
    return;
  end if;

  v_root_identity := coalesce(p_root_identity, v_caller);

  select m.id into v_root_membership
  from public.memberships m
  where m.identity_id = v_root_identity
    and m.org_id = v_org
    and m.status = 'active';

  if v_root_membership is null then
    return;
  end if;

  if not (
    v_root_identity = v_caller
    or public.is_ancestor_of(v_root_identity)
    or public.is_super_admin()
  ) then
    return;
  end if;

  return query
  with recursive tree as (
    select
      m.id as mid,
      m.identity_id as iid,
      m.sponsor_membership_id as sponsor_mid,
      0 as lvl,
      array[m.id] as path
    from public.memberships m
    where m.id = v_root_membership

    union all

    select
      c.id,
      c.identity_id,
      c.sponsor_membership_id,
      t.lvl + 1,
      t.path || c.id
    from public.memberships c
    join tree t on c.sponsor_membership_id = t.mid
    where c.org_id = v_org
      and c.status = 'active'
      and not (c.id = any (t.path))
  )
  select
    t.mid,
    t.iid,
    t.sponsor_mid,
    t.lvl,
    coalesce(p.first_name, '')::text,
    coalesce(p.last_name, '')::text,
    coalesce(p.username, '')::text,
    p.avatar_url,
    p.phone,
    m.role::text,
    coalesce(m.ap_total, 0)::int,
    r.key::text,
    r.label::text,
    r.frame_asset::text,
    (
      select count(*)::int from tree d where d.sponsor_mid = t.mid
    ),
    (
      select count(*)::int
      from tree d
      where t.mid = any (d.path) and d.mid <> t.mid
    ),
    m.last_app_opened_at,
    exists (
      select 1
      from public.monthly_awards ma
      where ma.membership_id = t.mid
        and ma.period = v_period
    ),
    m.joined_at
  from tree t
  join public.memberships m on m.id = t.mid
  left join public.profiles p on p.id = t.iid
  left join lateral (
    select rk.key, rk.label, rk.frame_asset
    from public.rank_for_ap(v_org, coalesce(m.ap_total, 0)) rk
  ) r on true
  order by t.lvl, p.first_name, p.last_name;
end;
$$;

comment on function public.get_genealogy_tree(uuid) is
  'Enriched genealogy tree for the active org. Root defaults to caller. Auth matches get_downline.';

revoke all on function public.get_genealogy_tree(uuid) from public, anon;
grant execute on function public.get_genealogy_tree(uuid) to authenticated, service_role;

-- ################################################################
-- MIGRATION 27
-- ################################################################

-- ============================================================
-- Migration 27: Leader Experience (Sprint 4.2)
--
-- Favorites, notes, AP task catalog + completions (anti-cheat),
-- TeamLeader qualification (5 active firstlines → rank/frame/€100),
-- leader dashboard / leaderboard / insights / warnings RPCs,
-- enriched genealogy fields (ICP month, streak, favorite, sponsor).
-- ============================================================

-- ---------- Columns on memberships ----------
alter table public.memberships
  add column if not exists streak_days integer not null default 0,
  add column if not exists streak_updated_on date,
  add column if not exists team_leader_qualified_at timestamptz;

comment on column public.memberships.streak_days is
  'Consecutive calendar days with app_opened.';
comment on column public.memberships.team_leader_qualified_at is
  'Set when 5 active firstline business partners are present.';

-- ---------- Favorites & notes ----------
create table if not exists public.leadership_favorites (
  owner_membership_id uuid not null references public.memberships(id) on delete cascade,
  target_membership_id uuid not null references public.memberships(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_membership_id, target_membership_id),
  check (owner_membership_id <> target_membership_id)
);

create table if not exists public.leadership_notes (
  id uuid primary key default gen_random_uuid(),
  owner_membership_id uuid not null references public.memberships(id) on delete cascade,
  target_membership_id uuid not null references public.memberships(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  updated_at timestamptz not null default now(),
  unique (owner_membership_id, target_membership_id)
);

alter table public.leadership_favorites enable row level security;
alter table public.leadership_notes enable row level security;

-- Idempotent: only drop policies after tables exist
drop policy if exists leadership_favorites_own on public.leadership_favorites;
drop policy if exists leadership_notes_own on public.leadership_notes;

create policy leadership_favorites_own on public.leadership_favorites
  for all using (
    owner_membership_id = public.active_membership_id()
  ) with check (
    owner_membership_id = public.active_membership_id()
  );

create policy leadership_notes_own on public.leadership_notes
  for all using (
    owner_membership_id = public.active_membership_id()
  ) with check (
    owner_membership_id = public.active_membership_id()
  );

grant select, insert, update, delete on public.leadership_favorites to authenticated;
grant select, insert, update, delete on public.leadership_notes to authenticated;
grant all on public.leadership_favorites, public.leadership_notes to service_role;

-- ---------- AP Task catalog (manual completions → ledger) ----------
create table if not exists public.ap_task_defs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  key text not null,
  title text not null,
  description text,
  category text not null default 'activity'
    check (category in ('outreach','follow_up','meeting','sale','recruit','rank','other')),
  difficulty text not null default 'normal'
    check (difficulty in ('easy','normal','hard','epic')),
  ap integer not null check (ap > 0),
  repeatable boolean not null default true,
  cooldown_hours integer check (cooldown_hours is null or cooldown_hours >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  unique (org_id, key)
);

create table if not exists public.ap_task_completions (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.memberships(id) on delete cascade,
  task_id uuid not null references public.ap_task_defs(id) on delete restrict,
  status text not null default 'done'
    check (status in ('open','in_progress','done')),
  ap_awarded integer not null default 0,
  ledger_id uuid references public.ap_ledger(id) on delete set null,
  note text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  -- Anti-cheat: one DONE completion per non-repeatable task
  unique (membership_id, task_id, completed_at)
);

-- Anti-cheat: each ledger credit can only bind once; one-time tasks enforced in complete_ap_task().
create unique index if not exists ap_task_completions_ledger_once
  on public.ap_task_completions (ledger_id)
  where ledger_id is not null;

alter table public.ap_task_defs enable row level security;
alter table public.ap_task_completions enable row level security;

-- Idempotent: only drop policies after tables exist
drop policy if exists ap_task_defs_select_org on public.ap_task_defs;
drop policy if exists ap_task_defs_admin_write on public.ap_task_defs;
drop policy if exists ap_task_completions_select on public.ap_task_completions;
drop policy if exists ap_task_completions_insert_own on public.ap_task_completions;

create policy ap_task_defs_select_org on public.ap_task_defs for select
  using (org_id = public.current_org_id());
create policy ap_task_defs_admin_write on public.ap_task_defs for all
  using (public.is_super_admin() and org_id = public.current_org_id())
  with check (public.is_super_admin() and org_id = public.current_org_id());

create policy ap_task_completions_select on public.ap_task_completions for select
  using (
    membership_id = public.active_membership_id()
    or exists (
      select 1 from public.memberships m
      where m.id = ap_task_completions.membership_id
        and m.org_id = public.current_org_id()
        and (
          public.is_super_admin()
          or public.is_ancestor_of(m.identity_id)
        )
    )
  );

create policy ap_task_completions_insert_own on public.ap_task_completions for insert
  with check (membership_id = public.active_membership_id());

grant select on public.ap_task_defs to authenticated;
grant select, insert on public.ap_task_completions to authenticated;
grant all on public.ap_task_defs, public.ap_task_completions to service_role;

-- Seed default tasks for every org
insert into public.ap_task_defs (org_id, key, title, description, category, difficulty, ap, repeatable, cooldown_hours, sort_order)
select o.id, v.key, v.title, v.description, v.category, v.difficulty, v.ap, v.repeatable, v.cooldown, v.sort
from public.organizations o
cross join (values
  ('prospect_messaged', 'Interessent angeschrieben', 'Kurze persönliche Nachricht gesendet.', 'outreach', 'easy', 5, true, 4, 10),
  ('follow_up_done', 'Follow-up durchgeführt', 'Dokumentiertes Nachfassen.', 'follow_up', 'normal', 10, true, 4, 20),
  ('zoom_invited', 'Zoom eingeladen', 'Termin/Einladung verschickt.', 'meeting', 'normal', 15, true, 8, 30),
  ('product_consult', 'Produktberatung abgeschlossen', 'Beratung mit Interessent beendet.', 'meeting', 'hard', 20, true, 12, 40),
  ('new_customer', 'Neuer Kunde', 'Kunde gewonnen und dokumentiert.', 'sale', 'hard', 30, true, 24, 50),
  ('new_partner', 'Neuer Businesspartner', 'Partner registriert unter dir.', 'recruit', 'hard', 50, true, 24, 60),
  ('first_sale_of_partner', 'Erster Verkauf des neuen Partners', 'Dein Partner hat den ersten Verkauf.', 'sale', 'epic', 100, true, 24, 70),
  ('rank_reached', 'Neuer Rang erreicht', 'Rangaufstieg bestätigt.', 'rank', 'epic', 250, false, null, 80)
) as v(key, title, description, category, difficulty, ap, repeatable, cooldown, sort)
on conflict (org_id, key) do nothing;

-- Complete task → AP once (SECURITY DEFINER)
create or replace function public.complete_ap_task(p_task_key text, p_note text default null)
returns table (completion_id uuid, ap_awarded int, new_ap_total int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mid uuid := public.active_membership_id();
  v_org uuid := public.current_org_id();
  v_task public.ap_task_defs;
  v_recent timestamptz;
  v_completion_id uuid;
  v_ledger_id uuid;
  v_total int;
begin
  if auth.uid() is null or v_mid is null or v_org is null then
    raise exception 'AscendOS: Nicht angemeldet.';
  end if;

  select * into v_task
  from public.ap_task_defs t
  where t.org_id = v_org and t.key = p_task_key and t.is_active;

  if v_task.id is null then
    raise exception 'AscendOS: Aufgabe unbekannt.';
  end if;

  if not v_task.repeatable then
    if exists (
      select 1 from public.ap_task_completions c
      where c.membership_id = v_mid and c.task_id = v_task.id and c.status = 'done'
    ) then
      raise exception 'AscendOS: Aufgabe bereits abgeschlossen.';
    end if;
  elsif v_task.cooldown_hours is not null then
    select max(c.completed_at) into v_recent
    from public.ap_task_completions c
    where c.membership_id = v_mid and c.task_id = v_task.id and c.status = 'done';
    if v_recent is not null and v_recent > now() - make_interval(hours => v_task.cooldown_hours) then
      raise exception 'AscendOS: Aufgabe noch in Abkühlzeit.';
    end if;
  end if;

  insert into public.ap_ledger (membership_id, delta, reason, source_kind, source_event_id)
  values (v_mid, v_task.ap, 'Aufgabe: ' || v_task.title, 'manual', gen_random_uuid())
  returning id into v_ledger_id;

  insert into public.ap_task_completions
    (membership_id, task_id, status, ap_awarded, ledger_id, note, started_at, completed_at)
  values
    (v_mid, v_task.id, 'done', v_task.ap, v_ledger_id, p_note, now(), now())
  returning id into v_completion_id;

  select ap_total into v_total from public.memberships where id = v_mid;

  return query select v_completion_id, v_task.ap, coalesce(v_total, 0);
end;
$$;

revoke all on function public.complete_ap_task(text, text) from public, anon;
grant execute on function public.complete_ap_task(text, text) to authenticated, service_role;

-- ---------- Streak update on app_opened ----------
create or replace function public.sync_membership_streak()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (new.created_at at time zone 'utc')::date;
begin
  if new.event_type is distinct from 'app_opened' then
    return new;
  end if;

  update public.memberships m
  set
    streak_days = case
      when m.streak_updated_on = v_today then m.streak_days
      when m.streak_updated_on = v_today - 1 then m.streak_days + 1
      else 1
    end,
    streak_updated_on = v_today,
    last_app_opened_at = greatest(coalesce(m.last_app_opened_at, new.created_at), new.created_at)
  where m.identity_id = new.user_id
    and m.org_id = new.org_id
    and m.status = 'active';

  return new;
end;
$$;

-- Replace previous last_app_opened-only trigger with streak-aware one
drop trigger if exists usage_events_sync_last_app_opened on public.usage_events;
drop trigger if exists usage_events_sync_streak on public.usage_events;
create trigger usage_events_sync_streak
  after insert on public.usage_events
  for each row execute function public.sync_membership_streak();

-- Keep old function harmless if referenced
create or replace function public.sync_membership_last_app_opened()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  return new; -- superseded by sync_membership_streak
end;
$$;

-- ---------- TeamLeader qualification (5 active firstlines) ----------
-- Active firstline = status active AND (last_app_opened_at within 30 days OR joined within 30 days)
create or replace function public.count_active_firstlines(p_membership uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.memberships d
  where d.sponsor_membership_id = p_membership
    and d.status = 'active'
    and (
      public.current_org_id() is null
      or d.org_id = public.current_org_id()
      or public.is_super_admin()
    )
    and (
      d.last_app_opened_at >= now() - interval '30 days'
      or d.joined_at >= now() - interval '30 days'
    );
$$;

create or replace function public.evaluate_team_leader_qualification(p_membership uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_org uuid;
  v_identity uuid;
  v_already timestamptz;
  v_rank record;
begin
  select org_id, identity_id, team_leader_qualified_at
    into v_org, v_identity, v_already
  from public.memberships where id = p_membership;

  if v_org is null then return false; end if;

  -- JWT path: only same org (or super-admin). Triggers may run without org header.
  if auth.uid() is not null and public.current_org_id() is not null then
    if v_org is distinct from public.current_org_id() and not public.is_super_admin() then
      return false;
    end if;
  end if;

  v_count := public.count_active_firstlines(p_membership);

  if v_count < 5 then
    return false;
  end if;

  if v_already is not null then
    return true;
  end if;

  update public.memberships
  set team_leader_qualified_at = now()
  where id = p_membership and team_leader_qualified_at is null;

  -- Unlock team_leader frame cosmetics if present
  insert into public.membership_cosmetics (membership_id, item_id, kind)
  select p_membership, ci.id, ci.kind
  from public.cosmetic_items ci
  where ci.org_id = v_org and ci.is_active and ci.rank_key = 'team_leader'
  on conflict (membership_id, item_id) do nothing;

  -- €100 bonus once — ONLY via this qualification path
  select * into v_rank
  from public.ranks
  where org_id = v_org and key = 'team_leader' and is_active
  limit 1;

  if v_rank.id is not null and v_rank.payout_cents is not null then
    insert into public.payouts
      (identity_id, kind, amount_cents, awarded_for_membership_id, note)
    values (
      v_identity,
      coalesce(v_rank.payout_kind, 'team_leader_bonus'),
      v_rank.payout_cents,
      p_membership,
      'TeamLeader: 5 aktive Firstlines erreicht'
    )
    on conflict (identity_id, kind) do nothing;
  end if;

  return true;
end;
$$;

create or replace function public.trg_eval_team_leader_on_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sponsor_membership_id is not null then
    perform public.evaluate_team_leader_qualification(new.sponsor_membership_id);
  end if;
  if tg_op = 'UPDATE' and old.sponsor_membership_id is distinct from new.sponsor_membership_id
     and old.sponsor_membership_id is not null then
    perform public.evaluate_team_leader_qualification(old.sponsor_membership_id);
  end if;
  return new;
end;
$$;

drop trigger if exists memberships_eval_team_leader on public.memberships;
create trigger memberships_eval_team_leader
  after insert or update of status, sponsor_membership_id, last_app_opened_at
  on public.memberships
  for each row execute function public.trg_eval_team_leader_on_membership();

-- AP path must NOT auto-create team_leader_bonus (qualification owns it)
create or replace function public.ap_apply_to_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total    integer;
  v_org      uuid;
  v_identity uuid;
  v_rank     record;
begin
  update public.memberships
  set ap_total = ap_total + new.delta
  where id = new.membership_id
  returning ap_total, org_id, identity_id into v_total, v_org, v_identity;

  if v_org is null then return new; end if;

  insert into public.membership_cosmetics (membership_id, item_id, kind)
  select new.membership_id, ci.id, ci.kind
  from public.cosmetic_items ci
  join public.ranks r on r.org_id = ci.org_id and r.key = ci.rank_key
  where ci.org_id = v_org and ci.is_active
    and ci.rank_key is not null and r.is_active
    and r.threshold_ap <= v_total
    and ci.rank_key is distinct from 'team_leader'
  on conflict (membership_id, item_id) do nothing;

  for v_rank in
    select * from public.ranks
    where org_id = v_org and is_active
      and payout_cents is not null and threshold_ap <= v_total
      and key is distinct from 'team_leader'
  loop
    insert into public.payouts
      (identity_id, kind, amount_cents, awarded_for_membership_id, note)
    values (v_identity, v_rank.payout_kind, v_rank.payout_cents, new.membership_id,
            'Automatisch erkannt beim Erreichen von ' || v_rank.label)
    on conflict (identity_id, kind) do nothing;
  end loop;

  return new;
end;
$$;

-- ---------- Progress RPC ----------
create or replace function public.get_team_leader_progress(p_membership uuid default null)
returns table (
  membership_id uuid,
  active_firstlines int,
  required_firstlines int,
  qualified boolean,
  qualified_at timestamptz,
  bonus_entitled boolean,
  bonus_paid boolean,
  bonus_amount_cents int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_mid uuid := coalesce(p_membership, public.active_membership_id());
  v_identity uuid;
  v_org uuid;
begin
  if auth.uid() is null or v_mid is null then return; end if;

  select m.identity_id, m.org_id into v_identity, v_org
  from public.memberships m where m.id = v_mid;
  if v_org is null then return; end if;

  if not (
    v_identity = auth.uid()
    or public.is_ancestor_of(v_identity)
    or public.is_super_admin()
  ) then
    return;
  end if;

  -- Refresh evaluation opportunistically
  perform public.evaluate_team_leader_qualification(v_mid);

  return query
  select
    v_mid,
    public.count_active_firstlines(v_mid),
    5,
    (m.team_leader_qualified_at is not null),
    m.team_leader_qualified_at,
    (m.team_leader_qualified_at is not null),
    exists (
      select 1 from public.payouts p
      where p.identity_id = m.identity_id
        and p.kind = 'team_leader_bonus'
        and p.confirmed_paid_at is not null
    ),
    coalesce((
      select r.payout_cents from public.ranks r
      where r.org_id = m.org_id and r.key = 'team_leader' limit 1
    ), 10000)
  from public.memberships m where m.id = v_mid;
end;
$$;

revoke all on function public.get_team_leader_progress(uuid) from public, anon;
grant execute on function public.get_team_leader_progress(uuid) to authenticated, service_role;

-- ---------- Leader dashboard ----------
create or replace function public.get_leader_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_mid uuid := public.active_membership_id();
  v_org uuid := public.current_org_id();
  v_today date := current_date;
  v_month_start date := date_trunc('month', now())::date;
  v_result jsonb;
begin
  if v_mid is null or v_org is null then
    return '{}'::jsonb;
  end if;

  with tree as (
    select * from public.get_genealogy_tree(null)
  ),
  team_ids as (
    select membership_id from tree where depth > 0
  )
  select jsonb_build_object(
    'active_today', (
      select count(*) from tree t
      where t.depth > 0 and t.last_app_opened_at::date = v_today
    ),
    'new_registrations_month', (
      select count(*) from tree t
      where t.depth > 0 and t.joined_at::date >= v_month_start
    ),
    'team_ap', (
      select coalesce(sum(t.ap_total), 0) from tree t where t.depth > 0
    ),
    'team_size', (select count(*) from tree t where t.depth > 0),
    'direct_count', (select count(*) from tree t where t.depth = 1),
    'inactive_14d', (
      select count(*) from tree t
      where t.depth > 0 and (
        t.last_app_opened_at is null
        or t.last_app_opened_at < now() - interval '14 days'
      )
    ),
    'tasks_done_today', (
      select count(*) from public.ap_task_completions c
      join team_ids ti on ti.membership_id = c.membership_id
      where c.status = 'done' and c.completed_at::date = v_today
    ),
    'icp_month', (
      select coalesce(sum(l.delta), 0)
      from public.ap_ledger l
      where l.membership_id = v_mid
        and l.delta > 0
        and l.created_at >= v_month_start
    ),
    'month_goal_ap', 2500,
    'goal_progress', least(100, round(
      100.0 * coalesce((select ap_total from public.memberships where id = v_mid),0)
      / nullif(2500,0)
    )::numeric, 1),
    'my_ap_total', (select ap_total from public.memberships where id = v_mid),
    'new_customers_month', (
      select count(*) from public.pipeline_events e
      where e.org_id = v_org
        and e.created_by = (select identity_id from public.memberships where id = v_mid)
        and e.event_type = 'fit_check_completed'
        and e.created_at >= v_month_start
    ),
    'open_followups', (
      select count(*) from public.contacts c
      where c.org_id = v_org
        and c.owner_id = (select identity_id from public.memberships where id = v_mid)
        and c.next_step_due is not null
        and c.next_step_due::date <= current_date
    ),
    'tasks_done_by_team_today', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'membership_id', x.membership_id,
        'name', x.name,
        'ap', x.ap,
        'tasks', x.tasks
      ) order by x.ap desc), '[]'::jsonb)
      from (
        select c.membership_id,
               trim(both from coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')) as name,
               sum(c.ap_awarded)::int as ap,
               count(*)::int as tasks
        from public.ap_task_completions c
        join team_ids ti on ti.membership_id = c.membership_id
        join public.memberships m on m.id = c.membership_id
        left join public.profiles p on p.id = m.identity_id
        where c.status = 'done' and c.completed_at::date = v_today
        group by c.membership_id, p.first_name, p.last_name
        limit 20
      ) x
    )
  ) into v_result;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

revoke all on function public.get_leader_dashboard() from public, anon;
grant execute on function public.get_leader_dashboard() to authenticated, service_role;

-- ---------- Leaderboard ----------
create or replace function public.get_team_leaderboard(
  p_period text default 'month',
  p_sort text default 'ap'
)
returns table (
  membership_id uuid,
  identity_id uuid,
  first_name text,
  last_name text,
  avatar_url text,
  rank_label text,
  frame_asset text,
  metric numeric,
  ap_total int,
  direct_count int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_since timestamptz;
begin
  if public.active_membership_id() is null then return; end if;

  v_since := case p_period
    when 'today' then date_trunc('day', now())
    when 'week' then date_trunc('week', now())
    when 'year' then date_trunc('year', now())
    else date_trunc('month', now())
  end;

  return query
  with tree as (
    select * from public.get_genealogy_tree(null)
  ),
  scored as (
    select
      t.*,
      coalesce((
        select sum(l.delta)::numeric
        from public.ap_ledger l
        where l.membership_id = t.membership_id
          and l.delta > 0
          and l.created_at >= v_since
      ), 0) as period_ap,
      coalesce((
        select count(*)::numeric
        from public.memberships d
        where d.sponsor_membership_id = t.membership_id
          and d.status = 'active'
          and d.joined_at >= v_since
      ), 0) as new_partners,
      coalesce((
        select count(*)::numeric
        from public.ap_task_completions c
        where c.membership_id = t.membership_id
          and c.status = 'done'
          and c.completed_at >= v_since
      ), 0) as activity_score
    from tree t
    where t.depth >= 0
  )
  select
    s.membership_id,
    s.identity_id,
    s.first_name,
    s.last_name,
    s.avatar_url,
    s.rank_label,
    s.frame_asset,
    case p_sort
      when 'icp' then s.period_ap
      when 'new_partners' then s.new_partners
      when 'activity' then s.activity_score
      else s.period_ap
    end as metric,
    s.ap_total,
    s.direct_count
  from scored s
  order by metric desc, s.ap_total desc
  limit 50;
end;
$$;

revoke all on function public.get_team_leaderboard(text, text) from public, anon;
grant execute on function public.get_team_leaderboard(text, text) to authenticated, service_role;

-- ---------- Insights ----------
create or replace function public.get_team_insights()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_items jsonb := '[]'::jsonb;
  v_row record;
begin
  if public.active_membership_id() is null then
    return v_items;
  end if;

  -- Most active (recent open)
  select * into v_row from public.get_genealogy_tree(null) t
  where t.depth > 0
  order by t.last_app_opened_at desc nulls last
  limit 1;
  if found then
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'kind','most_active','emoji','🔥','title','Aktivster Partner',
      'membership_id', v_row.membership_id,
      'name', trim(both from v_row.first_name||' '||v_row.last_name),
      'detail','Zuletzt aktiv'
    ));
  end if;

  -- Fastest growth (most directs)
  select * into v_row from public.get_genealogy_tree(null) t
  where t.depth > 0
  order by t.direct_count desc, t.joined_at desc
  limit 1;
  if found and v_row.direct_count > 0 then
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'kind','fastest_growth','emoji','🚀','title','Schnellstes Wachstum',
      'membership_id', v_row.membership_id,
      'name', trim(both from v_row.first_name||' '||v_row.last_name),
      'detail', v_row.direct_count || ' Direkte'
    ));
  end if;

  -- Rising (highest AP among depth>0)
  select * into v_row from public.get_genealogy_tree(null) t
  where t.depth > 0
  order by t.ap_total desc
  limit 1;
  if found then
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'kind','rising_star','emoji','⭐','title','Aufsteiger',
      'membership_id', v_row.membership_id,
      'name', trim(both from v_row.first_name||' '||v_row.last_name),
      'detail', v_row.ap_total || ' AP'
    ));
  end if;

  -- Inactive long
  select * into v_row from public.get_genealogy_tree(null) t
  where t.depth > 0
    and (t.last_app_opened_at is null or t.last_app_opened_at < now() - interval '14 days')
  order by t.last_app_opened_at asc nulls first
  limit 1;
  if found then
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'kind','inactive','emoji','💤','title','Lange inaktiv',
      'membership_id', v_row.membership_id,
      'name', trim(both from v_row.first_name||' '||v_row.last_name),
      'detail','Melde dich persönlich'
    ));
  end if;

  -- Near next rank
  select t.*, (
    select min(r.threshold_ap) - t.ap_total
    from public.ranks r
    where r.org_id = public.current_org_id() and r.is_active and r.threshold_ap > t.ap_total
  ) as gap
  into v_row
  from public.get_genealogy_tree(null) t
  where t.depth > 0
  order by (
    select min(r.threshold_ap) - t.ap_total
    from public.ranks r
    where r.org_id = public.current_org_id() and r.is_active and r.threshold_ap > t.ap_total
  ) asc nulls last
  limit 1;
  if found and v_row.gap is not null and v_row.gap > 0 and v_row.gap <= 500 then
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'kind','near_rank','emoji','🎯','title','Kurz vor nächstem Rang',
      'membership_id', v_row.membership_id,
      'name', trim(both from v_row.first_name||' '||v_row.last_name),
      'detail', 'Noch '||v_row.gap||' AP'
    ));
  end if;

  return v_items;
end;
$$;

revoke all on function public.get_team_insights() from public, anon;
grant execute on function public.get_team_insights() to authenticated, service_role;

-- ---------- Smart warnings ----------
create or replace function public.get_smart_warnings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_items jsonb := '[]'::jsonb;
  r record;
begin
  if public.active_membership_id() is null then return v_items; end if;

  for r in
    select * from public.get_genealogy_tree(null) t where t.depth > 0
  loop
    if r.last_app_opened_at is null or r.last_app_opened_at < now() - interval '7 days' then
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'kind','no_activity_7d',
        'membership_id', r.membership_id,
        'name', trim(both from r.first_name||' '||r.last_name),
        'title','7 Tage keine Aktivität',
        'action','Schreib eine kurze WhatsApp: „Wie kann ich dich diese Woche unterstützen?“'
      ));
    end if;
    if r.last_app_opened_at is null or r.last_app_opened_at < now() - interval '30 days' then
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'kind','no_order_proxy_30d',
        'membership_id', r.membership_id,
        'name', trim(both from r.first_name||' '||r.last_name),
        'title','30 Tage ohne App-Aktivität',
        'action','Vereinbare ein 10-Minuten-Check-in und setze ein gemeinsames Tagesziel.'
      ));
    end if;
  end loop;

  -- Cap noise for leaders
  if jsonb_array_length(v_items) > 40 then
    select jsonb_agg(e) into v_items
    from (
      select e from jsonb_array_elements(v_items) with ordinality as t(e, ord)
      order by ord
      limit 40
    ) s;
  end if;

  return coalesce(v_items, '[]'::jsonb);
end;
$$;

revoke all on function public.get_smart_warnings() from public, anon;
grant execute on function public.get_smart_warnings() to authenticated, service_role;

-- ---------- Toggle favorite ----------
create or replace function public.toggle_leadership_favorite(p_target_membership uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := public.active_membership_id();
  v_exists boolean;
begin
  if auth.uid() is null or v_owner is null then
    raise exception 'AscendOS: Nicht angemeldet.';
  end if;
  if p_target_membership = v_owner then
    raise exception 'AscendOS: Dich selbst kannst du nicht anpinnen.';
  end if;
  -- Must be in downline or self-org ancestor path
  if not exists (
    select 1 from public.get_genealogy_tree(null) t where t.membership_id = p_target_membership
  ) then
    raise exception 'AscendOS: Nur Partner in deiner Struktur.';
  end if;

  select exists (
    select 1 from public.leadership_favorites f
    where f.owner_membership_id = v_owner and f.target_membership_id = p_target_membership
  ) into v_exists;

  if v_exists then
    delete from public.leadership_favorites
    where owner_membership_id = v_owner and target_membership_id = p_target_membership;
    return false;
  else
    insert into public.leadership_favorites (owner_membership_id, target_membership_id)
    values (v_owner, p_target_membership);
    return true;
  end if;
end;
$$;

revoke all on function public.toggle_leadership_favorite(uuid) from public, anon;
grant execute on function public.toggle_leadership_favorite(uuid) to authenticated, service_role;

-- ---------- Upsert note ----------
create or replace function public.upsert_leadership_note(p_target_membership uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := public.active_membership_id();
  v_id uuid;
begin
  if auth.uid() is null or v_owner is null then
    raise exception 'AscendOS: Nicht angemeldet.';
  end if;
  if not exists (
    select 1 from public.get_genealogy_tree(null) t where t.membership_id = p_target_membership
  ) then
    raise exception 'AscendOS: Nur Partner in deiner Struktur.';
  end if;

  insert into public.leadership_notes (owner_membership_id, target_membership_id, body, updated_at)
  values (v_owner, p_target_membership, left(trim(p_body), 2000), now())
  on conflict (owner_membership_id, target_membership_id)
  do update set body = excluded.body, updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.upsert_leadership_note(uuid, text) from public, anon;
grant execute on function public.upsert_leadership_note(uuid, text) to authenticated, service_role;


-- ---------- Enrich genealogy tree (Sprint 4.2 fields) ----------
drop function if exists public.get_genealogy_tree(uuid);

create function public.get_genealogy_tree(p_root_identity uuid default null)
returns table (
  membership_id uuid,
  identity_id uuid,
  sponsor_membership_id uuid,
  depth int,
  first_name text,
  last_name text,
  username text,
  avatar_url text,
  phone text,
  role text,
  ap_total int,
  rank_key text,
  rank_label text,
  frame_asset text,
  direct_count int,
  team_count int,
  last_app_opened_at timestamptz,
  is_berater_des_monats boolean,
  joined_at timestamptz,
  icp_month int,
  streak_days int,
  is_favorite boolean,
  sponsor_name text,
  message_badge int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_org uuid := public.current_org_id();
  v_root_identity uuid;
  v_root_membership uuid;
  v_viewer uuid := public.active_membership_id();
  v_period date := date_trunc('month', now())::date;
  v_month_start timestamptz := date_trunc('month', now());
begin
  if v_caller is null or v_org is null then
    return;
  end if;

  v_root_identity := coalesce(p_root_identity, v_caller);

  select m.id into v_root_membership
  from public.memberships m
  where m.identity_id = v_root_identity
    and m.org_id = v_org
    and m.status = 'active';

  if v_root_membership is null then
    return;
  end if;

  if not (
    v_root_identity = v_caller
    or public.is_ancestor_of(v_root_identity)
    or public.is_super_admin()
  ) then
    return;
  end if;

  return query
  with recursive tree as (
    select
      m.id as mid,
      m.identity_id as iid,
      m.sponsor_membership_id as sponsor_mid,
      0 as lvl,
      array[m.id] as path
    from public.memberships m
    where m.id = v_root_membership

    union all

    select
      c.id,
      c.identity_id,
      c.sponsor_membership_id,
      t.lvl + 1,
      t.path || c.id
    from public.memberships c
    join tree t on c.sponsor_membership_id = t.mid
    where c.org_id = v_org
      and c.status = 'active'
      and not (c.id = any (t.path))
  )
  select
    t.mid,
    t.iid,
    t.sponsor_mid,
    t.lvl,
    coalesce(p.first_name, '')::text,
    coalesce(p.last_name, '')::text,
    coalesce(p.username, '')::text,
    p.avatar_url,
    p.phone,
    m.role::text,
    coalesce(m.ap_total, 0)::int,
    coalesce(disp.key, r.key)::text,
    coalesce(disp.label, r.label)::text,
    coalesce(disp.frame_asset, r.frame_asset)::text,
    (
      select count(*)::int from tree d where d.sponsor_mid = t.mid
    ),
    (
      select count(*)::int
      from tree d
      where t.mid = any (d.path) and d.mid <> t.mid
    ),
    m.last_app_opened_at,
    exists (
      select 1
      from public.monthly_awards ma
      where ma.membership_id = t.mid
        and ma.period = v_period
    ),
    m.joined_at,
    coalesce((
      select sum(l.delta)::int
      from public.ap_ledger l
      where l.membership_id = t.mid
        and l.delta > 0
        and l.created_at >= v_month_start
    ), 0),
    coalesce(m.streak_days, 0)::int,
    exists (
      select 1 from public.leadership_favorites f
      where f.owner_membership_id = v_viewer
        and f.target_membership_id = t.mid
    ),
    nullif(trim(both from coalesce(sp.first_name,'') || ' ' || coalesce(sp.last_name,'')), ''),
    0::int
  from tree t
  join public.memberships m on m.id = t.mid
  left join public.profiles p on p.id = t.iid
  left join public.memberships sm on sm.id = t.sponsor_mid
  left join public.profiles sp on sp.id = sm.identity_id
  left join lateral (
    select rk.key, rk.label, rk.frame_asset
    from public.rank_for_ap(v_org, coalesce(m.ap_total, 0)) rk
    where rk.key is distinct from 'team_leader'
       or m.team_leader_qualified_at is not null
  ) r on true
  left join lateral (
    select rk.key, rk.label, rk.frame_asset
    from public.ranks rk
    where rk.org_id = v_org and rk.is_active and rk.key = 'team_leader'
      and m.team_leader_qualified_at is not null
      and coalesce(m.ap_total, 0) < coalesce((
        select min(x.threshold_ap) from public.ranks x
        where x.org_id = v_org and x.is_active and x.threshold_ap > rk.threshold_ap
      ), 2147483647)
  ) disp on true
  order by
    exists (
      select 1 from public.leadership_favorites f
      where f.owner_membership_id = v_viewer and f.target_membership_id = t.mid
    ) desc,
    t.lvl,
    p.first_name,
    p.last_name;
end;
$$;

comment on function public.get_genealogy_tree(uuid) is
  'Enriched genealogy tree (4.2: ICP, streak, favorite, sponsor). Auth matches get_downline.';

revoke all on function public.get_genealogy_tree(uuid) from public, anon;
grant execute on function public.get_genealogy_tree(uuid) to authenticated, service_role;

-- ---------- Qualification progress (current / next rank) ----------
create or replace function public.get_qualification_progress(p_membership uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_mid uuid := coalesce(p_membership, public.active_membership_id());
  v_org uuid;
  v_identity uuid;
  v_ap int;
  v_tl timestamptz;
  v_current record;
  v_next record;
  v_tl_progress record;
begin
  if auth.uid() is null or v_mid is null then
    return '{}'::jsonb;
  end if;

  select org_id, identity_id, ap_total, team_leader_qualified_at
    into v_org, v_identity, v_ap, v_tl
  from public.memberships where id = v_mid;

  if v_org is null then return '{}'::jsonb; end if;
  if not (
    v_identity = auth.uid() or public.is_ancestor_of(v_identity) or public.is_super_admin()
  ) then
    return '{}'::jsonb;
  end if;

  select * into v_current from public.rank_for_ap(v_org, coalesce(v_ap,0));
  if v_current.key = 'team_leader' and v_tl is null then
    select r.key, r.label, r.threshold_ap, r.frame_asset, r.sort_order
      into v_current
    from public.ranks r
    where r.org_id = v_org and r.is_active and r.key is distinct from 'team_leader'
      and r.threshold_ap <= coalesce(v_ap,0)
    order by r.threshold_ap desc
    limit 1;
  end if;
  if v_tl is not null and (v_current.key is null or v_current.threshold_ap < (
    select threshold_ap from public.ranks where org_id = v_org and key = 'team_leader' limit 1
  )) then
    select r.key, r.label, r.threshold_ap, r.frame_asset, r.sort_order
      into v_current
    from public.ranks r where r.org_id = v_org and r.key = 'team_leader' limit 1;
  end if;

  select * into v_next from public.next_rank_for_ap(v_org, coalesce(v_ap,0));
  if v_next.key = 'team_leader' and v_tl is null then
    -- Next "rank" for TL is firstline qualification, still show AP next after TL if any
    null;
  end if;

  select * into v_tl_progress from public.get_team_leader_progress(v_mid);

  return jsonb_build_object(
    'membership_id', v_mid,
    'ap_total', coalesce(v_ap,0),
    'current_rank', case when v_current.key is null then null else jsonb_build_object(
      'key', v_current.key, 'label', v_current.label,
      'threshold_ap', v_current.threshold_ap, 'frame_asset', v_current.frame_asset
    ) end,
    'next_rank', case when v_next.key is null then null else jsonb_build_object(
      'key', v_next.key, 'label', v_next.label, 'threshold_ap', v_next.threshold_ap,
      'remaining_ap', greatest(0, v_next.threshold_ap - coalesce(v_ap,0))
    ) end,
    'team_leader', jsonb_build_object(
      'qualified', coalesce(v_tl_progress.qualified, false),
      'active_firstlines', coalesce(v_tl_progress.active_firstlines, 0),
      'required_firstlines', coalesce(v_tl_progress.required_firstlines, 5),
      'bonus_amount_cents', coalesce(v_tl_progress.bonus_amount_cents, 10000),
      'bonus_paid', coalesce(v_tl_progress.bonus_paid, false),
      'qualified_at', v_tl_progress.qualified_at
    ),
    'unlocked_rewards', coalesce((
      select jsonb_agg(jsonb_build_object('kind', p.kind, 'amount_cents', p.amount_cents, 'note', p.note))
      from public.payouts p where p.identity_id = v_identity
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_qualification_progress(uuid) from public, anon;
grant execute on function public.get_qualification_progress(uuid) to authenticated, service_role;

-- List active AP tasks for current org
create or replace function public.list_ap_tasks()
returns setof public.ap_task_defs
language sql
stable
security definer
set search_path = public
as $$
  select t.*
  from public.ap_task_defs t
  where t.org_id = public.current_org_id() and t.is_active
  order by t.sort_order, t.ap;
$$;

revoke all on function public.list_ap_tasks() from public, anon;
grant execute on function public.list_ap_tasks() to authenticated, service_role;

-- Seed AP tasks when a new organization is created
create or replace function public.seed_default_ap_tasks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ap_task_defs (org_id, key, title, description, category, difficulty, ap, repeatable, cooldown_hours, sort_order)
  select new.id, v.key, v.title, v.description, v.category, v.difficulty, v.ap, v.repeatable, v.cooldown, v.sort
  from (values
    ('prospect_messaged', 'Interessent angeschrieben', 'Kurze persönliche Nachricht gesendet.', 'outreach', 'easy', 5, true, 4, 10),
    ('follow_up_done', 'Follow-up durchgeführt', 'Dokumentiertes Nachfassen.', 'follow_up', 'normal', 10, true, 4, 20),
    ('zoom_invited', 'Zoom eingeladen', 'Termin/Einladung verschickt.', 'meeting', 'normal', 15, true, 8, 30),
    ('product_consult', 'Produktberatung abgeschlossen', 'Beratung mit Interessent beendet.', 'meeting', 'hard', 20, true, 12, 40),
    ('new_customer', 'Neuer Kunde', 'Kunde gewonnen und dokumentiert.', 'sale', 'hard', 30, true, 24, 50),
    ('new_partner', 'Neuer Businesspartner', 'Partner registriert unter dir.', 'recruit', 'hard', 50, true, 24, 60),
    ('first_sale_of_partner', 'Erster Verkauf des neuen Partners', 'Dein Partner hat den ersten Verkauf.', 'sale', 'epic', 100, true, 24, 70),
    ('rank_reached', 'Neuer Rang erreicht', 'Rangaufstieg bestätigt.', 'rank', 'epic', 250, false, null::int, 80)
  ) as v(key, title, description, category, difficulty, ap, repeatable, cooldown, sort)
  on conflict (org_id, key) do nothing;
  return new;
end;
$$;

drop trigger if exists organizations_seed_ap_tasks on public.organizations;
create trigger organizations_seed_ap_tasks
  after insert on public.organizations
  for each row execute function public.seed_default_ap_tasks();


-- ################################################################
-- VERIFICATION
-- ################################################################
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_genealogy_tree'
  ) then
    raise exception 'VERIFY FAIL: get_genealogy_tree missing';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_qualification_progress'
  ) then
    raise exception 'VERIFY FAIL: get_qualification_progress missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'memberships' and column_name = 'streak_days'
  ) then
    raise exception 'VERIFY FAIL: memberships.streak_days missing';
  end if;
  raise notice 'VERIFY OK: migrations 26+27 present';
end $$;
