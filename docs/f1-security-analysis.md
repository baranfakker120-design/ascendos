# F1: Sicherheitsanalyse der Datenbankfunktionen

Umfang: alle 26 Funktionen im Schema `public`, alle 4 Views, alle Trigger, alle Ausführungsrechte, alle Policies.
Grundlage: Live-Datenbank `shaydtihwicnocjjlnjm`, Migrationen 1 bis 11.
Datum: 24. Juli 2026. Analyse vor Umsetzung, wie vorgegeben.

---

## 1. Ausgangslage

26 Funktionen, davon 22 `SECURITY DEFINER`. Eine `DEFINER`-Funktion läuft mit den Rechten ihres Eigentümers, hier `postgres`. Damit ist RLS für alles, was sie liest oder schreibt, ausgeschaltet. Das ist ein legitimes Mittel, aber jede solche Funktion ist ein Loch in der RLS und muss die Berechtigung selbst prüfen.

Neun Funktionen tun das nicht.

## 2. Die entscheidende Vorprüfung: fällt RLS für `anon` geschlossen aus?

Bevor Schwere bewertet werden kann, muss geklärt sein, was ein unauthentifizierter Aufrufer regulär sieht.

Alle Policies sind mit `TO public` angelegt, gelten also für `anon` und `authenticated`. Die Absicherung liegt in der `USING`-Bedingung, die durchgehend `auth.uid()` oder `current_org_id()` nutzt.

Für `anon` ist `auth.uid()` NULL. `current_org_id()` liest `org_id` aus `profiles` für `auth.uid()`, findet keine Zeile und gibt NULL zurück. Bedingungen wie `org_id = current_org_id()` werden damit NULL, also nicht wahr, und liefern keine Zeilen.

**Ergebnis: RLS fällt für `anon` korrekt geschlossen aus.** Zwei Ausnahmen betreffen Tabellen des Fremdprojekts (`products`, `duftnoten`) und bleiben hier unberührt.

Das ist die gute Nachricht und sie begrenzt die Schwere von F1 erheblich. Die schlechte folgt in Abschnitt 3.

## 3. Die Angriffskette für authentifizierte Nutzer

Der View `profiles_public` hat **kein** `security_invoker` und läuft daher mit den Rechten von `postgres`. Die restriktive Policy `profiles_select_own` wird dabei umgangen. Der View hat stattdessen seine eigene Bedingung `where org_id = current_org_id()`.

Für `anon` fällt auch das geschlossen aus, weil `current_org_id()` NULL ist. Für einen angemeldeten Berater liefert der View jedoch **alle Profile seiner Organisation**, mit den Spalten `id, org_id, team_id, sponsor_id, role, first_name, last_name, username, avatar_url`.

Das ist so gewollt und richtig. Der View ist eine Teamliste, und dafür muss er die auf das eigene Profil beschränkte Basis-Policy erweitern. Der View ist **nicht** die Schwachstelle.

Er ist aber die Bezugsquelle für Nutzerkennungen, und damit ist die Kette geschlossen:

1. Ein beliebiger angemeldeter Berater liest `select id from profiles_public`. Ergebnis: alle Nutzerkennungen seiner Organisation, nicht nur seiner Downline.
2. Derselbe Berater ruft `plan_contact_state('<Kennung eines Kollegen>')` auf.
3. Die Funktion ist `DEFINER`, prüft den Aufrufer nicht und filtert nur nach dem übergebenen Parameter: `where c.owner_id = p_user`.
4. Rückgabe: die vollständige Kontaktliste dieses Kollegen mit `name`, `next_step`, `next_step_due`, `last_event_at` und dem Pipeline-Zustand.

Kein Sonderwissen, kein erhöhtes Recht, zwei Abfragen. Die Policy auf `contacts` lautet `owner_id = auth.uid()` und wird damit vollständig ausgehebelt.

**Betroffene Datenkategorie:** `contacts.name` und `contacts.next_step` sind personenbezogene Daten Dritter. Diese Personen sind keine Nutzer von AscendOS, haben nicht zugestimmt und wissen von der Verarbeitung nichts. Das ist die sensibelste Kategorie im System.

