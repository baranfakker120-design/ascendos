-- ============================================================
-- Migration 14: Sponsor-Zweig der user_progress-Policy reparieren
--
-- BEFUND, bewiesen in Sprint 0 durch journey.test.sql, Pruefung 8:
--   have=0  want=3
--
-- Die Policy user_progress_select_own_or_sponsor lautet:
--   user_id = auth.uid()
--   or exists (select 1 from profiles p
--              where p.id = user_progress.user_id
--                and p.sponsor_id = auth.uid())
--
-- Der zweite Zweig liest `profiles`. Auf `profiles` existiert genau
-- eine SELECT-Policy:
--   id = auth.uid() or (is_super_admin() and org_id = current_org_id())
--
-- RLS gilt auch fuer Tabellenverweise INNERHALB eines
-- Policy-Ausdrucks. Ein Berater sieht in `profiles` daher nur seine
-- eigene Zeile. Die Unterabfrage sucht aber die Zeile des
-- Downline-Partners, findet sie nicht, und EXISTS ist immer falsch.
--
-- Folge: Der Sponsor-Zweig ist fuer jeden ausser super_admin TOTER
-- CODE. Ein Sponsor kann den Journey-Fortschritt seiner Firstline
-- nicht sehen, obwohl die Policy genau das erlauben soll. Das ist ein
-- Fehler im Produktivcode, nicht im Test.
--
-- Sichtbar wurde er nur, weil der View
-- firstline_journey_progress selbst aus profiles_public liest und
-- damit eine Zeile liefert, deren gezaehlter Fortschritt dann 0 ist.
-- Daher have=0 und nicht have=NULL.
--
-- KORREKTUR, minimal: Die Unterabfrage liest profiles_public statt
-- profiles. Dieser View hat kein security_invoker, laeuft also mit
-- den Rechten seines Eigentuemers und umgeht die RLS auf profiles.
-- Er traegt seine eigene Grenze `org_id = current_org_id()`.
--
-- Die Semantik bleibt unveraendert: direkter Sponsor, nicht die
-- gesamte Upline. Absichtlich NICHT is_ancestor_of aus Migration 12,
-- denn das wuerde die Sichtbarkeit auf die ganze Downline erweitern
-- und damit das Verhalten ueber die Korrektur hinaus aendern.
--
-- ACHTUNG fuer kuenftige Aenderungen: Diese Policy haengt jetzt davon
-- ab, dass profiles_public KEIN security_invoker hat. Wird das
-- gesetzt, ist der Sponsor-Zweig wieder toter Code, und zwar
-- lautlos. Der Testfall journey Pruefung 8 deckt das ab.
-- ============================================================

drop policy if exists user_progress_select_own_or_sponsor on public.user_progress;

create policy user_progress_select_own_or_sponsor
  on public.user_progress
  for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles_public p
      where p.id = user_progress.user_id
        and p.sponsor_id = auth.uid()
    )
  );
