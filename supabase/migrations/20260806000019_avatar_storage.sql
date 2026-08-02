-- ============================================================
-- Migration 19, Sprint 4 Phase 2: Speicher-Bucket fuer Profilbilder
--
-- SETZT MIGRATIONEN 15 BIS 18 VORAUS (memberships, Profilspiegel).
--
-- ZIEL
--   profiles.avatar_url bekommt einen echten Upload-Pfad. Bisher
--   existierte die Spalte ohne Bucket (Sprint-4-Plan Abschnitt 1.3).
--
-- REGELN
--   1. Pfadkonvention: {auth.uid()}/avatar.<ext>
--      Der erste Pfadabschnitt IST die Identitaet. Policies pruefen
--      das serverseitig — das UI darf den Pfad nicht "frei" waehlen.
--   2. Oeffentlich LESBAR: Avatar-URLs stehen in profiles /
--      profiles_public und werden als <img src> geladen. Ein privater
--      Bucket wuerde fuer jedes Bild eine signierte URL verlangen und
--      die Mitgliederliste unbrauchbar machen.
--   3. Schreiben nur fuer den eigenen Ordner. Kein org-weiter Upload.
--   4. MIME und Groesse am Bucket begrenzt (Defense in Depth).
--   5. Keine Geschaeftsregel aendert sich. Nur Infrastruktur fuer
--      eine bereits vorhandene Spalte (Golden Rule / PROJECT_BIBLE).
-- ============================================================

-- ---------- Bucket -------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatare',
  'avatare',
  true,
  2097152, -- 2 MiB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------- Policies auf storage.objects ---------------------------
-- Idempotent: alte Policies gleichen Namens entfernen, falls ein
-- Teil-Lauf haengen blieb.

drop policy if exists avatare_select_public     on storage.objects;
drop policy if exists avatare_insert_own        on storage.objects;
drop policy if exists avatare_update_own        on storage.objects;
drop policy if exists avatare_delete_own        on storage.objects;

-- Lesen: oeffentlich (Bucket public=true + SELECT fuer authenticated/
-- anon, damit Studio und Client-Listen konsistent sind).
create policy avatare_select_public
  on storage.objects
  for select
  to public
  using (bucket_id = 'avatare');

-- Anlegen: nur im eigenen Ordner {uid}/...
create policy avatare_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatare'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Ersetzen: nur eigener Ordner
create policy avatare_update_own
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatare'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatare'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Loeschen: nur eigener Ordner
create policy avatare_delete_own
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatare'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );
