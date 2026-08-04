-- ============================================================
-- Sprint 6 System 4 — Live Coaching production contract
--
-- 1) org_id tenancy on events + outbox
-- 2) Per-user reminder receipts (in-app when open; not Web Push)
-- 3) Archive finished one-shots; roll recurring starts_at
-- 4) RPCs for catch-up + due reminder claim
-- ============================================================

-- ---------- Tenancy ----------
alter table public.live_coaching_events
  add column if not exists org_id uuid references public.organizations(id) on delete restrict;

alter table public.coaching_notification_outbox
  add column if not exists org_id uuid references public.organizations(id) on delete restrict;

-- Backfill from publisher / creator membership, else oldest org (single-tenant rescue).
update public.live_coaching_events e
set org_id = coalesce(
  (
    select m.org_id
    from public.memberships m
    where m.identity_id = coalesce(e.published_by, e.created_by)
      and m.status = 'active'
    order by m.created_at
    limit 1
  ),
  (select o.id from public.organizations o order by o.created_at, o.id limit 1)
)
where e.org_id is null;

update public.coaching_notification_outbox o
set org_id = e.org_id
from public.live_coaching_events e
where o.event_id = e.id and o.org_id is null;

alter table public.live_coaching_events
  alter column org_id set not null;

alter table public.coaching_notification_outbox
  alter column org_id set not null;

create index if not exists live_coaching_events_org_starts_idx
  on public.live_coaching_events (org_id, active, starts_at);

create index if not exists coaching_notification_outbox_org_due_idx
  on public.coaching_notification_outbox (org_id, scheduled_for)
  where sent_at is null;

