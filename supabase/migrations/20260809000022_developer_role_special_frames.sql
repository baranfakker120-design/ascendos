-- ============================================================
-- Migration 22: Rolle `developer` + Sonderrahmen (kein AP-Rang)
--
-- frame-08 = Developer, frame-09 = Super Admin — Anzeige über Rolle.
-- ranks / threshold_ap / seed-Ränge bleiben unverändert.
-- ============================================================

-- memberships.role: developer zulassen (Constraint-Name ist Postgres-Default).
alter table public.memberships drop constraint if exists memberships_role_check;
alter table public.memberships
  add constraint memberships_role_check
  check (role in ('super_admin', 'admin', 'berater', 'leader', 'developer'));

-- profiles.role ist nur Spiegel — muss denselben Wertebereich erlauben.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('super_admin', 'admin', 'berater', 'leader', 'developer'));

-- Kosmetik-Katalog: Sonderrahmen ohne rank_key (nicht über AP freischaltbar).
insert into public.cosmetic_items (org_id, kind, key, label, asset_path, rank_key, sort_order)
select o.id, 'frame', 'special-developer', 'Developer', 'frame-08', null, 98
from public.organizations o
on conflict (org_id, kind, key) do nothing;

insert into public.cosmetic_items (org_id, kind, key, label, asset_path, rank_key, sort_order)
select o.id, 'frame', 'special-super-admin', 'Super Admin', 'frame-09', null, 99
from public.organizations o
on conflict (org_id, kind, key) do nothing;
