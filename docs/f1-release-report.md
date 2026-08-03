# Release Report: F1 Release Candidate

Gegenstand: Migration `20260730000012_f1_function_security.sql` plus Testumgebung, Regressionstest und Security Baseline.
Datum: 24. Juli 2026. **Nichts ausgerollt, nichts auf eine Datenbank angewendet.**

---

## Übersicht der Artefakte

| Datei                                                         | Art              | Umfang         |
| ------------------------------------------------------------- | ---------------- | -------------- |
| `supabase/migrations/20260730000012_f1_function_security.sql` | Migration        | 581 Zeilen     |
| `supabase/tests/database/function_security.test.sql`          | Test, neu        | 34 Prüfungen   |
| `supabase/tests/database/regression.test.sql`                 | Test, neu        | 23 Prüfungen   |
| `supabase/tests/database/rls.test.sql`                        | Test, korrigiert | 13 Prüfungen   |
| `supabase/tests/database/daily_plan.test.sql`                 | Test, korrigiert | 10 Prüfungen   |
| `supabase/tests/database/journey.test.sql`                    | Test, korrigiert | 8 Prüfungen    |
| `supabase/tests/database/phases.test.sql`                     | Test, korrigiert | 6 Prüfungen    |
| `docs/security-baseline.md`                                   | Standard, neu    | 12 Regelwerke  |
| `docs/f1-security-analysis.md`                                | Analyse          | 264 Zeilen     |
| `setup/setup-complete.sql`                                    | generiert        | 12 Migrationen |

Gesamt 94 Prüfungen über sechs Testdateien.

---

## 1. Testumgebung

**Status: behoben.**

Gefunden wurde **ein** Problem, nicht mehrere. `on_auth_user_created` ist ein `AFTER INSERT`-Trigger auf `auth.users` und ruft `handle_new_user` auf. Diese Funktion wirft eine Ausnahme, wenn `raw_user_meta_data` keinen `invite_code` enthält. Alle vier bestehenden Testdateien fügen nur `id` und `email` ein. Damit konnte **keine einzige Testdatei durchlaufen.**

In `rls.test.sql` stand an genau dieser Stelle ein Kommentar, der behauptete, der Trigger feuere nur bei vorhandenen Metadaten. Das war sachlich falsch und hat das Problem verdeckt. Der Kommentar ist richtiggestellt.

Behebung, ausschließlich in der Testumgebung:

```sql
alter table auth.users disable trigger on_auth_user_created;   -- vor den Inserts
...
alter table auth.users enable trigger on_auth_user_created;    -- nach dem Aufbau
```

Bewusst nur dieser eine Trigger und **nicht** `session_replication_role = replica`: Letzteres hätte auch `contacts_log_created` und `set_updated_at` abgeschaltet, und mehrere Tests prüfen ausdrücklich, dass das Anlage-Ereignis automatisch entsteht. Ein pauschaler Schalter hätte diese Tests stillschweigend entwertet.

Produktionslogik ist unverändert. `handle_new_user` wurde nicht angefasst.

**Korrektur einer eigenen Fehlbehauptung:** Ich hatte zusätzlich behauptet, `rls.test.sql` und `journey.test.sql` hätten falsche `plan()`-Zahlen. Das war ein Fehler in meinem Suchmuster, `throws_like` fehlte darin. Nachgezählt mit vollständigem pgTAP-Wortschatz stimmen alle sechs Dateien.

**Risiko:** gering. `alter table ... disable trigger` verlangt Eigentum an `auth.users` oder Superuser-Rechte. Im lokalen `supabase test db` läuft der Test als `postgres`, das genügt. Ungeprüft, weil hier keine Ausführung möglich ist.

**Offene Punkte:** keine.

**Empfehlung:** Reproduzierbarkeit ist gegeben, weil der Block in jeder Datei steht und DDL transaktional ist. Das abschließende `rollback` stellt den Zustand ohnehin wieder her.

## 2. Test-Suite