## 4. Funktionsmatrix

Die neun Prüffragen aus der Aufgabenstellung, für jede der 26 Funktionen.

Legende: `uid` = prüft `auth.uid()`, `org` = prüft Organisation, `own` = prüft Eigentum, `rol` = prüft Rolle.

### 4.1 Gruppe A: Fremdparameter ohne Prüfung, Handlungsbedarf

| Funktion | Aufrufbar von | Ergebnis sichtbar für | DEFINER nötig? | uid | org | own | rol | Befund |
|---|---|---|---|---|---|---|---|---|
| `plan_contact_state(p_user)` | anon, auth, PUBLIC | jeden Aufrufer | **nein** | fehlt | fehlt | fehlt | nein | Kontaktdaten Dritter |
| `plan_signal_fit_check(p_user, p_date)` | anon, auth, PUBLIC | jeden Aufrufer | **nein** | fehlt | fehlt | fehlt | nein | Kontaktnamen |
| `plan_signal_next_step(p_user, p_date)` | anon, auth, PUBLIC | jeden Aufrufer | **nein** | fehlt | fehlt | fehlt | nein | Kontaktnamen |
| `plan_signal_presentation(p_user, p_date)` | anon, auth, PUBLIC | jeden Aufrufer | **nein** | fehlt | fehlt | fehlt | nein | Kontaktnamen |
| `plan_signal_follow_up(p_user, p_date)` | anon, auth, PUBLIC | jeden Aufrufer | **nein** | fehlt | fehlt | fehlt | nein | Kontaktnamen |
| `plan_signal_reactivate(p_user, p_date)` | anon, auth, PUBLIC | jeden Aufrufer | **nein** | fehlt | fehlt | fehlt | nein | Kontaktnamen |
| `get_downline(root_user_id)` | anon, auth, PUBLIC | jeden Aufrufer | ja | fehlt | **fehlt** | fehlt | nein | Genealogie, mandantenübergreifend |
| `coach_messages_today(p_user)` | anon, auth, PUBLIC | jeden Aufrufer | ja | fehlt | fehlt | fehlt | nein | Nutzungszahl Dritter |
| `track_usage(p_user, p_event, p_meta)` | PUBLIC | schreibend | ja | fehlt | teilweise | fehlt | nein | **Fälschung von Aktivität** |

### 4.2 Gruppe B: DEFINER mit korrekter Prüfung, nur Rechte einschränken

| Funktion | Prüfung vorhanden | DEFINER nötig? | Handlungsbedarf |
|---|---|---|---|
| `check_achievements()` | `auth.uid()`, kein Parameter | ja, schreibt `user_achievements` | EXECUTE von `anon` entziehen |
| `commit_daily_plan(p_plan_id)` | `auth.uid()` gegen Plan-Eigentümer | ja | EXECUTE von `anon` entziehen |
| `complete_journey_step(p_step_id)` | `auth.uid()` und `org_id` | ja | EXECUTE von `anon` entziehen |
| `correct_pipeline_event(p_event_id)` | `auth.uid()` und `org_id` | ja | EXECUTE von `anon` entziehen |
| `create_invite(invite_role)` | `auth.uid()`, Rollenprüfung für leader und admin | ja | EXECUTE von `anon` entziehen |
| `generate_daily_plan(p_date)` | `auth.uid()`, kein Fremdparameter | ja, schreibt Plan | Aufrufe an neue Signaturen anpassen |
| `update_mission_status(p_item_id, ...)` | `auth.uid()` und `org_id` | ja | EXECUTE von `anon` entziehen |
| `validate_invite(invite_code)` | keine, **so gewollt** | ja | EXECUTE von `anon` entziehen, siehe unten |

Zu `validate_invite`: Die Funktion muss ohne Anmeldung funktionieren, weil sie in der Registrierung genutzt wird. Geprüft: Die Edge Function `validate-invite` verwendet `SUPABASE_SERVICE_ROLE_KEY`. Der Aufruf läuft also nicht über `anon`, und das Recht kann entzogen werden. Die Ratenbegrenzung liegt in der Edge Function über `invite_validation_attempts`, nicht in der Funktion. Das bleibt so.

