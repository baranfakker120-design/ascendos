-- ============================================================
-- Autopilot publishing modes (additive, backward compatible)
--
-- Adds publishing_mode to content_autopilot_settings.
-- Raises max_stories_per_day cap to 10; NEW rows default to 4.
-- Does NOT UPDATE existing max_stories_per_day values.
-- Existing rows get publishing_mode = 'full' (preserves feed+stories).
--
-- Production: NOT applied by agent.
-- ============================================================

alter table public.content_autopilot_settings
  add column if not exists publishing_mode text not null default 'full';

alter table public.content_autopilot_settings
  drop constraint if exists content_autopilot_settings_publishing_mode_check;

alter table public.content_autopilot_settings
  add constraint content_autopilot_settings_publishing_mode_check
  check (
    publishing_mode in ('stories', 'feed', 'full', 'marked_stories')
  );

comment on column public.content_autopilot_settings.publishing_mode is
  'Autopilot generation+publish mode: stories | feed | full | marked_stories. Default full preserves legacy feed+stories.';

alter table public.content_autopilot_settings
  drop constraint if exists content_autopilot_settings_max_stories_per_day_check;

-- Recreate unnamed check from original migration (column check).
alter table public.content_autopilot_settings
  drop constraint if exists content_autopilot_settings_max_stories_per_day_check1;

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
      and t.relname = 'content_autopilot_settings'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%max_stories_per_day%'
  loop
    execute format('alter table public.content_autopilot_settings drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.content_autopilot_settings
  add constraint content_autopilot_settings_max_stories_per_day_check
  check (max_stories_per_day >= 0 and max_stories_per_day <= 10);

alter table public.content_autopilot_settings
  alter column max_stories_per_day set default 4;

comment on column public.content_autopilot_settings.max_stories_per_day is
  'Stories per day (0–10). Existing rows keep stored value; new rows default to 4.';
