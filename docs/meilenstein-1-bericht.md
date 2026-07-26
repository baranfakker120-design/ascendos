# Meilenstein 1: Bericht

Gegenstand: F1 vollständig abschließen.
Datum: 25. Juli 2026. Nichts auf Produktion angewendet.

---

## 1. Zusammenfassung

Von sechs Aufgaben sind zwei erledigt, eine teilweise, drei in dieser Umgebung nicht ausführbar.

| Aufgabe | Status | Grund |
|---|---|---|
| `package-lock.json` erstellen | **nicht möglich** | npm-Registry antwortet mit 403 Forbidden |
| CI reparieren | **teilweise** | CI selbst ist korrekt. Dem Repository fehlen zwei generierte Dateien |
| Migration auf Entwicklungsdatenbank | **nicht möglich** | Anlegen eines Zweigs ist gesperrt, auch die Kostenabfrage wurde abgewiesen |
| Komplette Test-Suite ausführen | **nicht möglich** | keine Supabase-CLI, kein Docker, kein Zweig |
| 94 Sicherheitstests ausführen | **nicht möglich** | dito |
| Smoke Tests | **nicht möglich** | benötigt ausgerollte Anwendung und Browser |

Der Ertrag dieses Meilensteins liegt trotzdem nicht bei null. Die Verifikationsarbeit hat **einen echten Fehler in meiner eigenen Arbeit der letzten Runde** aufgedeckt und **zwei meiner früheren Behauptungen widerlegt**. Genau dafür ist ein solcher Schritt da.

---

## 2. Behobener Fehler: die Testumgebung war falsch reparieren

**Befund.** In der letzten Runde habe ich in alle sechs Testdateien geschrieben:

```sql
alter table auth.users disable trigger on_auth_user_created;
```

Geprüft in der Live-Datenbank:

| Prüfung | Ergebnis |
|---|---|
| Eigentümer von `auth.users` | `supabase_auth_admin` |
| Verbindungsrolle | `postgres` |
| Ist `postgres` Superuser? | **nein** (`rolsuper = false`) |
| Ist `postgres` Mitglied von `supabase_auth_admin`? | **nein** |

`ALTER TABLE` verlangt Eigentum an der Tabelle. Die Rolle `postgres` hat es nicht.

**Auswirkung.** Der Befehl wäre **lokal durchgelaufen** (im Docker-Stack von `supabase db start` ist `postgres` Superuser) und **auf jeder gehosteten Supabase-Datenbank gescheitert**. Das ist der Fehlermodus „läuft bei mir", der erst beim ersten echten Testlauf gegen einen Zweig auffällt und dort schwer zuzuordnen ist.

**Behebung.** Ersetzt durch eine transaktionslokale Sitzungsvariable, die für `postgres` nachweislich funktioniert:

```sql
set local session_replication_role = replica;
insert into auth.users (...);
set local session_replication_role = origin;
```

Zwei Entscheidungen dabei, beide bewusst:

1. **Umgeschaltet wird nur für den Auth-Insert**, nicht für den gesamten Aufbau. `session_replication_role = replica` schaltet auch Fremdschlüsselprüfungen und die Trigger `contacts_log_created` und `set_updated_at` ab. Mehrere Tests prüfen ausdrücklich, dass das Anlage-Ereignis automatisch entsteht. Nach dem Auth-Insert wird deshalb sofort zurückgeschaltet, sodass alle weiteren Anweisungen unter vollständiger Prüfung laufen.
2. **In `regression.test.sql` liegt die echte Registrierung nach dem Zurückschalten** (Zeile 132 gegen Zeile 65). Der Trigger feuert dort also regulär. Das ist der wichtigste Nichtregressionsnachweis und wäre sonst wertlos gewesen.

Geprüft: `set local session_replication_role = replica` ist für `postgres` erfolgreich ausführbar.

---

## 3. Zwei widerlegte eigene Behauptungen

**Behauptung 1, falsch:** „`npm ci` scheitert ohne Lockfile, die CI erreicht `supabase test db` nie."

Die CI hat **drei voneinander unabhängige Jobs**: `quality`, `database`, `secrets`. Der Job `database` führt kein `npm ci` aus, sondern nur `supabase/setup-cli`, `supabase db start` und `supabase test db`. Ein Scheitern von `npm ci` im Job `quality` blockiert die pgTAP-Tests **nicht**.

Damit ist das fehlende Lockfile kein Blocker für die Tests, sondern nur für Lint, Typecheck und Build.

