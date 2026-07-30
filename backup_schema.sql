


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."check_achievements"() RETURNS SETOF "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user uuid := auth.uid();
  v_org  uuid;
  a record;
  v_ok boolean;
  v_needed int;
begin
  select org_id into v_org from public.profiles where id = v_user;
  if v_org is null then return; end if;

  for a in
    select * from public.achievements
    where org_id = v_org and is_active
      and id not in (select achievement_id from public.user_achievements
                     where user_id = v_user)
  loop
    v_needed := coalesce((a.condition ->> 'count')::int, 1);
    v_ok := case a.condition ->> 'type'
      when 'event_count' then (
        select count(*) >= v_needed
        from public.effective_pipeline_events e
        where e.created_by = v_user
          and e.event_type = a.condition ->> 'event_type'
      )
      when 'phase_count' then (
        select count(*) >= v_needed
        from public.contacts c
        where c.owner_id = v_user
          and (select coalesce(max(public.event_phase_rank(e.event_type)), 0)
               from public.effective_pipeline_events e
               where e.contact_id = c.id) >= (a.condition ->> 'min_rank')::int
      )
      when 'firstline_count' then (
        select count(*) >= v_needed
        from public.profiles p where p.sponsor_id = v_user
      )
      when 'downline_count' then (
        select count(*) >= v_needed from public.get_downline(v_user)
      )
      else false -- 'journey_completed' wird unten separat geprüft
    end;

    if a.condition ->> 'type' = 'journey_completed' then
      select exists (
        select 1
        from public.journeys j
        join public.profiles pr on pr.id = v_user
        where j.org_id = v_org and j.is_active
          and (j.team_id is null or j.team_id = pr.team_id)
          and (select count(*) from public.journey_steps s where s.journey_id = j.id)
            = (select count(*) from public.user_progress up
               join public.journey_steps s on s.id = up.step_id
               where up.user_id = v_user and s.journey_id = j.id)
          and (select count(*) from public.journey_steps s where s.journey_id = j.id) > 0
      ) into v_ok;
    end if;

    if v_ok then
      insert into public.user_achievements (user_id, achievement_id)
      values (v_user, a.id)
      on conflict do nothing;
      return next a.id;
    end if;
  end loop;
  return;
end;
$$;


