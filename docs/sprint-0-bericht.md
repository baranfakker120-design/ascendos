# Sprint 0: Abschlussbericht

Verifikation der Entwicklungsumgebung. Datum: 25. Juli 2026.
Keine Architektur, keine Features, keine Optimierungen außerhalb von Sprint 0.

---

# Teil 0: Prüfmethode und Prüfgrenzen

## 0.1 Methode

Nichts angenommen. Jede Aussage beruht auf einem ausgeführten Befehl oder einer Abfrage gegen die Produktionsdatenbank. Wo eine Prüfung nicht möglich war, steht das ausdrücklich, statt eine Bewertung zu erfinden.

## 0.2 Die Prüfgrenze, ausdrücklich getrennt

Dieser Bericht unterscheidet zwei Arten von Befunden. Die Vermischung wäre irreführend.

| Art               | Bedeutung                                                                                         | Kennzeichnung |
| ----------------- | ------------------------------------------------------------------------------------------------- | ------------- |
| **Projektbefund** | Etwas fehlt oder ist falsch im Repository, in der Datenbank oder in der Konfiguration. Ihre Sache | **P**         |
| **Prüfgrenze**    | Ich konnte es hier nicht prüfen, weil das Werkzeug fehlt. Kein Mangel Ihres Projekts              | **G**         |

In dieser Umgebung fehlen: **Docker, Docker Compose, Supabase CLI, psql, Deno**. Die npm-Registry antwortet mit 403. Es gibt kein Git-Verzeichnis, weil ich es vor dem Verpacken entferne, damit ein mitgeliefertes Repository nicht Ihre Historie überschreibt.

Alles, was diese Werkzeuge braucht, ist mit **G** gekennzeichnet und bleibt offen. Was ich stattdessen geprüft habe, steht jeweils daneben.

---

# Teil 1: Werkzeugkette

| Prüfpunkt               | Ergebnis                 | Bewertung |
| ----------------------- | ------------------------ | --------- |
| Node                    | v22.22.2                 | ✅        |
| npm                     | 10.9.7                   | ✅        |
| git                     | 2.43.0                   | ✅        |
| Geforderte Node-Version | `engines: >=20`, erfüllt | ✅        |
| **Docker**              | nicht vorhanden          | ❌ **G**  |
| **Docker Compose**      | nicht vorhanden          | ❌ **G**  |
| **Supabase CLI**        | nicht vorhanden          | ❌ **G**  |
| psql                    | nicht vorhanden          | ❌ **G**  |
| Deno                    | nicht vorhanden          | ❌ **G**  |
| npm-Registry            | 403 Forbidden            | ❌ **G**  |

## 1.1 Zwei Projektbefunde zur Versionsführung

| Befund                                                                                                                                   | Bewertung |
| ---------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **P** Keine `.nvmrc`. Ein neuer Entwickler hat keine Versionsbindung                                                                     | ⚠         |
| **P** CI läuft auf Node 20, `engines` erlaubt ab 20, lokal wird 22 verwendet. Geprüft wird also auf einer anderen Version als entwickelt | ⚠         |

Beides ist klein und beides erzeugt später schwer zuzuordnende Abweichungen. Behebung: eine Datei mit einer Zeile, und die CI auf dieselbe Version heben.

---

# Teil 2: Repository, Konfiguration, Abhängigkeiten

## 2.1 Konfigurationsdateien

Alle 14 erwarteten Dateien vorhanden, alle JSON-Dateien gültig geparst.

`package.json`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `vite.config.ts`, `tailwind.config.ts`, `postcss.config.js`, `eslint.config.js`, `.prettierrc`, `.prettierignore`, `.gitignore`, `netlify.toml`, `supabase/config.toml`, `.env.example`

Bewertung: ✅

## 2.2 Abhängigkeiten

| Prüfpunkt               | Ergebnis                                | Bewertung |
| ----------------------- | --------------------------------------- | --------- |
| Umfang                  | 7 Laufzeit, 19 Entwicklung              | ✅        |
| **`package-lock.json`** | **fehlt**                               | ❌ **P**  |
| `node_modules`          | fehlt, folgt aus dem fehlenden Lockfile | ❌ **G**  |
| Erzeugung des Lockfiles | hier unmöglich, Registry 403            | **G**     |

