-- ============================================================
-- Phase 7: coaching-media private + org-bound storage policies
--
-- WHY (required):
--   Bucket was public=true with coaching_media_public_read (no auth).
--   Flyer URLs in live_coaching_events.media_url were permanent public
--   links — table RLS cannot protect Storage objects.
--
-- ADDITIVE / NON-DESTRUCTIVE:
--   - Does NOT delete objects or rewrite media_path rows.
--   - Legacy paths ({userId}/…) remain readable when referenced by an
--     event/story in the caller's current org (dual-read).
--   - New uploads must use {org_id}/… folder (enforced on INSERT).
--
-- Production: NOT applied by agent.
-- ============================================================

-- ---------- 1) Private bucket ----------
update storage.buckets
set public = false
where id = 'coaching-media';

-- ---------- 2) Drop public read ----------
drop policy if exists "coaching_media_public_read" on storage.objects;

-- ---------- 3) Org-scoped SELECT (new paths + legacy via event/story) ----------
drop policy if exists "coaching_media_org_select" on storage.objects;
create policy "coaching_media_org_select"
on storage.objects for select
to authenticated
using (
  bucket_id = 'coaching-media'
  and public.active_membership_id() is not null
  and public.current_org_id() is not null
  and (
    -- New convention: {org_id}/…
    (storage.foldername(name))[1] = public.current_org_id()::text
    -- Legacy / path-agnostic: object referenced by org event
    or exists (
      select 1
      from public.live_coaching_events e
      where e.org_id = public.current_org_id()
        and e.media_path = name
        and (
          e.active = true
          or public.is_coach_content_manager()
        )
    )
    -- Stories media (optional column; most stories are text)
    or exists (
      select 1
      from public.ascend_stories s
      where s.org_id = public.current_org_id()
        and s.media_path = name
        and (
          (s.active = true and s.expires_at > now())
          or public.is_coach_content_manager()
        )
    )
  )
);

-- ---------- 4) Manager writes — org folder required ----------
drop policy if exists "coaching_media_manager_insert" on storage.objects;
create policy "coaching_media_manager_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'coaching-media'
  and public.is_coach_content_manager()
  and public.active_membership_id() is not null
  and (storage.foldername(name))[1] = public.current_org_id()::text
);

drop policy if exists "coaching_media_manager_update" on storage.objects;
create policy "coaching_media_manager_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'coaching-media'
  and public.is_coach_content_manager()
  and public.active_membership_id() is not null
  and (storage.foldername(name))[1] = public.current_org_id()::text
)
with check (
  bucket_id = 'coaching-media'
  and public.is_coach_content_manager()
  and public.active_membership_id() is not null
  and (storage.foldername(name))[1] = public.current_org_id()::text
);

drop policy if exists "coaching_media_manager_delete" on storage.objects;
create policy "coaching_media_manager_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'coaching-media'
  and public.is_coach_content_manager()
  and public.active_membership_id() is not null
  and (
    (storage.foldername(name))[1] = public.current_org_id()::text
    or exists (
      select 1
      from public.live_coaching_events e
      where e.org_id = public.current_org_id()
        and e.media_path = name
    )
  )
);
