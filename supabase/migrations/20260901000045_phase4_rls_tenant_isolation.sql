-- ============================================================
-- Migration 45: Phase 4 — RLS tenant isolation for CMS / Live /
-- Stories / Outbox
--
-- Column name remains org_id (Phase 3 / repository convention).
--
-- Policy inventory (before → after):
--
-- coach_knowledge_articles_select
--   BEFORE: manager OR (active+approved) — GLOBAL
--   AFTER:  same role rule AND org_id = current_org_id()
--
-- coach_knowledge_articles_write (FOR ALL)
--   BEFORE: manager — GLOBAL
--   AFTER:  manager AND org_id = current_org_id() (USING + WITH CHECK)
--
-- coach_knowledge_versions_select
--   BEFORE: manager OR parent active+approved — GLOBAL via article
--   AFTER:  parent.org_id = current_org_id() AND (manager OR approved)
--
-- coach_knowledge_versions_write
--   BEFORE: manager — GLOBAL
--   AFTER:  manager AND parent.org_id = current_org_id()
--
-- coach_knowledge_change_log_select / _write
--   BEFORE: manager — GLOBAL
--   AFTER:  manager AND parent.org_id = current_org_id()
--
-- live_coaching_events_select
--   BEFORE: manager OR active — GLOBAL
--   AFTER:  org_id = current_org_id() AND (manager OR active)
--
-- live_coaching_events_write
--   BEFORE: manager — GLOBAL
--   AFTER:  manager AND org_id = current_org_id()
--
-- coaching_notification_outbox_select
--   BEFORE: using (true) — GLOBAL LEAK
--   AFTER:  org_id = current_org_id() AND active_membership_id() IS NOT NULL
--
-- coaching_notification_outbox_write
--   BEFORE: manager — GLOBAL
--   AFTER:  manager AND org_id = current_org_id()
--   NOTE: service_role still bypasses RLS (push dispatch Phase 7).
--
-- ascend_stories_select
--   BEFORE: manager OR (active AND not expired) — GLOBAL
--   AFTER:  org_id = current_org_id() AND (manager OR eligible)
--
-- ascend_stories_write
--   BEFORE: manager — GLOBAL
--   AFTER:  manager AND org_id = current_org_id()
--
-- Platform admin: NO USING (true). No break-glass policies here
-- (Phase 8 / explicit ops). Org admin ≠ platform admin.
--
-- Out of scope: Storage, Edge, FE, Autopilot, t_minus_30 rename,
-- push recipient isolation.
-- ============================================================

-- ---------------------------------------------------------------------------
-- Phase-3 transitional DEFAULT Org#1 → membership-resolved current org.
-- coalesce keeps a safe Org#1 fallback when current_org_id() is NULL
-- (owner/seed paths, Phase-3 integrity fixtures). Authenticated tenants
-- still get current_org_id(); forged foreign org_id fails WITH CHECK.
-- ---------------------------------------------------------------------------
alter table public.coach_knowledge_articles
  alter column org_id set default coalesce(
    public.current_org_id(),
    '00000000-0000-0000-0000-000000000001'::uuid
  );

alter table public.live_coaching_events
  alter column org_id set default coalesce(
    public.current_org_id(),
    '00000000-0000-0000-0000-000000000001'::uuid
  );

alter table public.coaching_notification_outbox
  alter column org_id set default coalesce(
    public.current_org_id(),
    '00000000-0000-0000-0000-000000000001'::uuid
  );

alter table public.ascend_stories
  alter column org_id set default coalesce(
    public.current_org_id(),
    '00000000-0000-0000-0000-000000000001'::uuid
  );

-- ---------------------------------------------------------------------------
-- coach_knowledge_articles
-- ---------------------------------------------------------------------------
drop policy if exists "coach_knowledge_articles_select" on public.coach_knowledge_articles;
create policy "coach_knowledge_articles_select"
on public.coach_knowledge_articles for select to authenticated
using (
  org_id = public.current_org_id()
  and public.active_membership_id() is not null
  and (
    public.is_coach_content_manager()
    or (active = true and status = 'approved')
  )
);

drop policy if exists "coach_knowledge_articles_write" on public.coach_knowledge_articles;
create policy "coach_knowledge_articles_write"
on public.coach_knowledge_articles for all to authenticated
using (
  public.is_coach_content_manager()
  and org_id = public.current_org_id()
  and public.active_membership_id() is not null
)
with check (
  public.is_coach_content_manager()
  and org_id = public.current_org_id()
  and public.active_membership_id() is not null
);