### 4.3 Gruppe C: Helferfunktionen, die in Policies aufgerufen werden

| Funktion | Vorkommen in Policies | Rechte |
|---|---|---|
| `current_org_id()` | 31 | **EXECUTE muss für `anon` bleiben** |
| `is_super_admin()` | 19 | **EXECUTE muss für `anon` bleiben** |
| `current_user_role()` | 1 | **EXECUTE muss für `anon` bleiben** |

Das ist die wichtigste Einschränkung der ganzen Migration. Eine RLS-Policy wird mit den Rechten der abfragenden Rolle ausgewertet. Entzieht man `anon` das Ausführungsrecht auf eine Funktion, die in einer Policy steht, führt jede Abfrage dieser Rolle zu `permission denied for function` statt zu einem leeren Ergebnis.

Ein pauschales `revoke execute on all functions from anon` würde die Anwendung für unangemeldete Aufrufe unbrauchbar machen, insbesondere die Registrierung. Deshalb wird selektiv entzogen, nie pauschal.

### 4.4 Gruppe D: Trigger-Funktionen

| Funktion | Trigger auf | DEFINER nötig? | Handlungsbedarf |
|---|---|---|---|
| `handle_new_user()` | `auth.users` | ja, schreibt `profiles` an RLS vorbei | Direktaufruf unterbinden |
| `log_contact_created()` | `contacts` | ja | Direktaufruf unterbinden |
| `protect_profile_columns()` | `profiles` | nein, invoker korrekt | **`search_path` fehlt** |
| `set_updated_at()` | `contacts`, `profiles`, `products` | nein | **`search_path` fehlt** |

Zu `set_updated_at`: Diese Funktion wird auch von einem Trigger auf `products` genutzt, einer Tabelle des Fremdprojekts. Das Ergänzen von `search_path` ändert das Verhalten nicht, die Funktion setzt lediglich `new.updated_at`. Der Eingriff ist unkritisch, wird aber vermerkt.

### 4.5 Gruppe E: Härtung ohne akute Lücke

| Funktion | Modus | Befund |
|---|---|---|
| `match_knowledge(...)` | invoker | `search_path` fehlt, `p_org_id` ist ein scheinbarer Berechtigungsparameter |
| `event_phase_rank(p_event_type)` | invoker, immutable | `search_path` fehlt, rein rechnend, geringes Risiko |

Zu `match_knowledge`: Der Parameter `p_org_id` sieht wie eine Berechtigungsgrenze aus, ist aber keine. Die tatsächliche Trennung leistet die Policy `knowledge_docs_select_approved` mit `org_id = current_org_id()`. Ein Aufrufer, der eine fremde Organisation übergibt, erhält deshalb nichts. Der Parameter ist damit irreführend, nicht unsicher. Er erhält eine Prüfung, damit er hält, was er suggeriert.

Wichtig bei `search_path` für `match_knowledge`: Der Operator `<=>` und der Typ `vector` liegen im Schema `extensions`. Ein auf `public` festgenagelter Pfad würde die Funktion zerstören. Korrekt ist `set search_path = public, extensions`.

### 4.6 Views

| View | `security_invoker` | Bewertung |
|---|---|---|
| `contact_phases` | true | korrekt |
| `effective_pipeline_events` | true | korrekt |
| `firstline_journey_progress` | true | korrekt |
| `profiles_public` | nicht gesetzt | **beabsichtigt**, siehe Abschnitt 3, keine Änderung |

---

## 5. Migrationsstrategie je Funktion

### 5.1 `plan_contact_state` und die fünf `plan_signal_*`

**Aktueller Zustand.** `SECURITY DEFINER`, Parameter `p_user uuid`, kein Aufruferbezug. Der einzige echte Aufrufer ist `generate_daily_plan`, und dort wird der Parameter aus `v_user uuid := auth.uid()` gefüllt. Der Parameter ist im gesamten Produktivpfad immer der aufrufende Nutzer. Kein Frontend- und kein Edge-Function-Aufruf existiert.

