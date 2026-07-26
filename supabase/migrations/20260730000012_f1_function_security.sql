-- ============================================================
-- Migration 12 (F1): Sicherheitshärtung der Datenbankfunktionen
--
-- Behebt neun Funktionen, die mit SECURITY DEFINER laufen, einen
-- fremden Nutzerparameter annehmen und den Aufrufer nicht prüfen.
-- Vollständige Analyse: docs/f1-security-analysis.md
--
-- Kernbefunde:
--   1. plan_contact_state und die fünf plan_signal_* geben die
--      Kontaktliste beliebiger Nutzer heraus, inklusive Name und
--      next_step. Personenbezogene Daten Dritter.
--   2. get_downline hat keinen org_id-Filter, also mandanten-
--      übergreifende Genealogie.
--   3. track_usage ist schreibend, ungeprüft und für PUBLIC offen.
--   4. Vier Funktionen haben keinen festgenagelten search_path.
--
-- WICHTIG zur Reihenfolge der Rechte:
-- Ein "revoke ... from anon" ist WIRKUNGSLOS, solange PUBLIC das
-- Recht besitzt, weil anon es über PUBLIC erbt. Migration 8 hat
-- unter [S-1] genau diesen Fehler gemacht: validate_invite trägt
-- weiterhin das PUBLIC-Recht und ist für anon aufrufbar. Deshalb
-- wird hier zuerst PUBLIC entzogen und danach selektiv gewährt.
--
-- Rücknahme: Migration 1 und 8 enthalten die Ursprungsfassungen.
-- Eine Rücknahme wäre eine neue Migration (ADR-018) und würde die
-- Lücken wieder öffnen.
-- ============================================================

-- ============================================================
-- Teil 1: Neuer Baustein für die Sichtbarkeitsprüfung
-- ============================================================

-- Beantwortet genau eine Frage: Steht der aufrufende Nutzer in
-- derselben Organisation oberhalb von p_target?
--
-- Bewusst klein geschnitten. Befund F2 des Reviews fordert eine
-- allgemeine Funktion can_see_user(); die wird hier NICHT gebaut,
-- weil F2 nicht Teil dieses Auftrags ist. Dieser Baustein ist so
-- geschnitten, dass can_see_user() ihn später zusammensetzen kann,
-- ohne dass die Rekursion doppelt existiert.
--
-- SECURITY DEFINER ist nötig, weil die Policy profiles_select_own
-- den Zugriff auf das eigene Profil beschränkt, die Prüfung aber
-- die Sponsorenkette aufwärts lesen muss.