**Status: strukturell geprüft, nicht ausgeführt.**

| Prüfung                                                | Ergebnis                  |
| ------------------------------------------------------ | ------------------------- |
| `plan()` gegen tatsächliche Zusicherungen              | 6 von 6 Dateien stimmen   |
| `$$`-Begrenzer paarweise                               | alle sechs Dateien gerade |
| Trigger-Behandlung vorhanden                           | 6 von 6                   |
| Reihenfolge `disable` vor Insert, `enable` nach Aufbau | 6 von 6                   |

Beim Prüfen meines eigenen Testplans habe ich eine Schwäche gefunden und behoben. Ich hatte `throws_ok(sql, null, null, beschreibung)` verwendet. Das ist aus zwei Gründen schlecht: untypisierte NULL erzeugt Mehrdeutigkeit bei der Funktionsauflösung, und der Test wird **auch grün, wenn die Funktion aus einem völlig anderen Grund scheitert**, etwa wegen eines Fehlers in meiner Migration. Ersetzt durch `throws_like` mit Prüfung der Fehlermeldung, was zugleich der Projektkonvention entspricht. Ebenso `isnt(x, null, ...)` durch `ok(x is not null, ...)`.

**Risiko: hoch, und dies ist der Kern des Freigabeurteils.** Die Tests wurden nie ausgeführt. In meiner Umgebung fehlen Supabase-CLI, Docker und Netzwerkzugang. Statische Prüfung schließt Syntaxfehler nicht aus, die erst der Parser findet.

**Offene Punkte:**

- `supabase test db` wurde nie ausgeführt, weder lokal noch in der CI.
- Der CI-Ablauf erreicht `supabase test db` überhaupt nicht: Zeile 41 führt `npm ci` aus, und das verweigert den Dienst ohne `package-lock.json`. Die Datei existiert im Repository nicht. Der Job scheitert vor Zeile 43.

**Empfehlung:** Zuerst `package-lock.json` erzeugen und committen, dann `supabase test db` ausführen. Ohne diesen Schritt ist Ihr eigenes Abschlusskriterium nicht überprüfbar.

## 3. Migration validiert

**Status: geprüft, drei eigene Fehler gefunden und behoben.**

| Prüfpunkt                             | Ergebnis                                                                     |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| `SECURITY DEFINER` nur mit Begründung | 4 Gründe definiert, jede Funktion zugeordnet                                 |
| `SECURITY INVOKER` wo möglich         | 6 Planungsfunktionen umgestellt                                              |
| `auth.uid()`                          | Parameter entfernt statt geprüft, wo immer eigener Nutzer                    |
| `org_id`                              | in `get_downline` ergänzt, in beiden Rekursionszweigen                       |
| Rollenprüfung                         | `is_super_admin()` bei `coach_messages_today`, `track_usage`, `get_downline` |
| Berechtigungen                        | Beziehung über `is_ancestor_of`, nicht über Rolle                            |
| RLS                                   | nicht angetastet, keine Policy geändert                                      |
| PUBLIC                                | zuerst entzogen, dann selektiv gewährt                                       |
| anon                                  | entzogen, außer bei den drei Policy-Helfern                                  |
| authenticated                         | erhalten für alle vom Frontend genutzten RPC                                 |
| Trigger                               | nicht eingeschränkt, weil nicht direkt aufrufbar                             |
| Rekursionen                           | `CYCLE`-Klausel statt Tiefengrenze                                           |
| Performance                           | siehe unten                                                                  |
| Seiteneffekte                         | siehe unten                                                                  |

### Eigene Fehler, die diese Runde gefunden hat

**Fehler 1: fehlendes `RECURSIVE`.** In `get_downline` stand `with authorized as (...), recursive_downline as (...)` mit einem Selbstbezug, aber ohne `RECURSIVE` nach `WITH`. Das ist ein Syntaxfehler, die Migration wäre sofort gescheitert. Behoben, dabei die Funktion auf PL/pgSQL mit frühem Abbruch umgestellt, wodurch die Rekursion bei fehlender Berechtigung gar nicht mehr läuft.