**Risiko.** Vollständige Offenlegung der Kontaktdaten beliebiger Nutzer, siehe Abschnitt 3.

**Angriffsszenario.** Angemeldeter Berater, zwei Abfragen, Kontaktliste jedes Kollegen inklusive `next_step`. Für `anon` zusätzlich möglich, sobald eine Nutzerkennung aus einer anderen Quelle bekannt ist, etwa einem geteilten Bildschirmfoto oder einem Protokolleintrag.

**Empfohlene Änderung.** Parameter `p_user` **entfernen** und intern `auth.uid()` verwenden. Zusätzlich `SECURITY INVOKER`.

Begründung für das Entfernen statt einer Prüfung: Ein Parameter, der immer den eigenen Nutzer enthält, ist keine Funktionalität, sondern Angriffsfläche. Eine Prüfung `if p_user <> auth.uid() then raise` wäre gleichwertig sicher, aber die Signatur würde weiterhin suggerieren, dass Fremdabfragen vorgesehen sind. Das Entfernen macht die Fehlbenutzung unmöglich statt sie abzufangen.

Begründung für `INVOKER`: Die Funktionen lesen ausschließlich. Als `INVOKER` greift bei einem Direktaufruf durch `authenticated` zusätzlich die RLS auf `contacts`. Zwei unabhängige Schranken statt einer.

Wichtige Feinheit: Beim Aufruf aus `generate_daily_plan`, das `DEFINER` bleibt, ist `current_user` gleich `postgres`. RLS greift dort also nicht, auch nicht bei `INVOKER`. Die Absicherung leistet in diesem Pfad der explizite Filter `owner_id = auth.uid()`. Dieser Filter ist deshalb nicht optional, sondern die eigentliche Garantie. `auth.uid()` funktioniert in beiden Fällen, weil es die JWT-Ansprüche der Sitzung liest und nicht die aktive Rolle.

**Auswirkungen.** `generate_daily_plan` muss neu erstellt werden, weil sich die Signaturen der aufgerufenen Funktionen ändern. Kein Frontend-Code betroffen, da kein direkter Aufruf existiert. Die generierten Typen in `src/shared/types/database.types.ts` enthalten diese Funktionen nicht.

**Tests.** Fremdaufruf ist nach der Änderung syntaktisch unmöglich, es gibt keinen Parameter mehr. Zu prüfen bleibt: Der Tagesplan wird für den eigenen Nutzer korrekt erzeugt, und ein zweiter Nutzer erhält seinen eigenen Plan mit seinen eigenen Kontakten.

### 5.2 `get_downline`

**Aktueller Zustand.** `DEFINER`, Parameter `root_user_id`, keine Aufruferprüfung, **kein `org_id`-Filter**. Die Rekursion läuft über die gesamte Tabelle `profiles`. Für `anon` ausführbar. Kein Aufrufer im Code, nur ein Eintrag in den generierten Typen.

**Risiko.** Offenlegung der Genealogiestruktur beliebiger Nutzer und, wegen des fehlenden Organisationsfilters, über Mandantengrenzen hinweg. Heute existiert eine Organisation, ab Skalierungsstufe 5 ist es ein Mandantenleck.

**Angriffsszenario.** Ein Berater ermittelt über `profiles_public` alle Kennungen seiner Organisation und rekonstruiert die vollständige Struktur, auch Zweige, die nicht zu seiner Linie gehören, also Sidelines. Die Wissensdatenbank definiert Sidelines ausdrücklich als Partner außerhalb der eigenen Struktur. Ihre Sichtbarkeit ist ein fachlicher Verstoß, nicht nur ein technischer.

**Empfohlene Änderung.** Parameter **behalten**, weil eine Teamleitung die Struktur einer anderen Person sehen soll. Ergänzen:

1. Organisationsfilter in der Rekursion, beide Zweige.
2. Berechtigungsprüfung: erlaubt, wenn der Aufrufer die Wurzel selbst ist, wenn er in der Upline der Wurzel steht, oder wenn er `super_admin` derselben Organisation ist. Andernfalls leere Rückgabe.

