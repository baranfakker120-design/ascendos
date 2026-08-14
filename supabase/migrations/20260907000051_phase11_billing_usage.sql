-- ============================================================
-- Phase 11 — Billing + Usage architecture (no Stripe / no payments)
--
-- Model: €20/org/month + €2/active membership/month (integer cents)
-- Hard rules:
--   - No float money
--   - Seats = COUNT(memberships WHERE status = 'active')
--   - Org admin: current_org_id() + is_organization_admin()
--   - Platform: is_platform_super_admin() only
--   - No Stripe / payment provider
--   - Repo only — do not apply to production without approval
-- ============================================================

-- ---------- Central billing config (single row) ----------
create table if not exists public.billing_config (
  id smallint primary key default 1 check (id = 1),
  plan_key text not null default 'ascendos_standard',
  base_price_cents integer not null default 2000 check (base_price_cents >= 0),
  seat_price_cents integer not null default 200 check (seat_price_cents >= 0),
  currency text not null default 'EUR' check (currency = 'EUR'),
  updated_at timestamptz not null default now()
);

comment on table public.billing_config is
  'Single-row AscendOS pricing config. Never hardcode €20/€2 in the frontend.';

insert into public.billing_config (id, plan_key, base_price_cents, seat_price_cents, currency)
values (1, 'ascendos_standard', 2000, 200, 'EUR')
on conflict (id) do nothing;

revoke all on table public.billing_config from public, anon, authenticated;
grant select on table public.billing_config to authenticated;
grant all on table public.billing_config to service_role;

alter table public.billing_config enable row level security;

drop policy if exists billing_config_select on public.billing_config;
create policy billing_config_select on public.billing_config
  for select to authenticated
  using (
    public.is_organization_admin()
    or public.is_platform_super_admin()
  );

-- ---------- org_billing_accounts ----------
create table if not exists public.org_billing_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete restrict,
  status text not null default 'trial'
    check (status in ('trial', 'active', 'past_due', 'suspended', 'cancelled')),
  currency text not null default 'EUR' check (currency = 'EUR'),
  billing_email text,
  provider_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists org_billing_accounts_status_idx
  on public.org_billing_accounts (status);

comment on table public.org_billing_accounts is
  'Per-org billing account. provider_customer_id stays NULL until a payment provider exists.';

comment on column public.org_billing_accounts.provider_customer_id is
  'Optional future payment-provider customer id. Always NULL in Phase 11.';