**Fehler 2: willkürliche Tiefengrenze.** Ich hatte `depth < 50` als Zyklusschutz eingebaut. Das ist falsch: Es schneidet legitime tiefe Genealogien ab und liefert dann stillschweigend falsche Ergebnisse, also genau der Fehlermodus, den ich an anderer Stelle kritisiert habe. Ersetzt durch die `CYCLE`-Klausel, die nur echte Kreise erkennt und die Tiefe nicht begrenzt. Gegen die Live-Datenbank auf PostgreSQL 17.6 validiert.

**Fehler 3: zu schwache Fehlerprüfung im Test.** Siehe Abschnitt 2.

### Semantikprüfung

Bei `coach_messages_today` habe ich die Sprache von `sql` auf `plpgsql` geändert. Kontrolliert, ob ich dabei die Zählbedingungen verändert habe: Das Original filtert auf `m.role = 'user'` und `m.created_at >= date_trunc('day', now())`. Meine Fassung enthält beide unverändert. Das war ein realer Risikopunkt, weil dieser Wert das Tageslimit des Coaches steuert.

### Performance

| Änderung                                  | Bewertung                                                                                                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `match_knowledge` von `sql` auf `plpgsql` | Verliert Inlining. Da die Funktion immer eigenständig aufgerufen wird und der HNSW-Index im eigenen Plan genutzt wird, ist die Auswirkung vernachlässigbar. **Nicht gemessen.** |
| `get_downline` von `sql` auf `plpgsql`    | Verliert Inlining, gewinnt frühen Abbruch. Bei fehlender Berechtigung entfällt die gesamte Rekursion. Netto besser.                                                             |
| `is_ancestor_of` je `get_downline`-Aufruf | Ein Aufwärtslauf pro Aufruf. Bei einer Leaderansicht über viele Personen entsteht ein N-plus-1-Muster. Das ist Befund F12 des Architektur-Reviews und nicht Teil von F1.        |
| Index auf `profiles.sponsor_id`           | vorhanden (`profiles_sponsor_id_idx`), die Rekursion ist abgedeckt                                                                                                              |

### Seiteneffekte

| Geprüft                              | Ergebnis                                                                                                               |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Funktions-OIDs ändern sich           | ja, unerheblich. Signaturen der vom Frontend genutzten RPC bleiben identisch                                           |
| `database.types.ts`                  | enthält `get_downline` mit unveränderter Signatur, kein Anpassungsbedarf                                               |
| `coach-chat` Edge Function           | übergibt die eigene Nutzerkennung und `profile.org_id`, beide Prüfungen bestehen                                       |
| `validate-invite` Edge Function      | nutzt `service_role`, Entzug von `authenticated` unschädlich                                                           |
| `set_updated_at`                     | wird auch von einem Trigger auf `products` des Fremdprojekts genutzt. Nur `search_path` ergänzt, Verhalten unverändert |
| `event_phase_rank`                   | kein Index nutzt die Funktion, der `SET`-Zusatz ist unschädlich                                                        |
| Kein Index auf betroffene Funktionen | geprüft, keiner                                                                                                        |

**Risiko:** mittel. Alle Aussagen beruhen auf statischer Prüfung und auf Leseabfragen gegen die Live-Datenbank. Die Migration selbst wurde nicht angewendet.

**Offene Punkte:**

- Die `CYCLE`-Klausel wurde eigenständig validiert, aber nicht innerhalb eines `RETURN QUERY` in PL/pgSQL.
- Die Umlaute in den `throws_like`-Mustern müssen zur Kodierung passen. Das Muster `%können nicht selbst geändert werden%` stammt unverändert aus `rls.test.sql` und ist damit konsistent.

**Empfehlung:** Anwenden auf einen Entwicklungszweig, nicht direkt auf Produktion.

## 4. Regressionstest

**Status: erstellt, nicht ausgeführt.**

