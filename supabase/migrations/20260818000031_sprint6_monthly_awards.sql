-- ============================================================
-- Sprint 6 System 2 — Advisor of the Month (Berater des Monats)
--
-- Semantics:
--   title_period  = first day of the UTC month when the title is HELD
--                   (matches System 1 readers: current UTC month)
--   activity      = previous UTC month [title_period - 1 month, title_period)
--                   AP from ap_ledger.created_at in that half-open window
--
-- Tie-break (deterministic):
--   1) higher sum(delta) in activity window
--   2) earlier memberships.created_at
--   3) lower membership_id::text
--
-- Eligibility: memberships in the org with ap_in_period > 0.
-- Idempotent: if any row exists for (org, title_period), skip writes.
-- Schedule: Edge Function + GitHub Actions cron (1st 00:05 UTC) +
--           authenticated catch-up RPC ensure_monthly_awards().
-- ============================================================

-- Index for period-window AP aggregation (membership_id, created_at already exists).
create index if not exists ap_ledger_created_at_idx
  on public.ap_ledger (created_at);

comment on table public.monthly_awards is
  'Monatliche Auszeichnung, Plaetze 1 bis 3. Kein Rang. '
  'period = Titelmonat (UTC, 1.). AP stammen aus dem Vormonat. '
  'Unentschieden: mehr AP, dann aeltere Mitgliedschaft, dann membership_id.';

-- ---------- Core: compute for one org + title period ----------
create or replace function public.compute_monthly_awards(
  p_org uuid,
  p_title_period date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title date := coalesce(
    p_title_period,
    (date_trunc('month', timezone('utc', now())))::date
  );
  v_activity_start date;
  v_activity_end date;
  v_existing int;
  v_inserted int := 0;
  v_place int;
  r record;
begin
  if p_org is null then
    raise exception 'compute_monthly_awards: org required';
  end if;

  -- Normalize to month start (date arithmetic, no session TZ).
  v_title := (date_trunc('month', v_title::timestamp))::date;

  -- Do not award a future title month.
  if v_title > (date_trunc('month', timezone('utc', now())))::date then
    return jsonb_build_object(
      'org_id', p_org,
      'period', v_title,
      'status', 'skipped_future'
    );
  end if;

  select count(*)::int into v_existing
  from public.monthly_awards
  where org_id = p_org and period = v_title;

  if v_existing > 0 then
    return jsonb_build_object(
      'org_id', p_org,
      'period', v_title,
      'status', 'already_computed',
      'rows', v_existing
    );
  end if;

  v_activity_end := v_title;
  v_activity_start := (v_title - interval '1 month')::date;

  -- Rank candidates; insert top 3 with positive AP.
  -- Activity window is UTC half-open: [start, end).
  v_place := 0;
  for r in
    select
      m.id as membership_id,
      coalesce(sum(l.delta), 0)::integer as ap_in_period
    from public.memberships m
    left join public.ap_ledger l
      on l.membership_id = m.id
     and l.created_at >= (v_activity_start::timestamp at time zone 'UTC')
     and l.created_at <  (v_activity_end::timestamp at time zone 'UTC')
    where m.org_id = p_org
    group by m.id, m.created_at
    having coalesce(sum(l.delta), 0) > 0
    order by
      coalesce(sum(l.delta), 0) desc,
      m.created_at asc,
      m.id::text asc
    limit 3
  loop
    v_place := v_place + 1;
    insert into public.monthly_awards (
      org_id, period, place, membership_id, ap_in_period
    ) values (
      p_org, v_title, v_place, r.membership_id, r.ap_in_period
    );
    v_inserted := v_inserted + 1;

    -- Place 1 unlocks the Berater des Monats frame (collectible).
    if v_place = 1 then
      insert into public.membership_cosmetics (membership_id, item_id, kind, is_equipped)
      select r.membership_id, ci.id, ci.kind, false
      from public.cosmetic_items ci
      where ci.org_id = p_org
        and ci.is_active
        and ci.kind = 'frame'
        and ci.key = 'hero-berater-des-monats'
      on conflict (membership_id, item_id) do nothing;
    end if;
  end loop;

  return jsonb_build_object(
    'org_id', p_org,
    'period', v_title,
    'activity_start', v_activity_start,
    'activity_end', v_activity_end,
    'status', case when v_inserted = 0 then 'no_candidates' else 'computed' end,
    'rows', v_inserted
  );
end;
$$;

revoke all on function public.compute_monthly_awards(uuid, date) from public, anon, authenticated;
grant execute on function public.compute_monthly_awards(uuid, date) to service_role;

-- ---------- Job: all orgs for a title period ----------
create or replace function public.run_monthly_awards_job(
  p_title_period date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title date := coalesce(
    p_title_period,
    (date_trunc('month', timezone('utc', now())))::date
  );
  v_org uuid;
  v_results jsonb := '[]'::jsonb;
  v_one jsonb;
begin
  v_title := (date_trunc('month', v_title::timestamp))::date;

  for v_org in select id from public.organizations order by created_at, id
  loop
    v_one := public.compute_monthly_awards(v_org, v_title);
    v_results := v_results || jsonb_build_array(v_one);
  end loop;

  return jsonb_build_object(
    'period', v_title,
    'org_count', jsonb_array_length(v_results),
    'results', v_results
  );
end;
$$;

revoke all on function public.run_monthly_awards_job(date) from public, anon, authenticated;
grant execute on function public.run_monthly_awards_job(date) to service_role;

-- ---------- Authenticated catch-up for caller's org ----------
create or replace function public.ensure_monthly_awards()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_org_id();
  v_title date := (date_trunc('month', timezone('utc', now())))::date;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if v_org is null then
    return jsonb_build_object('status', 'no_org');
  end if;
  return public.compute_monthly_awards(v_org, v_title);
end;
$$;

revoke all on function public.ensure_monthly_awards() from public, anon;
grant execute on function public.ensure_monthly_awards() to authenticated, service_role;

-- ---------- History / podium reader (org-scoped) ----------
create or replace function public.list_monthly_awards(
  p_limit integer default 36
)
returns table (
  period date,
  place integer,
  membership_id uuid,
  ap_in_period integer,
  display_name text,
  avatar_url text,
  username text,
  is_me boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_org_id();
  v_mid uuid := public.active_membership_id();
  v_limit int := greatest(1, least(coalesce(p_limit, 36), 120));
begin
  if auth.uid() is null or v_org is null then
    return;
  end if;

  return query
  select
    ma.period,
    ma.place,
    ma.membership_id,
    ma.ap_in_period,
    trim(both from coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) as display_name,
    p.avatar_url,
    p.username,
    (ma.membership_id = v_mid) as is_me,
    ma.created_at
  from public.monthly_awards ma
  join public.memberships m on m.id = ma.membership_id
  join public.profiles p on p.id = m.identity_id
  where ma.org_id = v_org
  order by ma.period desc, ma.place asc
  limit v_limit;
end;
$$;

revoke all on function public.list_monthly_awards(integer) from public, anon;
grant execute on function public.list_monthly_awards(integer) to authenticated, service_role;
