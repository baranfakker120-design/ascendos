-- ============================================================
-- Migration 44: Phase 3 — Tenant org columns + Org #1 backfill
--
-- Scope (schema + integrity ONLY; Phase 4 owns RLS):
--   coach_knowledge_articles.org_id
--   live_coaching_events.org_id
--   coaching_notification_outbox.org_id
--   ascend_stories.org_id
--
-- Deliberately NOT adding org_id to:
--   coach_knowledge_versions     → via article_id → articles.org_id
--   coach_knowledge_change_log   → via article_id → articles.org_id
--
-- Column name is org_id (repository convention), not organization_id.
-- Org #1 (production / seed Chogan):
--   00000000-0000-0000-0000-000000000001
--
-- Note: local CI applies seed.sql AFTER migrations. Org #1 therefore may
-- not exist yet when this migration runs on an empty database. Backfill
-- targets that UUID; FK validation fails only if rows exist without Org #1.
-- Production already has Org #1 — do not create/replace it here.
--
-- RLS policies: UNCHANGED (still global for these tables until Phase 4).
-- Edge / FE / push / Autopilot: UNCHANGED.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1) coach_knowledge_articles
-- ---------------------------------------------------------------------------
alter table public.coach_knowledge_articles
  add column if not exists org_id uuid;

update public.coach_knowledge_articles
set org_id = '00000000-0000-0000-0000-000000000001'
where org_id is null;

do $$
begin
  if exists (
    select 1 from public.coach_knowledge_articles where org_id is null
  ) then
    raise exception 'Phase 3: coach_knowledge_articles still has null org_id';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'coach_knowledge_articles_org_id_fkey'
  ) then
    alter table public.coach_knowledge_articles
      add constraint coach_knowledge_articles_org_id_fkey
      foreign key (org_id) references public.organizations (id)
      on delete restrict;
  end if;
end
$$;

alter table public.coach_knowledge_articles
  alter column org_id set not null;

-- Transitional default so existing FE inserts (no org_id yet) keep working
-- until Phase 4/6 set org from membership context. Single-tenant = Org #1.
alter table public.coach_knowledge_articles
  alter column org_id set default '00000000-0000-0000-0000-000000000001';

create index if not exists coach_knowledge_articles_org_id_idx
  on public.coach_knowledge_articles (org_id);

-- Slug uniqueness becomes per-organization (additive multi-tenant integrity).
alter table public.coach_knowledge_articles
  drop constraint if exists coach_knowledge_articles_slug_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'coach_knowledge_articles_org_slug_key'
  ) then
    alter table public.coach_knowledge_articles
      add constraint coach_knowledge_articles_org_slug_key
      unique (org_id, slug);
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2) live_coaching_events
-- ---------------------------------------------------------------------------
alter table public.live_coaching_events
  add column if not exists org_id uuid;

update public.live_coaching_events
set org_id = '00000000-0000-0000-0000-000000000001'
where org_id is null;

do $$
begin
  if exists (
    select 1 from public.live_coaching_events where org_id is null
  ) then
    raise exception 'Phase 3: live_coaching_events still has null org_id';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'live_coaching_events_org_id_fkey'
  ) then
    alter table public.live_coaching_events
      add constraint live_coaching_events_org_id_fkey
      foreign key (org_id) references public.organizations (id)
      on delete restrict;
  end if;
end
$$;

alter table public.live_coaching_events
  alter column org_id set not null;

alter table public.live_coaching_events
  alter column org_id set default '00000000-0000-0000-0000-000000000001';

create index if not exists live_coaching_events_org_id_idx
  on public.live_coaching_events (org_id);

create index if not exists live_coaching_events_org_active_starts_idx
  on public.live_coaching_events (org_id, active, starts_at);

-- ---------------------------------------------------------------------------
-- 3) coaching_notification_outbox (backfill FROM event.org_id)
-- ---------------------------------------------------------------------------
alter table public.coaching_notification_outbox
  add column if not exists org_id uuid;