Der fehlende Lockfile ist ein **Projektbefund**, nicht meine Prüfgrenze. Er fehlte auch im hochgeladenen Archiv. Folge: Die CI-Aufgabe `quality` bricht bei `npm ci` ab, weil dieser Befehl ohne Lockfile den Dienst verweigert.

## 2.3 Git

| Prüfpunkt                                      | Ergebnis                                                                   | Bewertung |
| ---------------------------------------------- | -------------------------------------------------------------------------- | --------- |
| Repository, Branch-Struktur, Remotes, Historie | hier nicht vorhanden                                                       | **G**     |
| `.gitignore`                                   | vorhanden, deckt `node_modules`, `dist`, `.env`, `supabase/functions/.env` | ✅        |

Zur Branch-Struktur kann ich keine Aussage treffen. Sie ist von hier aus unsichtbar.

---

# Teil 3: Docker

| Prüfpunkt                                                                       | Ergebnis                   |
| ------------------------------------------------------------------------------- | -------------------------- |
| Installation, Compose, Container, Volumes, Netzwerk, Startverhalten, Persistenz | **sämtlich nicht prüfbar** |

Bewertung: ❌ **G**

Docker ist die Voraussetzung für `supabase db start` und damit für den lokalen Stapel, die Migrationsprüfung und die 94 Prüfungen. Ohne Docker ist der gesamte Prüfteil von Sprint 0 nicht ausführbar. Das ist der wichtigste einzelne Grund für das Urteil in Teil 10.

---

# Teil 4: Supabase

## 4.1 Was geprüft werden konnte

Über den Datenbankzugang, ohne CLI.

| Prüfpunkt                           | Ergebnis                                                                        | Bewertung       |
| ----------------------------------- | ------------------------------------------------------------------------------- | --------------- |
| Projekt erreichbar                  | `shaydtihwicnocjjlnjm`, eu-central-2, ACTIVE_HEALTHY                            | ✅              |
| PostgreSQL                          | 17.6                                                                            | ✅              |
| Verbindungsrolle                    | `postgres`, **kein Superuser**                                                  | ✅ dokumentiert |
| Tabellen mit RLS aktiv              | 24                                                                              | ✅              |
| Policies                            | 40                                                                              | ✅              |
| RPC-Funktionen in `public`          | 26                                                                              | ✅              |
| Trigger in `public`                 | 5                                                                               | ✅              |
| Auth-Trigger `on_auth_user_created` | vorhanden                                                                       | ✅              |
| Auth-Nutzer                         | 5                                                                               | ⚠ siehe Teil 8  |
| Storage-Buckets                     | 1, `produktbilder`, öffentlich, 3 Objekte                                       | ⚠ siehe Teil 8  |
| Extensions                          | `pg_stat_statements`, `pgcrypto`, `supabase_vault`, `uuid-ossp`, `vector 0.8.2` | ✅              |
| **pgvector**                        | vorhanden, 0.8.2                                                                | ✅              |
| **pg_cron**                         | **nicht installiert**                                                           | ⚠ **P**         |
| **pg_net**                          | **nicht installiert**                                                           | ⚠ **P**         |
| **pgTAP**                           | **nicht installiert**                                                           | ❌ **P**        |
| Migrationsverfolgung                | `supabase_migrations.schema_migrations` **fehlt**                               | ⚠ **P**         |

## 4.2 Vier Befunde mit Folgen

**pgTAP nicht installiert.** Die 94 Prüfungen können nirgends laufen, auch nicht gegen die Produktionsdatenbank. Das Installieren wäre eine dauerhafte Änderung an der Produktionsdatenbank und gehört in den lokalen Stapel, nicht dorthin.

**Keine Migrationsverfolgung.** Das Setup lief über den SQL-Editor. Die Datenbank weiß nicht, welche der 12 Migrationen angewendet sind. Für Sprint 1 muss das nachgeholt werden, sonst ist jede weitere Migration eine Handarbeit ohne Nachweis.

**pg_cron und pg_net fehlen.** Bestätigt die Einordnung aus der Roadmap: Benachrichtigungen mit Zeitsteuerung sind nicht baubar, bis mindestens `pg_cron` verfügbar ist. Für Version 1.0 nicht vorgesehen, deshalb ⚠ und nicht ❌.

