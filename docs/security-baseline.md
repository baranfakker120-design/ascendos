# Security Baseline AscendOS

Verbindlich für jedes neue Datenbankobjekt ab dem 24. Juli 2026.
Hergeleitet aus Befund F1, in dem neun Funktionen personenbezogene Daten Dritter herausgegeben haben.

Diese Regeln sind keine Empfehlungen. Ein Objekt, das eine Pflichtregel verletzt, wird nicht ausgeliefert.

---

## 0. Grundsatz

**Die Absicherung liegt an den Daten, nicht am Zugriffspfad.**

AscendOS setzt Row Level Security als primäre Grenze ein und lässt den Client direkt mit der Datenbank sprechen. Der Vorteil: Jeder neue Client, jede native App und jede künftige Schnittstelle erbt die Absicherung automatisch. Der Preis: **Jede `SECURITY DEFINER`-Funktion ist ein Loch in dieser Grenze.**

Damit ist der wichtigste Satz dieses Standards:

> Wer `SECURITY DEFINER` schreibt, übernimmt die Berechtigungsprüfung persönlich. RLS hilft dort nicht mehr.

Die Wissensdatenbank beschreibt in 13_SUPABASE.md das gegenteilige Muster, nämlich Zugriff ausschließlich über ein Backend. Dieses Muster gilt weiterhin für die Werkzeuge der Generation 1, die keine Konten und keine RLS haben. Für AscendOS gilt RLS-first. Diese Entscheidung ist getroffen und wird nicht bei jedem Modul neu verhandelt.

---

## 1. SECURITY DEFINER: wann erlaubt

`SECURITY DEFINER` ist **nur** erlaubt, wenn mindestens eine dieser Bedingungen zutrifft und im Kopfkommentar der Funktion benannt ist:

| Zulässiger Grund                                                                                | Beispiel im Bestand                                                         |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Die Funktion muss eine Tabelle beschreiben, für die es bewusst keine INSERT-Policy gibt         | `generate_daily_plan`, weil `daily_plans` keinen Client-Schreibweg hat      |
| Die Funktion muss Daten oberhalb der eigenen Zeile lesen, um eine Beziehung zu prüfen           | `is_ancestor_of`, weil `profiles_select_own` nur das eigene Profil freigibt |
| Die Funktion wird in einer RLS-Policy aufgerufen und würde sonst eine Rekursion erzeugen        | `current_org_id`, `is_super_admin`                                          |
| Die Funktion ist eine Trigger-Funktion, die über die Rechte des Auslösers hinaus schreiben muss | `handle_new_user`, schreibt `profiles` beim Anlegen eines Auth-Kontos       |

**Nicht zulässig** als Begründung: „ist einfacher", „die anderen Funktionen sind auch so", „ich weiß nicht, ob RLS reicht". Wenn unklar ist, ob RLS reicht: `SECURITY INVOKER` schreiben und testen. Wenn es reicht, ist die Frage beantwortet.

## 2. SECURITY INVOKER: wann Pflicht

`SECURITY INVOKER` ist **Pflicht**, wenn die Funktion ausschließlich liest und alle gelesenen Tabellen eine RLS-Policy haben, die den Zugriff korrekt begrenzt.

Beispiel aus F1: `plan_contact_state` liest nur `contacts` und `effective_pipeline_events`. Beide sind durch RLS abgedeckt. Die Funktion war `DEFINER` ohne Not und hat dadurch die Kontaktliste jedes Nutzers herausgegeben.

**Wichtige Feinheit, die zwingend zu beachten ist:** Eine `INVOKER`-Funktion, die aus einer `DEFINER`-Funktion aufgerufen wird, läuft mit den Rechten der äußeren Funktion, also als `postgres`. RLS greift dort **nicht**. `INVOKER` allein ist deshalb keine Garantie. Die Garantie ist immer der explizite Filter im Funktionskörper.

## 3. Pflichtprüfung über auth.uid()

Jede Funktion, die einen Nutzerbezug hat, muss `auth.uid()` verwenden.

**Regel 3a: Kein Nutzerparameter, wenn immer der eigene Nutzer gemeint ist.**

Ein Parameter, der im gesamten Aufrufpfad stets `auth.uid()` enthält, ist keine Funktionalität, sondern Angriffsfläche. Er wird entfernt, nicht geprüft. So war es bei den sechs Planungsfunktionen in F1.

Falsch:

```sql
create function f(p_user uuid) ... where owner_id = p_user
```

Richtig:

