-- ============================================================
-- Migration 39: Content drafts carousel support (ADDITIVE ONLY)
--
-- Stores ordered carousel asset ids + structured AI analysis JSON.
-- asset_id remains the cover / first slide (existing FK + single-image path).
-- Does NOT alter Instagram OAuth, Coach, or unrelated schemas.
-- ============================================================

alter table public.content_drafts
  add column if not exists carousel_asset_ids uuid[] not null default '{}'::uuid[];

alter table public.content_drafts
  add column if not exists analysis_json jsonb not null default '{}'::jsonb;

comment on column public.content_drafts.carousel_asset_ids is
  'Ordered Instagram carousel slide asset ids (2–6). Empty = single-asset draft. First id should match asset_id.';

comment on column public.content_drafts.analysis_json is
  'Structured Content Assistant analysis (keywords/hashtags with reasons, slide notes, optimization).';

create index if not exists content_drafts_carousel_asset_ids_gin
  on public.content_drafts using gin (carousel_asset_ids);