ALTER FUNCTION "public"."check_achievements"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."coach_messages_today"("p_user" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select count(*)::int
  from public.coach_messages m
  join public.coach_convos c on c.id = m.convo_id
  where c.user_id = p_user
    and m.role = 'user'
    and m.created_at >= date_trunc('day', now());
$$;


ALTER FUNCTION "public"."coach_messages_today"("p_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."commit_daily_plan"("p_plan_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.daily_plans
  set committed_at = coalesce(committed_at, now())
  where id = p_plan_id and user_id = auth.uid();
  if not found then
    raise exception 'AscendOS: Plan nicht gefunden.';
  end if;
  perform public.track_usage(auth.uid(), 'plan_committed');
end;
$$;


ALTER FUNCTION "public"."commit_daily_plan"("p_plan_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_journey_step"("p_step_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user uuid := auth.uid();
  v_step public.journey_steps;
  v_unlocked_day int;
begin
  select s.* into v_step
  from public.journey_steps s
  join public.journeys j on j.id = s.journey_id
  join public.profiles pr on pr.id = v_user
  where s.id = p_step_id
    and j.org_id = pr.org_id
    and (j.team_id is null or j.team_id = pr.team_id)
    and j.is_active;
  if v_step.id is null then
    raise exception 'AscendOS: Schritt nicht gefunden.';
  end if;

  select coalesce(min(s.day_number), 1) into v_unlocked_day
  from public.journey_steps s
  left join public.user_progress up
    on up.step_id = s.id and up.user_id = v_user
  where s.journey_id = v_step.journey_id
    and up.step_id is null;

  if v_step.day_number > v_unlocked_day then
    raise exception 'AscendOS: Dieser Tag ist noch nicht freigeschaltet. Schließe erst die vorherigen Tage ab.';
  end if;

  insert into public.user_progress (user_id, step_id)
  values (v_user, p_step_id)
  on conflict do nothing;

  perform public.track_usage(v_user, 'journey_step_completed',
    jsonb_build_object('day', v_step.day_number));
end;
$$;


ALTER FUNCTION "public"."complete_journey_step"("p_step_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."correct_pipeline_event"("p_event_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_event public.pipeline_events;
  v_user  uuid := auth.uid();
begin
  select e.* into v_event
  from public.pipeline_events e
  join public.contacts c on c.id = e.contact_id
  where e.id = p_event_id and c.owner_id = v_user;

  if v_event.id is null then
    raise exception 'AscendOS: Ereignis nicht gefunden.';
  end if;
  if v_event.event_type in ('correction', 'contact_created') then
    raise exception 'AscendOS: Dieses Ereignis kann nicht korrigiert werden.';
  end if;
  if exists (
    select 1 from public.pipeline_events x
    where x.event_type = 'correction'
      and (x.payload ->> 'corrects_event_id')::uuid = p_event_id
  ) then
    raise exception 'AscendOS: Dieses Ereignis wurde bereits korrigiert.';
  end if;

  insert into public.pipeline_events
    (contact_id, org_id, event_type, source, payload, created_by)
  values (
    v_event.contact_id, v_event.org_id, 'correction', 'system',
    jsonb_build_object('corrects_event_id', p_event_id,
                       'corrected_event_type', v_event.event_type),
    v_user
  );
end;
$$;


ALTER FUNCTION "public"."correct_pipeline_event"("p_event_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_invite"("invite_role" "text" DEFAULT 'berater'::"text") RETURNS TABLE("invite_code" "text", "invite_expires_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."create_invite"("invite_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_org_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select org_id from public.profiles where id = auth.uid();
$$;


ALTER FUNCTION "public"."current_org_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select role from public.profiles where id = auth.uid();
$$;


ALTER FUNCTION "public"."current_user_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."event_phase_rank"("p_event_type" "text") RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case p_event_type
    when 'registered'          then 70
    when 'became_customer'     then 60
    when 'three_way_call_done' then 50
    when 'fit_check_completed' then 40
    when 'presentation_viewed' then 30
    when 'presentation_sent'   then 20
    when 'first_touch'         then 10
    else 0
  end;
$$;


ALTER FUNCTION "public"."event_phase_rank"("p_event_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_daily_plan"("p_date" "date") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user    uuid := auth.uid();
  v_org     uuid;
  v_plan_id uuid;
  v_count   int;
begin
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
    select * from public.plan_signal_fit_check(v_user, p_date)
    union all select * from public.plan_signal_next_step(v_user, p_date)
    union all select * from public.plan_signal_presentation(v_user, p_date)
    union all select * from public.plan_signal_follow_up(v_user, p_date)
    union all select * from public.plan_signal_reactivate(v_user, p_date)
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


ALTER FUNCTION "public"."generate_daily_plan"("p_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_downline"("root_user_id" "uuid") RETURNS TABLE("user_id" "uuid", "depth" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with recursive downline as (
    select p.id as user_id, 1 as depth
    from public.profiles p
    where p.sponsor_id = root_user_id
    union all
    select p.id, d.depth + 1
    from public.profiles p
    join downline d on p.sponsor_id = d.user_id
  )
  select user_id, depth from downline;
$$;


ALTER FUNCTION "public"."get_downline"("root_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_invite public.invites;
  v_code text;
  v_username text;
begin
  v_code := upper(trim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')));
  if v_code = '' then
    raise exception 'AscendOS: Registrierung ist nur mit Einladungscode möglich.';
  end if;

  select * into v_invite
  from public.invites
  where code = v_code
  for update; -- sperrt den Invite gegen parallele Einlösung

  if v_invite.id is null then
    raise exception 'AscendOS: Dieser Einladungscode existiert nicht.';
  end if;
  if v_invite.used_at is not null then
    raise exception 'AscendOS: Dieser Einladungscode wurde bereits verwendet.';
  end if;
  if v_invite.expires_at <= now() then
    raise exception 'AscendOS: Dieser Einladungscode ist abgelaufen.';
  end if;

  v_username := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', '')));
  if v_username !~ '^[a-z0-9_.]{3,30}$' then
    raise exception 'AscendOS: Benutzername muss 3-30 Zeichen lang sein (a-z, 0-9, Punkt, Unterstrich).';
  end if;
  if exists (select 1 from public.profiles where username = v_username) then
    raise exception 'AscendOS: Dieser Benutzername ist bereits vergeben.';
  end if;

  insert into public.profiles
    (id, org_id, team_id, sponsor_id, role, first_name, last_name, username, language)
  values (
    new.id,
    v_invite.org_id,
    v_invite.team_id,
    v_invite.sponsor_id,
    v_invite.role,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'first_name'), ''), 'Unbekannt'),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'last_name'), ''), ''),
    v_username,
    coalesce(nullif(new.raw_user_meta_data ->> 'language', ''), 'de')
  );

  update public.invites
  set used_by = new.id, used_at = now()
  where id = v_invite.id;

  return new;
end;
$_$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_super_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    (select role = 'super_admin' from public.profiles where id = auth.uid()),
    false
  );
$$;


ALTER FUNCTION "public"."is_super_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_contact_created"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.pipeline_events (contact_id, org_id, event_type, source, created_by)
  values (new.id, new.org_id, 'contact_created', 'system', new.owner_id);
  perform public.track_usage(new.owner_id, 'contact_created');
  return new;
end;
$$;


ALTER FUNCTION "public"."log_contact_created"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_knowledge"("query_embedding" "extensions"."vector", "p_org_id" "uuid", "match_categories" "text"[] DEFAULT NULL::"text"[], "match_count" integer DEFAULT 5, "min_similarity" double precision DEFAULT 0.25) RETURNS TABLE("doc_id" "uuid", "doc_title" "text", "category" "text", "content" "text", "similarity" double precision)
    LANGUAGE "sql" STABLE
    AS $$
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
$$;


ALTER FUNCTION "public"."match_knowledge"("query_embedding" "extensions"."vector", "p_org_id" "uuid", "match_categories" "text"[], "match_count" integer, "min_similarity" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."plan_contact_state"("p_user" "uuid") RETURNS TABLE("id" "uuid", "name" "text", "next_step" "text", "next_step_due" "date", "max_rank" integer, "last_event_at" timestamp with time zone, "presentation_sent_at" timestamp with time zone, "presentation_viewed" boolean, "fit_check_done" boolean, "three_way_done" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
  where c.owner_id = p_user
  group by c.id;
$$;


ALTER FUNCTION "public"."plan_contact_state"("p_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."plan_signal_fit_check"("p_user" "uuid", "p_date" "date") RETURNS TABLE("contact_id" "uuid", "mission_type" "text", "title" "text", "reason" "text", "score" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select id, 'fit_check_next_step',
    '3-Way-Call mit ' || name || ' organisieren',
    'Fit Check ist abgeschlossen — jetzt entscheidet der nächste Schritt.',
    100
  from public.plan_contact_state(p_user)
  where fit_check_done and not three_way_done and max_rank < 60;
$$;


ALTER FUNCTION "public"."plan_signal_fit_check"("p_user" "uuid", "p_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."plan_signal_follow_up"("p_user" "uuid", "p_date" "date") RETURNS TABLE("contact_id" "uuid", "mission_type" "text", "title" "text", "reason" "text", "score" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select id, 'follow_up_overdue',
    name || ' kontaktieren',
    'Seit ' || extract(day from now() - last_event_at)::int ||
      ' Tagen kein Kontakt — bleib präsent.',
    least(60 + extract(day from now() - last_event_at)::int, 75)
  from public.plan_contact_state(p_user)
  where last_event_at < now() - interval '7 days'
    and last_event_at >= now() - interval '14 days'
    and max_rank between 10 and 50;
$$;


ALTER FUNCTION "public"."plan_signal_follow_up"("p_user" "uuid", "p_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."plan_signal_next_step"("p_user" "uuid", "p_date" "date") RETURNS TABLE("contact_id" "uuid", "mission_type" "text", "title" "text", "reason" "text", "score" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select id, 'next_step_due',
    coalesce(next_step, 'Geplanten Schritt bei ' || name || ' erledigen'),
    case when next_step_due < p_date
      then 'Bei ' || name || ' seit ' || (p_date - next_step_due) || ' Tag(en) überfällig.'
      else 'Für heute bei ' || name || ' geplant.'
    end,
    case when next_step_due < p_date then 95 else 90 end
  from public.plan_contact_state(p_user)
  where next_step_due is not null and next_step_due <= p_date and max_rank < 70;
$$;


ALTER FUNCTION "public"."plan_signal_next_step"("p_user" "uuid", "p_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."plan_signal_presentation"("p_user" "uuid", "p_date" "date") RETURNS TABLE("contact_id" "uuid", "mission_type" "text", "title" "text", "reason" "text", "score" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select id, 'presentation_pending',
    'Bei ' || name || ' zur Präsentation nachfassen',
    'Präsentation vor ' || extract(day from now() - presentation_sent_at)::int ||
      ' Tagen gesendet, noch nicht angesehen.',
    80
  from public.plan_contact_state(p_user)
  where presentation_sent_at is not null
    and not presentation_viewed
    and presentation_sent_at < now() - interval '2 days'
    and max_rank < 60;
$$;


ALTER FUNCTION "public"."plan_signal_presentation"("p_user" "uuid", "p_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."plan_signal_reactivate"("p_user" "uuid", "p_date" "date") RETURNS TABLE("contact_id" "uuid", "mission_type" "text", "title" "text", "reason" "text", "score" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select id, 'reactivate_contact',
    name || ' reaktivieren',
    'Seit ' || extract(day from now() - last_event_at)::int ||
      ' Tagen keine Aktivität — ein kurzes Lebenszeichen genügt.',
    50
  from public.plan_contact_state(p_user)
  where last_event_at < now() - interval '14 days' and max_rank < 60;
$$;


ALTER FUNCTION "public"."plan_signal_reactivate"("p_user" "uuid", "p_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_profile_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if public.is_super_admin() then
    return new; -- Admins dürfen verwalten
  end if;

  if new.role       is distinct from old.role
  or new.org_id     is distinct from old.org_id
  or new.team_id    is distinct from old.team_id
  or new.sponsor_id is distinct from old.sponsor_id then
    raise exception 'AscendOS: Rolle, Organisation, Team und Sponsor können nicht selbst geändert werden.';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."protect_profile_columns"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."track_usage"("p_user" "uuid", "p_event" "text", "p_meta" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.usage_events (user_id, org_id, event_type, metadata)
  select p_user, org_id, p_event, p_meta from public.profiles where id = p_user;
exception when others then
  null; -- Tracking darf nie eine Kernfunktion brechen
end;
$$;


ALTER FUNCTION "public"."track_usage"("p_user" "uuid", "p_event" "text", "p_meta" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_mission_status"("p_item_id" "uuid", "p_status" "text", "p_reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_item public.daily_plan_items;
  v_user uuid := auth.uid();
  v_org  uuid;
begin
  if p_status not in ('pending', 'done', 'deferred', 'skipped') then
    raise exception 'AscendOS: Ungültiger Status.';
  end if;

  select i.* into v_item
  from public.daily_plan_items i
  join public.daily_plans p on p.id = i.plan_id
  where i.id = p_item_id and p.user_id = v_user;
  if v_item.id is null then
    raise exception 'AscendOS: Mission nicht gefunden.';
  end if;

  update public.daily_plan_items
  set status = p_status, status_reason = p_reason,
      resolved_at = case when p_status in ('done', 'skipped') then now() else null end
  where id = p_item_id;

  if p_status = 'done' and v_item.contact_id is not null then
    if v_item.mission_type in ('follow_up_overdue', 'reactivate_contact', 'presentation_pending') then
      select org_id into v_org from public.profiles where id = v_user;
      insert into public.pipeline_events (contact_id, org_id, event_type, source, created_by)
      values (v_item.contact_id, v_org, 'follow_up', 'system', v_user);
    elsif v_item.mission_type = 'next_step_due' then
      update public.contacts set next_step = null, next_step_due = null
      where id = v_item.contact_id and owner_id = v_user;
    end if;
  end if;

  if p_status = 'done' then
    perform public.track_usage(v_user, 'mission_completed',
      jsonb_build_object('mission_type', v_item.mission_type));
  elsif p_status = 'skipped' then
    perform public.track_usage(v_user, 'mission_skipped',
      jsonb_build_object('mission_type', v_item.mission_type, 'reason', p_reason));
  end if;
end;
$$;


ALTER FUNCTION "public"."update_mission_status"("p_item_id" "uuid", "p_status" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_invite"("invite_code" "text") RETURNS TABLE("org_name" "text", "team_name" "text", "sponsor_first_name" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    o.name,
    t.name,
    p.first_name
  from public.invites i
  join public.organizations o on o.id = i.org_id
  join public.teams t on t.id = i.team_id
  left join public.profiles p on p.id = i.sponsor_id
  where i.code = upper(trim(invite_code))
    and i.used_at is null
    and i.expires_at > now();
$$;


ALTER FUNCTION "public"."validate_invite"("invite_code" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."achievements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "icon" "text" DEFAULT '⭐'::"text" NOT NULL,
    "condition" "jsonb" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."achievements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "system_prompt" "text" NOT NULL,
    "retrieval_categories" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "model" "text" DEFAULT 'claude-sonnet-4-6'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."agents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_convos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "contact_id" "uuid",
    "agent_key" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."coach_convos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "convo_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "coach_messages_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'assistant'::"text"])))
);


ALTER TABLE "public"."coach_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text",
    "email" "text",
    "notes" "text",
    "next_step" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "next_step_due" "date"
);


ALTER TABLE "public"."contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pipeline_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pipeline_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['contact_created'::"text", 'first_touch'::"text", 'follow_up'::"text", 'presentation_sent'::"text", 'presentation_viewed'::"text", 'fit_check_sent'::"text", 'fit_check_completed'::"text", 'waytomoon_sent'::"text", 'three_way_call_done'::"text", 'party_scheduled'::"text", 'party_done'::"text", 'became_customer'::"text", 'registered'::"text", 'correction'::"text"]))),
    CONSTRAINT "pipeline_events_source_check" CHECK (("source" = ANY (ARRAY['manual'::"text", 'waytomoon'::"text", 'presentation'::"text", 'fitcheck'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."pipeline_events" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."effective_pipeline_events" WITH ("security_invoker"='true') AS
 SELECT "id",
    "contact_id",
    "org_id",
    "event_type",
    "source",
    "payload",
    "created_by",
    "occurred_at",
    "created_at"
   FROM "public"."pipeline_events" "e"
  WHERE (("event_type" <> 'correction'::"text") AND (NOT (EXISTS ( SELECT 1
           FROM "public"."pipeline_events" "x"
          WHERE (("x"."event_type" = 'correction'::"text") AND ((("x"."payload" ->> 'corrects_event_id'::"text"))::"uuid" = "e"."id"))))));


ALTER VIEW "public"."effective_pipeline_events" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."contact_phases" WITH ("security_invoker"='true') AS
 SELECT "c"."id" AS "contact_id",
    "c"."owner_id",
        CASE "max"("public"."event_phase_rank"("e"."event_type"))
            WHEN 70 THEN 'partner'::"text"
            WHEN 60 THEN 'kunde'::"text"
            WHEN 50 THEN 'three_way_call'::"text"
            WHEN 40 THEN 'fit_check'::"text"
            WHEN 30 THEN 'praesentation'::"text"
            WHEN 20 THEN 'praesentation_offen'::"text"
            WHEN 10 THEN 'im_gespraech'::"text"
            ELSE 'lead'::"text"
        END AS "phase",
    "max"("e"."occurred_at") AS "last_event_at"
   FROM ("public"."contacts" "c"
     LEFT JOIN "public"."effective_pipeline_events" "e" ON (("e"."contact_id" = "c"."id")))
  GROUP BY "c"."id", "c"."owner_id";


ALTER VIEW "public"."contact_phases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_plan_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "contact_id" "uuid",
    "mission_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "score" integer NOT NULL,
    "position" integer NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "status_reason" "text",
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "daily_plan_items_mission_type_check" CHECK (("mission_type" = ANY (ARRAY['fit_check_next_step'::"text", 'next_step_due'::"text", 'presentation_pending'::"text", 'follow_up_overdue'::"text", 'reactivate_contact'::"text", 'new_contacts'::"text"]))),
    CONSTRAINT "daily_plan_items_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'done'::"text", 'deferred'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."daily_plan_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "plan_date" "date" NOT NULL,
    "committed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."daily_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."duftnoten" (
    "nr" integer NOT NULL,
    "kopf" "text" DEFAULT ''::"text",
    "herz" "text" DEFAULT ''::"text",
    "basis" "text" DEFAULT ''::"text",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."duftnoten" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."external_tools" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "url" "text" NOT NULL,
    "share_event_type" "text" NOT NULL,
    "result_event_type" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."external_tools" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."journey_steps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "journey_id" "uuid" NOT NULL,
    "day_number" integer NOT NULL,
    "step_order" integer DEFAULT 1 NOT NULL,
    "title" "text" NOT NULL,
    "content_type" "text" DEFAULT 'task'::"text" NOT NULL,
    "content" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "journey_steps_content_type_check" CHECK (("content_type" = ANY (ARRAY['info'::"text", 'task'::"text", 'tool'::"text"]))),
    CONSTRAINT "journey_steps_day_number_check" CHECK (("day_number" >= 1))
);


ALTER TABLE "public"."journey_steps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."journeys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "team_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."journeys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "team_id" "uuid" NOT NULL,
    "sponsor_id" "uuid",
    "role" "text" DEFAULT 'berater'::"text" NOT NULL,
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "username" "text" NOT NULL,
    "phone" "text",
    "country" "text",
    "language" "text" DEFAULT 'de'::"text" NOT NULL,
    "avatar_url" "text",
    "goals" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['super_admin'::"text", 'leader'::"text", 'berater'::"text"]))),
    CONSTRAINT "profiles_username_check" CHECK (("username" ~ '^[a-z0-9_.]{3,30}$'::"text"))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."profiles_public" AS
 SELECT "id",
    "org_id",
    "team_id",
    "sponsor_id",
    "role",
    "first_name",
    "last_name",
    "username",
    "avatar_url"
   FROM "public"."profiles"
  WHERE ("org_id" = "public"."current_org_id"());


ALTER VIEW "public"."profiles_public" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_progress" (
    "user_id" "uuid" NOT NULL,
    "step_id" "uuid" NOT NULL,
    "completed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_progress" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."firstline_journey_progress" WITH ("security_invoker"='true') AS
 SELECT "p"."id" AS "user_id",
    "p"."first_name",
    "p"."username",
    "j"."id" AS "journey_id",
    "j"."title" AS "journey_title",
    "count"("s"."id") AS "total_steps",
    "count"("up"."step_id") AS "completed_steps",
    COALESCE("min"("s"."day_number") FILTER (WHERE ("up"."step_id" IS NULL)), ("max"("s"."day_number") + 1)) AS "current_day",
    "max"("s"."day_number") AS "total_days"
   FROM ((("public"."profiles_public" "p"
     JOIN "public"."journeys" "j" ON ((("j"."org_id" = "p"."org_id") AND (("j"."team_id" IS NULL) OR ("j"."team_id" = "p"."team_id")) AND "j"."is_active")))
     JOIN "public"."journey_steps" "s" ON (("s"."journey_id" = "j"."id")))
     LEFT JOIN "public"."user_progress" "up" ON ((("up"."step_id" = "s"."id") AND ("up"."user_id" = "p"."id"))))
  WHERE ("p"."sponsor_id" = "auth"."uid"())
  GROUP BY "p"."id", "p"."first_name", "p"."username", "j"."id", "j"."title";


ALTER VIEW "public"."firstline_journey_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invite_validation_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ip" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."invite_validation_attempts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "team_id" "uuid" NOT NULL,
    "sponsor_id" "uuid",
    "role" "text" DEFAULT 'berater'::"text" NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '14 days'::interval) NOT NULL,
    "used_by" "uuid",
    "used_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "invites_role_check" CHECK (("role" = ANY (ARRAY['super_admin'::"text", 'leader'::"text", 'berater'::"text"])))
);


ALTER TABLE "public"."invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kabelkatalog_state" (
    "key" "text" NOT NULL,
    "value" "jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."kabelkatalog_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."knowledge_chunks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "doc_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "chunk_index" integer NOT NULL,
    "content" "text" NOT NULL,
    "embedding" "extensions"."vector"(1536),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."knowledge_chunks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."knowledge_docs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "team_id" "uuid",
    "title" "text" NOT NULL,
    "category" "text" NOT NULL,
    "language" "text" DEFAULT 'de'::"text" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "author_id" "uuid",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "source_type" "text" DEFAULT 'document'::"text" NOT NULL,
    "valid_from" timestamp with time zone DEFAULT "now"() NOT NULL,
    "valid_until" timestamp with time zone,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "supersedes_doc_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "knowledge_docs_source_type_check" CHECK (("source_type" = ANY (ARRAY['document'::"text", 'transcript'::"text", 'faq'::"text", 'guideline'::"text", 'best_practice'::"text"]))),
    CONSTRAINT "knowledge_docs_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'approved'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."knowledge_docs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."knowledge_gaps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "agent_key" "text" NOT NULL,
    "question" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."knowledge_gaps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "branding" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "code" "text",
    "price" "text",
    "description" "text",
    "category" "text",
    "ingredients" "text",
    "usage_info" "text",
    "availability" "text",
    "image_url" "text",
    "created_by" "text",
    "updated_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "details" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teams" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "parent_team_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."teams" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."usage_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "usage_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['app_opened'::"text", 'plan_committed'::"text", 'mission_completed'::"text", 'mission_skipped'::"text", 'coach_message_sent'::"text", 'contact_created'::"text", 'journey_step_completed'::"text"])))
);


ALTER TABLE "public"."usage_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_achievements" (
    "user_id" "uuid" NOT NULL,
    "achievement_id" "uuid" NOT NULL,
    "unlocked_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_achievements" OWNER TO "postgres";


ALTER TABLE ONLY "public"."achievements"
    ADD CONSTRAINT "achievements_org_id_key_key" UNIQUE ("org_id", "key");



ALTER TABLE ONLY "public"."achievements"
    ADD CONSTRAINT "achievements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agents"
    ADD CONSTRAINT "agents_org_id_key_key" UNIQUE ("org_id", "key");



ALTER TABLE ONLY "public"."agents"
    ADD CONSTRAINT "agents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_convos"
    ADD CONSTRAINT "coach_convos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_messages"
    ADD CONSTRAINT "coach_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_plan_items"
    ADD CONSTRAINT "daily_plan_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_plans"
    ADD CONSTRAINT "daily_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_plans"
    ADD CONSTRAINT "daily_plans_user_id_plan_date_key" UNIQUE ("user_id", "plan_date");



ALTER TABLE ONLY "public"."duftnoten"
    ADD CONSTRAINT "duftnoten_pkey" PRIMARY KEY ("nr");



ALTER TABLE ONLY "public"."external_tools"
    ADD CONSTRAINT "external_tools_org_id_key_key" UNIQUE ("org_id", "key");



ALTER TABLE ONLY "public"."external_tools"
    ADD CONSTRAINT "external_tools_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invite_validation_attempts"
    ADD CONSTRAINT "invite_validation_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."journey_steps"
    ADD CONSTRAINT "journey_steps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."journeys"
    ADD CONSTRAINT "journeys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kabelkatalog_state"
    ADD CONSTRAINT "kabelkatalog_state_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."knowledge_chunks"
    ADD CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."knowledge_docs"
    ADD CONSTRAINT "knowledge_docs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."knowledge_gaps"
    ADD CONSTRAINT "knowledge_gaps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pipeline_events"
    ADD CONSTRAINT "pipeline_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."usage_events"
    ADD CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_pkey" PRIMARY KEY ("user_id", "achievement_id");



ALTER TABLE ONLY "public"."user_progress"
    ADD CONSTRAINT "user_progress_pkey" PRIMARY KEY ("user_id", "step_id");



CREATE INDEX "coach_convos_user_idx" ON "public"."coach_convos" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "coach_messages_convo_idx" ON "public"."coach_messages" USING "btree" ("convo_id", "created_at");



CREATE INDEX "contacts_org_id_idx" ON "public"."contacts" USING "btree" ("org_id");



CREATE INDEX "contacts_owner_id_idx" ON "public"."contacts" USING "btree" ("owner_id");



CREATE INDEX "daily_plan_items_plan_idx" ON "public"."daily_plan_items" USING "btree" ("plan_id", "position");



CREATE INDEX "daily_plans_user_date_idx" ON "public"."daily_plans" USING "btree" ("user_id", "plan_date" DESC);



CREATE INDEX "invite_attempts_ip_idx" ON "public"."invite_validation_attempts" USING "btree" ("ip", "created_at" DESC);



CREATE INDEX "invites_code_idx" ON "public"."invites" USING "btree" ("code");



CREATE INDEX "invites_sponsor_id_idx" ON "public"."invites" USING "btree" ("sponsor_id");



CREATE INDEX "journey_steps_journey_idx" ON "public"."journey_steps" USING "btree" ("journey_id", "day_number", "step_order");



CREATE INDEX "knowledge_chunks_doc_idx" ON "public"."knowledge_chunks" USING "btree" ("doc_id");



CREATE INDEX "knowledge_chunks_embedding_idx" ON "public"."knowledge_chunks" USING "hnsw" ("embedding" "extensions"."vector_cosine_ops");



CREATE INDEX "pipeline_events_contact_idx" ON "public"."pipeline_events" USING "btree" ("contact_id", "occurred_at" DESC);



CREATE INDEX "pipeline_events_correction_idx" ON "public"."pipeline_events" USING "btree" ((("payload" ->> 'corrects_event_id'::"text"))) WHERE ("event_type" = 'correction'::"text");



CREATE INDEX "pipeline_events_created_by_idx" ON "public"."pipeline_events" USING "btree" ("created_by", "occurred_at" DESC);



CREATE INDEX "profiles_org_id_idx" ON "public"."profiles" USING "btree" ("org_id");



CREATE INDEX "profiles_sponsor_id_idx" ON "public"."profiles" USING "btree" ("sponsor_id");



CREATE INDEX "profiles_team_id_idx" ON "public"."profiles" USING "btree" ("team_id");



CREATE INDEX "teams_org_id_idx" ON "public"."teams" USING "btree" ("org_id");



CREATE INDEX "usage_events_org_idx" ON "public"."usage_events" USING "btree" ("org_id", "event_type", "created_at" DESC);



CREATE INDEX "usage_events_user_idx" ON "public"."usage_events" USING "btree" ("user_id", "created_at" DESC);



CREATE OR REPLACE TRIGGER "contacts_log_created" AFTER INSERT ON "public"."contacts" FOR EACH ROW EXECUTE FUNCTION "public"."log_contact_created"();



CREATE OR REPLACE TRIGGER "contacts_set_updated_at" BEFORE UPDATE ON "public"."contacts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "profiles_protect_columns" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."protect_profile_columns"();



CREATE OR REPLACE TRIGGER "profiles_set_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_products_updated" BEFORE UPDATE ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."achievements"
    ADD CONSTRAINT "achievements_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agents"
    ADD CONSTRAINT "agents_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_convos"
    ADD CONSTRAINT "coach_convos_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."coach_convos"
    ADD CONSTRAINT "coach_convos_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_convos"
    ADD CONSTRAINT "coach_convos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_messages"
    ADD CONSTRAINT "coach_messages_convo_id_fkey" FOREIGN KEY ("convo_id") REFERENCES "public"."coach_convos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_plan_items"
    ADD CONSTRAINT "daily_plan_items_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_plan_items"
    ADD CONSTRAINT "daily_plan_items_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."daily_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_plans"
    ADD CONSTRAINT "daily_plans_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_plans"
    ADD CONSTRAINT "daily_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."external_tools"
    ADD CONSTRAINT "external_tools_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_sponsor_id_fkey" FOREIGN KEY ("sponsor_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_used_by_fkey" FOREIGN KEY ("used_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."journey_steps"
    ADD CONSTRAINT "journey_steps_journey_id_fkey" FOREIGN KEY ("journey_id") REFERENCES "public"."journeys"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."journeys"
    ADD CONSTRAINT "journeys_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."journeys"
    ADD CONSTRAINT "journeys_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."knowledge_chunks"
    ADD CONSTRAINT "knowledge_chunks_doc_id_fkey" FOREIGN KEY ("doc_id") REFERENCES "public"."knowledge_docs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."knowledge_chunks"
    ADD CONSTRAINT "knowledge_chunks_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."knowledge_docs"
    ADD CONSTRAINT "knowledge_docs_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."knowledge_docs"
    ADD CONSTRAINT "knowledge_docs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."knowledge_docs"
    ADD CONSTRAINT "knowledge_docs_supersedes_doc_id_fkey" FOREIGN KEY ("supersedes_doc_id") REFERENCES "public"."knowledge_docs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."knowledge_docs"
    ADD CONSTRAINT "knowledge_docs_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."knowledge_gaps"
    ADD CONSTRAINT "knowledge_gaps_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."knowledge_gaps"
    ADD CONSTRAINT "knowledge_gaps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pipeline_events"
    ADD CONSTRAINT "pipeline_events_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pipeline_events"
    ADD CONSTRAINT "pipeline_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pipeline_events"
    ADD CONSTRAINT "pipeline_events_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_sponsor_id_fkey" FOREIGN KEY ("sponsor_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_parent_team_id_fkey" FOREIGN KEY ("parent_team_id") REFERENCES "public"."teams"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."usage_events"
    ADD CONSTRAINT "usage_events_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."usage_events"
    ADD CONSTRAINT "usage_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_achievement_id_fkey" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_progress"
    ADD CONSTRAINT "user_progress_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "public"."journey_steps"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_progress"
    ADD CONSTRAINT "user_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE "public"."achievements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "achievements_admin_all" ON "public"."achievements" USING (("public"."is_super_admin"() AND ("org_id" = "public"."current_org_id"())));



CREATE POLICY "achievements_select_member" ON "public"."achievements" FOR SELECT USING ((("org_id" = "public"."current_org_id"()) AND "is_active"));



ALTER TABLE "public"."agents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agents_admin_all" ON "public"."agents" USING (("public"."is_super_admin"() AND ("org_id" = "public"."current_org_id"())));



CREATE POLICY "agents_select_member" ON "public"."agents" FOR SELECT USING ((("org_id" = "public"."current_org_id"()) AND "is_active"));



ALTER TABLE "public"."coach_convos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coach_convos_own" ON "public"."coach_convos" USING (("user_id" = "auth"."uid"())) WITH CHECK ((("user_id" = "auth"."uid"()) AND ("org_id" = "public"."current_org_id"())));



ALTER TABLE "public"."coach_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coach_messages_own" ON "public"."coach_messages" USING ((EXISTS ( SELECT 1
   FROM "public"."coach_convos" "c"
  WHERE (("c"."id" = "coach_messages"."convo_id") AND ("c"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."coach_convos" "c"
  WHERE (("c"."id" = "coach_messages"."convo_id") AND ("c"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."contacts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "contacts_owner_all" ON "public"."contacts" USING (("owner_id" = "auth"."uid"())) WITH CHECK ((("owner_id" = "auth"."uid"()) AND ("org_id" = "public"."current_org_id"())));



ALTER TABLE "public"."daily_plan_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "daily_plan_items_select_own" ON "public"."daily_plan_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."daily_plans" "p"
  WHERE (("p"."id" = "daily_plan_items"."plan_id") AND ("p"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."daily_plans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "daily_plans_select_own" ON "public"."daily_plans" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."duftnoten" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "duftnoten_all" ON "public"."duftnoten" USING (true) WITH CHECK (true);



ALTER TABLE "public"."external_tools" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "external_tools_admin_insert" ON "public"."external_tools" FOR INSERT WITH CHECK (("public"."is_super_admin"() AND ("org_id" = "public"."current_org_id"())));



CREATE POLICY "external_tools_admin_update" ON "public"."external_tools" FOR UPDATE USING (("public"."is_super_admin"() AND ("org_id" = "public"."current_org_id"())));



CREATE POLICY "external_tools_select_member" ON "public"."external_tools" FOR SELECT USING ((("org_id" = "public"."current_org_id"()) AND "is_active"));



ALTER TABLE "public"."invite_validation_attempts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invites_select_own" ON "public"."invites" FOR SELECT USING ((("created_by" = "auth"."uid"()) OR ("public"."is_super_admin"() AND ("org_id" = "public"."current_org_id"()))));



ALTER TABLE "public"."journey_steps" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "journey_steps_admin_all" ON "public"."journey_steps" USING (("public"."is_super_admin"() AND (EXISTS ( SELECT 1
   FROM "public"."journeys" "j"
  WHERE (("j"."id" = "journey_steps"."journey_id") AND ("j"."org_id" = "public"."current_org_id"()))))));



CREATE POLICY "journey_steps_select_member" ON "public"."journey_steps" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."journeys" "j"
  WHERE ("j"."id" = "journey_steps"."journey_id"))));



ALTER TABLE "public"."journeys" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "journeys_admin_all" ON "public"."journeys" USING (("public"."is_super_admin"() AND ("org_id" = "public"."current_org_id"())));



CREATE POLICY "journeys_select_member" ON "public"."journeys" FOR SELECT USING ((("org_id" = "public"."current_org_id"()) AND (("team_id" IS NULL) OR ("team_id" = ( SELECT "profiles"."team_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) AND "is_active"));



ALTER TABLE "public"."knowledge_chunks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "knowledge_chunks_admin_write" ON "public"."knowledge_chunks" USING (("public"."is_super_admin"() AND ("org_id" = "public"."current_org_id"())));



CREATE POLICY "knowledge_chunks_select" ON "public"."knowledge_chunks" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."knowledge_docs" "d"
  WHERE ("d"."id" = "knowledge_chunks"."doc_id"))));



ALTER TABLE "public"."knowledge_docs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "knowledge_docs_admin_write" ON "public"."knowledge_docs" USING (("public"."is_super_admin"() AND ("org_id" = "public"."current_org_id"())));



CREATE POLICY "knowledge_docs_select_approved" ON "public"."knowledge_docs" FOR SELECT USING ((("org_id" = "public"."current_org_id"()) AND ((("status" = 'approved'::"text") AND (("valid_until" IS NULL) OR ("valid_until" > "now"())) AND (("team_id" IS NULL) OR ("team_id" = ( SELECT "profiles"."team_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))))) OR "public"."is_super_admin"())));



ALTER TABLE "public"."knowledge_gaps" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "knowledge_gaps_admin_select" ON "public"."knowledge_gaps" FOR SELECT USING (("public"."is_super_admin"() AND ("org_id" = "public"."current_org_id"())));



CREATE POLICY "knowledge_gaps_insert_own" ON "public"."knowledge_gaps" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND ("org_id" = "public"."current_org_id"())));



ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "organizations_select_member" ON "public"."organizations" FOR SELECT USING (("id" = "public"."current_org_id"()));



CREATE POLICY "organizations_update_admin" ON "public"."organizations" FOR UPDATE USING (("public"."is_super_admin"() AND ("id" = "public"."current_org_id"())));



ALTER TABLE "public"."pipeline_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pipeline_events_insert_owner" ON "public"."pipeline_events" FOR INSERT WITH CHECK ((("created_by" = "auth"."uid"()) AND ("org_id" = "public"."current_org_id"()) AND (EXISTS ( SELECT 1
   FROM "public"."contacts" "c"
  WHERE (("c"."id" = "pipeline_events"."contact_id") AND ("c"."owner_id" = "auth"."uid"()))))));



CREATE POLICY "pipeline_events_select_owner" ON "public"."pipeline_events" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."contacts" "c"
  WHERE (("c"."id" = "pipeline_events"."contact_id") AND ("c"."owner_id" = "auth"."uid"())))));



ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "products_read" ON "public"."products" FOR SELECT USING (true);



CREATE POLICY "products_write" ON "public"."products" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_admin_update" ON "public"."profiles" FOR UPDATE USING (("public"."is_super_admin"() AND ("org_id" = "public"."current_org_id"())));



CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT USING ((("id" = "auth"."uid"()) OR ("public"."is_super_admin"() AND ("org_id" = "public"."current_org_id"()))));



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE USING (("id" = "auth"."uid"()));



ALTER TABLE "public"."teams" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "teams_admin_insert" ON "public"."teams" FOR INSERT WITH CHECK (("public"."is_super_admin"() AND ("org_id" = "public"."current_org_id"())));



CREATE POLICY "teams_admin_update" ON "public"."teams" FOR UPDATE USING (("public"."is_super_admin"() AND ("org_id" = "public"."current_org_id"())));



CREATE POLICY "teams_select_member" ON "public"."teams" FOR SELECT USING (("org_id" = "public"."current_org_id"()));



ALTER TABLE "public"."usage_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "usage_events_insert_own" ON "public"."usage_events" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND ("org_id" = "public"."current_org_id"())));



CREATE POLICY "usage_events_select_own_or_admin" ON "public"."usage_events" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR ("public"."is_super_admin"() AND ("org_id" = "public"."current_org_id"()))));



ALTER TABLE "public"."user_achievements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_achievements_select_own" ON "public"."user_achievements" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."user_progress" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_progress_select_own_or_sponsor" ON "public"."user_progress" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "user_progress"."user_id") AND ("p"."sponsor_id" = "auth"."uid"()))))));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";












































































































































































































































































































































































































































































































GRANT ALL ON FUNCTION "public"."check_achievements"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_achievements"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_achievements"() TO "service_role";



GRANT ALL ON FUNCTION "public"."coach_messages_today"("p_user" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."coach_messages_today"("p_user" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."coach_messages_today"("p_user" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."commit_daily_plan"("p_plan_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."commit_daily_plan"("p_plan_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."commit_daily_plan"("p_plan_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."complete_journey_step"("p_step_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."complete_journey_step"("p_step_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_journey_step"("p_step_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."correct_pipeline_event"("p_event_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."correct_pipeline_event"("p_event_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."correct_pipeline_event"("p_event_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_invite"("invite_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_invite"("invite_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_invite"("invite_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."current_org_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_org_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_org_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_user_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."event_phase_rank"("p_event_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."event_phase_rank"("p_event_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."event_phase_rank"("p_event_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_daily_plan"("p_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_daily_plan"("p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_daily_plan"("p_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_downline"("root_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_downline"("root_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_downline"("root_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_contact_created"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_contact_created"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_contact_created"() TO "service_role";






GRANT ALL ON FUNCTION "public"."plan_contact_state"("p_user" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."plan_contact_state"("p_user" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."plan_contact_state"("p_user" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."plan_signal_fit_check"("p_user" "uuid", "p_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."plan_signal_fit_check"("p_user" "uuid", "p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."plan_signal_fit_check"("p_user" "uuid", "p_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."plan_signal_follow_up"("p_user" "uuid", "p_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."plan_signal_follow_up"("p_user" "uuid", "p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."plan_signal_follow_up"("p_user" "uuid", "p_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."plan_signal_next_step"("p_user" "uuid", "p_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."plan_signal_next_step"("p_user" "uuid", "p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."plan_signal_next_step"("p_user" "uuid", "p_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."plan_signal_presentation"("p_user" "uuid", "p_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."plan_signal_presentation"("p_user" "uuid", "p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."plan_signal_presentation"("p_user" "uuid", "p_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."plan_signal_reactivate"("p_user" "uuid", "p_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."plan_signal_reactivate"("p_user" "uuid", "p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."plan_signal_reactivate"("p_user" "uuid", "p_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."protect_profile_columns"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_profile_columns"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_profile_columns"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."track_usage"("p_user" "uuid", "p_event" "text", "p_meta" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_mission_status"("p_item_id" "uuid", "p_status" "text", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_mission_status"("p_item_id" "uuid", "p_status" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_mission_status"("p_item_id" "uuid", "p_status" "text", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_invite"("invite_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_invite"("invite_code" "text") TO "service_role";






























GRANT ALL ON TABLE "public"."achievements" TO "anon";
GRANT ALL ON TABLE "public"."achievements" TO "authenticated";
GRANT ALL ON TABLE "public"."achievements" TO "service_role";



GRANT ALL ON TABLE "public"."agents" TO "anon";
GRANT ALL ON TABLE "public"."agents" TO "authenticated";
GRANT ALL ON TABLE "public"."agents" TO "service_role";



GRANT ALL ON TABLE "public"."coach_convos" TO "anon";
GRANT ALL ON TABLE "public"."coach_convos" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_convos" TO "service_role";



GRANT ALL ON TABLE "public"."coach_messages" TO "anon";
GRANT ALL ON TABLE "public"."coach_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_messages" TO "service_role";



GRANT ALL ON TABLE "public"."contacts" TO "anon";
GRANT ALL ON TABLE "public"."contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."contacts" TO "service_role";



GRANT ALL ON TABLE "public"."pipeline_events" TO "anon";
GRANT ALL ON TABLE "public"."pipeline_events" TO "authenticated";
GRANT ALL ON TABLE "public"."pipeline_events" TO "service_role";



GRANT ALL ON TABLE "public"."effective_pipeline_events" TO "anon";
GRANT ALL ON TABLE "public"."effective_pipeline_events" TO "authenticated";
GRANT ALL ON TABLE "public"."effective_pipeline_events" TO "service_role";



GRANT ALL ON TABLE "public"."contact_phases" TO "anon";
GRANT ALL ON TABLE "public"."contact_phases" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_phases" TO "service_role";



GRANT ALL ON TABLE "public"."daily_plan_items" TO "anon";
GRANT ALL ON TABLE "public"."daily_plan_items" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_plan_items" TO "service_role";



GRANT ALL ON TABLE "public"."daily_plans" TO "anon";
GRANT ALL ON TABLE "public"."daily_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_plans" TO "service_role";



GRANT ALL ON TABLE "public"."duftnoten" TO "anon";
GRANT ALL ON TABLE "public"."duftnoten" TO "authenticated";
GRANT ALL ON TABLE "public"."duftnoten" TO "service_role";



GRANT ALL ON TABLE "public"."external_tools" TO "anon";
GRANT ALL ON TABLE "public"."external_tools" TO "authenticated";
GRANT ALL ON TABLE "public"."external_tools" TO "service_role";



GRANT ALL ON TABLE "public"."journey_steps" TO "anon";
GRANT ALL ON TABLE "public"."journey_steps" TO "authenticated";
GRANT ALL ON TABLE "public"."journey_steps" TO "service_role";



GRANT ALL ON TABLE "public"."journeys" TO "anon";
GRANT ALL ON TABLE "public"."journeys" TO "authenticated";
GRANT ALL ON TABLE "public"."journeys" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."profiles_public" TO "anon";
GRANT ALL ON TABLE "public"."profiles_public" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles_public" TO "service_role";



GRANT ALL ON TABLE "public"."user_progress" TO "anon";
GRANT ALL ON TABLE "public"."user_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."user_progress" TO "service_role";



GRANT ALL ON TABLE "public"."firstline_journey_progress" TO "anon";
GRANT ALL ON TABLE "public"."firstline_journey_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."firstline_journey_progress" TO "service_role";



GRANT ALL ON TABLE "public"."invite_validation_attempts" TO "anon";
GRANT ALL ON TABLE "public"."invite_validation_attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."invite_validation_attempts" TO "service_role";



GRANT ALL ON TABLE "public"."invites" TO "anon";
GRANT ALL ON TABLE "public"."invites" TO "authenticated";
GRANT ALL ON TABLE "public"."invites" TO "service_role";



GRANT ALL ON TABLE "public"."kabelkatalog_state" TO "anon";
GRANT ALL ON TABLE "public"."kabelkatalog_state" TO "authenticated";
GRANT ALL ON TABLE "public"."kabelkatalog_state" TO "service_role";



GRANT ALL ON TABLE "public"."knowledge_chunks" TO "anon";
GRANT ALL ON TABLE "public"."knowledge_chunks" TO "authenticated";
GRANT ALL ON TABLE "public"."knowledge_chunks" TO "service_role";



GRANT ALL ON TABLE "public"."knowledge_docs" TO "anon";
GRANT ALL ON TABLE "public"."knowledge_docs" TO "authenticated";
GRANT ALL ON TABLE "public"."knowledge_docs" TO "service_role";



GRANT ALL ON TABLE "public"."knowledge_gaps" TO "anon";
GRANT ALL ON TABLE "public"."knowledge_gaps" TO "authenticated";
GRANT ALL ON TABLE "public"."knowledge_gaps" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."teams" TO "anon";
GRANT ALL ON TABLE "public"."teams" TO "authenticated";
GRANT ALL ON TABLE "public"."teams" TO "service_role";



GRANT ALL ON TABLE "public"."usage_events" TO "anon";
GRANT ALL ON TABLE "public"."usage_events" TO "authenticated";
GRANT ALL ON TABLE "public"."usage_events" TO "service_role";



GRANT ALL ON TABLE "public"."user_achievements" TO "anon";
GRANT ALL ON TABLE "public"."user_achievements" TO "authenticated";
GRANT ALL ON TABLE "public"."user_achievements" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