```sql
create function f() ... where owner_id = auth.uid()
```

**Regel 3b: Bleibt ein Fremdparameter nötig, ist die Prüfung Pflicht.**

Ein Fremdparameter ist nur zulässig, wenn ein fachlicher Fall existiert, in dem eine andere Person gemeint ist, etwa eine Teamleitung, die eine Downline ansieht. Dann gilt:

```sql
if p_user <> auth.uid() and not <berechtigt> then
  <abweisen>
end if;
```

**Regel 3c: `auth.uid() is null` wird immer behandelt.**

Ohne Anmeldung ist `auth.uid()` NULL. Ein Vergleich `owner_id = NULL` ergibt NULL, also keine Zeilen. Das fällt zufällig geschlossen aus, aber Sicherheit darf nicht auf Zufall beruhen. Schreibende Funktionen werfen eine Ausnahme, lesende geben eine leere Menge zurück.

## 4. Pflichtprüfung über org_id

**Jede Abfrage, die mehrere Zeilen über Personen oder Organisationsdaten liefert, filtert auf `org_id`.**

Das gilt auch, solange nur eine Organisation existiert. Begründung: Skalierungsstufe 5 der Wissensdatenbank sieht die Weitergabe an andere Teams vor. Ein fehlender Filter ist dann ein Mandantenleck, und er fällt bis dahin nicht auf. In F1 war genau das bei `get_downline` der Fall: Die Rekursion lief über die gesamte Tabelle `profiles`.

Bei rekursiven Abfragen muss der Filter in **beiden** Zweigen stehen, im Startzweig und im Rekursionszweig. Ein Filter nur im Startzweig lässt die Rekursion aus der Organisation herauslaufen.

Neue Tabellen erhalten `org_id not null` mit Fremdschlüssel, ohne Ausnahme.

## 5. Pflichtprüfung der Berechtigungen

**Regel 5a: Sichtbarkeit hängt an der Beziehung, nicht an der Rolle.**

Ein Berater mit Downline ist für diese Downline die Teamleitung, unabhängig davon, was in `profiles.role` steht. Die Wissensdatenbank definiert Upline Manager über den erreichten Rang, nicht über eine zugewiesene Rolle. Eine reine Rollenprüfung bildet das falsch ab.

Rollenprüfung ist zulässig für **Verwaltungshandlungen**: Wissen freigeben, Produkte pflegen, Anerkennung vergeben. Nicht für den Zugriff auf Personendaten.

**Regel 5b: Berechtigungen sind keine Spalten auf `profiles`.**

`protect_profile_columns()` schützt eine feste Liste von Spalten gegen Selbstveränderung. Eine neue Berechtigungsspalte auf `profiles` wäre nicht in dieser Liste und damit selbst erteilbar, weil die Policy `profiles_update_own` das eigene Profil freigibt. Berechtigungen gehören in eine eigene Tabelle mit eigener Policy, in der ausschließlich `is_super_admin()` schreiben darf.

**Regel 5c: Abweisen ohne Informationsleck.**

- **Lesende Funktion:** leere Menge zurückgeben, keine Ausnahme. Eine Ausnahme bestätigt, dass die angefragte Kennung existiert.
- **Schreibende Funktion:** Ausnahme werfen. Ein stilles Verwerfen würde einen Fehler verbergen.
- **Funktion, deren Rückgabewert eine Grenze steuert:** Ausnahme werfen. Bei `coach_messages_today` würde eine stillschweigende Null das Tageslimit aushebeln.

## 6. Verbot unnötiger Rechte

**Regel 6a: PUBLIC zuerst entziehen, dann selektiv gewähren.**

Ein `revoke ... from anon` ist **wirkungslos**, solange `PUBLIC` das Recht hält, weil `anon` es über `PUBLIC` erbt. Genau daran ist der Fix `[S-1]` in Migration 8 gescheitert: `validate_invite` war danach weiterhin für `anon` aufrufbar.

Verbindliches Muster für jede neue Funktion:

```sql
revoke execute on function public.f(...) from PUBLIC, anon;
grant  execute on function public.f(...) to authenticated, service_role;
```

**Regel 6b: `anon` erhält nur, was die Registrierung braucht.**

Zwingende Ausnahme, die nicht angetastet wird: `current_org_id()`, `is_super_admin()` und `current_user_role()` behalten `EXECUTE` für `anon`. Diese Funktionen werden **innerhalb** von RLS-Policies aufgerufen, und eine Policy wird mit den Rechten der abfragenden Rolle ausgewertet. Ohne dieses Recht liefert jede Abfrage von `anon` einen Berechtigungsfehler statt eines leeren Ergebnisses, und die Registrierung bricht.

