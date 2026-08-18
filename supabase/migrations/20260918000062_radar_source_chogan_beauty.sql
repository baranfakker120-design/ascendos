-- ============================================================
-- Team Seyda Radar — add source 'chogan_beauty' (additive CHECK)
--
-- Existing sources 'chogan' and 'essence_tribe' remain valid.
-- No new table. No token/cron/OAuth changes.
-- Unique key stays (org_id, user_id, source, external_id).
--
-- Production: NOT applied by agent. No db push / deploy.
-- ============================================================

alter table public.team_radar_items
  drop constraint if exists team_radar_items_source_check;

do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'team_radar_items'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%source%'
      and pg_get_constraintdef(c.oid) ilike '%chogan%'
      and pg_get_constraintdef(c.oid) not ilike '%chogan_beauty%'
      and c.conname <> 'team_radar_items_org1_only'
  loop
    execute format('alter table public.team_radar_items drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.team_radar_items
  add constraint team_radar_items_source_check
  check (source in ('chogan', 'essence_tribe', 'chogan_beauty'));

comment on column public.team_radar_items.source is
  'Business Discovery source: chogan | essence_tribe | chogan_beauty.';