Für die Upline-Prüfung wird eine neue Funktion `public.is_ancestor_of(p_target uuid)` eingeführt. Sie beantwortet genau eine Frage: Steht `auth.uid()` in derselben Organisation oberhalb von `p_target`?

Anmerkung zur Abgrenzung: Befund F2 des Reviews fordert eine allgemeine Sichtbarkeitsfunktion `can_see_user()`. Diese wird hier **nicht** gebaut, weil F2 nicht Teil dieses Auftrags ist. `is_ancestor_of` ist der kleinste Baustein, den `get_downline` zwingend braucht, und ist bewusst so geschnitten, dass `can_see_user()` ihn später zusammensetzen kann, ohne dass Logik doppelt existiert.

Leere Rückgabe statt Ausnahme: Eine Ausnahme würde bestätigen, dass die Kennung existiert. Eine leere Menge ist von einer nicht existierenden Wurzel nicht unterscheidbar und verrät damit nichts.

**Auswirkungen.** Ein Aufrufer existiert: `check_achievements` ruft `get_downline(v_user)` für die Bedingung `downline_count` auf, und `v_user` ist dort `auth.uid()`. Damit greift der erste Zweig der Berechtigungsprüfung, `root_user_id = auth.uid()`, und die Funktion arbeitet unverändert.

> **KORREKTUR vom 25. Juli 2026.** Die erste Fassung behauptete hier „kein Aufrufer". Falsch, aus demselben Grund wie bei `track_usage`: Ich habe nur Frontend und Edge Functions durchsucht, nicht die Datenbankfunktionen selbst. Nachgeholt mit einer systematischen Aufrufsuche über alle Funktionen, Views und Policies. Ergebnis in der Tabelle unten.

**Vollständige Aufrufsuche, nachgeholt am 25. Juli 2026:**

| Funktion | Aufgerufen von |
|---|---|
| `track_usage` | `commit_daily_plan`, `complete_journey_step`, `log_contact_created`, `update_mission_status` |
| `get_downline` | `check_achievements` |
| `plan_contact_state` | alle fünf `plan_signal_*` |
| `plan_signal_*` | `generate_daily_plan` |
| `event_phase_rank` | `check_achievements`, View `contact_phases`, `plan_contact_state` |
| `coach_messages_today` | keiner in der Datenbank, Aufruf aus `coach-chat` |
| `match_knowledge` | keiner in der Datenbank, Aufruf aus `coach-chat` |
| `is_ancestor_of` | `get_downline`, neu in dieser Migration |

`track_usage` hat also **vier** Aufrufer, nicht null. Drei davon übergeben `auth.uid()`, der Trigger übergibt `new.owner_id`, was durch die Policy `contacts_owner_all` gleich `auth.uid()` ist. Die korrigierte Fassung trägt alle vier Wege.

**Tests.** Eigene Wurzel liefert die eigene Downline. Sponsor liefert die Downline seiner Firstline. Fremder Zweig derselben Organisation liefert nichts. Fremde Organisation liefert nichts. `super_admin` liefert innerhalb seiner Organisation, außerhalb nichts. Nicht existierende Kennung liefert nichts. `anon` erhält kein Ausführungsrecht.

### 5.3 `coach_messages_today`

**Aktueller Zustand.** `DEFINER`, Parameter `p_user`, keine Prüfung. Aufrufer ist die Edge Function `coach-chat`, Zeile 85, mit `p_user: userId`, also der Kennung des angemeldeten Nutzers. Der dort verwendete Client trägt das JWT des Nutzers.

**Risiko.** Gering im Vergleich zu 5.1. Offengelegt wird eine Zahl, die Nachrichtenanzahl eines beliebigen Nutzers am aktuellen Tag. Kein Inhalt, keine Namen. Es ist dennoch ein Nutzungsprofil einer anderen Person.

**Angriffsszenario.** Ein Berater beobachtet über Tage die Coach-Nutzung von Kollegen. Für sich harmlos, in Verbindung mit einer Leistungsbewertung nicht.

**Empfohlene Änderung.** Parameter **behalten**, weil ein späterer Adminbereich Kontingente je Nutzer anzeigen soll. Prüfung ergänzen: erlaubt für den eigenen Nutzer und für `super_admin` derselben Organisation, sonst Ausnahme.