Jeder pauschale Entzug über `all functions in schema public` ist verboten.

**Regel 6c: Trigger-Funktionen werden nicht eingeschränkt.**

Sie sind nicht direkt aufrufbar, PL/pgSQL lehnt den Direktaufruf einer Trigger-Funktion ab. Ein Entzug bringt kein Sicherheitsplus und kann die Trigger-Ausführung stören.

## 7. Anforderungen an neue SQL-Funktionen

Prüfliste. Alle Punkte sind Pflicht.

| #   | Anforderung                                                                                                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `set search_path = public` ist gesetzt. Bei Nutzung von pgvector, `<=>` oder `vector`: `set search_path = public, extensions`, sonst fällt die Funktion aus |
| 2   | `SECURITY DEFINER` nur mit einem der vier Gründe aus Abschnitt 1, benannt im Kopfkommentar                                                                  |
| 3   | Kein Nutzerparameter, wenn immer der eigene Nutzer gemeint ist                                                                                              |
| 4   | Bleibt ein Fremdparameter: Aufruferprüfung vorhanden                                                                                                        |
| 5   | `org_id`-Filter vorhanden, bei Rekursion in beiden Zweigen                                                                                                  |
| 6   | `auth.uid() is null` behandelt                                                                                                                              |
| 7   | `revoke ... from PUBLIC, anon` vorhanden, dann selektiv gewährt                                                                                             |
| 8   | Rekursive Abfragen nutzen die `CYCLE`-Klausel                                                                                                               |
| 9   | Kopfkommentar nennt Zweck, Sicherheitsmodell und Begründung                                                                                                 |
| 10  | pgTAP-Test vorhanden, der die Grenze von außen angreift                                                                                                     |
| 11  | **Aufrufsuche über die Datenbank durchgeführt**, nicht nur über Frontend und Edge Functions                                                                 |

**Zu Punkt 8:** Eine feste Tiefengrenze ist falsch. Sie schneidet legitime tiefe Genealogien ab und liefert stillschweigend falsche Ergebnisse. PostgreSQL erkennt Kreise nicht selbst, die `CYCLE`-Klausel tut es und begrenzt nichts anderes:

```sql
with recursive t as (...) cycle id set is_cycle using path
select ... from t where not is_cycle;
```

**Zu Punkt 10:** Der Test prüft nicht, dass die Funktion arbeitet. Er prüft, dass sie einen unberechtigten Aufruf abweist. Positivtests allein hätten F1 nie gefunden.

**Zu Punkt 11, hinzugefügt nach einem Fehler in Sprint 0.** Wer eine Funktion ändert, muss ihre Aufrufer kennen. Eine Suche in `src/` und `supabase/functions/` genügt nicht: Datenbankfunktionen rufen sich gegenseitig auf, und Trigger rufen sie ebenfalls auf. In F1 wurde `track_usage` als toter Code eingeordnet und mit einer harten Ausnahme versehen. Tatsächlich hatte sie vier Aufrufer, einer davon ein Trigger ohne Nutzersitzung. Der erste Testlauf brach daran ab.

Verbindliche Prüfung vor jeder Änderung an einer Funktion, über alle Funktionen, Views und Policies:

```
Suche im Rumpf jeder Funktion, jeder View-Definition und jedem
Policy-Ausdruck nach dem Namen der zu aendernden Funktion.
```

**Zusatzregel, die sich daraus ergibt:** Eine Funktion, die von einem Trigger aufgerufen wird, darf **niemals** eine Ausnahme werfen, die den auslösenden Vorgang abbricht, es sei denn genau das ist beabsichtigt. Nachverfolgung, Protokollierung und Kennzahlen gehören zu dieser Klasse. Sie geben bei fehlender Berechtigung eine Warnung aus und schreiben nichts, statt zu werfen.

## 8. Anforderungen an neue Trigger

| #   | Anforderung                                                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | `set search_path` gesetzt, auch bei `SECURITY INVOKER`                                                                |
| 2   | Zeitpunkt und Ereignisse minimal: `BEFORE UPDATE` statt `BEFORE INSERT OR UPDATE`, wenn nur Änderungen betroffen sind |
| 3   | Wirft der Trigger Ausnahmen, ist das in `docs/` dokumentiert, weil er dadurch die Testumgebung beeinflusst            |
| 4   | Bei einem Trigger auf `auth.users`: Auswirkung auf pgTAP-Tests prüfen und im Testkopf vermerken                       |