create or replace function public.is_ancestor_of(p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with recursive upline as (
    -- Startpunkt: der direkte Sponsor des Ziels, in derselben Org
    select p.sponsor_id as anc_id, p.org_id
    from public.profiles p
    where p.id = p_target
      and p.sponsor_id is not null
      and p.org_id = (select org_id from public.profiles where id = auth.uid())
    union all
    select p.sponsor_id, p.org_id
    from public.profiles p
    join upline u on p.id = u.anc_id
    where p.sponsor_id is not null
      and p.org_id = u.org_id
  ) cycle anc_id set is_cycle using cycle_path
  -- Kreiserkennung ueber die CYCLE-Klausel (PostgreSQL 14+, hier 17.6).
  -- Eine feste Tiefengrenze waere falsch: Sie wuerde legitime tiefe
  -- Genealogien abschneiden und dadurch stillschweigend falsche
  -- Ergebnisse liefern. CYCLE bricht nur bei echten Kreisen ab.
  select count(*) > 0 from upline where anc_id = auth.uid() and not is_cycle;
$$;

comment on function public.is_ancestor_of(uuid) is
  'Wahr, wenn auth.uid() in derselben Organisation oberhalb von p_target steht. Baustein fuer Sichtbarkeitspruefungen (F1).';

-- ============================================================
-- Teil 2: Planungsfunktionen, Fremdparameter entfernen
--
-- Der Parameter p_user war im gesamten Produktivpfad immer
-- auth.uid(), weil generate_daily_plan ihn aus v_user := auth.uid()
-- gefuellt hat. Ein Parameter, der stets den eigenen Nutzer
-- enthaelt, ist keine Funktionalitaet, sondern Angriffsflaeche.
-- Entfernen macht die Fehlbenutzung unmoeglich, statt sie
-- abzufangen.
--
-- Zusaetzlich SECURITY INVOKER: Die Funktionen lesen nur. Bei
-- einem Direktaufruf durch authenticated greift damit zusaetzlich
-- die RLS auf contacts.
--
-- Feinheit, die zwingend beachtet werden muss: Beim Aufruf aus
-- generate_daily_plan (bleibt DEFINER) ist current_user gleich
-- postgres, RLS greift dort also NICHT, auch nicht bei INVOKER.
-- Die Absicherung leistet in diesem Pfad allein der explizite
-- Filter owner_id = auth.uid(). Dieser Filter ist deshalb die
-- eigentliche Garantie und darf nie entfallen.
-- auth.uid() funktioniert in beiden Faellen, weil es die
-- JWT-Ansprueche der Sitzung liest und nicht die aktive Rolle.
-- ============================================================

drop function if exists public.plan_signal_fit_check(uuid, date);
drop function if exists public.plan_signal_next_step(uuid, date);
drop function if exists public.plan_signal_presentation(uuid, date);
drop function if exists public.plan_signal_follow_up(uuid, date);
drop function if exists public.plan_signal_reactivate(uuid, date);
drop function if exists public.plan_contact_state(uuid);

create or replace function public.plan_contact_state()
returns table (
  id uuid, name text, next_step text, next_step_due date,
  max_rank int, last_event_at timestamptz,
  presentation_sent_at timestamptz, presentation_viewed boolean,
  fit_check_done boolean, three_way_done boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    c.id, c.name, c.next_step, c.next_step_due,
    coalesce(max(public.event_phase_rank(e.event_type)), 0),
    max(e.occurred_at),
    max(e.occurred_at) filter (where e.event_type = 'presentation_sent'),
    coalesce(bool_or(e.event_type = 'presentation_viewed'), false),
    coalesce(bool_or(e.event_type = 'fit_check_completed'), false),
    coalesce(bool_or(e.event_type = 'three_way_call_done'), false)
  from public.contacts c
  left join public.effective_pipeline_events e on e.contact_id = c.id
  where c.owner_id = auth.uid()   -- Die eigentliche Garantie, siehe Kopf
  group by c.id;
$$;

comment on function public.plan_contact_state() is
  'Pipeline-Zustand der EIGENEN Kontakte. Fremdparameter in F1 entfernt.';

create or replace function public.plan_signal_fit_check(p_date date)
returns table (contact_id uuid, mission_type text, title text, reason text, score int)
language sql stable security invoker set search_path = public
as $$
  select id, 'fit_check_next_step',
    '3-Way-Call mit ' || name || ' organisieren',
    'Fit Check ist abgeschlossen, jetzt entscheidet der nächste Schritt.',
    100
  from public.plan_contact_state()
  where fit_check_done and not three_way_done and max_rank < 60;
$$;

create or replace function public.plan_signal_next_step(p_date date)
returns table (contact_id uuid, mission_type text, title text, reason text, score int)
language sql stable security invoker set search_path = public
as $$
  select id, 'next_step_due',
    coalesce(next_step, 'Geplanten Schritt bei ' || name || ' erledigen'),
    case when next_step_due < p_date
      then 'Bei ' || name || ' seit ' || (p_date - next_step_due) || ' Tag(en) überfällig.'
      else 'Für heute bei ' || name || ' geplant.'
    end,
    case when next_step_due < p_date then 95 else 90 end
  from public.plan_contact_state()
  where next_step_due is not null and next_step_due <= p_date and max_rank < 70;
$$;

create or replace function public.plan_signal_presentation(p_date date)
returns table (contact_id uuid, mission_type text, title text, reason text, score int)
language sql stable security invoker set search_path = public
as $$
  select id, 'presentation_pending',
    'Bei ' || name || ' zur Präsentation nachfassen',
    'Präsentation vor ' || extract(day from now() - presentation_sent_at)::int ||
      ' Tagen gesendet, noch nicht angesehen.',
    80
  from public.plan_contact_state()
  where presentation_sent_at is not null
    and not presentation_viewed
    and presentation_sent_at < now() - interval '2 days'
    and max_rank < 60;
$$;

create or replace function public.plan_signal_follow_up(p_date date)
returns table (contact_id uuid, mission_type text, title text, reason text, score int)
language sql stable security invoker set search_path = public
as $$
  select id, 'follow_up_overdue',
    name || ' kontaktieren',
    'Seit ' || extract(day from now() - last_event_at)::int ||
      ' Tagen kein Kontakt, bleib präsent.',
    least(60 + extract(day from now() - last_event_at)::int, 75)
  from public.plan_contact_state()
  where last_event_at < now() - interval '7 days'
    and last_event_at >= now() - interval '14 days'
    and max_rank between 10 and 50;
$$;

create or replace function public.plan_signal_reactivate(p_date date)
returns table (contact_id uuid, mission_type text, title text, reason text, score int)
language sql stable security invoker set search_path = public
as $$
  select id, 'reactivate_contact',
    name || ' reaktivieren',
    'Seit ' || extract(day from now() - last_event_at)::int ||
      ' Tagen keine Aktivität, ein kurzes Lebenszeichen genügt.',
    50
  from public.plan_contact_state()
  where last_event_at < now() - interval '14 days' and max_rank < 60;
$$;

-- ============================================================
-- Teil 3: generate_daily_plan an die neuen Signaturen anpassen
--
-- Bleibt SECURITY DEFINER: Auf daily_plans und daily_plan_items
-- existiert bewusst keine INSERT-Policy, der Nutzer darf also
-- nicht selbst schreiben. Die Funktion ist der einzige Schreibweg.
-- Sie nimmt keinen Fremdparameter und ist damit nicht angreifbar.
--
-- Logik unveraendert gegenueber Migration 8, nur die Aufrufe.
-- ============================================================

create or replace function public.generate_daily_plan(p_date date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_org     uuid;
  v_plan_id uuid;
  v_count   int;
begin
  if v_user is null then
    raise exception 'AscendOS: Nicht angemeldet.';
  end if;

  select org_id into v_org from public.profiles where id = v_user;
  if v_org is null then
    raise exception 'AscendOS: Kein Profil gefunden.';
  end if;

  select id into v_plan_id
  from public.daily_plans where user_id = v_user and plan_date = p_date;
  if v_plan_id is not null then
    return v_plan_id;
  end if;

  insert into public.daily_plans (user_id, org_id, plan_date)
  values (v_user, v_org, p_date)
  returning id into v_plan_id;

  with candidates as (
    select * from public.plan_signal_fit_check(p_date)
    union all select * from public.plan_signal_next_step(p_date)
    union all select * from public.plan_signal_presentation(p_date)
    union all select * from public.plan_signal_follow_up(p_date)
    union all select * from public.plan_signal_reactivate(p_date)
  ),
  best_per_contact as (
    select distinct on (contact_id) *
    from candidates order by contact_id, score desc
  )
  insert into public.daily_plan_items
    (plan_id, contact_id, mission_type, title, reason, score, position)
  select v_plan_id, contact_id, mission_type, title, reason, score,
         row_number() over (order by score desc, title)
  from best_per_contact
  order by score desc, title
  limit 5;

  select count(*) into v_count
  from public.daily_plan_items where plan_id = v_plan_id;

  if v_count < 3 then
    insert into public.daily_plan_items
      (plan_id, contact_id, mission_type, title, reason, score, position)
    values (v_plan_id, null, 'new_contacts',
      'Drei neue Menschen ansprechen',
      'Frische Kontakte sind der Treibstoff deiner Pipeline.',
      30, v_count + 1);
  end if;

  return v_plan_id;
end;
$$;

-- ============================================================
-- Teil 4: get_downline, Organisationsfilter und Berechtigung
--
-- Parameter bleibt, weil eine Teamleitung die Struktur einer
-- anderen Person sehen soll (Roadmap Phase 5).
--
-- Leere Rueckgabe statt Ausnahme bei fehlender Berechtigung:
-- Eine Ausnahme wuerde bestaetigen, dass die Kennung existiert.
-- Eine leere Menge ist von einer nicht existierenden Wurzel nicht
-- unterscheidbar und verraet damit nichts.
-- ============================================================

create or replace function public.get_downline(root_user_id uuid)
returns table (user_id uuid, depth int)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_root_org uuid;
begin
  if auth.uid() is null then
    return; -- leere Menge
  end if;

  select org_id into v_root_org from public.profiles where id = root_user_id;
  if v_root_org is null then
    return; -- Wurzel existiert nicht: nicht unterscheidbar von "kein Zugriff"
  end if;

  -- Berechtigung ZUERST, damit die Rekursion bei fehlendem Zugriff
  -- gar nicht laeuft. Frueher Abbruch statt Filter am Ende.
  if not (
    root_user_id = auth.uid()
    or public.is_ancestor_of(root_user_id)
    or (public.is_super_admin() and v_root_org = public.current_org_id())
  ) then
    return; -- leere Menge, keine Ausnahme: verraet nicht, ob die Kennung existiert
  end if;

  return query
    with recursive downline as (
      select p.id as uid, 1 as lvl
      from public.profiles p
      where p.sponsor_id = root_user_id
        and p.org_id = v_root_org        -- Mandantengrenze, fehlte vor F1
      union all
      select p.id, d.lvl + 1
      from public.profiles p
      join downline d on p.sponsor_id = d.uid
      where p.org_id = v_root_org
    ) cycle uid set is_cycle using cycle_path
    -- Kreiserkennung, Begruendung siehe is_ancestor_of
    select d.uid, d.lvl from downline d where not d.is_cycle;
end;
$$;

comment on function public.get_downline(uuid) is
  'Downline einer Person. Seit F1 mit org_id-Filter und Berechtigungspruefung: Selbst, Upline oder super_admin derselben Organisation.';

-- ============================================================
-- Teil 5: coach_messages_today, Aufruferpruefung
--
-- Parameter bleibt, weil ein spaeterer Adminbereich Kontingente
-- je Nutzer anzeigen soll.
--
-- Hier ist eine Ausnahme richtig und keine leere Rueckgabe: Der
-- Wert steuert das Tageslimit im Coach. Eine stillschweigende
-- Null wuerde das Limit aushebeln.
-- ============================================================

create or replace function public.coach_messages_today(p_user uuid)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'AscendOS: Nicht angemeldet.';
  end if;

  if p_user <> auth.uid() then
    if not (
      public.is_super_admin()
      and exists (
        select 1 from public.profiles
        where id = p_user and org_id = public.current_org_id()
      )
    ) then
      raise exception 'AscendOS: Kein Zugriff auf fremde Nutzungsdaten.';
    end if;
  end if;

  return (
    select count(*)::int
    from public.coach_messages m
    join public.coach_convos c on c.id = m.convo_id
    where c.user_id = p_user
      and m.role = 'user'
      and m.created_at >= date_trunc('day', now())
  );
end;
$$;

-- ============================================================
-- Teil 6: track_usage, Aufruferpruefung
--
-- KORREKTUR gegenueber der ersten Fassung dieser Migration.
--
-- Die erste Fassung ging davon aus, track_usage habe keinen
-- Aufrufer. Das war falsch. Aufrufer ist der Trigger
-- log_contact_created, der in Migration 8 um
--   perform public.track_usage(new.owner_id, 'contact_created');
-- erweitert wurde. Der Trigger laeuft als SECURITY DEFINER unter
-- postgres, dort ist auth.uid() NULL, zum Beispiel in Tests, in
-- Migrationen und bei Aufrufen ueber service_role.
--
-- Eine harte Pruefung auf auth.uid() liess deshalb das Anlegen
-- eines Kontakts scheitern:
--   ERROR: AscendOS: Nicht angemeldet.
--   CONTEXT: track_usage <- log_contact_created
--
-- Zwei Aenderungen loesen das, ohne die Sicherheit zu senken:
--
-- 1. Die Eigentumspruefung greift nur, WENN eine Nutzersitzung
--    existiert. Ohne Sitzung ist der Aufrufer das System. Die
--    eigentliche Grenze sind die Ausfuehrungsrechte in Teil 9:
--    anon hat kein EXECUTE, also kann kein unangemeldeter
--    Aufrufer diesen Weg nutzen.
--
-- 2. WARNUNG statt AUSNAHME. Eine Nachverfolgungsfunktion darf
--    den Vorgang, den sie nachverfolgt, niemals abbrechen. Bei
--    einem Versuch fuer einen fremden Nutzer wird nichts
--    geschrieben und eine Warnung protokolliert. Der Kontakt
--    entsteht trotzdem.
--
-- Reichweite geprueft: Die Policy contacts_owner_all erzwingt
-- owner_id = auth.uid(). Ueber die API kann der Parameter also
-- nie abweichen. Die Pruefung ist zusaetzliche Tiefe, nicht die
-- Grenze.
-- ============================================================

create or replace function public.track_usage(p_user uuid, p_event text, p_meta jsonb default '{}')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Nur bei bestehender Nutzersitzung pruefen, Begruendung im Kopf.
  if auth.uid() is not null
     and p_user <> auth.uid()
     and not public.is_super_admin() then
    raise warning 'AscendOS: track_usage fuer fremden Nutzer abgewiesen, nichts geschrieben.';
    return;
  end if;

  begin
    insert into public.usage_events (user_id, org_id, event_type, metadata)
    select p_user, org_id, p_event, p_meta
    from public.profiles where id = p_user;
  exception when others then
    null; -- Tracking darf nie eine Kernfunktion brechen
  end;
end;
$$;

comment on function public.track_usage(uuid, text, jsonb) is
  'Nachverfolgung. Aufrufer ist der Trigger log_contact_created. Bricht nie den nachverfolgten Vorgang ab.';

-- ============================================================
-- Teil 7: match_knowledge, search_path und ehrlicher Parameter
--
-- KRITISCH: Der Typ vector und der Operator <=> liegen im Schema
-- extensions. Ein auf public festgenagelter Pfad wuerde die
-- Funktion sofort zerstoeren. Korrekt ist public, extensions.
--
-- p_org_id sah wie eine Berechtigungsgrenze aus, war aber keine.
-- Die Trennung leistet die Policy knowledge_docs_select_approved.
-- Der Parameter erhaelt eine Pruefung, damit er haelt, was er
-- suggeriert. coach-chat uebergibt profile.org_id, also die
-- eigene Organisation: kein Bruch.
-- ============================================================

create or replace function public.match_knowledge(
  query_embedding extensions.vector(1536),
  p_org_id uuid,
  match_categories text[] default null,
  match_count int default 5,
  min_similarity float default 0.25
)
returns table (doc_id uuid, doc_title text, category text, content text, similarity float)
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
begin
  if p_org_id is distinct from public.current_org_id()
     and not public.is_super_admin() then
    raise exception 'AscendOS: Kein Zugriff auf fremdes Organisationswissen.';
  end if;

  return query
    select d.id, d.title, d.category, c.content,
           1 - (c.embedding <=> query_embedding) as similarity
    from public.knowledge_chunks c
    join public.knowledge_docs d on d.id = c.doc_id
    where c.embedding is not null
      and d.org_id = p_org_id
      and (match_categories is null or d.category = any(match_categories))
      and 1 - (c.embedding <=> query_embedding) >= min_similarity
    order by c.embedding <=> query_embedding
    limit match_count;
end;
$$;

-- ============================================================
-- Teil 8: search_path bei den uebrigen Funktionen festnageln
--
-- Kein akuter Ausfall, aber Haertung. Bei
-- protect_profile_columns waere die Auswirkung gravierend: Die
-- Funktion setzt den Schutz vor Selbstbefoerderung durch und ruft
-- public.is_super_admin() auf. Ein manipulierbarer Suchpfad
-- wuerde diesen Schutz aushebeln.
--
-- Verhalten bleibt in allen drei Faellen unveraendert.
-- HINWEIS: set_updated_at wird auch von einem Trigger auf der
-- Tabelle products des Fremdprojekts genutzt. Das Festnageln des
-- Pfades aendert das Verhalten nicht.
-- ============================================================

alter function public.protect_profile_columns() set search_path = public;
alter function public.set_updated_at()          set search_path = public;
alter function public.event_phase_rank(text)    set search_path = public;

-- ============================================================
-- Teil 9: Ausfuehrungsrechte
--
-- Reihenfolge ist entscheidend: PUBLIC zuerst entziehen, dann
-- selektiv gewaehren. Ein Entzug von anon allein ist wirkungslos,
-- solange PUBLIC das Recht haelt. Genau daran ist [S-1] in
-- Migration 8 gescheitert.
--
-- ZWINGENDE AUSNAHME: current_org_id, is_super_admin und
-- current_user_role werden INNERHALB von RLS-Policies aufgerufen
-- (31, 19 und 1 Vorkommen). Eine Policy wird mit den Rechten der
-- abfragenden Rolle ausgewertet. Ohne EXECUTE fuer anon liefert
-- jede Abfrage dieser Rolle "permission denied for function"
-- statt eines leeren Ergebnisses. Diese drei behalten ihr Recht.
--
-- Trigger-Funktionen (handle_new_user, log_contact_created,
-- protect_profile_columns, set_updated_at) behalten ihre Rechte
-- ebenfalls. Sie sind nicht direkt aufrufbar: PL/pgSQL lehnt den
-- Direktaufruf einer Trigger-Funktion ab. Ein Entzug haette kein
-- Sicherheitsplus, koennte aber die Trigger-Ausfuehrung stoeren.
-- ============================================================

-- Vom Frontend genutzte RPC: nur authenticated und service_role
revoke execute on function public.check_achievements()                     from PUBLIC, anon;
revoke execute on function public.commit_daily_plan(uuid)                  from PUBLIC, anon;
revoke execute on function public.complete_journey_step(uuid)              from PUBLIC, anon;
revoke execute on function public.correct_pipeline_event(uuid)             from PUBLIC, anon;
revoke execute on function public.create_invite(text)                      from PUBLIC, anon;
revoke execute on function public.generate_daily_plan(date)                from PUBLIC, anon;
revoke execute on function public.update_mission_status(uuid, text, text)  from PUBLIC, anon;
revoke execute on function public.get_downline(uuid)                       from PUBLIC, anon;
revoke execute on function public.is_ancestor_of(uuid)                     from PUBLIC, anon;
revoke execute on function public.coach_messages_today(uuid)               from PUBLIC, anon;
revoke execute on function public.match_knowledge(extensions.vector, uuid, text[], int, float) from PUBLIC, anon;

grant execute on function public.check_achievements()                      to authenticated, service_role;
grant execute on function public.commit_daily_plan(uuid)                    to authenticated, service_role;
grant execute on function public.complete_journey_step(uuid)                to authenticated, service_role;
grant execute on function public.correct_pipeline_event(uuid)               to authenticated, service_role;
grant execute on function public.create_invite(text)                        to authenticated, service_role;
grant execute on function public.generate_daily_plan(date)                  to authenticated, service_role;
grant execute on function public.update_mission_status(uuid, text, text)    to authenticated, service_role;
grant execute on function public.get_downline(uuid)                         to authenticated, service_role;
grant execute on function public.is_ancestor_of(uuid)                       to authenticated, service_role;
grant execute on function public.coach_messages_today(uuid)                 to authenticated, service_role;
grant execute on function public.match_knowledge(extensions.vector, uuid, text[], int, float) to authenticated, service_role;

-- Planungsfunktionen: intern von generate_daily_plan genutzt.
-- authenticated bleibt erlaubt, weil ein Direktaufruf nach dem
-- Entfernen des Parameters nur eigene Daten liefern kann.
revoke execute on function public.plan_contact_state()          from PUBLIC, anon;
revoke execute on function public.plan_signal_fit_check(date)    from PUBLIC, anon;
revoke execute on function public.plan_signal_next_step(date)    from PUBLIC, anon;
revoke execute on function public.plan_signal_presentation(date) from PUBLIC, anon;
revoke execute on function public.plan_signal_follow_up(date)    from PUBLIC, anon;
revoke execute on function public.plan_signal_reactivate(date)   from PUBLIC, anon;

grant execute on function public.plan_contact_state()            to authenticated, service_role;
grant execute on function public.plan_signal_fit_check(date)      to authenticated, service_role;
grant execute on function public.plan_signal_next_step(date)      to authenticated, service_role;
grant execute on function public.plan_signal_presentation(date)   to authenticated, service_role;
grant execute on function public.plan_signal_follow_up(date)      to authenticated, service_role;
grant execute on function public.plan_signal_reactivate(date)     to authenticated, service_role;

-- validate_invite: laeuft ausschliesslich ueber die Edge Function
-- mit service_role. [S-1] aus Migration 8 wird hier wirksam
-- nachgezogen, weil jetzt auch PUBLIC entzogen wird.
revoke execute on function public.validate_invite(text) from PUBLIC, anon, authenticated;
grant  execute on function public.validate_invite(text) to service_role;

-- track_usage: schreibend, derzeit ohne Aufrufer.
revoke execute on function public.track_usage(uuid, text, jsonb) from PUBLIC, anon;
grant  execute on function public.track_usage(uuid, text, jsonb) to authenticated, service_role;

-- Policy-Helfer: Recht fuer anon MUSS bleiben, siehe Kopf dieses Teils.
-- Nur explizit bestaetigt, nicht veraendert.
grant execute on function public.current_org_id()    to anon, authenticated, service_role;
grant execute on function public.is_super_admin()    to anon, authenticated, service_role;
grant execute on function public.current_user_role() to anon, authenticated, service_role;