Hier ist eine Ausnahme richtig und keine leere Rückgabe: Der Rückgabewert steuert das Tageslimit. Eine stillschweigende Null würde das Limit aushebeln.

**Auswirkungen.** `coach-chat` bleibt unverändert funktionsfähig, weil dort die eigene Kennung übergeben wird. Kein Frontend betroffen.

**Tests.** Eigene Kennung funktioniert. Fremde Kennung wirft eine Ausnahme. `super_admin` darf fremde Kennung derselben Organisation abfragen. `super_admin` einer anderen Organisation nicht.

### 5.4 `track_usage`

**Aktueller Zustand.** `DEFINER`, **schreibend**, Parameter `p_user`, keine Prüfung, Ausführungsrecht für `PUBLIC`.

> **KORREKTUR vom 25. Juli 2026.** Die erste Fassung dieses Abschnitts behauptete, die Funktion habe keinen Aufrufer und sei toter Code. **Das war falsch.** Aufrufer ist der Trigger `log_contact_created`, der in Migration 8 um `perform public.track_usage(new.owner_id, 'contact_created')` erweitert wurde.
>
> Ursache des Fehlers: Ich habe geprüft, welche Funktionen an einen Trigger *gebunden* sind, und im Frontend sowie in den Edge Functions nach Aufrufen gesucht. Ich habe die Migrationen nicht danach durchsucht, wer die Funktion *aufruft*. Migration 3 definierte `log_contact_created` noch ohne diesen Aufruf, Migration 8 fügte ihn hinzu.
>
> Aufgefallen ist es erst beim ersten Testlauf in Sprint 0.

Das Frontend schreibt zusätzlich direkt in `usage_events`, abgesichert durch die Policy `usage_events_insert_own`.

**Risiko.** Fälschung von Aktivitätsdaten für beliebige Nutzer, ohne Anmeldung.

**Angriffsszenario.** Ein Angreifer erzeugt beliebige `usage_events`. Auswirkung entsteht erst durch die Roadmap: Phase 6 baut Kennzahlen auf `usage_events`, Phase 8.3 baut Anerkennung auf Aktivitätsmetriken. Eine Auszeichnung auf fälschbarer Grundlage ist schlechter als keine. Zusätzlich verfälscht es jede Aussage darüber, ob die Roadmap wirkt.

**Empfohlene Änderung, korrigierte Fassung.** Die Funktion bleibt, weil sie einen Aufrufer hat. Zwei Eigenschaften:

1. **Die Eigentumsprüfung greift nur bei bestehender Nutzersitzung.** Der Trigger läuft als `SECURITY DEFINER` unter `postgres`, dort ist `auth.uid()` NULL. Eine harte Prüfung würde das Anlegen eines Kontakts scheitern lassen. Die eigentliche Grenze sind die Ausführungsrechte: `anon` hat kein EXECUTE, ein unangemeldeter Aufrufer erreicht diesen Weg also nicht.
2. **Warnung statt Ausnahme.** Eine Nachverfolgungsfunktion darf den Vorgang, den sie nachverfolgt, niemals abbrechen. Bei einem Versuch für einen fremden Nutzer wird nichts geschrieben und eine Warnung protokolliert.

Der Vermerk für eine Aufräum-Migration entfällt. Die Funktion ist in Gebrauch.

**Auswirkungen.** Der Trigger `log_contact_created` bleibt funktionsfähig. Reichweite geprüft: Die Policy `contacts_owner_all` erzwingt `owner_id = auth.uid()`, über die API kann der Parameter also nie abweichen.

**Tests.** Eigene Kennung schreibt. Fremde Kennung wirft. `anon` erhält kein Ausführungsrecht.

### 5.5 `match_knowledge`

**Aktueller Zustand.** `INVOKER`, kein `search_path`, Parameter `p_org_id` ohne Prüfung.

**Risiko.** Der fehlende `search_path` ist eine Härtungslücke, kein akuter Ausfall. Der Parameter `p_org_id` ist irreführend, aber durch RLS abgedeckt.

