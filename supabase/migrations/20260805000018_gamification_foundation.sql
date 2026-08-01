-- ============================================================
-- Migration 18, Sprint 4: Fundament des Gamification-Systems
--
-- SETZT MIGRATIONEN 15 BIS 17 VORAUS. Ohne `memberships` schlaegt
-- diese Migration fehl -- absichtlich, statt eine Uebergangsloesung
-- fuer den alten Stand einzubauen (Vorgabe des Betreibers vom
-- 31. Juli 2026: keine technischen Schulden).
--
-- LEITSATZ: Kataloge sind Daten, keine Konstanten im Code.
-- Ein neuer Rang, ein anderer Punktwert, eine neue Season, ein
-- anderer Auszahlungsbetrag ist ein Datensatz -- keine Auslieferung.
-- Das ist die wortwoertliche Vorgabe: "Die Punktewerte duerfen nicht
-- fest im Code stehen."
--
-- VERBINDLICHE REGELN, die hier strukturell durchgesetzt werden:
--   1. AP gehoeren zur MITGLIEDSCHAFT (ap_ledger.membership_id)
--   2. Die 100 Euro gehoeren zur IDENTITAET und koennen NIE zweimal
--      entstehen (payouts UNIQUE (identity_id, kind))
--   3. Das System zahlt NIEMALS selbst aus. Es erzeugt einen Anspruch;
--      ein Mensch bestaetigt (payouts.confirmed_paid_at)
--   4. Rollen bleiben unveraendert -- memberships.role wird NICHT
--      angefasst (Vorgabe: "Rollenmodell bleibt unveraendert")
--   5. Raenge und Rahmen sind oeffentlich, Rollen nicht
-- ============================================================


-- ============================================================
-- 1. Gepufferte AP-Summe an der Mitgliedschaft
--
-- Warum ein gepufferter Wert und nicht immer eine Aggregation ueber
-- das Register: Bestenlisten und die Rangermittlung lesen diesen Wert
-- bei JEDEM Seitenaufruf. Eine Summierung ueber ein wachsendes
-- Register waere dort der erste Engpass.
--
-- Die Wahrheit bleibt das Register (ap_ledger). Dieser Wert ist eine
-- Projektion, per Trigger gepflegt und mit ap_recalculate() jederzeit
-- nachrechenbar.
--
-- Nicht von protect_membership_columns betroffen: jener Trigger
-- schuetzt role, org_id, team_id, sponsor_membership_id, status und
-- identity_id -- ap_total ist bewusst nicht darunter, weil es kein
-- Identitaets- oder Berechtigungsmerkmal ist.
-- ============================================================

alter table public.memberships
  add column if not exists ap_total integer not null default 0;

create index if not exists memberships_ap_total_idx
  on public.memberships (org_id, ap_total desc)
  where status = 'active';

comment on column public.memberships.ap_total is
  'Gepufferte Summe aus ap_ledger. Wahrheit ist das Register; mit ap_recalculate() nachrechenbar.';


-- ============================================================
-- 2. Seasons
--
-- Von Anfang an vorhanden, auch wenn Sprint 4 nur eine Season kennt.
-- Nachtraeglich eingefuegt waere jede Zeile in ap_rules, cosmetic_items
-- und ap_ledger ohne Season-Bezug -- und damit nicht rueckwirkend
-- zuordenbar.
-- ============================================================

create table if not exists public.seasons (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete restrict,
  key        text not null,
  label      text not null,
  starts_at  timestamptz not null,
  ends_at    timestamptz,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, key)
);

comment on table public.seasons is
  'Zeitabschnitte fuer Punktesaetze, Rahmen, Titel und Belohnungen.';


-- ============================================================
-- 3. Punkteregeln -- die Antwort auf "welche Aktivitaet bringt wie
--    viele AP", als DATEN
--
-- `source_kind` erlaubt bewusst ZWEI Quellen:
--   'pipeline_event'  Geschaeftsereignisse (Kontakt, Follow-up,
--                     Praesentation, Party, Kunde ...) -- 14 Typen
--   'usage_event'     Nutzungsereignisse (app_opened, plan_committed,
--                     journey_step_completed ...) -- 6 Typen
--
-- Damit ist auch die spaetere Streak-Belohnung (app_opened) ohne
-- Codeaenderung konfigurierbar, genau wie verlangt.
--
-- `event_type` ist ABSICHTLICH nicht per Fremdschluessel an die
-- CHECK-Liste von pipeline_events gebunden: neue Ereignisarten sollen
-- ohne Migration Punkte tragen koennen.
--
-- Zeitliche Gueltigkeit (valid_from/valid_until) statt Ueberschreiben:
-- eine Aenderung des Punktwerts darf die Vergangenheit nicht
-- umschreiben. Das Register haelt fest, welche Regel damals galt.
-- ============================================================