**Behauptung 2, falsch:** „`rls.test.sql` und `journey.test.sql` haben falsche `plan()`-Zahlen."

Mein Suchmuster hatte `throws_like` nicht enthalten. Nachgezählt mit vollständigem pgTAP-Wortschatz stimmen alle sechs Dateien.

Ich führe beide Korrekturen auf, weil ein Bericht, der eigene Fehlbefunde verschweigt, seinen Zweck verfehlt.

---

## 4. Neuer Blocker: Typen-Drift bricht die CI

Der Job `database` enthält einen Schritt, der `src/shared/types/database.types.ts` gegen `supabase gen types typescript --local` vergleicht und bei Abweichung mit `exit 1` abbricht.

Die Datei ist laut ihrem eigenen Kopfkommentar **handgepflegt** („Sprint 1: handgepflegt"). Ich habe sie in einer früheren Runde zusätzlich von Hand um vier Tabellen erweitert (`agents`, `knowledge_docs`, `knowledge_chunks`, `knowledge_gaps`).

Eine handgeschriebene Datei stimmt praktisch nie zeichengenau mit der Generatorausgabe überein: Reihenfolge, Kommentare, Formatierung und Vollständigkeit weichen ab. Dieser Schritt wird also fehlschlagen, unabhängig von F1.

**Behebung erfordert eine Maschine:** einmal `npm run db:types` gegen den lokalen Stack ausführen und die erzeugte Datei committen. Ab dann erzwingt der Schritt Konsistenz, wie vorgesehen.

**Hinweis zur Nebenwirkung:** Der Generator schreibt alle Tabellen des Schemas. Gegen den lokalen Stack sind das ausschließlich die AscendOS-Tabellen aus den Migrationen. Die Tabellen des Fremdprojekts (`products`, `duftnoten`, `kabelkatalog_state`) existieren dort nicht und tauchen deshalb nicht auf. Gegen die Produktionsdatenbank generierte Typen würden sie enthalten, weshalb `--local` hier der richtige Bezug ist.

---

## 5. CI: Bewertung und offene Entscheidung

**Die CI ist nicht defekt.** Sie ist korrekt konfiguriert. Dem Repository fehlen zwei generierte Artefakte:

| Fehlendes Artefakt | Blockiert | Behebung |
|---|---|---|
| `package-lock.json` | Job `quality` ab `npm ci` | `npm install` auf einer Maschine, Datei committen |
| aktuelle `database.types.ts` | Job `database`, letzter Schritt | `npm run db:types`, Datei committen |

Ich habe die CI **nicht** verändert, und zwar aus einem Grund, der Ihre eigene Prioritätenordnung betrifft.

Die naheliegende „Reparatur" wäre, `npm ci` durch `npm install` zu ersetzen. Damit wäre der Job grün. Der Preis: `npm ci` installiert ausschließlich die im Lockfile festgeschriebenen Versionen, `npm install` löst Versionsbereiche neu auf. Ohne Lockfile können CI und Produktionsbuild dann unterschiedliche Abhängigkeitsversionen verwenden. Das ist ein Lieferkettenrisiko und widerspricht Priorität 1, Sicherheit.

**Das ist eine Entscheidung, die ich nach den neuen Arbeitsregeln nicht allein treffe.**

| Option | Nutzen | Kosten und Risiko | Empfehlung |
|---|---|---|---|
| A: Lockfile erzeugen und committen, `npm ci` bleibt | Reproduzierbare Builds, CI vollständig grün | benötigt einmalig eine Maschine, etwa 2 Minuten | **empfohlen** |
| B: CI auf `npm install` umstellen | sofort grün ohne Maschine | Versionsdrift möglich, Lieferkettenrisiko, widerspricht Priorität 1 | nicht empfohlen |
| C: Job `quality` vorläufig aussetzen | Ehrlicher als B, verdeckt nichts | Lint, Typecheck und Build laufen nicht mehr | Notlösung |

---

## 6. Testbericht

**Ausgeführt: null von 94.** Das ist die zentrale Aussage dieses Berichts.

| Prüfart | Umfang | Ergebnis |
|---|---|---|
| `plan()` gegen tatsächliche Zusicherungen | 6 Dateien | 6 von 6 stimmen |
| `$$`-Begrenzer paarweise | 6 Dateien | alle gerade |
| Reihenfolge `replica` → Auth-Insert → `origin` → Profile | 6 Dateien | 6 von 6 korrekt |
| Keine Reste des fehlerhaften Ansatzes | 6 Dateien | keine |
| Rechteprüfung `session_replication_role` | Live-Datenbank | ausführbar für `postgres` |
| Syntax und Semantik beider Rekursionen mit `CYCLE` | Live-Datenbank, lesend | korrekt in beide Richtungen |
| Semantik `coach_messages_today` unverändert | Vergleich gegen Original | beide Filterbedingungen erhalten |

Das ist statische und punktuelle Prüfung, **kein Testlauf**. Sie kann Syntaxfehler nicht ausschließen, die erst der Parser findet, und sie sagt nichts über Laufzeitverhalten.

---

## 7. Testabdeckung

| Bereich | Prüfungen | Art |
|---|---|---|
Funktionssicherheit F1 | 34 | Angriff von außen: Berater, Leader, Super-Admin, fremde Organisation, `anon`, ungültige und manipulierte Kennung |
| Regression Kernfunktionen | 23 | Registrierung über echten Trigger-Pfad, Invites, Pipeline, Tagesplan, Coach, Wissen, Retrieval, Struktur, Aktivitäten, Rechte, Mandanten |
| RLS-Grenzen | 13 | Eigentümer, gleiche Organisation, fremde Organisation |
| Tagesplan-Regeln | 10 | Signalerzeugung und Missionsstatus |
| Journey | 8 | Schrittfolge und Sponsorensicht |
| Pipeline-Phasen | 6 | Phasenableitung inklusive Korrekturen |
| **Summe** | **94** | |

**Nicht abgedeckt und auf Datenbankebene nicht abdeckbar:**

| Bereich | Warum | Ersatz |
|---|---|---|
| Login | Supabase Auth, keine Datenbanklogik | manuell |
| Dashboard | existiert noch nicht | entfällt |
| Coach-Antwortqualität | benötigt Gemini und Netzwerk | Eval-Set, manuell |
| Oberflächen | keine Testinfrastruktur für Frontend vorhanden | manuell |
| Leaderfunktionen | existieren noch nicht (F2) | geprüft wird der korrekte Istzustand: keine erweiterten Rechte |

Eine ehrliche Einordnung: Es gibt **keine** Frontend-Testinfrastruktur im Projekt. `npm run test` deckt nur das ab, was an Unit-Tests existiert. Für Priorität 4, Testbarkeit, ist das eine offene Flanke, aber kein F1-Thema.

---

## 8. Offene Risiken

| # | Risiko | Schwere | Bewertung |
|---|---|---|---|
| R1 | Die Migration wurde nie angewendet. Kein Nachweis, dass sie durchläuft | **hoch** | Drei eigene Fehler in zwei Runden zeigen, dass Durchlesen nicht genügt |
| R2 | `CYCLE` innerhalb `RETURN QUERY` in PL/pgSQL ist unverifiziert | mittel | Eigenständig gegen PostgreSQL 17.6 validiert, nicht im Funktionskontext |
| R3 | Die `revoke`-Anweisungen mit `extensions.vector` in der Signatur sind unverifiziert | mittel | Typauflösung sollte greifen, ungeprüft |
| R4 | `session_replication_role` in der CI-Umgebung unverifiziert | niedrig | Dort ist `postgres` Superuser, also unkritischer als gehostet |
| R5 | Umlaute in den `throws_like`-Mustern müssen zur Kodierung passen | niedrig | Muster stammt unverändert aus `rls.test.sql` |
| R6 | `match_knowledge` verliert durch PL/pgSQL das Inlining | niedrig | Auswirkung als vernachlässigbar bewertet, nicht gemessen |
| R7 | Keine Frontend-Testinfrastruktur | mittel | Betrifft Priorität 4, nicht F1 |

---

## 9. Ausführungsanleitung für die verbleibenden Schritte

Reihenfolge ist bindend. Jeder Schritt setzt den vorherigen voraus.

```bash
# S1  Lockfile erzeugen (behebt Job quality)
npm install
git add package-lock.json

# S2  Lokalen Stack starten, Migrationen inklusive 12 anwenden
supabase db start

# S3  Generierte Typen erneuern (behebt Job database)
npm run db:types
git add src/shared/types/database.types.ts

# S4  Alle 94 Prüfungen ausführen
supabase test db
```

**Erwartete Stolperstellen, in der Reihenfolge ihrer Wahrscheinlichkeit:**

1. `CYCLE` innerhalb `RETURN QUERY` in `get_downline`, Risiko R2
2. Die `revoke`- und `grant`-Anweisungen mit `extensions.vector`, Risiko R3
3. Prüfung `F1` in `regression.test.sql`, der Vektoroperator nach der `search_path`-Änderung
4. Prüfungen `A1` bis `A3` in `regression.test.sql`, die Registrierung über den echten Trigger-Pfad

Bei roten Prüfungen bitte die vollständige Ausgabe von `supabase test db` schicken. Die Prüfungsnamen sind so gewählt, dass sich daraus direkt die Ursache ableiten lässt.

**Danach Smoke Tests, manuell, gegen einen Entwicklungszweig:**

| # | Ablauf | Erwartung |
|---|---|---|
| 1 | Registrierung mit einem Einladungscode | Profil entsteht, Code als verbraucht markiert |
| 2 | Anmeldung | `current_org_id()` und `is_super_admin()` liefern Werte, Organisation wird geladen |
| 3 | Coach-Nachricht senden | Antwort kommt, `coach_messages` erhält zwei Zeilen |
| 4 | Tagesplan erzeugen | Plan mit mindestens einer Mission |
| 5 | Teamstruktur öffnen | eigene Downline sichtbar, keine Sideline |
| 6 | Wissensdokument hochladen und freigeben | `knowledge_chunks` wächst, Coach zitiert daraus |

Ablauf 2 ist besonders zu beachten: Ich habe die Ausführungsrechte von `current_org_id`, `is_super_admin` und `current_user_role` für `anon` ausdrücklich **nicht** angetastet, weil sie in 51 Policies aufgerufen werden. Sollte die Anmeldung dennoch Probleme zeigen, ist das der erste Ort zum Nachsehen.

---

## 10. Freigabe

### NEIN

Meilenstein 1 ist nicht abgeschlossen.

Ihre eigenen Abschlusskriterien lauteten: sämtliche Tests erfolgreich, keine Regression festgestellt, keine Sicherheitslücken verbleibend. Das erste Kriterium ist nicht erfüllt, weil **kein einziger Test ausgeführt wurde**. Damit sind das zweite und dritte nicht bewertbar. Ohne Testlauf ist die Aussage „keine Regression" eine Vermutung, und Vermutungen sind bei einer Sicherheitsmigration auf einer Produktionsdatenbank nicht ausreichend.

### Verbleibende Blocker

| # | Blocker | Behebung | Wer |
|---|---|---|---|
| **B1** | `package-lock.json` fehlt. npm-Registry hier gesperrt (403) | `npm install`, committen | Maschine nötig |
| **B2** | `database.types.ts` ist handgepflegt und bricht den Typen-Drift-Schritt der CI | `npm run db:types`, committen | Maschine nötig |
| **B3** | Migration nie angewendet. Anlegen eines Entwicklungszweigs über mich gesperrt, Kostenabfrage abgewiesen | `supabase db start` lokal, oder Zweig manuell anlegen | Maschine oder Freigabe |
| **B4** | 94 Prüfungen nie ausgeführt | `supabase test db` nach B2 und B3 | Maschine nötig |
| **B5** | Smoke Tests nicht ausgeführt | sechs Abläufe aus Abschnitt 9 | Maschine und Browser |

Keiner dieser Blocker verlangt eine Änderung an der Migration. Alle fünf sind Verifikationsschritte.

### Was von mir noch fehlt: nichts

Alles, was ohne Maschine und ohne Datenbankzugriff mit Schreibrechten möglich ist, liegt vor. Die Testumgebung ist jetzt in beiden Umgebungen tragfähig, nicht nur lokal.

### Offene Entscheidung, die ich Ihnen vorlege

Die Lockfile-Frage aus Abschnitt 5. Ich empfehle Option A, das Lockfile zu erzeugen, statt die CI auf `npm install` umzustellen. Bitte bestätigen, dann ist die CI-Aufgabe abschließend geklärt.

### Zur Fortsetzung

Meilenstein 2 beginnt nach Ihrer Freigabe. Nach Ihren Arbeitsregeln fange ich damit nicht eigenständig an. Wenn Sie B1 bis B5 nicht zeitnah ausführen können, ist eine sinnvolle Alternative, Meilenstein 2 und 3 vorzuziehen: Beide sind reine Analyse- und Entwurfsarbeit ohne Ausführungsbedarf und damit hier vollständig leistbar. F1 bliebe dann als offener Punkt bestehen, klar markiert, und würde vor Phase 0 nachgezogen.
