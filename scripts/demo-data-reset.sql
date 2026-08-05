-- =============================================================================
-- AscendOS — Demo-Daten-Reset (Production / Chogan · Team Seyda)
-- =============================================================================
-- Zielstruktur:
--   Şeyda Tatar (super_admin)
--   └── Baran (developer)
--       └── Zuhal Özkartal (berater)
--
-- Ann-Christin Aydin wird vollständig aus der Organisation entfernt.
-- Kataloge (ranks, journeys, knowledge_docs, agents, …) bleiben erhalten.
-- Keine Tabellen / Migrationen / App-Funktionen werden gelöscht.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0a) Ensure `developer` is a valid membership/invite role (Migration 22)
--     Required for Baran = Developer; no-op if already applied.
-- ---------------------------------------------------------------------------
alter table public.memberships drop constraint if exists memberships_role_check;
alter table public.memberships
  add constraint memberships_role_check
  check (role in ('super_admin', 'admin', 'berater', 'leader', 'developer'));

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('super_admin', 'admin', 'berater', 'leader', 'developer'));

alter table public.invites drop constraint if exists invites_role_check;
alter table public.invites
  add constraint invites_role_check
  check (role in ('super_admin', 'admin', 'berater', 'leader', 'developer'));

insert into public.cosmetic_items (org_id, kind, key, label, asset_path, rank_key, sort_order)
select o.id, 'frame', 'special-developer', 'Developer', 'frame-08', null, 98
from public.organizations o
where o.id = '00000000-0000-0000-0000-000000000001'
on conflict (org_id, kind, key) do nothing;

insert into public.cosmetic_items (org_id, kind, key, label, asset_path, rank_key, sort_order)
select o.id, 'frame', 'special-super-admin', 'Super Admin', 'frame-09', null, 99
from public.organizations o
where o.id = '00000000-0000-0000-0000-000000000001'
on conflict (org_id, kind, key) do nothing;

-- Bypass self-protect trigger for role/sponsor rewiring (CLI has no auth.uid)
alter table public.memberships disable trigger memberships_protect_columns;

do $$
declare
  v_org          uuid := '00000000-0000-0000-0000-000000000001';
  v_seyda_p      uuid;
  v_baran_p      uuid;
  v_zuhal_p      uuid;
  v_ann_p        uuid;
  v_seyda_m      uuid;
  v_baran_m      uuid;
  v_zuhal_m      uuid;
  v_ann_m        uuid;
  v_keeper_ids   uuid[];
  v_keeper_mids  uuid[];
  v_all_ids      uuid[];
  v_all_mids     uuid[];
