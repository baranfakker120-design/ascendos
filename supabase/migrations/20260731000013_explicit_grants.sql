-- ============================================================
-- Migration 13: Rechte ausdruecklich vergeben statt erben
--
-- URSACHE B, bewiesen in Sprint 0.
--
-- Befund lokal:      25 Objekte in public ohne SELECT fuer authenticated
-- Befund Produktion:  0 Objekte ohne SELECT fuer authenticated
--
-- Warum der Unterschied. Die ACL von daily_plans in Produktion lautet
--   postgres=arwdDxtm/postgres  anon=arwdDxtm/postgres
--   authenticated=arwdDxtm/postgres  service_role=arwdDxtm/postgres
-- Das Suffix /postgres benennt den Erteiler. Die Rechte entstehen dort
-- nicht durch eine Migration, sondern als Nebenwirkung konfigurierter
-- Vorgabeprivilegien: in Produktion ist
--   alter default privileges for role postgres in schema public ...
-- gesetzt, und jede von postgres angelegte Tabelle erbt die Rechte.
--
-- ALTER DEFAULT PRIVILEGES wirkt PRO ERZEUGENDER ROLLE. Lokal greift
-- dieser Weg nicht, weil dort entweder keine Vorgabe fuer die
-- erzeugende Rolle konfiguriert ist oder die Migrationen von einer
-- anderen Rolle angewendet werden. Welche der beiden Varianten
-- zutrifft, wurde nicht weiter untersucht und ist fuer diese
-- Korrektur unerheblich: Eine ausdrueckliche Erteilung wirkt in
-- beiden Faellen.
--
-- Folge ohne diese Migration: Das Schema ist nicht portabel. Es
-- funktioniert nur in einer Umgebung, deren Vorgabeprivilegien
-- zufaellig passen. Betroffen ist nicht nur die Testsuite, sondern
-- jede Frontend-Abfrage einer lokalen Entwicklungsumgebung.
--
-- Wirkung in Produktion: keine. Die Rechte sind dort identisch
-- vorhanden, die Anweisungen sind dort folgenlos.
--
-- Sicherheit: anon erhaelt Rechte auf Tabellenebene, genau wie in
-- Produktion. Das ist unbedenklich, weil RLS auf allen Tabellen aktiv
-- ist und fuer anon geschlossen ausfaellt: auth.uid() ist NULL,
-- current_org_id() liefert NULL, und jede Policy-Bedingung wird
-- dadurch NULL und damit nicht wahr. Die Grenze ist RLS, nicht das
-- Tabellenrecht. In Sprint 0 geprueft.
-- ============================================================

-- ---------- Schema ----------

grant usage on schema public to anon, authenticated, service_role;

-- ---------- Bestehende Tabellen und Views ----------
--
-- "all tables" umfasst in PostgreSQL auch Views. Der Umfang der
-- Rechte entspricht dem Istzustand in Produktion, arwdDxtm.

grant all on all tables in schema public to anon, authenticated, service_role;

-- ---------- Kuenftige Tabellen und Views ----------
--
-- Bewusst OHNE "for role": die Vorgabe gilt dadurch fuer die Rolle,
-- die diese Migration anwendet. Genau das macht die Einstellung
-- portabel, denn jede Umgebung setzt sie fuer ihre eigene
-- Migrationsrolle.

alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;

-- ============================================================
-- AUSDRUECKLICH NICHT ENTHALTEN: Rechte auf Funktionen.
--
-- Migration 12 entzieht anon das Ausfuehrungsrecht auf neun
-- Funktionen, darunter get_downline, plan_contact_state und
-- track_usage. Ein pauschales
--   grant all on all functions in schema public to anon
-- wuerde genau diese Entzuege aufheben und die in F1 behobene Luecke
-- wieder oeffnen.
--
-- Dasselbe gilt fuer eine Vorgabe auf Funktionen. Funktionsrechte
-- werden ausschliesslich einzeln vergeben, wie in Migration 12 und
-- wie in der Security Baseline, Abschnitt 6, festgelegt.
--
-- Ebenfalls nicht enthalten: Sequenzen. Sie waren nicht Teil des
-- bewiesenen Befunds und sind daher nicht Gegenstand dieser
-- Korrektur.
-- ============================================================