-- ---------- org_subscriptions ----------
create table if not exists public.org_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete restrict,
  status text not null default 'trial'
    check (status in ('trial', 'active', 'past_due', 'suspended', 'cancelled')),
  plan_key text not null default 'ascendos_standard',
  base_price_cents integer not null check (base_price_cents >= 0),
  seat_price_cents integer not null check (seat_price_cents >= 0),
  currency text not null default 'EUR' check (currency = 'EUR'),
  current_period_start timestamptz not null default date_trunc('month', now()),
  current_period_end timestamptz not null default (date_trunc('month', now()) + interval '1 month'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists org_subscriptions_status_idx
  on public.org_subscriptions (status);

comment on table public.org_subscriptions is
  'Estimated AscendOS subscription state. No payment provider dependency.';

-- ---------- org_subscription_items ----------
create table if not exists public.org_subscription_items (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.org_subscriptions(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  item_type text not null check (item_type in ('base', 'seat')),
  quantity integer not null check (quantity >= 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subscription_id, item_type)
);

create index if not exists org_subscription_items_org_idx
  on public.org_subscription_items (organization_id);

-- ---------- org_invoices (data model only — no PDFs / no provider) ----------
create table if not exists public.org_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  status text not null default 'draft'
    check (status in ('draft', 'open', 'paid', 'void')),
  currency text not null default 'EUR' check (currency = 'EUR'),
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  total_cents integer not null default 0 check (total_cents >= 0),
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists org_invoices_org_idx
  on public.org_invoices (organization_id, created_at desc);

comment on table public.org_invoices is
  'Invoice placeholder rows only. No PDF generation and no payment provider in Phase 11.';

-- ---------- updated_at helpers (reuse existing set_updated_at) ----------
drop trigger if exists org_billing_accounts_set_updated_at on public.org_billing_accounts;
create trigger org_billing_accounts_set_updated_at
  before update on public.org_billing_accounts
  for each row execute function public.set_updated_at();

drop trigger if exists org_subscriptions_set_updated_at on public.org_subscriptions;
create trigger org_subscriptions_set_updated_at
  before update on public.org_subscriptions
  for each row execute function public.set_updated_at();

drop trigger if exists org_subscription_items_set_updated_at on public.org_subscription_items;
create trigger org_subscription_items_set_updated_at
  before update on public.org_subscription_items
  for each row execute function public.set_updated_at();

drop trigger if exists org_invoices_set_updated_at on public.org_invoices;
create trigger org_invoices_set_updated_at
  before update on public.org_invoices
  for each row execute function public.set_updated_at();

-- ---------- Privileges + RLS ----------
revoke all on table public.org_billing_accounts from public, anon, authenticated;
revoke all on table public.org_subscriptions from public, anon, authenticated;
revoke all on table public.org_subscription_items from public, anon, authenticated;
revoke all on table public.org_invoices from public, anon, authenticated;

grant select on table public.org_billing_accounts to authenticated;
grant select on table public.org_subscriptions to authenticated;
grant select on table public.org_subscription_items to authenticated;
grant select on table public.org_invoices to authenticated;

grant all on table public.org_billing_accounts to service_role;
grant all on table public.org_subscriptions to service_role;
grant all on table public.org_subscription_items to service_role;
grant all on table public.org_invoices to service_role;

alter table public.org_billing_accounts enable row level security;
alter table public.org_subscriptions enable row level security;
alter table public.org_subscription_items enable row level security;
alter table public.org_invoices enable row level security;

drop policy if exists org_billing_accounts_select_org on public.org_billing_accounts;
create policy org_billing_accounts_select_org on public.org_billing_accounts
  for select to authenticated
  using (
    public.is_organization_admin()
    and organization_id = public.current_org_id()
  );

drop policy if exists org_billing_accounts_select_platform on public.org_billing_accounts;
create policy org_billing_accounts_select_platform on public.org_billing_accounts
  for select to authenticated
  using (public.is_platform_super_admin());

drop policy if exists org_subscriptions_select_org on public.org_subscriptions;
create policy org_subscriptions_select_org on public.org_subscriptions
  for select to authenticated
  using (
    public.is_organization_admin()
    and organization_id = public.current_org_id()
  );

drop policy if exists org_subscriptions_select_platform on public.org_subscriptions;
create policy org_subscriptions_select_platform on public.org_subscriptions
  for select to authenticated
  using (public.is_platform_super_admin());

drop policy if exists org_subscription_items_select_org on public.org_subscription_items;
create policy org_subscription_items_select_org on public.org_subscription_items
  for select to authenticated
  using (
    public.is_organization_admin()
    and organization_id = public.current_org_id()
  );

drop policy if exists org_subscription_items_select_platform on public.org_subscription_items;
create policy org_subscription_items_select_platform on public.org_subscription_items
  for select to authenticated
  using (public.is_platform_super_admin());

drop policy if exists org_invoices_select_org on public.org_invoices;
create policy org_invoices_select_org on public.org_invoices
  for select to authenticated
  using (
    public.is_organization_admin()
    and organization_id = public.current_org_id()
  );

drop policy if exists org_invoices_select_platform on public.org_invoices;
create policy org_invoices_select_platform on public.org_invoices
  for select to authenticated
  using (public.is_platform_super_admin());

-- Usage events: platform admin may read all (org admins already have own/admin policies)
drop policy if exists usage_events_select_platform on public.usage_events;
create policy usage_events_select_platform on public.usage_events
  for select to authenticated
  using (public.is_platform_super_admin());

-- ============================================================
-- Billing helpers + RPCs
-- ============================================================

create or replace function public.billing_get_config()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.billing_config;
begin
  if auth.uid() is null then
    raise exception 'AscendOS: Keine Plattformberechtigung.' using errcode = '42501';
  end if;
  if not (public.is_organization_admin() or public.is_platform_super_admin()) then
    raise exception 'AscendOS: Keine Plattformberechtigung.' using errcode = '42501';
  end if;

  select * into v_row from public.billing_config where id = 1;
  return jsonb_build_object(
    'plan_key', v_row.plan_key,
    'base_price_cents', v_row.base_price_cents,
    'seat_price_cents', v_row.seat_price_cents,
    'currency', v_row.currency
  );
end;
$$;

revoke all on function public.billing_get_config() from public, anon;
grant execute on function public.billing_get_config() to authenticated, service_role;

create or replace function public.billing_count_active_seats(p_org_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'AscendOS: Keine Plattformberechtigung.' using errcode = '42501';
  end if;
  if not (
    public.is_platform_super_admin()
    or (public.is_organization_admin() and p_org_id = public.current_org_id())
  ) then
    raise exception 'AscendOS: Keine Plattformberechtigung.' using errcode = '42501';
  end if;

  return (
    select coalesce(count(*)::integer, 0)
    from public.memberships m
    where m.org_id = p_org_id
      and m.status = 'active'
  );
end;
$$;

revoke all on function public.billing_count_active_seats(uuid) from public, anon;
grant execute on function public.billing_count_active_seats(uuid) to authenticated, service_role;

create or replace function public.billing_estimate_monthly_cents(
  p_active_seats integer,
  p_base_price_cents integer default null,
  p_seat_price_cents integer default null
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_base integer;
  v_seat integer;
  v_seats integer := greatest(coalesce(p_active_seats, 0), 0);
begin
  -- Pure math helper; callers that expose results must still be role-gated.
  select
    coalesce(p_base_price_cents, c.base_price_cents),
    coalesce(p_seat_price_cents, c.seat_price_cents)
  into v_base, v_seat
  from public.billing_config c
  where c.id = 1;

  return v_base + (v_seats * v_seat);
end;
$$;

revoke all on function public.billing_estimate_monthly_cents(integer, integer, integer) from public, anon;
grant execute on function public.billing_estimate_monthly_cents(integer, integer, integer) to authenticated, service_role;

-- Idempotent bootstrap for an organization (used by create-org + backfill).
create or replace function public.ensure_org_billing(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg public.billing_config;
  v_sub public.org_subscriptions;
  v_seats integer;
begin
  if p_org_id is null then
    raise exception 'AscendOS: Organisation oder Ressource nicht gefunden.';
  end if;
  if not exists (select 1 from public.organizations where id = p_org_id) then
    raise exception 'AscendOS: Organisation oder Ressource nicht gefunden.';
  end if;

  select * into v_cfg from public.billing_config where id = 1;
  select coalesce(count(*)::integer, 0) into v_seats
  from public.memberships m
  where m.org_id = p_org_id
    and m.status = 'active';

  insert into public.org_billing_accounts (organization_id, status, currency, billing_email)
  values (p_org_id, 'trial', v_cfg.currency, null)
  on conflict (organization_id) do nothing;

  insert into public.org_subscriptions (
    organization_id, status, plan_key, base_price_cents, seat_price_cents, currency
  )
  values (
    p_org_id, 'trial', v_cfg.plan_key, v_cfg.base_price_cents, v_cfg.seat_price_cents, v_cfg.currency
  )
  on conflict (organization_id) do update
    set updated_at = now()
  returning * into v_sub;

  if v_sub.id is null then
    select * into v_sub from public.org_subscriptions where organization_id = p_org_id;
  end if;

  insert into public.org_subscription_items (
    subscription_id, organization_id, item_type, quantity, unit_price_cents
  )
  values
    (v_sub.id, p_org_id, 'base', 1, v_sub.base_price_cents),
    (v_sub.id, p_org_id, 'seat', v_seats, v_sub.seat_price_cents)
  on conflict (subscription_id, item_type) do update
    set quantity = excluded.quantity,
        unit_price_cents = excluded.unit_price_cents,
        updated_at = now();
end;
$$;

revoke all on function public.ensure_org_billing(uuid) from public, anon;
grant execute on function public.ensure_org_billing(uuid) to service_role;

-- Refresh seat quantity snapshot from authoritative membership COUNT.
create or replace function public.refresh_org_billing_seats(p_org_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seats integer;
begin
  if p_org_id is null then
    raise exception 'AscendOS: Organisation oder Ressource nicht gefunden.';
  end if;

  perform public.ensure_org_billing(p_org_id);

  select coalesce(count(*)::integer, 0) into v_seats
  from public.memberships m
  where m.org_id = p_org_id
    and m.status = 'active';

  update public.org_subscription_items i
  set quantity = v_seats,
      updated_at = now()
  from public.org_subscriptions s
  where i.subscription_id = s.id
    and s.organization_id = p_org_id
    and i.item_type = 'seat';

  return v_seats;
end;
$$;

revoke all on function public.refresh_org_billing_seats(uuid) from public, anon;
grant execute on function public.refresh_org_billing_seats(uuid) to service_role;

-- Keep seat snapshot in sync when membership status/org changes.
create or replace function public.memberships_refresh_billing_seats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.refresh_org_billing_seats(new.org_id);
    return new;
  elsif tg_op = 'DELETE' then
    perform public.refresh_org_billing_seats(old.org_id);
    return old;
  else
    perform public.refresh_org_billing_seats(new.org_id);
    if old.org_id is distinct from new.org_id then
      perform public.refresh_org_billing_seats(old.org_id);
    end if;
    return new;
  end if;
end;
$$;

drop trigger if exists memberships_refresh_billing_seats on public.memberships;
create trigger memberships_refresh_billing_seats
  after insert or update of status, org_id or delete
  on public.memberships
  for each row execute function public.memberships_refresh_billing_seats();

-- Org-admin billing snapshot (active org only).
create or replace function public.org_admin_get_billing()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_org_id();
  v_seats integer;
  v_sub public.org_subscriptions;
  v_acc public.org_billing_accounts;
  v_total integer;
begin
  if auth.uid() is null or not public.is_organization_admin() or v_org is null then
    raise exception 'AscendOS: Keine Plattformberechtigung.' using errcode = '42501';
  end if;

  perform public.ensure_org_billing(v_org);
  v_seats := public.billing_count_active_seats(v_org);
  select * into v_sub from public.org_subscriptions where organization_id = v_org;
  select * into v_acc from public.org_billing_accounts where organization_id = v_org;
  v_total := public.billing_estimate_monthly_cents(
    v_seats, v_sub.base_price_cents, v_sub.seat_price_cents
  );

  return jsonb_build_object(
    'organization_id', v_org,
    'plan_key', v_sub.plan_key,
    'billing_status', v_acc.status,
    'subscription_status', v_sub.status,
    'currency', v_sub.currency,
    'billing_email', v_acc.billing_email,
    'base_price_cents', v_sub.base_price_cents,
    'seat_price_cents', v_sub.seat_price_cents,
    'active_seats', v_seats,
    'seat_total_cents', v_seats * v_sub.seat_price_cents,
    'estimated_monthly_cents', v_total,
    'period_start', v_sub.current_period_start,
    'period_end', v_sub.current_period_end,
    'payment_note', 'Zahlungsabwicklung wird später integriert.'
  );
end;
$$;

revoke all on function public.org_admin_get_billing() from public, anon;
grant execute on function public.org_admin_get_billing() to authenticated, service_role;

-- Org-admin usage snapshot from existing usage_events only.
create or replace function public.org_admin_get_usage()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_org_id();
begin
  if auth.uid() is null or not public.is_organization_admin() or v_org is null then
    raise exception 'AscendOS: Keine Plattformberechtigung.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'organization_id', v_org,
    'total_events', (select count(*) from public.usage_events where org_id = v_org),
    'coach_messages', (
      select count(*) from public.usage_events
      where org_id = v_org and event_type = 'coach_message_sent'
    ),
    'app_opens', (
      select count(*) from public.usage_events
      where org_id = v_org and event_type = 'app_opened'
    ),
    'plans_committed', (
      select count(*) from public.usage_events
      where org_id = v_org and event_type = 'plan_committed'
    )
  );
end;
$$;

revoke all on function public.org_admin_get_usage() from public, anon;
grant execute on function public.org_admin_get_usage() to authenticated, service_role;

-- Platform billing overview.
create or replace function public.platform_list_billing(p_status text default null)
returns table (
  organization_id uuid,
  organization_name text,
  display_name text,
  billing_status text,
  subscription_status text,
  plan_key text,
  active_seats integer,
  base_price_cents integer,
  seat_price_cents integer,
  seat_total_cents integer,
  estimated_monthly_cents integer,
  currency text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := nullif(trim(coalesce(p_status, '')), '');
begin
  if not public.is_platform_super_admin() then
    raise exception 'AscendOS: Keine Plattformberechtigung.' using errcode = '42501';
  end if;
  if v_status is not null
     and v_status not in ('trial', 'active', 'past_due', 'suspended', 'cancelled') then
    raise exception 'AscendOS: Ungültiger Status.';
  end if;

  return query
  select
    o.id,
    o.name,
    coalesce(nullif(trim(o.branding->>'display_name'), ''), o.name),
    a.status,
    s.status,
    s.plan_key,
    (
      select coalesce(count(*)::integer, 0)
      from public.memberships m
      where m.org_id = o.id and m.status = 'active'
    ),
    s.base_price_cents,
    s.seat_price_cents,
    (
      select coalesce(count(*)::integer, 0)
      from public.memberships m
      where m.org_id = o.id and m.status = 'active'
    ) * s.seat_price_cents,
    public.billing_estimate_monthly_cents(
      (
        select coalesce(count(*)::integer, 0)
        from public.memberships m
        where m.org_id = o.id and m.status = 'active'
      ),
      s.base_price_cents,
      s.seat_price_cents
    ),
    s.currency
  from public.organizations o
  join public.org_billing_accounts a on a.organization_id = o.id
  join public.org_subscriptions s on s.organization_id = o.id
  where v_status is null or a.status = v_status
  order by o.created_at desc;
end;
$$;

revoke all on function public.platform_list_billing(text) from public, anon;
grant execute on function public.platform_list_billing(text) to authenticated, service_role;

-- Hook: create org also bootstraps billing.
create or replace function public.platform_create_organization(
  p_name text,
  p_display_name text default null,
  p_website text default null,
  p_support_url text default null,
  p_logo_url text default null,
  p_admin_identity_id uuid default null
)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_display text := trim(coalesce(nullif(p_display_name, ''), p_name, ''));
  v_org public.organizations;
  v_team_id uuid;
  v_branding jsonb;
begin
  if not public.is_platform_super_admin() then
    raise exception 'AscendOS: Keine Plattformberechtigung.' using errcode = '42501';
  end if;
  if length(v_name) < 2 then
    raise exception 'AscendOS: Organisationsname fehlt.' using errcode = '22023';
  end if;
  if v_display ~* '(team\s*seyda|waytomoon|essence\s*tribe)' then
    raise exception 'AscendOS: Ungültiger Anzeigename.';
  end if;

  v_branding := jsonb_build_object('display_name', v_display);
  if nullif(trim(coalesce(p_website, '')), '') is not null then
    v_branding := v_branding || jsonb_build_object('website', trim(p_website));
  end if;
  if nullif(trim(coalesce(p_support_url, '')), '') is not null then
    v_branding := v_branding || jsonb_build_object('supportUrl', trim(p_support_url));
  end if;
  if nullif(trim(coalesce(p_logo_url, '')), '') is not null then
    v_branding := v_branding || jsonb_build_object('logoUrl', trim(p_logo_url));
  end if;

  insert into public.organizations (name, branding, settings, status)
  values (
    v_name,
    v_branding,
    jsonb_build_object('coach_daily_message_limit', 50, 'content_asset_limit', 25),
    'active'
  )
  returning * into v_org;

  insert into public.teams (org_id, name)
  values (v_org.id, 'Main Team')
  returning id into v_team_id;

  if p_admin_identity_id is not null then
    if not exists (select 1 from public.profiles where id = p_admin_identity_id) then
      raise exception 'AscendOS: Organisation oder Ressource nicht gefunden.';
    end if;
    insert into public.memberships (identity_id, org_id, team_id, role, status)
    values (p_admin_identity_id, v_org.id, v_team_id, 'super_admin', 'active');
  end if;

  perform public.ensure_org_billing(v_org.id);

  insert into public.usage_events (user_id, org_id, event_type, metadata)
  values (
    auth.uid(),
    v_org.id,
    'platform_organization_created',
    jsonb_build_object('name', v_org.name, 'display_name', v_display)
  );

  return v_org;
end;
$$;

revoke all on function public.platform_create_organization(text, text, text, text, text, uuid) from public, anon;
grant execute on function public.platform_create_organization(text, text, text, text, text, uuid) to authenticated, service_role;

-- Platform config: billing modeled (still no payment provider).
create or replace function public.platform_config_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_super_admin() then
    raise exception 'AscendOS: Keine Plattformberechtigung.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'supabase', 'connected',
    'ai_provider', 'configured',
    'instagram', 'configured',
    'push', 'configured',
    'billing', 'modeled'
  );
end;
$$;

revoke all on function public.platform_config_status() from public, anon;
grant execute on function public.platform_config_status() to authenticated, service_role;

-- Improve usage attribution: prefer current_org_id(), else profile mirror.
create or replace function public.track_usage(
  p_user uuid,
  p_event text,
  p_meta jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    return;
  end if;
  if p_user is distinct from auth.uid() and not public.is_super_admin() then
    raise warning 'AscendOS: track_usage fuer fremden Nutzer abgewiesen, nichts geschrieben.';
    return;
  end if;

  v_org := public.current_org_id();
  if v_org is null then
    select p.org_id into v_org from public.profiles p where p.id = p_user;
  end if;
  if v_org is null then
    return;
  end if;

  insert into public.usage_events (user_id, org_id, event_type, metadata)
  values (p_user, v_org, p_event, coalesce(p_meta, '{}'::jsonb));
end;
$$;

revoke all on function public.track_usage(uuid, text, jsonb) from public, anon;
grant execute on function public.track_usage(uuid, text, jsonb) to authenticated, service_role;

-- Backfill billing for existing organizations (additive).
do $$
declare
  r record;
begin
  for r in select id from public.organizations loop
    perform public.ensure_org_billing(r.id);
  end loop;
end;
$$;

comment on function public.billing_estimate_monthly_cents(integer, integer, integer) is
  'Phase 11: base_cents + seats * seat_cents. Integer cents only.';
comment on function public.org_admin_get_billing() is
  'Phase 11: org-admin estimated billing for current_org_id() only.';
comment on function public.platform_list_billing(text) is
  'Phase 11: platform estimated billing overview. No payments.';