-- ---------------------------------------------------------------------------
-- coach_knowledge_versions (org via article_id)
-- ---------------------------------------------------------------------------
drop policy if exists "coach_knowledge_versions_select" on public.coach_knowledge_versions;
create policy "coach_knowledge_versions_select"
on public.coach_knowledge_versions for select to authenticated
using (
  public.active_membership_id() is not null
  and exists (
    select 1
    from public.coach_knowledge_articles a
    where a.id = article_id
      and a.org_id = public.current_org_id()
      and (
        public.is_coach_content_manager()
        or (a.active = true and a.status = 'approved')
      )
  )
);

drop policy if exists "coach_knowledge_versions_write" on public.coach_knowledge_versions;
create policy "coach_knowledge_versions_write"
on public.coach_knowledge_versions for all to authenticated
using (
  public.is_coach_content_manager()
  and public.active_membership_id() is not null
  and exists (
    select 1
    from public.coach_knowledge_articles a
    where a.id = article_id
      and a.org_id = public.current_org_id()
  )
)
with check (
  public.is_coach_content_manager()
  and public.active_membership_id() is not null
  and exists (
    select 1
    from public.coach_knowledge_articles a
    where a.id = article_id
      and a.org_id = public.current_org_id()
  )
);

-- ---------------------------------------------------------------------------
-- coach_knowledge_change_log (org via article_id)
-- ---------------------------------------------------------------------------
drop policy if exists "coach_knowledge_change_log_select" on public.coach_knowledge_change_log;
create policy "coach_knowledge_change_log_select"
on public.coach_knowledge_change_log for select to authenticated
using (
  public.is_coach_content_manager()
  and public.active_membership_id() is not null
  and exists (
    select 1
    from public.coach_knowledge_articles a
    where a.id = article_id
      and a.org_id = public.current_org_id()
  )
);

drop policy if exists "coach_knowledge_change_log_write" on public.coach_knowledge_change_log;
create policy "coach_knowledge_change_log_write"
on public.coach_knowledge_change_log for all to authenticated
using (
  public.is_coach_content_manager()
  and public.active_membership_id() is not null
  and exists (
    select 1
    from public.coach_knowledge_articles a
    where a.id = article_id
      and a.org_id = public.current_org_id()
  )
)
with check (
  public.is_coach_content_manager()
  and public.active_membership_id() is not null
  and exists (
    select 1
    from public.coach_knowledge_articles a
    where a.id = article_id
      and a.org_id = public.current_org_id()
  )
);

-- ---------------------------------------------------------------------------
-- live_coaching_events
-- ---------------------------------------------------------------------------
drop policy if exists "live_coaching_events_select" on public.live_coaching_events;
create policy "live_coaching_events_select"
on public.live_coaching_events for select to authenticated
using (
  org_id = public.current_org_id()
  and public.active_membership_id() is not null
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
  and public.active_membership_id() is not null
)
with check (
  public.is_coach_content_manager()
  and org_id = public.current_org_id()
  and public.active_membership_id() is not null
);

-- ---------------------------------------------------------------------------
-- coaching_notification_outbox
-- ---------------------------------------------------------------------------
drop policy if exists "coaching_notification_outbox_select"
  on public.coaching_notification_outbox;
create policy "coaching_notification_outbox_select"
on public.coaching_notification_outbox for select to authenticated
using (
  org_id = public.current_org_id()
  and public.active_membership_id() is not null
);

drop policy if exists "coaching_notification_outbox_write"
  on public.coaching_notification_outbox;
create policy "coaching_notification_outbox_write"
on public.coaching_notification_outbox for all to authenticated
using (
  public.is_coach_content_manager()
  and org_id = public.current_org_id()
  and public.active_membership_id() is not null
)
with check (
  public.is_coach_content_manager()
  and org_id = public.current_org_id()
  and public.active_membership_id() is not null
);

-- ---------------------------------------------------------------------------
-- ascend_stories
-- ---------------------------------------------------------------------------
drop policy if exists "ascend_stories_select" on public.ascend_stories;
create policy "ascend_stories_select"
on public.ascend_stories for select to authenticated
using (
  org_id = public.current_org_id()
  and public.active_membership_id() is not null
  and (
    public.is_coach_content_manager()
    or (active = true and expires_at > now())
  )
);

drop policy if exists "ascend_stories_write" on public.ascend_stories;
create policy "ascend_stories_write"
on public.ascend_stories for all to authenticated
using (
  public.is_coach_content_manager()
  and org_id = public.current_org_id()
  and public.active_membership_id() is not null
)
with check (
  public.is_coach_content_manager()
  and org_id = public.current_org_id()
  and public.active_membership_id() is not null
);

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER touchpoints (review only; no rewrite unless required):
--   active_membership_id / current_org_id / current_user_role /
--   is_super_admin / is_organization_admin / is_platform_super_admin /
--   is_coach_content_manager — unchanged; already membership-scoped.
--   coaching_notification_outbox_set_org_id — syncs org from event;
--     WITH CHECK above still rejects cross-tenant attach.
-- No p_org_id RPCs target these six tables.
-- ============================================================