**Empfohlene Änderung.** `set search_path = public, extensions`, weil Typ und Operator im Schema `extensions` liegen. Prüfung ergänzen, dass `p_org_id` der eigenen Organisation entspricht, außer für `super_admin`.

**Auswirkungen.** `coach-chat` übergibt `profile.org_id`, also die eigene Organisation. Kein Bruch. Ohne den Zusatz `extensions` im Pfad würde die Funktion sofort ausfallen, das ist der kritische Punkt dieser Änderung.

**Tests.** Retrieval liefert weiterhin Treffer. Fremde Organisation wirft. Der Vektoroperator funktioniert nach der Pfadänderung.

### 5.6 Härtung `search_path`

`protect_profile_columns`, `set_updated_at`, `event_phase_rank` erhalten `set search_path = public`.

**Risiko ohne Änderung.** Gering in Supabase, weil `authenticated` keine Schemata anlegen darf. Bei `protect_profile_columns` wäre die Auswirkung dennoch gravierend, weil die Funktion den Schutz vor Selbstbeförderung durchsetzt und `public.is_super_admin()` aufruft. Ein manipulierbarer Suchpfad würde diesen Schutz aushebeln.

**Empfohlene Änderung.** Pfad festnageln. Verhalten unverändert.

### 5.7 Ausführungsrechte

Selektiv, nie pauschal.

| Aktion | Betrifft |
|---|---|
| EXECUTE für `anon` entziehen | alle Funktionen außer `current_org_id`, `is_super_admin`, `current_user_role` |
| EXECUTE für `PUBLIC` entziehen | alle Funktionen der Gruppen A, B, D |
| EXECUTE nur für `service_role` | `handle_new_user`, `log_contact_created`, `track_usage` |
| EXECUTE für `authenticated` erhalten | alle vom Frontend genutzten RPC |

Die drei Policy-Helfer behalten ihr Recht für `anon`. Begründung in 4.3.

---

## 6. Reihenfolge und Rücknahme

Eine einzige Migration, `20260730000012_f1_function_security.sql`, in einer Transaktion. Reihenfolge:

1. Neue Helferfunktion `is_ancestor_of`.
2. Alte Signaturen der sechs Planungsfunktionen entfernen.
3. Neue Signaturen anlegen.
4. `generate_daily_plan` neu anlegen, angepasst an die neuen Signaturen.
5. `get_downline`, `coach_messages_today`, `track_usage`, `match_knowledge` ersetzen.
6. `search_path` bei den drei übrigen Funktionen ergänzen.
7. Ausführungsrechte setzen.

Zur Unbedenklichkeit des Entfernens: Die Funktionskörper sind als Zeichenkette in `$$` hinterlegt. PostgreSQL verfolgt dabei keine Abhängigkeiten zwischen Funktionen. Ein Entfernen und Neuanlegen innerhalb einer Transaktion ist deshalb ungefährlich, solange der Endzustand stimmig ist.

Rücknahme: Migration 8 und Migration 1 enthalten die ursprünglichen Definitionen. Eine Rücknahme wäre eine neue Migration, die diese wiederherstellt, entsprechend der Projektregel, angewendete Migrationen nicht zu editieren. Sie würde die Lücken wieder öffnen und ist nur als Notfallmaßnahme sinnvoll.

## 7. Was diese Migration ausdrücklich nicht tut

- Keine Änderung an `profiles_public`. Der View ist korrekt, siehe Abschnitt 3.
- Kein `can_see_user()`. Das ist F2.
- Keine Änderung an Tabellen, Policies oder Frontend.
- Keine Änderung an Fremdprojekttabellen. `set_updated_at` wird gehärtet, aber verhaltensgleich.
- Kein Entfernen von `track_usage`, obwohl fachlich angezeigt. Vorgabe war, bestehende Funktionen nicht zu zerstören.

## 8. Abschlusskriterium

F1 gilt als abgeschlossen, wenn der Testplan in `supabase/tests/database/function_security.test.sql` vollständig grün ist, und zwar für die Rollen Berater, Leader, Super-Admin, fremde Organisation und `anon`, einschließlich ungültiger und manipulierter Kennungen.