| Kernfunktion           | Abgedeckt    | Wie                                                                                                                                                               |
| ---------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registrierung          | ja           | über den **echten** Trigger-Pfad, mit gültiger Einladung und Metadaten. Wichtigster Nachweis, weil `handle_new_user` der einzige reguläre Weg zu einem Profil ist |
| Invite-System          | ja           | `create_invite`, `validate_invite`                                                                                                                                |
| Pipeline               | ja           | Anlage-Ereignis, Phasenableitung, `correct_pipeline_event`                                                                                                        |
| Daily Plan             | ja           | `generate_daily_plan`, `commit_daily_plan`, `update_mission_status`. Am stärksten betroffen, weil sechs Signaturen geändert wurden                                |
| Coach                  | teilweise    | `coach_messages_today`. Die Gemini-Anbindung ist nicht datenbankseitig prüfbar                                                                                    |
| Wissensdatenbank       | ja           | Freigegebenes sichtbar, Entwurf unsichtbar                                                                                                                        |
| Knowledge Retrieval    | ja           | `match_knowledge` mit echtem Vektor. **Kritischster Test der Migration**, weil ein falscher `search_path` den Operator `<=>` unauffindbar machen würde            |
| Teamstruktur           | ja           | `get_downline`, `profiles_public`                                                                                                                                 |
| Aktivitäten            | ja           | Schreiben eigener `usage_events`                                                                                                                                  |
| Berechtigungen         | ja           | Selbstbeförderung blockiert                                                                                                                                       |
| Mehrmandantenfähigkeit | ja           | drei Prüfungen über die Organisationsgrenze                                                                                                                       |
| Leaderfunktionen       | dokumentiert | Geprüft wird, dass die Rolle `leader` **keinen** erweiterten Zugriff hat. Das ist der korrekte Istzustand, siehe F2                                               |
| Login                  | **nein**     | Supabase Auth, keine Datenbanklogik. Manuell zu prüfen                                                                                                            |
| Dashboard              | **nein**     | existiert noch nicht                                                                                                                                              |

**Risiko:** mittel, solange nicht ausgeführt.

**Offene Punkte:** Login und Dashboard sind auf Datenbankebene nicht prüfbar. Login sollte nach dem Rollout einmal manuell durchlaufen werden, weil `current_org_id()` und `is_super_admin()` unmittelbar nach der Anmeldung greifen und ich deren Rechte ausdrücklich **nicht** angetastet habe.

**Empfehlung:** Nach dem Anwenden auf einen Entwicklungszweig zusätzlich manuell: einmal registrieren, einmal anmelden, eine Coach-Nachricht senden, einen Tagesplan erzeugen.

## 5. Security Baseline

**Status: erstellt, verbindlich ab sofort.**

Zwölf Regelwerke in `docs/security-baseline.md`. Kern:

- `SECURITY DEFINER` nur mit einem von vier benannten Gründen, im Kopfkommentar dokumentiert
- `SECURITY INVOKER` Pflicht bei reinen Leseoperationen auf RLS-geschützten Tabellen
- Kein Nutzerparameter, wenn immer der eigene Nutzer gemeint ist
- `org_id`-Filter Pflicht, bei Rekursion in beiden Zweigen
- Sichtbarkeit über die Beziehung, Rollenprüfung nur für Verwaltungshandlungen
- `PUBLIC` zuerst entziehen, dann selektiv gewähren
- Berechtigungen nie als Spalte auf `profiles`
- `CYCLE` statt Tiefengrenze
- Geheimnisse gehören nicht in AscendOS und nicht in die Wissensbasis

Zwei Regeln sind als Tests verankert und können nicht umgangen werden, ohne die Suite rot zu machen:

- **J1:** Keine `SECURITY DEFINER`-Funktion mit `uuid`-Parameter ohne Aufruferprüfung.
- **I1:** Jede `SECURITY DEFINER`-Funktion hat einen festgenagelten `search_path`.

