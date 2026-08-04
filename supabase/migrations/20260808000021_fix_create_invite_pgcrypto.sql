-- ============================================================
-- Migration 21: Fix create_invite random bytes (pgcrypto)
--
-- Migration 7 already qualified extensions.gen_random_bytes.
-- Migration 16 rewrote create_invite for memberships and
-- accidentally used bare gen_random_bytes() again. With
-- search_path = public that fails: function does not exist.
--
-- Applied migrations are never edited (ADR-018) — fix here.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

create or replace function public.create_invite(invite_role text default 'berater')
returns table (invite_code text, invite_expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membership public.memberships;
  v_code text;
begin
  select * into v_membership
  from public.memberships
  where id = public.active_membership_id();

  if v_membership.id is null then
    raise exception 'AscendOS: Keine aktive Mitgliedschaft für diesen Nutzer.';
  end if;

  if invite_role <> 'berater' and v_membership.role <> 'super_admin' then
    raise exception 'AscendOS: Nur Super-Admins können Admin- oder Leader-Einladungen erstellen.';
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
  values (v_code, v_membership.org_id, v_membership.team_id,
          v_membership.identity_id, invite_role, v_membership.identity_id);

  return query
    select i.code, i.expires_at from public.invites i where i.code = v_code;
end;
$$;

revoke execute on function public.create_invite(text) from PUBLIC, anon;
grant  execute on function public.create_invite(text) to authenticated, service_role;

comment on function public.create_invite(text) is
  'Creates an invite from the active membership. Uses extensions.gen_random_bytes (pgcrypto).';