**`postgres` ist kein Superuser.** Bereits in Sprint 0 der Testumgebung berücksichtigt, deshalb arbeitet der Testplan mit `session_replication_role` statt mit `ALTER TABLE ... DISABLE TRIGGER`. Die Entscheidung war richtig und ist hier erneut bestätigt.

## 4.3 Auslieferungsstand der Edge Functions

| Function           | Version | Zuletzt ausgeliefert | `verify_jwt` | Auslieferungsart      |
| ------------------ | ------- | -------------------- | ------------ | --------------------- |
| `validate-invite`  | 6       | 22.07.2026 19:07     | **true**     | Einzeldatei           |
| `coach-chat`       | 7       | 24.07.2026 03:47     | **false**    | modular mit `_shared` |
| `ingest-knowledge` | 7       | 24.07.2026 03:47     | **false**    | modular mit `_shared` |

Drei Befunde:

| #   | Befund                                                                                                                                                                                                  | Bewertung |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1   | **`verify_jwt` ist genau umgekehrt zum Bedarf.** `validate-invite` wird bei der Registrierung aufgerufen und hat `true`. `coach-chat` und `ingest-knowledge` verlangen eine Anmeldung und haben `false` | ⚠ **P**   |
| 2   | **Zwei Auslieferungsarten in Gebrauch.** Eine Function als Einzeldatei, zwei modular                                                                                                                    | ⚠ **P**   |
| 3   | Quelltext des ausgelieferten Stands **nicht vergleichbar**. Der Abruf wurde abgewiesen                                                                                                                  | **G**     |

Zu Befund 1: Es ist kein Loch, weil beide Functions im Code selbst prüfen und mit 401 antworten. Aber unauthentifizierter Verkehr erreicht überhaupt erst die Function und verbraucht Aufrufe. Bei einem kostenpflichtigen Modell ist das die Ebene, auf der Missbrauch abzufangen wäre.

Zu Befund 3: Ein Byte-Vergleich zwischen ausgeliefertem Stand und Repository ist mir nicht möglich. Indirekt lässt sich sagen: Der Coach antwortet, und `agents.model` steht auf `claude-sonnet-4-6`. Ein ausgelieferter Stand mit `gemini-2.5-flash` und ohne Rückfall würde mit 404 scheitern. Der ausgelieferte Stand enthält also die Modellkorrektur. Änderungen am Funktionscode nach dem 24. Juli betrafen nur Kommentare.

---

# Teil 5: Tests, Build, CI

| Prüfpunkt                     | Ergebnis                                     | Bewertung |
| ----------------------------- | -------------------------------------------- | --------- |
| Testrahmen Frontend           | Vitest eingebunden                           | ✅        |
| Testrahmen Datenbank          | pgTAP, 6 Dateien, 94 Prüfungen geschrieben   | ✅        |
| **Prüfungen ausführbar**      | **nein**, kein pgTAP, keine CLI, kein Docker | ❌ **G**  |
| **`npm run test`**            | nicht ausführbar, keine Abhängigkeiten       | ❌ **G**  |
| **`npm run lint`**            | nicht ausführbar                             | ❌ **G**  |
| **`npm run typecheck`**       | nicht ausführbar                             | ❌ **G**  |
| **`npm run build`**           | nicht ausführbar                             | ❌ **G**  |
| **Typgenerierung `db:types`** | nicht ausführbar, braucht lokalen Stapel     | ❌ **G**  |
| Datenbanktypen                | **handgepflegt**, siehe unten                | ⚠ **P**   |
| CI-Struktur                   | 3 Aufgaben: `quality`, `database`, `secrets` | ✅        |
| Geheimnisprüfung              | gitleaks eingebunden                         | ✅        |

## 5.1 Ersatzprüfungen, die ohne npm möglich waren