begin
  select id into strict v_seyda_p from public.profiles
   where username = 'seyda' or (first_name = 'Şeyda' and last_name = 'Tatar')
   limit 1;

  select id into strict v_baran_p from public.profiles
   where username = 'barfumnetwork'
   limit 1;

  select id into strict v_zuhal_p from public.profiles
   where username = 'zuzu' or (first_name = 'Zuhal' and last_name = 'Özkartal')
   limit 1;

  select id into v_ann_p from public.profiles
   where username = 'anniaydin'
      or (first_name ilike 'Ann-Christin%' and last_name ilike 'Aydin%')
   limit 1;

  select id into strict v_seyda_m from public.memberships
   where identity_id = v_seyda_p and org_id = v_org and status = 'active';

  select id into strict v_baran_m from public.memberships
   where identity_id = v_baran_p and org_id = v_org and status = 'active';

  select id into strict v_zuhal_m from public.memberships
   where identity_id = v_zuhal_p and org_id = v_org and status = 'active';

  if v_ann_p is not null then
    select id into v_ann_m from public.memberships
     where identity_id = v_ann_p and org_id = v_org and status = 'active';
  end if;

  v_keeper_ids  := array[v_seyda_p, v_baran_p, v_zuhal_p];
  v_keeper_mids := array[v_seyda_m, v_baran_m, v_zuhal_m];
  v_all_ids     := v_keeper_ids;
  v_all_mids    := v_keeper_mids;
  if v_ann_p is not null then
    v_all_ids := v_all_ids || v_ann_p;
  end if;
  if v_ann_m is not null then
    v_all_mids := v_all_mids || v_ann_m;
  end if;

  raise notice 'Reset targets: seyda=% baran=% zuhal=% ann=%',
    v_seyda_p, v_baran_p, v_zuhal_p, v_ann_p;

  -- -------------------------------------------------------------------------
  -- 1) Wipe user-generated content (FK-safe order)
  -- -------------------------------------------------------------------------
  delete from public.coach_messages
   where convo_id in (select id from public.coach_convos where user_id = any (v_all_ids));

  delete from public.daily_plan_items
   where plan_id in (select id from public.daily_plans where user_id = any (v_all_ids));

  delete from public.ap_task_completions
   where membership_id = any (v_all_mids);

  delete from public.ap_ledger
   where membership_id = any (v_all_mids);

  delete from public.membership_cosmetics
   where membership_id = any (v_all_mids);

  delete from public.monthly_awards
   where membership_id = any (v_all_mids);

  delete from public.payouts
   where identity_id = any (v_all_ids);

  delete from public.leadership_favorites
   where owner_membership_id = any (v_all_mids)
      or target_membership_id = any (v_all_mids);

  delete from public.leadership_notes
   where owner_membership_id = any (v_all_mids)
      or target_membership_id = any (v_all_mids);

  delete from public.user_achievements where user_id = any (v_all_ids);
  delete from public.user_progress where user_id = any (v_all_ids);
  delete from public.knowledge_gaps where user_id = any (v_all_ids);
  delete from public.usage_events where user_id = any (v_all_ids);

  delete from public.pipeline_events
   where contact_id in (select id from public.contacts where owner_id = any (v_all_ids));

  delete from public.daily_plans where user_id = any (v_all_ids);
  delete from public.coach_convos where user_id = any (v_all_ids);
  delete from public.contacts where owner_id = any (v_all_ids);

  -- Shared demo tool state (not per-user keyed)
  delete from public.kabelkatalog_state;

  -- Invites + validation noise
  delete from public.invite_validation_attempts;
  delete from public.invites where org_id = v_org;

  -- -------------------------------------------------------------------------
  -- 2) Remove Ann-Christin completely from the organisation
  -- -------------------------------------------------------------------------
  if v_ann_m is not null then
    update public.memberships
       set sponsor_membership_id = v_seyda_m
     where sponsor_membership_id = v_ann_m;

    update public.memberships
       set status = 'ended',
           left_at = now(),
           sponsor_membership_id = null
     where id = v_ann_m;

    delete from public.ap_ledger where membership_id = v_ann_m;
    delete from public.membership_cosmetics where membership_id = v_ann_m;
    delete from public.monthly_awards where membership_id = v_ann_m;
    delete from public.payouts where identity_id = v_ann_p;

    delete from public.memberships where id = v_ann_m;
  end if;

  if v_ann_p is not null then
    delete from public.profiles where id = v_ann_p;
    delete from auth.identities where user_id = v_ann_p;
    delete from auth.sessions where user_id = v_ann_p;
    delete from auth.refresh_tokens where user_id = v_ann_p::text;
    delete from auth.users where id = v_ann_p;
  end if;

  -- -------------------------------------------------------------------------
  -- 3) Rewire genealogy: Şeyda → Baran → Zuhal
  -- -------------------------------------------------------------------------
  update public.memberships
     set sponsor_membership_id = null,
         role = 'super_admin'
   where id = v_seyda_m;

  update public.memberships
     set sponsor_membership_id = v_seyda_m,
         role = 'developer'
   where id = v_baran_m;

  update public.memberships
     set sponsor_membership_id = v_baran_m,
         role = 'berater'
   where id = v_zuhal_m;

  -- Display name: Baran
  update public.profiles
     set first_name = 'Baran',
         last_name = 'Fakker'
   where id = v_baran_p;

  -- -------------------------------------------------------------------------
  -- 4) Reset counters / streaks / TL qualification on keepers
  -- -------------------------------------------------------------------------
  update public.memberships
     set ap_total = 0,
         streak_days = 0,
         streak_updated_on = null,
         last_app_opened_at = null,
         team_leader_qualified_at = null
   where id = any (v_keeper_mids);

  raise notice 'Demo reset complete.';
end $$;

alter table public.memberships enable trigger memberships_protect_columns;

commit;
