-- Phase A: optional Instagram library audio selection on drafts (foundation only).
-- Nullable; existing rows unchanged. Not used by publish until Facebook Login music phase.

alter table public.content_drafts
  add column if not exists instagram_audio_json jsonb null;

comment on column public.content_drafts.instagram_audio_json is
  'Optional selected Instagram library audio for future Reel publish. Null = no selection / original video audio.';