create table if not exists public.ap_rules (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete restrict,
  source_kind text not null check (source_kind in ('pipeline_event','usage_event','manual')),
  event_type  text not null,
  ap          integer not null default 0,
  season_id   uuid references public.seasons(id) on delete set null,
  valid_from  timestamptz not null default now(),
  valid_until timestamptz,
  is_active   boolean not null default true,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Hoechstens EINE aktive Regel je Organisation, Quelle, Ereignisart
-- und Season. Verhindert, dass ein Ereignis versehentlich doppelt
-- bepunktet wird, weil zwei Regeln gleichzeitig greifen.
create unique index if not exists ap_rules_one_active
  on public.ap_rules (org_id, source_kind, event_type, coalesce(season_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where is_active;

create index if not exists ap_rules_lookup_idx
  on public.ap_rules (org_id, source_kind, event_type) where is_active;

create trigger ap_rules_updated_at
  before update on public.ap_rules
  for each row execute function public.set_updated_at();

comment on table public.ap_rules is
  'Zuordnung Ereignisart -> Punktwert. Frei konfigurierbar, keine Werte im Code.';


-- ============================================================
-- 4. Punkteregister -- fortschreibend, nachrechenbar, korrigierbar
--
-- Warum ein Register und kein blosser Zaehler:
--   - Die 100 Euro haengen daran. Ein Zaehler ohne Herkunft ist nicht
--     pruefbar.
--   - `pipeline_events` kennt den Typ 'correction'. AP muessen also
--     rueckholbar sein -- als GEGENBUCHUNG, nicht als Loeschung.
--   - Die Anzeige "+25 AP" braucht eine Quelle.
--   - ap_total ist jederzeit daraus neu berechenbar.
--
-- `on delete restrict` auf die Mitgliedschaft: Punktehistorie ist ein
-- Geschaeftsvorfall, sinngemaess zu F2 Aenderung Ae6.
-- ============================================================

create table if not exists public.ap_ledger (
  id              uuid primary key default gen_random_uuid(),
  membership_id   uuid not null references public.memberships(id) on delete restrict,
  delta           integer not null,
  reason          text not null,
  rule_id         uuid references public.ap_rules(id) on delete set null,
  source_kind     text not null check (source_kind in ('pipeline_event','usage_event','manual','correction')),
  -- Bewusst OHNE Fremdschluessel: die Quelle kann pipeline_events ODER
  -- usage_events sein. Ein Fremdschluessel auf beide gleichzeitig ist
  -- nicht darstellbar; die Herkunft steht in source_kind.
  source_event_id uuid,
  season_id       uuid references public.seasons(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- IDEMPOTENZ: je Quellereignis und Regel genau eine Buchung. Ein
-- erneut ausgeloester Trigger kann keine zweite Gutschrift erzeugen.
create unique index if not exists ap_ledger_once_per_event_rule
  on public.ap_ledger (source_event_id, rule_id)
  where source_event_id is not null and rule_id is not null;

create index if not exists ap_ledger_membership_idx
  on public.ap_ledger (membership_id, created_at desc);

comment on table public.ap_ledger is
  'Fortschreibendes Punkteregister. Korrekturen sind Gegenbuchungen, keine Loeschungen.';


-- ============================================================
-- 5. Rangkatalog
--
-- Als Tabelle, nicht als Enum oder Konstante: "Diese Werte sollen
-- spaeter leicht anpassbar sein" und "Neue Raenge" ohne Migration.
--
-- `payout_cents` und `payout_kind` liegen HIER, nicht im Code: damit
-- ist die 100-Euro-Belohnung an den Rang Team Leader gebunden, aber
-- Betrag und Schwelle bleiben konfigurierbar. Kein 30000 und kein
-- 10000 steht irgendwo fest.
-- ============================================================

create table if not exists public.ranks (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete restrict,
  key          text not null,
  label        text not null,
  threshold_ap integer not null check (threshold_ap >= 0),
  frame_asset  text,
  payout_cents integer check (payout_cents is null or payout_cents > 0),
  payout_kind  text,
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (org_id, key),
  -- Zwei Raenge auf derselben Schwelle waeren mehrdeutig.
  unique (org_id, threshold_ap),
  -- Ein Auszahlungsbetrag ohne Art (oder umgekehrt) waere unvollstaendig.
  check ((payout_cents is null) = (payout_kind is null))
);

create trigger ranks_updated_at
  before update on public.ranks
  for each row execute function public.set_updated_at();

comment on table public.ranks is
  'Rangkatalog: Schwelle, Rahmen und optionale Einmalbelohnung. Frei anpassbar.';


-- ============================================================
-- 6. Kosmetische Inhalte -- EIN Katalog fuer alles
--
-- Rahmen, Titel, Sticker und Eventobjekte in einer Tabelle, nach dem
-- Muster, das `achievements` im Bestand bereits verwendet. Damit
-- braucht ein neuer Titel, ein neuer Rahmen oder eine neue Season
-- keine neue Tabelle.
--
-- `unlock_condition` nutzt dieselbe jsonb-Form wie
-- `achievements.condition` -- die vorhandene Regelmaschine wird
-- erweitert, nicht verdoppelt.
--
-- BEKANNTE GRENZE, bewusst so: Besitz haengt an der MITGLIEDSCHAFT,
-- konsequent zur bestaetigten Regel "AP gehoeren zur Mitgliedschaft".
-- Ein Titel wie "Founder" koennte fachlich zur Identitaet gehoeren --
-- die Frage ist offen. Falls gewuenscht, ist das eine ERGAENZENDE
-- Tabelle `identity_cosmetics` mit demselben Aufbau, kein Umbau.
-- ============================================================

create table if not exists public.cosmetic_items (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete restrict,
  kind             text not null check (kind in ('frame','title','badge','event_object')),
  key              text not null,
  label            text not null,
  asset_path       text,
  season_id        uuid references public.seasons(id) on delete set null,
  -- Gehoert dieser Gegenstand zu einem Rang? Dann wird er beim
  -- Erreichen automatisch freigeschaltet.
  rank_key         text,
  unlock_condition jsonb,
  sort_order       integer not null default 0,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  unique (org_id, kind, key)
);

create index if not exists cosmetic_items_rank_idx
  on public.cosmetic_items (org_id, rank_key) where rank_key is not null;

comment on table public.cosmetic_items is
  'Katalog aller kosmetischen Inhalte: Rahmen, Titel, Sticker, Eventobjekte. Season-faehig.';

create table if not exists public.membership_cosmetics (
  membership_id uuid not null references public.memberships(id) on delete restrict,
  item_id       uuid not null references public.cosmetic_items(id) on delete cascade,
  -- Absichtlich verdoppelt aus cosmetic_items: nur so ist die Regel
  -- "hoechstens ein ausgeruesteter Gegenstand JE ART" als partieller
  -- Index durchsetzbar. Ein Index kann nicht auf eine andere Tabelle
  -- greifen. Wird vom Trigger unten konsistent gehalten.
  kind          text not null check (kind in ('frame','title','badge','event_object')),
  unlocked_at   timestamptz not null default now(),
  is_equipped   boolean not null default false,
  primary key (membership_id, item_id)
);

create unique index if not exists membership_cosmetics_one_equipped_per_kind
  on public.membership_cosmetics (membership_id, kind)
  where is_equipped;

create index if not exists membership_cosmetics_membership_idx
  on public.membership_cosmetics (membership_id);


-- ============================================================
-- 7. Auszahlungsansprueche
--
-- DAS WICHTIGSTE ELEMENT DIESER MIGRATION.
--
-- `unique (identity_id, kind)` macht eine Doppelauszahlung
-- STRUKTURELL unmoeglich -- auf Datenbankebene, nicht in
-- Anwendungslogik, die man vergessen oder umgehen kann.
--
-- An der IDENTITAET, nicht an der Mitgliedschaft: F2 FD-2 erlaubt
-- Wiedereintritt, der eine NEUE Mitgliedschaft erzeugt. Laege der
-- Anspruch an der Mitgliedschaft, wuerde Austritt und Wiedereintritt
-- eine zweite Auszahlung ausloesen. Genau das ist ausgeschlossen.
--
-- ZWEI GETRENNTE ZEITPUNKTE, bewusst:
--   entitled_at        das System erkennt den Anspruch (automatisch)
--   confirmed_paid_at  ein MENSCH bestaetigt die Zahlung (manuell)
-- Eine automatische Geldbewegung, ausgeloest von einem Punktestand,
-- waere eine Haftung. Das System zahlt nicht.
--
-- `on delete restrict`: aufbewahrungspflichtiger Geschaeftsvorfall,
-- F2 Aenderung Ae6.
-- ============================================================

create table if not exists public.payouts (
  id                        uuid primary key default gen_random_uuid(),
  identity_id               uuid not null references public.profiles(id) on delete restrict,
  kind                      text not null,
  amount_cents              integer not null check (amount_cents > 0),
  currency                  text not null default 'EUR',
  entitled_at               timestamptz not null default now(),
  confirmed_paid_at         timestamptz,
  confirmed_by              uuid references public.profiles(id) on delete set null,
  -- Nur Nachweis, welche Mitgliedschaft den Anspruch ausgeloest hat.
  -- Nicht die Grundlage der Einmaligkeit -- die ist identity_id.
  awarded_for_membership_id uuid references public.memberships(id) on delete set null,
  note                      text,
  created_at                timestamptz not null default now(),
  unique (identity_id, kind)
);

comment on table public.payouts is
  'Auszahlungsansprueche. UNIQUE(identity_id, kind) garantiert Einmaligkeit ueber Austritt und Wiedereintritt hinweg. Das System zahlt NICHT selbst aus.';


-- ============================================================
-- 8. Berater des Monats
-- ============================================================

create table if not exists public.monthly_awards (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete restrict,
  -- Erster Tag des Monats, als Kennzeichen des Zeitraums.
  period        date not null,
  place         integer not null check (place between 1 and 3),
  membership_id uuid not null references public.memberships(id) on delete restrict,
  ap_in_period  integer not null,
  created_at    timestamptz not null default now(),
  unique (org_id, period, place),
  -- Dieselbe Person kann nicht zwei Plaetze belegen.
  unique (org_id, period, membership_id)
);

comment on table public.monthly_awards is
  'Monatliche Auszeichnung, Plaetze 1 bis 3. Kein Rang.';


-- ============================================================
-- 9. Punktevergabe aus Ereignissen
--
-- EIN Trigger fuer beide Faelle. Das ist moeglich, weil
-- `correct_pipeline_event()` im Bestand eine Korrektur als NEUES
-- Ereignis vom Typ 'correction' anlegt, mit
-- payload.corrected_event_type -- das Original bleibt stehen. Eine
-- Korrektur ist damit fuer diesen Trigger einfach ein weiteres
-- Ereignis, das eine Gegenbuchung erzeugt.
--
-- Doppelkorrektur ist bereits dort ausgeschlossen; hier greift
-- zusaetzlich das partielle Unique auf (source_event_id, rule_id).
--
-- WICHTIG: `created_by` statt `auth.uid()`. Der Trigger
-- `log_contact_created` schreibt Ereignisse OHNE Nutzersitzung -- das
-- hat in Sprint 0 bereits `track_usage` zum Absturz gebracht. Aus
-- diesem Fehler gelernt.
-- ============================================================

create or replace function public.ap_award_from_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_identity    uuid;
  v_org         uuid;
  v_event_type  text;
  v_source_kind text;
  v_membership  uuid;
  v_rule        public.ap_rules;
  v_orig_type   text;
begin
  if TG_TABLE_NAME = 'pipeline_events' then
    v_identity := new.created_by; v_org := new.org_id;
    v_event_type := new.event_type; v_source_kind := 'pipeline_event';
  elsif TG_TABLE_NAME = 'usage_events' then
    v_identity := new.user_id; v_org := new.org_id;
    v_event_type := new.event_type; v_source_kind := 'usage_event';
  else
    return new;
  end if;

  -- Systemereignis ohne Zuordnung: keine Punkte, kein Fehler.
  if v_identity is null or v_org is null then return new; end if;

  select m.id into v_membership
  from public.memberships m
  where m.identity_id = v_identity and m.org_id = v_org and m.status = 'active';

  -- Keine aktive Mitgliedschaft: keine Punkte. Bewusst still, damit
  -- ein Ereignis nie am Punktesystem scheitert.
  if v_membership is null then return new; end if;

  -- ---------- Korrektur: Gegenbuchung ----------
  if v_source_kind = 'pipeline_event' and v_event_type = 'correction' then
    v_orig_type := new.payload ->> 'corrected_event_type';
    if v_orig_type is null then return new; end if;

    select * into v_rule from public.ap_rules r
    where r.org_id = v_org and r.source_kind = 'pipeline_event'
      and r.event_type = v_orig_type and r.is_active
      and r.valid_from <= now()
      and (r.valid_until is null or r.valid_until > now())
    limit 1;

    if v_rule.id is null or v_rule.ap = 0 then return new; end if;

    insert into public.ap_ledger
      (membership_id, delta, reason, rule_id, source_kind, source_event_id, season_id)
    values (v_membership, -v_rule.ap, 'Korrektur: ' || v_orig_type,
            v_rule.id, 'correction', new.id, v_rule.season_id)
    on conflict do nothing;
    return new;
  end if;

  -- ---------- Normalfall ----------
  select * into v_rule from public.ap_rules r
  where r.org_id = v_org and r.source_kind = v_source_kind
    and r.event_type = v_event_type and r.is_active
    and r.valid_from <= now()
    and (r.valid_until is null or r.valid_until > now())
  limit 1;

  -- Keine Regel oder Wert 0: nichts buchen. So bleibt ein
  -- unkonfiguriertes System funktionsfaehig, es vergibt nur nichts.
  if v_rule.id is null or v_rule.ap = 0 then return new; end if;

  insert into public.ap_ledger
    (membership_id, delta, reason, rule_id, source_kind, source_event_id, season_id)
  values (v_membership, v_rule.ap, v_event_type,
          v_rule.id, v_source_kind, new.id, v_rule.season_id)
  on conflict do nothing;

  return new;
end;
$$;

create trigger pipeline_events_award_ap
  after insert on public.pipeline_events
  for each row execute function public.ap_award_from_event();

create trigger usage_events_award_ap
  after insert on public.usage_events
  for each row execute function public.ap_award_from_event();


-- ============================================================
-- 10. Register wirkt auf die gepufferte Summe, Rang und Anspruch
--
-- Reihenfolge im Trigger ist bewusst: erst Summe, dann Kosmetik,
-- dann Auszahlungsanspruch. Der Anspruch entsteht als LETZTES, damit
-- er auf einem bereits konsistenten Stand beruht.
-- ============================================================

create or replace function public.ap_apply_to_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total    integer;
  v_org      uuid;
  v_identity uuid;
  v_rank     record;
begin
  update public.memberships
  set ap_total = ap_total + new.delta
  where id = new.membership_id
  returning ap_total, org_id, identity_id into v_total, v_org, v_identity;

  if v_org is null then return new; end if;

  -- Rangbezogene Kosmetik freischalten. `kind` setzt der eigene
  -- Trigger membership_cosmetics_kind_sync.
  insert into public.membership_cosmetics (membership_id, item_id, kind)
  select new.membership_id, ci.id, ci.kind
  from public.cosmetic_items ci
  join public.ranks r on r.org_id = ci.org_id and r.key = ci.rank_key
  where ci.org_id = v_org and ci.is_active
    and ci.rank_key is not null and r.is_active
    and r.threshold_ap <= v_total
  on conflict (membership_id, item_id) do nothing;

  -- Auszahlungsanspruch. Das UNIQUE (identity_id, kind) plus
  -- ON CONFLICT DO NOTHING ist die Einmaligkeitsgarantie:
  -- strukturell, nicht durch Anwendungslogik.
  --
  -- Es entsteht ausschliesslich ein ANSPRUCH. confirmed_paid_at bleibt
  -- leer, bis ein Mensch bestaetigt.
  for v_rank in
    select * from public.ranks
    where org_id = v_org and is_active
      and payout_cents is not null and threshold_ap <= v_total
  loop
    insert into public.payouts
      (identity_id, kind, amount_cents, awarded_for_membership_id, note)
    values (v_identity, v_rank.payout_kind, v_rank.payout_cents, new.membership_id,
            'Automatisch erkannt beim Erreichen von ' || v_rank.label)
    on conflict (identity_id, kind) do nothing;
  end loop;

  return new;
end;
$$;

create trigger ap_ledger_apply_total
  after insert on public.ap_ledger
  for each row execute function public.ap_apply_to_total();


-- ============================================================
-- 11. Hilfsfunktionen
-- ============================================================

/** Haelt das verdoppelte `kind` in membership_cosmetics konsistent.
 *  Ein Index kann nicht auf eine andere Tabelle greifen -- deshalb
 *  liegt `kind` dort gespiegelt und wird hier gesetzt, nie von Hand. */
create or replace function public.membership_cosmetics_sync_kind()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  select ci.kind into new.kind from public.cosmetic_items ci where ci.id = new.item_id;
  if new.kind is null then
    raise exception 'AscendOS: Unbekannter kosmetischer Gegenstand.';
  end if;
  return new;
end;
$$;

create trigger membership_cosmetics_kind_sync
  before insert or update of item_id on public.membership_cosmetics
  for each row execute function public.membership_cosmetics_sync_kind();

/** Rang zu einem Punktestand. Rein, ohne Sitzungsbezug -- damit auch
 *  fuer Bestenlisten und Vorschauen nutzbar. */
create or replace function public.rank_for_ap(p_org_id uuid, p_ap integer)
returns table (key text, label text, threshold_ap integer, frame_asset text, sort_order integer)
language sql
stable
set search_path = public
as $$
  select r.key, r.label, r.threshold_ap, r.frame_asset, r.sort_order
  from public.ranks r
  where r.org_id = p_org_id and r.is_active and r.threshold_ap <= p_ap
  order by r.threshold_ap desc
  limit 1;
$$;

/** Naechste Schwelle. Liefert NULL beim hoechsten Rang -- der Aufrufer
 *  zeigt dann keinen Fortschritt zur naechsten Stufe, sondern den
 *  Endstand. */
create or replace function public.next_rank_for_ap(p_org_id uuid, p_ap integer)
returns table (key text, label text, threshold_ap integer)
language sql
stable
set search_path = public
as $$
  select r.key, r.label, r.threshold_ap
  from public.ranks r
  where r.org_id = p_org_id and r.is_active and r.threshold_ap > p_ap
  order by r.threshold_ap asc
  limit 1;
$$;

/** Neuberechnung der gepufferten Summe aus dem Register.
 *  Pruefwerkzeug und Reparatur -- nur fuer Super-Admins, weil es einen
 *  abweichenden Puffer stillschweigend ueberschreibt. */
create or replace function public.ap_recalculate(p_membership_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_sum integer;
begin
  if not public.is_super_admin() then
    raise exception 'AscendOS: Nur Super-Admins koennen Punkte neu berechnen.';
  end if;
  if not exists (select 1 from public.memberships m
                 where m.id = p_membership_id and m.org_id = public.current_org_id()) then
    raise exception 'AscendOS: Mitgliedschaft nicht in dieser Organisation.';
  end if;
  select coalesce(sum(delta), 0) into v_sum
  from public.ap_ledger where membership_id = p_membership_id;
  update public.memberships set ap_total = v_sum where id = p_membership_id;
  return v_sum;
end;
$$;


-- ============================================================
-- 12. Zeilenrechte
--
-- Muster wie im Bestand: Kataloge sind fuer Mitglieder der
-- Organisation lesbar und nur fuer Super-Admins schreibbar. Das
-- Punkteregister ist fuer Nutzer NUR lesbar -- geschrieben wird
-- ausschliesslich vom Trigger, der SECURITY DEFINER ist.
--
-- Bewusste Entscheidung zur OEFFENTLICHKEIT, nach der bestaetigten
-- Regel "Raenge und Profilrahmen sind oeffentlich sichtbar, Rollen
-- nicht": `membership_cosmetics` und `monthly_awards` sind fuer die
-- ganze Organisation lesbar. `ap_ledger` ist es NICHT -- der
-- Punktestand einer anderen Person ist nicht jedermanns Sache, nur
-- der daraus abgeleitete Rang.
-- ============================================================

alter table public.seasons              enable row level security;
alter table public.ap_rules             enable row level security;
alter table public.ap_ledger            enable row level security;
alter table public.ranks                enable row level security;
alter table public.cosmetic_items       enable row level security;
alter table public.membership_cosmetics enable row level security;
alter table public.payouts              enable row level security;
alter table public.monthly_awards       enable row level security;

-- ---------- Kataloge: lesen alle Mitglieder, schreiben nur Super-Admin
create policy seasons_select_org on public.seasons for select
  using (org_id = public.current_org_id());
create policy seasons_admin_write on public.seasons for all
  using (public.is_super_admin() and org_id = public.current_org_id())
  with check (public.is_super_admin() and org_id = public.current_org_id());

create policy ap_rules_select_org on public.ap_rules for select
  using (org_id = public.current_org_id());
create policy ap_rules_admin_write on public.ap_rules for all
  using (public.is_super_admin() and org_id = public.current_org_id())
  with check (public.is_super_admin() and org_id = public.current_org_id());

create policy ranks_select_org on public.ranks for select
  using (org_id = public.current_org_id());
create policy ranks_admin_write on public.ranks for all
  using (public.is_super_admin() and org_id = public.current_org_id())
  with check (public.is_super_admin() and org_id = public.current_org_id());

create policy cosmetic_items_select_org on public.cosmetic_items for select
  using (org_id = public.current_org_id());
create policy cosmetic_items_admin_write on public.cosmetic_items for all
  using (public.is_super_admin() and org_id = public.current_org_id())
  with check (public.is_super_admin() and org_id = public.current_org_id());

-- ---------- Punkteregister: NUR lesen, und nur den eigenen Stand
-- Kein INSERT, UPDATE oder DELETE fuer Nutzer. Geschrieben wird
-- ausschliesslich von ap_award_from_event() (SECURITY DEFINER).
create policy ap_ledger_select_own on public.ap_ledger for select
  using (
    membership_id = public.active_membership_id()
    or (
      public.is_super_admin()
      and exists (select 1 from public.memberships m
                  where m.id = ap_ledger.membership_id
                    and m.org_id = public.current_org_id())
    )
  );

-- ---------- Kosmetik: oeffentlich in der Organisation, weil Rahmen
-- oeffentlich sind. Aendern darf man nur die eigene Ausruestung.
create policy membership_cosmetics_select_org on public.membership_cosmetics for select
  using (
    exists (select 1 from public.memberships m
            where m.id = membership_cosmetics.membership_id
              and m.org_id = public.current_org_id())
  );

create policy membership_cosmetics_equip_own on public.membership_cosmetics for update
  using (membership_id = public.active_membership_id())
  with check (membership_id = public.active_membership_id());

create policy membership_cosmetics_admin_write on public.membership_cosmetics for all
  using (
    public.is_super_admin()
    and exists (select 1 from public.memberships m
                where m.id = membership_cosmetics.membership_id
                  and m.org_id = public.current_org_id())
  )
  with check (
    public.is_super_admin()
    and exists (select 1 from public.memberships m
                where m.id = membership_cosmetics.membership_id
                  and m.org_id = public.current_org_id())
  );

-- ---------- Ansprueche: eigene sehen. Kein Schreiben durch Nutzer.
-- Der Super-Admin sieht die Ansprueche seiner Organisation, damit er
-- sie bestaetigen kann -- ueber awarded_for_membership_id, weil
-- payouts absichtlich kein org_id hat (der Anspruch gehoert zur
-- Identitaet, nicht zur Organisation).
create policy payouts_select_own on public.payouts for select
  using (
    identity_id = auth.uid()
    or (
      public.is_super_admin()
      and exists (select 1 from public.memberships m
                  where m.id = payouts.awarded_for_membership_id
                    and m.org_id = public.current_org_id())
    )
  );

-- Nur die Bestaetigung der Zahlung, und nur durch Super-Admin.
create policy payouts_admin_confirm on public.payouts for update
  using (
    public.is_super_admin()
    and exists (select 1 from public.memberships m
                where m.id = payouts.awarded_for_membership_id
                  and m.org_id = public.current_org_id())
  )
  with check (
    public.is_super_admin()
    and exists (select 1 from public.memberships m
                where m.id = payouts.awarded_for_membership_id
                  and m.org_id = public.current_org_id())
  );

-- ---------- Auszeichnung: oeffentlich in der Organisation
create policy monthly_awards_select_org on public.monthly_awards for select
  using (org_id = public.current_org_id());
create policy monthly_awards_admin_write on public.monthly_awards for all
  using (public.is_super_admin() and org_id = public.current_org_id())
  with check (public.is_super_admin() and org_id = public.current_org_id());


-- ============================================================
-- 13. Ausfuehrungs- und Tabellenrechte
--
-- Muster aus der Security Baseline: PUBLIC zuerst entziehen, dann
-- selektiv gewaehren. Ein Entzug von anon allein ist wirkungslos,
-- solange PUBLIC das Recht haelt.
--
-- Keine dieser neuen Funktionen wird INNERHALB einer RLS-Policy
-- aufgerufen -- deshalb brauchen sie, anders als current_org_id() und
-- is_super_admin(), kein EXECUTE fuer anon.
-- ============================================================

revoke execute on function public.rank_for_ap(uuid, integer)      from PUBLIC, anon;
revoke execute on function public.next_rank_for_ap(uuid, integer) from PUBLIC, anon;
revoke execute on function public.ap_recalculate(uuid)            from PUBLIC, anon;

grant execute on function public.rank_for_ap(uuid, integer)      to authenticated, service_role;
grant execute on function public.next_rank_for_ap(uuid, integer) to authenticated, service_role;
grant execute on function public.ap_recalculate(uuid)            to authenticated, service_role;

grant select on public.seasons, public.ap_rules, public.ranks,
               public.cosmetic_items, public.ap_ledger,
               public.membership_cosmetics, public.payouts,
               public.monthly_awards to authenticated;

grant update on public.membership_cosmetics to authenticated;  -- nur is_equipped, per Policy
grant update on public.payouts to authenticated;               -- nur Bestaetigung, per Policy

grant all on public.seasons, public.ap_rules, public.ranks,
             public.cosmetic_items, public.ap_ledger,
             public.membership_cosmetics, public.payouts,
             public.monthly_awards to service_role;


-- ============================================================
-- 14. Startdaten
--
-- Fuer JEDE bestehende Organisation, nicht nur die eine vorhandene --
-- damit eine spaeter angelegte Organisation nicht ohne Rangkatalog
-- dasteht.
--
-- PUNKTWERTE ABSICHTLICH ALLE 0. Der Betreiber hat am 31. Juli 2026
-- ausdruecklich festgelegt, die Werte spaeter selbst zu bestimmen. Die
-- Zeilen existieren, damit die vollstaendige Liste sichtbar ist und
-- nur die Zahl geaendert werden muss -- ohne Migration, ohne
-- Auslieferung. Bei ap = 0 bucht der Trigger nichts.
-- ============================================================

-- ---------- Raenge: sieben erspielbare Stufen ----------
-- frame_asset haelt einen SCHLUESSEL, keinen Pfad. Die Oberflaeche
-- waehlt daraus die passende Groesse (96 px in Listen, 320 px im
-- Profil), ohne dass die Datenbank Bildgroessen kennt.
insert into public.ranks (org_id, key, label, threshold_ap, frame_asset, payout_cents, payout_kind, sort_order)
select o.id, v.key, v.label, v.threshold, v.frame, v.cents, v.pkind, v.ord
from public.organizations o
cross join (values
  ('newcomer',    'Newcomer',     0,     'frame-01', null::integer, null::text, 1),
  ('active',      'Active',       250,   'frame-02', null,          null,       2),
  ('consistent',  'Consistent',   1250,  'frame-03', null,          null,       3),
  ('elite',       'Elite',        5000,  'frame-04', null,          null,       4),
  ('legend',      'Legend',       15000, 'frame-05', null,          null,       5),
  -- Die einmalige Belohnung haengt HIER, nicht im Code.
  ('team_leader', 'Team Leader',  30000, 'frame-06', 10000, 'team_leader_bonus', 6),
  ('mentor',      'Mentor',       50000, 'frame-07', null,          null,       7)
) as v(key, label, threshold, frame, cents, pkind, ord)
on conflict (org_id, key) do nothing;

-- ---------- Rangrahmen als kosmetische Gegenstaende ----------
-- Ueber rank_key mit dem Rang verbunden: beim Erreichen der Schwelle
-- schaltet ap_apply_to_total() sie automatisch frei. Sie erscheinen
-- damit in der Sammlung, auch nachdem ein hoeherer Rang erreicht ist.
insert into public.cosmetic_items (org_id, kind, key, label, asset_path, rank_key, sort_order)
select r.org_id, 'frame', 'rank-' || r.key, r.label || ' Rahmen', r.frame_asset, r.key, r.sort_order
from public.ranks r
on conflict (org_id, kind, key) do nothing;

-- ---------- Hero-Rahmen: keine Rangbelohnung ----------
-- Gehoert ausschliesslich zur monatlichen Auszeichnung, hat deshalb
-- KEIN rank_key und wird nicht ueber Punkte freigeschaltet.
insert into public.cosmetic_items (org_id, kind, key, label, asset_path, rank_key, sort_order)
select o.id, 'frame', 'hero-berater-des-monats', 'Berater des Monats', 'frame-10', null, 100
from public.organizations o
on conflict (org_id, kind, key) do nothing;

-- ---------- Punkteregeln: vollstaendige Liste, alle Werte 0 ----------
insert into public.ap_rules (org_id, source_kind, event_type, ap, note)
select o.id, 'pipeline_event', v.et, 0, 'Wert vom Betreiber festzulegen'
from public.organizations o
cross join (values
  ('contact_created'),('first_touch'),('follow_up'),('presentation_sent'),
  ('presentation_viewed'),('fit_check_sent'),('fit_check_completed'),
  ('waytomoon_sent'),('three_way_call_done'),('party_scheduled'),
  ('party_done'),('became_customer'),('registered')
) as v(et)
on conflict do nothing;

-- 'correction' bekommt KEINE eigene Regel: eine Korrektur bucht den
-- Wert der KORRIGIERTEN Ereignisart gegen, nicht einen eigenen.

insert into public.ap_rules (org_id, source_kind, event_type, ap, note)
select o.id, 'usage_event', v.et, 0, 'Wert vom Betreiber festzulegen'
from public.organizations o
cross join (values
  ('app_opened'),('coach_message_sent'),('contact_created'),
  ('journey_step_completed'),('mission_skipped'),('plan_committed')
) as v(et)
on conflict do nothing;


-- ============================================================
-- 15. Was Sprint 4 hier NICHT entschieden hat
--
--   a) Titel an der Identitaet: `membership_cosmetics` haengt an der
--      Mitgliedschaft, konsequent zur Regel fuer AP. Ein Titel wie
--      "Founder" koennte zur Person gehoeren. Falls gewuenscht, ist
--      das eine ERGAENZENDE Tabelle `identity_cosmetics`, kein Umbau.
--   b) Rahmen 08 (DEVELOPER) und 09 (SUPER ADMIN) sind NICHT
--      eingetragen. Rollen sind nach bestaetigter Regel nicht
--      oeffentlich sichtbar; ein oeffentlicher Rollenrahmen widerspraeche
--      dem. Ob sie im EIGENEN Profil erscheinen duerfen, ist offen.
--   c) Streaks: `ap_rules` mit source_kind 'usage_event' und
--      event_type 'app_opened' traegt sie bereits. Die Frage, ob ein
--      verpasster Tag auf null zurueckwirft oder langsam verliert, ist
--      offen und beruehrt dieses Schema nicht.
--   d) Mindestteilnehmerzahl fuer die monatliche Auszeichnung.
-- ============================================================