**Risiko:** gering. Der Standard beschreibt Regeln, er ändert kein Verhalten.

**Offene Punkte:** Der Standard nennt in Abschnitt 5b, dass Berechtigungen in eine eigene Tabelle gehören. Diese Tabelle existiert nicht. Das ist Befund F11 des Architektur-Reviews und Teil von Phase 0, nicht von F1.

**Empfehlung:** Als Prüfliste in die Vorlage für Pull Requests aufnehmen, damit sie bei jeder Änderung gelesen wird und nicht nur einmal.

## 6. Freigabeurteil

### NEIN

F1 ist **nicht** bereit für den produktiven Rollout.

Nicht, weil die Migration fehlerhaft wäre, sondern weil Ihr eigenes Abschlusskriterium nicht erfüllt ist: „Erst wenn alle Tests erfolgreich sind, gilt F1 als abgeschlossen." Kein einziger Test wurde ausgeführt. Ich habe 94 Prüfungen geschrieben und statisch validiert, aber ich habe sie nicht laufen lassen, und ich kann es in dieser Umgebung nicht.

Eine Freigabe auf Basis von „sieht korrekt aus" wäre bei einer Sicherheitsmigration auf einer Produktionsdatenbank mit echten Nutzerdaten das falsche Signal. Drei eigene Fehler in dieser Runde, davon einer ein harter Syntaxfehler, sind der Beleg dafür, dass Durchlesen nicht genügt.

### Verbleibende Blocker

| #      | Blocker                                                                                                                                  | Behebung                                                            | Aufwand                        |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------ |
| **B1** | `package-lock.json` fehlt, `npm ci` in `.github/workflows/ci.yml` Zeile 41 scheitert. Die CI erreicht `supabase test db` in Zeile 43 nie | `npm install` ausführen, `package-lock.json` committen              | Minuten, braucht einen Rechner |
| **B2** | Die Migration wurde nie angewendet. Kein Nachweis, dass sie fehlerfrei durchläuft                                                        | Auf einen Supabase-Entwicklungszweig anwenden, nicht auf Produktion | ein Durchlauf                  |
| **B3** | Die 94 Prüfungen wurden nie ausgeführt                                                                                                   | `supabase test db` nach B1 und B2                                   | ein Durchlauf                  |
| **B4** | Login und Dashboard sind datenbankseitig nicht prüfbar                                                                                   | manuell: registrieren, anmelden, Coach-Nachricht, Tagesplan         | 10 Minuten                     |

Alle vier Blocker sind Verifikationsschritte, keine Konstruktionsfehler. Keiner verlangt eine Änderung an der Migration.

### Empfohlene Reihenfolge zur Freigabe

1. **B1:** `package-lock.json` erzeugen und committen. Behebt gleichzeitig den ESLint-Blocker aus einer früheren Runde.
2. **B2:** Migration auf einen Entwicklungszweig anwenden. Erwartete Stolperstellen in dieser Reihenfolge: `CYCLE` innerhalb `RETURN QUERY`, dann die `revoke`-Anweisungen mit `extensions.vector` in der Signatur.
3. **B3:** `supabase test db`. Erwartung: 94 von 94 grün. Bei Rotmeldungen bitte die Ausgabe schicken, insbesondere zu `F1` (Vektoroperator) und `A1` bis `A3` (Registrierung), das sind die empfindlichsten Prüfungen.
4. **B4:** Manuelle Prüfung der vier Abläufe.
5. Erst dann auf Produktion anwenden.

### Was nach der Freigabe gilt

Sobald B1 bis B4 grün sind, ist F1 abgeschlossen und **Phase 0 kann beginnen**. Die Blocker F2 und F3 aus dem Architektur-Review bleiben davon unberührt und sind vor Phase 3 beziehungsweise innerhalb von Phase 0 zu erledigen.

Ich bestätige diese Freigabe ausdrücklich **nicht** vorab. Sie hängt an einem Testlauf, den ich nicht durchführen kann.