**Zu Punkt 3 und 4:** `on_auth_user_created` wirft ohne Einladungscode eine Ausnahme. Dadurch konnte keine einzige Testdatei durchlaufen, und in `rls.test.sql` stand ein Kommentar, der das Gegenteil behauptete. Ein Trigger, der wirft, ist nicht nur Produktionslogik, sondern eine Eigenschaft der Testumgebung.

## 9. Anforderungen an neue Views

| #   | Anforderung                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------- |
| 1   | `security_invoker = true` ist der Standard, damit die RLS des Aufrufers gilt                                              |
| 2   | Wird bewusst darauf verzichtet, muss der View eine **eigene** Filterbedingung tragen, die für `anon` geschlossen ausfällt |
| 3   | Der Verzicht wird im Kommentar begründet                                                                                  |
| 4   | Spaltenauswahl minimal                                                                                                    |

**Beispiel aus dem Bestand:** `profiles_public` hat bewusst kein `security_invoker`, weil er als Teamliste die auf das eigene Profil beschränkte Policy erweitern muss. Er trägt stattdessen `where org_id = current_org_id()`, und das fällt für `anon` geschlossen aus, weil `current_org_id()` dann NULL ist. Das ist korrekt.

Zu beachten ist aber: Dieser View ist die **Bezugsquelle für Nutzerkennungen** innerhalb einer Organisation. Jede `DEFINER`-Funktion mit Nutzerparameter wird dadurch für jeden angemeldeten Kollegen ausnutzbar. Wer einen solchen View anlegt, muss wissen, dass er die Angriffsfläche jeder ungeprüften Funktion vergrößert.

## 10. Anforderungen an neue RLS-Policies

| #   | Anforderung                                                                               |
| --- | ----------------------------------------------------------------------------------------- |
| 1   | RLS wird beim Anlegen der Tabelle aktiviert, nicht später                                 |
| 2   | Jede Tabelle hat entweder Policies oder eine dokumentierte Begründung für Policy-Freiheit |
| 3   | Jede Policy filtert auf `org_id` über `current_org_id()`                                  |
| 4   | Personenbezug über die Beziehung, nicht über die Rolle                                    |
| 5   | Schreibrechte getrennt von Leserechten, keine `for all`-Policy ohne Begründung            |
| 6   | Für `anon` muss die Bedingung geschlossen ausfallen, nachweisbar durch einen Test         |

**Zu Punkt 2:** `invite_validation_attempts` hat bewusst keine Policies, weil ausschließlich die Service-Rolle darauf zugreift. RLS aktiv plus keine Policy ist das korrekte Deny-All und das stärkere Muster gegenüber einer `is_super_admin()`-Policy, weil es gar keine API-Oberfläche hat.

## 11. Geheimnisse

Zugangsdaten, API-Schlüssel und Passwörter werden **nicht** in AscendOS gespeichert.

Begründung aus F1: Eine Tabelle mit einer `is_super_admin()`-Policy ist über die öffentliche API lesbar, sobald ein Sitzungstoken vorliegt. Braucht der Betrieb ein Geheimnis nicht, ist eine solche Tabelle reine Angriffsfläche. Wird eines doch nötig, etwa ein Schlüssel für eine Fremdschnittstelle: RLS ohne Policies plus Zugriff ausschließlich über eine Edge Function.

Zusätzlich: Geheimnisse gehören nicht in die Wissensbasis. Retrieval ruft Ausschnitte nach Ähnlichkeit ab, nicht nach Berechtigung. Ein Systemprompt kann darum bitten, ein Passwort nicht zu nennen, aber er kann es nicht verhindern, wenn der Wert im Kontext steht.

## 12. Prüfschritt vor jeder Auslieferung

Diese Abfrage muss null Zeilen liefern. Sie ist als Test `J1` in `supabase/tests/database/function_security.test.sql` verankert und wird bei jedem Lauf geprüft.

```sql
select p.proname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and pg_get_function_arguments(p.oid) like '%uuid%'
  and pg_get_functiondef(p.oid) !~
      'auth\.uid|is_super_admin|current_org_id|is_ancestor_of';
```

Ergänzend, ebenfalls verankert als Test `I1`: Jede `SECURITY DEFINER`-Funktion hat einen festgenagelten `search_path`.

Diese beiden Tests sind der Grund, warum F1 nicht wiederkehren kann. Sie werden nicht deaktiviert und nicht aufgeweicht.