-- ---------- Per-user receipts ----------
create table if not exists public.coaching_notification_receipts (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null references public.coaching_notification_outbox(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  delivered_at timestamptz not null default now(),
  unique (outbox_id, user_id)
);

create index if not exists coaching_notification_receipts_user_idx
  on public.coaching_notification_receipts (user_id, delivered_at desc);

alter table public.coaching_notification_receipts enable row level security;

drop policy if exists coaching_notification_receipts_own on public.coaching_notification_receipts;
create policy coaching_notification_receipts_own
on public.coaching_notification_receipts for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

grant select, insert on public.coaching_notification_receipts to authenticated;
grant all on public.coaching_notification_receipts to service_role;

-- ---------- RLS rewrite (org-scoped) ----------
drop policy if exists "live_coaching_events_select" on public.live_coaching_events;
create policy "live_coaching_events_select"
on public.live_coaching_events for select to authenticated
using (
  org_id = public.current_org_id()
  and (
    public.is_coach_content_manager()
    or active = true
  )
);

drop policy if exists "live_coaching_events_write" on public.live_coaching_events;
create policy "live_coaching_events_write"
on public.live_coaching_events for all to authenticated
using (
  public.is_coach_content_manager()
  and org_id = public.current_org_id()
)
with check (
  public.is_coach_content_manager()
  and org_id = public.current_org_id()
);

drop policy if exists "coaching_notification_outbox_select" on public.coaching_notification_outbox;
create policy "coaching_notification_outbox_select"
on public.coaching_notification_outbox for select to authenticated
using (org_id = public.current_org_id());

drop policy if exists "coaching_notification_outbox_write" on public.coaching_notification_outbox;
create policy "coaching_notification_outbox_write"
on public.coaching_notification_outbox for all to authenticated
using (
  public.is_coach_content_manager()
  and org_id = public.current_org_id()
)
with check (
  public.is_coach_content_manager()
  and org_id = public.current_org_id()
);

-- ---------- Advance starts_at for recurrence ----------
create or replace function public.live_coaching_next_starts_at(
  p_starts timestamptz,
  p_rule text
)
returns timestamptz
language sql
immutable
as $$
  select case p_rule
    when 'daily' then p_starts + interval '1 day'
    when 'weekly' then p_starts + interval '7 days'
    when 'biweekly' then p_starts + interval '14 days'
    when 'monthly' then p_starts + interval '1 month'
    else p_starts
  end;
$$;

-- ---------- Archive finished / roll recurring ----------
create or replace function public.maintain_live_coaching_events(
  p_org uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := coalesce(p_org, public.current_org_id());
  r record;
  v_archived int := 0;
  v_rolled int := 0;
  v_next timestamptz;
begin
  if v_org is null then
    return jsonb_build_object('status', 'no_org');
  end if;

  for r in
    select *
    from public.live_coaching_events e
    where e.org_id = v_org
      and e.active = true
      and (e.starts_at + make_interval(mins => e.duration_minutes)) < timezone('utc', now())
  loop
    if r.repeat_rule is null or r.repeat_rule = 'none' then
      update public.live_coaching_events
      set active = false, updated_at = timezone('utc', now())
      where id = r.id;
      v_archived := v_archived + 1;
    else
      v_next := r.starts_at;
      -- Roll forward until the occurrence is in the future (or live).
      while (v_next + make_interval(mins => r.duration_minutes)) < timezone('utc', now()) loop
        v_next := public.live_coaching_next_starts_at(v_next, r.repeat_rule);
      end loop;
      update public.live_coaching_events
      set starts_at = v_next, updated_at = timezone('utc', now())
      where id = r.id;

      delete from public.coaching_notification_outbox where event_id = r.id;
      insert into public.coaching_notification_outbox (
        event_id, org_id, kind, scheduled_for, title, body
      ) values (
        r.id, r.org_id, 'published', timezone('utc', now()),
        'Live Coaching veröffentlicht',
        'Neues Live Coaching: ' || r.title
      );
      if (v_next - interval '30 minutes') > timezone('utc', now()) then
        insert into public.coaching_notification_outbox (
          event_id, org_id, kind, scheduled_for, title, body
        ) values (
          r.id, r.org_id, 't_minus_30', v_next - interval '30 minutes',
          'In 30 Minuten',
          r.title || ' startet in 30 Minuten.'
        );
      end if;
      if (v_next - interval '5 minutes') > timezone('utc', now()) then
        insert into public.coaching_notification_outbox (
          event_id, org_id, kind, scheduled_for, title, body
        ) values (
          r.id, r.org_id, 't_minus_5', v_next - interval '5 minutes',
          'In 5 Minuten',
          r.title || ' startet in 5 Minuten.'
        );
      end if;
      v_rolled := v_rolled + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'org_id', v_org,
    'archived', v_archived,
    'rolled', v_rolled
  );
end;
$$;

revoke all on function public.maintain_live_coaching_events(uuid) from public, anon;
grant execute on function public.maintain_live_coaching_events(uuid) to authenticated, service_role;

create or replace function public.run_live_coaching_maintenance_job()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_results jsonb := '[]'::jsonb;
begin
  for v_org in select id from public.organizations order by created_at, id
  loop
    v_results := v_results || jsonb_build_array(public.maintain_live_coaching_events(v_org));
  end loop;
  return jsonb_build_object('results', v_results);
end;
$$;

revoke all on function public.run_live_coaching_maintenance_job() from public, anon, authenticated;
grant execute on function public.run_live_coaching_maintenance_job() to service_role;

-- ---------- Claim due reminders for current user (in-app) ----------
create or replace function public.claim_due_coaching_notifications(p_limit integer default 20)
returns table (
  outbox_id uuid,
  event_id uuid,
  kind text,
  scheduled_for timestamptz,
  title text,
  body text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_org_id();
  v_uid uuid := auth.uid();
  v_limit int := greatest(1, least(coalesce(p_limit, 20), 50));
begin
  if v_uid is null or v_org is null then
    return;
  end if;

  -- Keep events tidy before claiming.
  perform public.maintain_live_coaching_events(v_org);

  return query
  with due as (
    select o.id
    from public.coaching_notification_outbox o
    join public.live_coaching_events e on e.id = o.event_id
    where o.org_id = v_org
      and e.org_id = v_org
      and e.active = true
      and o.scheduled_for <= timezone('utc', now())
      and not exists (
        select 1 from public.coaching_notification_receipts r
        where r.outbox_id = o.id and r.user_id = v_uid
      )
    order by o.scheduled_for asc
    limit v_limit
  ),
  inserted as (
    insert into public.coaching_notification_receipts (outbox_id, user_id)
    select d.id, v_uid from due d
    on conflict (outbox_id, user_id) do nothing
    returning outbox_id
  )
  select o.id, o.event_id, o.kind, o.scheduled_for, o.title, o.body
  from inserted i
  join public.coaching_notification_outbox o on o.id = i.outbox_id;
end;
$$;

revoke all on function public.claim_due_coaching_notifications(integer) from public, anon;
grant execute on function public.claim_due_coaching_notifications(integer) to authenticated, service_role;
