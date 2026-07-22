-- ============================================================
-- Migration 7 (Sprint 4.5): Stabilisierungs-Fixes.
-- Bugfix: create_invite nutzte gen_random_bytes ohne pgcrypto-
-- Qualifizierung — mit search_path=public wäre die Funktion in
-- Production beim ersten Aufruf gescheitert. Angewendete
-- Migrationen werden nie editiert (ADR-018), daher Fix-Migration.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

create or replace function public.create_invite(invite_role text default 'berater')
returns table (invite_code text, invite_expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_code text;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile.id is null then
    raise exception 'AscendOS: Kein Profil für diesen Nutzer gefunden.';
  end if;

  if invite_role <> 'berater' and v_profile.role <> 'super_admin' then
    raise exception 'AscendOS: Nur Super-Admins können Leader- oder Admin-Einladungen erstellen.';
  end if;

  -- 10 Zeichen, gut vorlesbar (keine 0/O, 1/I); pgcrypto explizit
  -- über das extensions-Schema angesprochen.
  v_code := upper(
    substring(replace(replace(replace(replace(
      encode(extensions.gen_random_bytes(8), 'base64'),
      '/', 'A'), '+', 'B'), '0', 'C'), 'O', 'D')
    from 1 for 10)
  );

  insert into public.invites (code, org_id, team_id, sponsor_id, role, created_by)
  values (v_code, v_profile.org_id, v_profile.team_id, v_profile.id, invite_role, v_profile.id);

  return query
    select i.code, i.expires_at from public.invites i where i.code = v_code;
end;
$$;