update public.coaching_notification_outbox o
set org_id = e.org_id
from public.live_coaching_events e
where o.event_id = e.id
  and o.org_id is null;

-- Any orphaned outbox without a resolvable event org → Org #1 (should not happen
-- given event_id NOT NULL FK; defensive).
update public.coaching_notification_outbox
set org_id = '00000000-0000-0000-0000-000000000001'
where org_id is null;

do $$
begin
  if exists (
    select 1 from public.coaching_notification_outbox where org_id is null
  ) then
    raise exception 'Phase 3: coaching_notification_outbox still has null org_id';
  end if;

  if exists (
    select 1
    from public.coaching_notification_outbox o
    join public.live_coaching_events e on e.id = o.event_id
    where o.org_id is distinct from e.org_id
  ) then
    raise exception
      'Phase 3: coaching_notification_outbox.org_id mismatches live_coaching_events.org_id';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'coaching_notification_outbox_org_id_fkey'
  ) then
    alter table public.coaching_notification_outbox
      add constraint coaching_notification_outbox_org_id_fkey
      foreign key (org_id) references public.organizations (id)
      on delete restrict;
  end if;
end
$$;

alter table public.coaching_notification_outbox
  alter column org_id set not null;

alter table public.coaching_notification_outbox
  alter column org_id set default '00000000-0000-0000-0000-000000000001';

create index if not exists coaching_notification_outbox_org_id_idx
  on public.coaching_notification_outbox (org_id);

-- Keep outbox.org_id aligned with its event (integrity; not RLS).
create or replace function public.coaching_notification_outbox_set_org_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select e.org_id into v_org
  from public.live_coaching_events e
  where e.id = new.event_id;

  if v_org is null then
    raise exception
      'coaching_notification_outbox: event % missing or has null org_id',
      new.event_id;
  end if;

  new.org_id := v_org;
  return new;
end;
$$;

drop trigger if exists coaching_notification_outbox_set_org_id
  on public.coaching_notification_outbox;
create trigger coaching_notification_outbox_set_org_id
before insert or update of event_id, org_id
on public.coaching_notification_outbox
for each row execute function public.coaching_notification_outbox_set_org_id();

revoke all on function public.coaching_notification_outbox_set_org_id() from public;

-- ---------------------------------------------------------------------------
-- 4) ascend_stories
-- ---------------------------------------------------------------------------
alter table public.ascend_stories
  add column if not exists org_id uuid;

update public.ascend_stories
set org_id = '00000000-0000-0000-0000-000000000001'
where org_id is null;

do $$
begin
  if exists (
    select 1 from public.ascend_stories where org_id is null
  ) then
    raise exception 'Phase 3: ascend_stories still has null org_id';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ascend_stories_org_id_fkey'
  ) then
    alter table public.ascend_stories
      add constraint ascend_stories_org_id_fkey
      foreign key (org_id) references public.organizations (id)
      on delete restrict;
  end if;
end
$$;

alter table public.ascend_stories
  alter column org_id set not null;

alter table public.ascend_stories
  alter column org_id set default '00000000-0000-0000-0000-000000000001';

create index if not exists ascend_stories_org_id_idx
  on public.ascend_stories (org_id);

create index if not exists ascend_stories_org_active_expires_idx
  on public.ascend_stories (org_id, active, expires_at desc);

-- ---------------------------------------------------------------------------
-- Phase 4 / later (documented, NOT done here):
--   - Tenant RLS on the four tables above (+ storage coaching-media)
--   - coach-chat / ingest-knowledge org filters
--   - coaching-push-dispatch membership/org fan-out (Phase 7 push isolation)
--   - FE insert paths setting org_id from currentOrganization
--   - Remove transitional Org #1 column defaults once FE always supplies org_id
-- Helpers intentionally untouched:
--   current_org_id(), active_membership_id(),
--   is_platform_super_admin(), is_organization_admin(), is_super_admin(),
--   is_coach_content_manager()
-- ============================================================