| Prüfung                                         | Umfang                      | Ergebnis           |
| ----------------------------------------------- | --------------------------- | ------------------ |
| Syntax aller TypeScript- und JavaScript-Dateien | **64 Dateien**              | **0 Fehler** ✅    |
| Strikte Typprüfung Edge Functions, modular      | mit Deno-Ersatzdefinitionen | **fehlerfrei** ✅  |
| Strikte Typprüfung Edge Functions, gebündelt    | mit Deno-Ersatzdefinitionen | **fehlerfrei** ✅  |
| Generatorabgleich Bundles                       | 3 Dateien                   | **aktuell** ✅     |
| Generatorabgleich Setup-Datei                   | 12 Migrationen              | **aktuell** ✅     |
| Balance der `$$`-Begrenzer                      | 12 Migrationen              | **alle gerade** ✅ |
| Reihenfolge der Migrationen                     | 12 Dateien                  | **korrekt** ✅     |

Das ersetzt keinen Build. Es schließt aber Syntax- und Typfehler als Ursache aus, wenn der Build später scheitert.

## 5.2 Der Typen-Drift ist unverändert offen

`src/shared/types/database.types.ts` ist laut eigenem Kopfkommentar handgepflegt und wurde von mir um vier Tabellen erweitert. Die CI-Aufgabe `database` vergleicht sie mit der Generatorausgabe und bricht bei Abweichung ab. Eine handgeschriebene Datei stimmt nie zeichengenau.

Bewertung: ⚠ **P**. Behebung ist ein Befehl, braucht aber den lokalen Stapel.

---

# Teil 6: F1-Verifikation

Punktweise gegen die Produktionsdatenbank geprüft. Nicht analysiert, nur verifiziert.

| #     | Zusage aus Migration 12                                          | Ergebnis                           |
| ----- | ---------------------------------------------------------------- | ---------------------------------- |
| F1-01 | `is_ancestor_of` existiert                                       | ❌ nicht erfüllt                   |
| F1-02 | `plan_contact_state` ohne Nutzerparameter                        | ❌ nicht erfüllt                   |
| F1-03 | `plan_signal_*` ohne Nutzerparameter                             | ❌ nicht erfüllt, **5 betroffen**  |
| F1-04 | `get_downline` mit Organisationsfilter                           | ❌ nicht erfüllt                   |
| F1-05 | `get_downline` mit Aufruferprüfung                               | ❌ nicht erfüllt                   |
| F1-06 | `coach_messages_today` mit Aufruferprüfung                       | ❌ nicht erfüllt                   |
| F1-07 | `track_usage` mit Aufruferprüfung                                | ❌ nicht erfüllt                   |
| F1-08 | `match_knowledge` mit `extensions` im `search_path`              | ❌ nicht erfüllt                   |
| F1-09 | `anon` ohne EXECUTE auf `get_downline`                           | ❌ nicht erfüllt                   |
| F1-10 | `anon` ohne EXECUTE auf `plan_contact_state`                     | ❌ nicht erfüllt                   |
| F1-11 | `anon` ohne EXECUTE auf `validate_invite`                        | ❌ nicht erfüllt                   |
| F1-12 | `anon` behält EXECUTE auf `current_org_id`                       | ✅ erfüllt                         |
| F1-13 | Test I1, jede DEFINER-Funktion mit `search_path`                 | ✅ erfüllt, **aber siehe 6.2**     |
| F1-14 | Test J1, keine DEFINER-Funktion mit Nutzerparameter ohne Prüfung | ❌ nicht erfüllt, **9 Funktionen** |
| F1-15 | pgTAP installiert                                                | ❌ nicht erfüllt                   |

**13 von 15 nicht erfüllt. Migration 12 ist nicht angewendet.**

Bewertung: ❌ **P**

## 6.1 Was das konkret bedeutet

Die neun Funktionen, die F1 absichert, sind unverändert offen. `plan_contact_state` gibt weiterhin die Kontaktliste beliebiger Nutzer heraus, `get_downline` hat weiterhin keinen Organisationsfilter, `anon` hat weiterhin Ausführungsrechte.

Einordnung, unverändert aus dem Masterplan: Es liegen **null Kontakte** vor. Die Lücke hat derzeit keine Daten hinter sich. Es liegen aber **6 offene Einladungen** vor.

## 6.2 Ein Fund gegen meinen eigenen Testplan

F1-13 ist erfüllt, obwohl Migration 12 nicht angewendet ist. Das ist kein Zufall, sondern eine Lücke in meinem Test.

Geprüft: Genau **vier** Funktionen haben keinen festgenagelten `search_path`, und alle vier sind `SECURITY INVOKER`:

`event_phase_rank`, `match_knowledge`, `protect_profile_columns`, `set_updated_at`

Mein Test I1 in `function_security.test.sql` prüft ausschließlich Funktionen mit `prosecdef`, also DEFINER. Die vier Funktionen, deren `search_path` F1 nachzieht, fallen deshalb nicht in den Prüfbereich.

**Folge: Der Test I1 würde grün werden, ohne dass die Härtung stattgefunden hat.** Ein Test, der falsche Sicherheit gibt, ist schlechter als kein Test.

**Behoben in diesem Sprint.** Die Bedingung `prosecdef` ist aus dem Prädikat entfernt, geprüft wird jetzt jede Funktion in `public`. Gegen die Produktionsdatenbank verifiziert:

| Fassung              | Treffer | Verhalten                                    |
| -------------------- | ------- | -------------------------------------------- |
| alt, nur DEFINER     | **0**   | wäre grün geworden, obwohl die Härtung fehlt |
| neu, alle Funktionen | **4**   | wird rot, erkennt die Lücke korrekt          |

Die vier Treffer sind genau die vier invoker-Funktionen. Nach Anwendung von Migration 12 muss die Prüfung grün werden. Damit ist sie ab Sprint 1 ein belastbarer Maßstab.

Bewertung: ✅ **behoben**, Datei `supabase/tests/database/function_security.test.sql`.

---

# Teil 7: Dokumentation

| Prüfpunkt                            | Ergebnis                                                       | Bewertung   |
| ------------------------------------ | -------------------------------------------------------------- | ----------- |
| `README.md`                          | vorhanden, 230 Zeilen                                          | ✅          |
| **Installationsanleitung im README** | **keine Überschrift zu Installation, Setup oder Schnellstart** | ❌ **P**    |
| **Entwickler-Onboarding**            | **kein eigenes Dokument**                                      | ❌ **P**    |
| Projektstruktur dokumentiert         | knapp, eine Fundstelle                                         | ⚠ **P**     |
| `.env.example`                       | vorhanden, 9 Zeilen                                            | ⚠ siehe 7.1 |
| `docs/deployment.md`                 | vorhanden, 70 Zeilen                                           | ✅          |
| `setup/SETUP-ANLEITUNG.md`           | vorhanden, 132 Zeilen                                          | ✅          |
| `docs/adr.md`                        | vorhanden, 472 Zeilen, 29 Entscheidungen                       | ✅          |
| `docs/design-system.md`              | vorhanden, 95 Zeilen                                           | ✅          |

## 7.1 Umgebungsvariablen, Abgleich Code gegen Dokumentation

Im Code verwendet, acht Variablen:

`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FAST_MODEL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

In `.env.example` dokumentiert, fünf:

`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FAST_MODEL`

Die drei fehlenden werden von Supabase in ausgelieferten Edge Functions automatisch bereitgestellt. Für die Produktion ist die Auslassung korrekt. Für **lokales** Ausführen mit `supabase functions serve --env-file` müssen sie gesetzt sein, und genau dieser Befehl steht im README.

Bewertung: ⚠ **P**. Drei Zeilen mit einem Hinweis, dass sie nur lokal nötig sind.

## 7.2 Die eigentliche Lücke

Es gibt 24 Dokumente unter `docs/`, darunter vier vollständige Architekturbände. Es gibt **keine Anleitung, wie man das Projekt zum Laufen bringt.**

Ein neuer Entwickler findet Architekturentscheidungen zu Berechtigungsmodellen und Vektorräumen, aber nicht die Reihenfolge aus Repository holen, Abhängigkeiten installieren, lokalen Stapel starten, Umgebungsvariablen setzen, Prüfungen ausführen.

Das ist die auffälligste Auslassung der gesamten Dokumentation, und sie fällt genau in Sprint 0.

---

# Teil 8: Reste des Vorprojekts

Kurz, weil ausdrücklich nicht mein Auftrag. Beide Befunde stammen vom **8. Juni 2026**, dem Tag der Projektanlage. Die erste AscendOS-Migration ist vom **21. Juli**.

| Befund                                                                                    | Einordnung                                                                                                                                                  |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **3 Auth-Nutzer ohne Profil**, alle bestätigt, keiner mit Einladungscode in den Metadaten | Kein AscendOS-Mangel. Sie können sich anmelden, erhalten aber nichts, weil `current_org_id()` ohne Profil NULL liefert und jede Policy geschlossen ausfällt |
| **Storage-Bucket `produktbilder`, öffentlich, 3 Objekte**                                 | Kein AscendOS-Bestandteil. Öffentlich lesbar für jeden mit der Adresse                                                                                      |

Ich habe an beidem nichts geändert und empfehle keine Änderung im Rahmen von Sprint 0. Beides gehört auf eine Liste für einen späteren Aufräumschritt, gemeinsam mit `kabelkatalog_state`.

---

# Teil 9: Bewertung nach Vorgabe

| Punkt                           | Bewertung | Begründung                                                                                                                                                        |
| ------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Entwicklungsumgebung bereit** | ❌        | Docker, Supabase CLI und npm-Registry fehlen. Kein Lockfile                                                                                                       |
| **Migrationen bereit**          | ⚠         | 12 Dateien vorhanden, Reihenfolge korrekt, Syntax geprüft. Migration 12 nirgends angewendet, keine Migrationsverfolgung                                           |
| **Tests bereit**                | ⚠         | 94 Prüfungen geschrieben, strukturell validiert, **nie ausgeführt**. Der Test mit falscher Sicherheit ist behoben und gegen die Datenbank gegengeprüft, siehe 6.2 |
| **CI bereit**                   | ❌        | Struktur korrekt, zwei Aufgaben brechen sicher ab: `npm ci` ohne Lockfile, Typenabgleich gegen handgepflegte Datei                                                |
| **Build bereit**                | ⚠         | Nicht ausführbar. Ersatzweise 64 Dateien syntaktisch und Edge Functions strikt typgeprüft, alles fehlerfrei                                                       |
| **F1 verifiziert**              | ❌        | 13 von 15 Zusagen nicht erfüllt. Migration 12 nicht angewendet                                                                                                    |

---

# Teil 10: Priorisierte To-do-Liste

Ausschließlich Sprint-0-Umfang. Keine Architektur, keine Features.

## Blockierend für Sprint 1

| #      | Aufgabe                                                                                                     | Wer            | Aufwand     |
| ------ | ----------------------------------------------------------------------------------------------------------- | -------------- | ----------- |
| **T1** | **Rechner mit Docker und Supabase CLI bereitstellen.** Ohne das ist keine der folgenden Aufgaben ausführbar | Sie            | Beschaffung |
| **T2** | `npm install`, `package-lock.json` einchecken                                                               | Sie am Rechner | 5 Minuten   |
| **T3** | `supabase db start`, alle 12 Migrationen anwenden, Fehler protokollieren                                    | Sie am Rechner | 15 Minuten  |
| **T4** | `npm run db:types`, erzeugte Datei einchecken                                                               | Sie am Rechner | 5 Minuten   |
| ~~T5~~ | ~~Test I1 korrigieren~~ **erledigt in diesem Sprint.** Gegengeprüft: alt 0 Treffer, neu 4 Treffer           | ich            | erledigt    |
| **T6** | `supabase test db`, alle 94 Prüfungen ausführen, Ergebnis protokollieren                                    | Sie am Rechner | 10 Minuten  |
| **T7** | CI grün bekommen. Erwartet grün nach T2 und T4                                                              | Sie            | 15 Minuten  |

## Nicht blockierend, aber Sprint-0-Umfang

| #   | Aufgabe                                                                                                              | Wer              | Aufwand    |
| --- | -------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------- |
| T8  | **Sechs offene Einladungen zurückhalten**, bis F1 in Produktion ist. Entschärft die einzige Frist                    | Sie, SQL-Editor  | 2 Minuten  |
| T9  | Installationsanleitung im README ergänzen: Repository, Abhängigkeiten, lokaler Stapel, Umgebungsvariablen, Prüfungen | ich              | 1 Stunde   |
| T10 | `.env.example` um die drei lokal nötigen Variablen ergänzen, mit Hinweis                                             | ich              | 10 Minuten |
| T11 | `.nvmrc` anlegen, CI-Node-Version darauf heben                                                                       | ich              | 10 Minuten |
| T12 | Migrationsverfolgung einrichten, damit der SQL-Editor-Weg endet                                                      | Sie am Rechner   | 15 Minuten |
| T13 | `verify_jwt` bei den drei Functions richtigstellen                                                                   | Sie im Dashboard | 5 Minuten  |
| T14 | Auf eine Auslieferungsart festlegen, modular oder Einzeldatei                                                        | Entscheidung     | Minuten    |
| T15 | Entwickler-Onboarding als eigenes Dokument                                                                           | ich              | 1 Stunde   |

T5, T9, T10, T11 und T15 kann ich hier erledigen. Alles mit Rechnerbezug nicht.

---

# Abschluss

## NEIN

Sprint 1 kann nicht beginnen.

## Blocker, die Sprint 1 tatsächlich verhindern

Nur die, die es wirklich verhindern. Der Rest steht in Teil 10.

| #      | Blocker                                      | Warum es Sprint 1 verhindert                                                                                                                                                                                                                                                                                                                                                                                     |
| ------ | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **B1** | **Kein Rechner mit Docker und Supabase CLI** | Sprint 1 wendet Migration 12 auf Produktion an. Die Migration ist **nirgends** angewendet worden. Sie enthält zwei Konstrukte, die nur eigenständig geprüft sind: die `CYCLE`-Klausel innerhalb `RETURN QUERY` und die Rechtebefehle mit `extensions.vector` in der Signatur. Eine ungeprüfte Migration direkt auf Produktion anzuwenden, ist genau das, was die Definition of Done von Sprint 0 verhindern soll |
| **B2** | **Die 94 Prüfungen wurden nie ausgeführt**   | Die Definition of Done von Sprint 1 lautet, dass Prüfung J1 grün ist und `anon` kein Ausführungsrecht mehr hat. Ohne ausführbare Prüfungen ist dieser Nachweis nicht erbringbar. pgTAP ist nirgends installiert                                                                                                                                                                                                  |
| ~~B3~~ | ~~Test I1 gibt falsche Sicherheit~~          | **In diesem Sprint behoben.** Der Test prüfte nur DEFINER-Funktionen, während genau die vier betroffenen invoker sind. Er wäre grün geworden, ohne dass die Härtung geschah. Korrigiert und gegen die Produktionsdatenbank gegengeprüft                                                                                                                                                                          |

**Es verbleiben zwei Blocker, B1 und B2. Beide hängen an einem Rechner mit Docker und Supabase CLI.** Beide sind an einem Vormittag zu erledigen, sobald dieser Zugang besteht.

## Zur Fristspannung, ehrlich

F1 behebt eine offene Lücke. Es liegen 6 Einladungen aus. Daraus entsteht ein Druck, Migration 12 ohne Prüfung über den SQL-Editor auf Produktion anzuwenden.

Drei Wege, mit ihren Kosten:

| Weg                                         | Nutzen                                     | Kosten                                                                                                                                                                     |
| ------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: Auf den Rechner warten, dann ordentlich  | vollständig geprüft                        | Lücke bleibt offen, solange Einladungen aus sind                                                                                                                           |
| B: Migration ungeprüft auf Produktion       | Lücke sofort zu                            | Zwei ungeprüfte Konstrukte. Ein Fehler in `get_downline` oder in den Rechtebefehlen kann Nutzer aussperren oder Rechte falsch setzen. Kein Rückweg ohne weitere Handarbeit |
| C: **Einladungen zurückhalten, dann Weg A** | Frist entfällt, Prüfung bleibt vollständig | 2 Minuten Aufwand, Registrierungen verschieben sich                                                                                                                        |

**Empfehlung: C.** Die Frist entsteht ausschließlich durch die offenen Einladungen. Sie zu entwerten kostet zwei Minuten und löst den Konflikt vollständig, ohne die Prüfdisziplin aufzugeben, die diesen Sprint überhaupt begründet.

Ich empfehle ausdrücklich **nicht** Weg B, obwohl er die Lücke am schnellsten schließt. Migration 12 ist von mir geschrieben, und in zwei aufeinanderfolgenden Runden habe ich darin je einen eigenen Fehler gefunden, einen davon einen harten Syntaxfehler. Das ist der Grund, warum Sprint 0 existiert.
