-- ============================================================
-- Production-Setup [A-5]: kontrollierte Erstbefüllung einer Org.
-- KEIN Seed, KEINE Studio-Klicks (ADR-018). Ausführen mit:
--
--   psql "$PRODUCTION_DB_URL" \
--     -v org_name="'Chogan'" \
--     -v team_name="'Team Seyda'" \
--     -f scripts/setup-production.sql
--
-- Idempotent: bricht ab, wenn die Org bereits existiert.
-- Gibt am Ende die beiden Gründer-Invite-Codes aus — diese sicher
-- übermitteln und nach der Registrierung verifizieren.
-- ============================================================

\set ON_ERROR_STOP on

begin;

do $$
begin
  if exists (select 1 from public.organizations) then
    raise exception 'Setup abgebrochen: Es existiert bereits eine Organisation.';
  end if;
end $$;

insert into public.organizations (id, name, settings)
values (gen_random_uuid(), :org_name,
        '{"coach_daily_message_limit": 50}'::jsonb);

insert into public.teams (id, org_id, name)
select gen_random_uuid(), o.id, :team_name
from public.organizations o where o.name = :org_name;

-- Zwei Gründer-Invites (super_admin, 30 Tage gültig, zufällige Codes):
insert into public.invites (code, org_id, team_id, sponsor_id, role, expires_at)
select
  upper(substring(replace(replace(replace(replace(
    encode(extensions.gen_random_bytes(8), 'base64'),
    '/', 'A'), '+', 'B'), '0', 'C'), 'O', 'D') from 1 for 10)),
  t.org_id, t.id, null, 'super_admin', now() + interval '30 days'
from public.teams t, generate_series(1, 2)
where t.name = :team_name;

-- Externe Tools (Generation 1):
insert into public.external_tools
  (org_id, key, name, description, url, share_event_type, result_event_type, sort_order)
select o.id, v.key, v.name, v.description, v.url, v.share_ev, v.result_ev, v.ord
from public.organizations o,
(values
  ('waytomoon', 'WayToMoon', 'Onboarding für neue Interessenten',
   'https://waytomoon.netlify.app', 'waytomoon_sent', null, 1),
  ('presentation', 'Firmenpräsentation', 'Präsentation für Interessenten',
   'https://mywaytomoon.netlify.app', 'presentation_sent', 'presentation_viewed', 2),
  ('fitcheck', 'Business Fit Check', 'Qualifizierung nach der Präsentation',
   'https://businessfitcheck.netlify.app', 'fit_check_sent', 'fit_check_completed', 3)
) as v(key, name, description, url, share_ev, result_ev, ord)
where o.name = :org_name;

-- KI-Agenten (identisch zum Staging-Stand):
insert into public.agents (org_id, key, name, system_prompt, retrieval_categories)
select o.id, v.key, v.name, v.prompt, v.cats
from public.organizations o,
(values
  ('recruiting', 'Recruiting Coach',
   'Du bist der Recruiting-Coach. Deine Spezialgebiete: Interessenten qualifizieren, Einwände behandeln, den Prozess Präsentation -> Business Fit Check -> 3-Way-Call -> Registrierung führen. Du kennst die Angst vor dem ersten Schritt und nimmst sie ernst, ohne Druck aufzubauen.',
   '{recruiting,einwaende,prozess}'::text[]),
  ('sales', 'Sales Coach',
   'Du bist der Sales-Coach. Deine Spezialgebiete: Produkte, Kundengespräche, Duftpartys planen und nachbereiten, aus Kunden Stammkunden machen. Du verkaufst über Nutzen und Erlebnis, nie über Druck.',
   '{produkte,verkauf,duftparty}'::text[]),
  ('knowledge', 'Knowledge Coach',
   'Du bist der Knowledge-Coach. Deine Spezialgebiete: Produkte, Vergütungsplan, Abläufe und Schulungsinhalte präzise erklären. Du antwortest nur auf Basis der Teamdokumente; fehlen sie, sagst du das klar.',
   '{produkte,verguetung,schulung,faq,prozess}'::text[])
) as v(key, name, prompt, cats)
where o.name = :org_name;

commit;

-- Gründer-Codes ausgeben:
select code as gruender_invite_code, expires_at
from public.invites where sponsor_id is null;
