# Phase 0: Implementation Masterplan

Datum: 25. Juli 2026. Keine Architektur, keine Implementierung. Ausschließlich Reihenfolge.

Verbindliche Grundlagen: F1 Security, F2 Authorization, F3 Internationalisierung, F4 Product Experience, plus Roadmap und Security Baseline.

---

# Teil 0: Gemessener Istzustand

Erhoben am 25. Juli 2026 gegen die Produktionsdatenbank. Der Plan steht auf diesen Zahlen, nicht auf Annahmen.

## 0.1 Datenbestand

| Gegenstand                                          | Anzahl | Bedeutung für den Plan                                                                    |
| --------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------- |
| Organisationen                                      | 1      | Mehrmandantenfähigkeit noch ohne Last                                                     |
| Profile                                             | 2      | Umstellung auf Mitgliedschaften betrifft zwei Zeilen                                      |
| **Kontakte**                                        | **0**  | **Es liegen noch keine personenbezogenen Daten Dritter vor**                              |
| Pipeline-Ereignisse                                 | 0      |                                                                                           |
| Tagesplan-Einträge mit gerenderten deutschen Sätzen | **3**  | F3 Befund T1 ist jetzt praktisch kostenlos                                                |
| Coach-Konversationen                                | 3      |                                                                                           |
| Coach-Nachrichten                                   | **32** | Der Coach läuft in Produktion                                                             |
| Wissensausschnitte                                  | **0**  | Der Coach arbeitet ohne jede Wissensbasis                                                 |
| **Erfasste Wissenslücken**                          | **16** | Bei 32 Nachrichten. Etwa jede zweite Frage konnte nicht aus Teamwissen beantwortet werden |
| **Offene Einladungen**                              | **6**  | Sechs Personen können sich jederzeit registrieren                                         |

## 0.2 Zustand der Umsetzung

| Bereich              | Zustand                                                                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coach mit Gemini     | **läuft**, 32 Nachrichten belegen es                                                                                                                 |
| `agents.model`       | steht auf `claude-sonnet-4-6`, das Laufzeit-Mapping in `gemini.ts` fängt es ab. Funktioniert wie entworfen                                           |
| **F1 Migration 12**  | **nicht angewendet.** `is_ancestor_of` fehlt, `plan_contact_state` hat weiterhin den Fremdparameter, `anon` hat weiterhin EXECUTE auf `get_downline` |
| pgTAP                | nicht installiert                                                                                                                                    |
| 94 Prüfungen         | nie ausgeführt                                                                                                                                       |
| `package-lock.json`  | fehlt                                                                                                                                                |
| `database.types.ts`  | handgepflegt, bricht den Typenabgleich der CI                                                                                                        |
| Migrationsverfolgung | nicht vorhanden, Setup lief über den SQL-Editor                                                                                                      |
| Wissensbasis         | leer                                                                                                                                                 |

## 0.3 Zwei Zahlen, die den Plan bestimmen

**Erste Zahl: 0 Kontakte.**

Die Sicherheitslücke aus F1, über die `plan_contact_state` die Kontaktliste beliebiger Nutzer herausgibt, hat derzeit **keine Daten hinter sich**. Es gibt nichts zu erbeuten.

**Zweite Zahl: 6 offene Einladungen.**

Sechs Personen können sich jederzeit registrieren und beginnen dann, Kontakte zu erfassen. Ab der ersten erfassten Person liegt die Lücke über echten personenbezogenen Daten Dritter.

**Daraus folgt die einzige terminliche Vorgabe dieses Plans:**

> F1 muss abgeschlossen sein, bevor die erste Person einen Kontakt erfasst.

Das ist kein Prioritätsargument, sondern eine Frist. Sie ist bekannt, sie ist nah, und sie hängt nicht an der Entwicklung, sondern daran, wann jemand seine Einladung einlöst.

**Empfehlung, sofort umsetzbar und ohne Entwicklung:** Die sechs offenen Einladungen bis zum Abschluss von Sprint 1 zurückhalten. Eine Einladung lässt sich über ihr Ablaufdatum entwerten und neu ausstellen. Damit ist die Frist entschärft, ohne den Plan zu beschleunigen.

## 0.4 Die dritte Zahl, für die Inhaltsspur

**16 Wissenslücken bei 32 Nachrichten und 0 Wissensausschnitten.**

Der Coach wurde 32 Mal benutzt und hat 16 Mal festgestellt, dass ihm Teamwissen fehlt. Die Maschine funktioniert. Sie hat nur nichts zu sagen.

Das ist die belastbarste Aussage dieses Plans: **Der Engpass ist nicht die Entwicklung, sondern der Inhalt.** Kein Sprint dieses Plans verbessert die Coach-Antworten so stark wie das erste eingespeiste Teamdokument. Deshalb ist die Inhaltsspur in Teil 4 keine Sprintaufgabe, sondern eine ab heute laufende Parallelspur ohne Entwicklerbeteiligung.

---

# Teil 1: Sequenzierungsregeln

## 1.1 Was zuerst entstehen muss

| Rang | Baustein                                  | Warum zuerst                                                                                                                 |
| ---- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1    | **Werkzeugkette und Prüfbarkeit**         | Ohne ausführbare Prüfungen ist jeder folgende Schritt unbelegt. Betrifft Lockfile, Typen, CI, pgTAP                          |
| 2    | **F1**                                    | Terminvorgabe aus 0.3. Und jede weitere Änderung an denselben Funktionen wäre eine Änderung an ungeprüftem Stand             |
| 3    | **Identität und Mitgliedschaft**          | 22 Tabellen verweisen auf die Organisation. Jede neue Tabelle vor dieser Umstellung braucht dieselbe Nacharbeit              |
| 4    | **Auflösungsfunktion für Berechtigungen** | Jede Policy, jede RPC-Funktion und jede Oberfläche ruft sie auf. Sie ist der am stärksten geteilte Baustein im ganzen System |
| 5    | Alles Übrige                              |                                                                                                                              |

## 1.2 Die wichtigste Regel des Plans

> **Vor der Umstellung auf Mitgliedschaften entstehen keine neuen Tabellen.**

Begründung: Jede Tabelle mit Organisationsbezug, die vorher entsteht, muss nachher zweimal angefasst werden, einmal beim Anlegen und einmal beim Umstellen. Bei 22 bestehenden Tabellen ist die Umstellung ohnehin die größte Einzelarbeit des Plans. Sie um jede vorgezogene Funktion zu vergrößern, ist der teuerste vermeidbare Fehler.

Konsequenz: Vergütungsplan, Produkte, Termine, Benachrichtigungen und Anerkennung entstehen **nach** Sprint 3. Nicht davor, auch nicht als Vorbereitung mit Schema.

## 1.3 Was niemals parallel laufen darf

| Nie gleichzeitig                                                | Begründung                                                                                                        |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| F1 und die Umstellung auf Mitgliedschaften                      | Beide ändern `get_downline`, `is_ancestor_of`, `plan_contact_state`. Ein Fehler wäre nicht zuzuordnen             |
| Zwei Migrationen auf derselben Tabelle                          | Reihenfolge entscheidet über das Ergebnis                                                                         |
| Schemaänderung und Datenumzug auf derselben Tabelle             | Ein Abbruch in der Mitte lässt einen unbestimmten Zustand zurück                                                  |
| Änderung an einer Funktion und Ausführung der Prüfungen dagegen | Der Prüfstand muss stillstehen                                                                                    |
| Umstellung der Symbole und Umbau der Navigation                 | Beide berühren dieselben 14 Oberflächendateien. Zusammengelegte Änderungen sind nicht mehr einzeln zurückzunehmen |
| Rechteumstellung und Einladung neuer Nutzer                     | Ein Nutzer, der während der Umstellung entsteht, kann in einem Zwischenzustand landen                             |

## 1.4 Was gefahrlos parallel laufen darf

| Parallel möglich                     | Begründung                                                  |
| ------------------------------------ | ----------------------------------------------------------- |
| Datenbankarbeit und Design-Fundament | Tokens, Symbole und Theme berühren keine Datenbank          |
| Datenbankarbeit und Inhaltsspur      | Wissensdokumente sind Daten. Sie entstehen ohne Entwicklung |
| Werkzeugkette und Design-Fundament   | verschiedene Bereiche                                       |
| Übersetzungsvorbereitung und alles   | Nachrichtenkataloge sind Dateien                            |
| Dokumentation und alles              |                                                             |

## 1.5 Bausteine, auf denen viele andere aufsetzen

Nach Zahl der Abhängigen, absteigend. Diese Reihenfolge bestimmt die Sprintfolge.

| Baustein                                  | Abhängige Bereiche                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| **Auflösungsfunktion für Berechtigungen** | jede Policy, jede RPC-Funktion, Navigation, Dashboard, Suche, Coach, Verwaltung |
| **Mitgliedschaft**                        | alle 22 Tabellen, Genealogie, Rollen, Rechte, Kontakte, Punkte, Journey         |
| **Aktive Organisation**                   | jede Policy, jede Edge Function, die Oberflächenschiene                         |
| **Nachrichtenkatalog**                    | jede Oberfläche, Benachrichtigungen, Tagesplan, Fehlerzustände                  |
| **Token-System v2**                       | jede Oberflächenkomponente                                                      |
| **Drei Layoutmuster aus F4**              | jeder Bildschirm                                                                |
| **Symbolsatz**                            | jede Oberfläche                                                                 |
| Wissensbasis mit Statusmetadaten          | Coach, Retrieval, Trainings, Suche                                              |
| Vergütungsplan-Engine                     | Rang, Lizenz, Ziele, Auswertungen, Anerkennung, Coach-Werkzeuge                 |

## 1.6 Was wiederverwendet wird

| Vorhanden                                | Wiederverwendbar für                                         |
| ---------------------------------------- | ------------------------------------------------------------ |
| CSS-Variablen als Token                  | Weiß-Label je Organisation, Dark Mode, Theme je Mandant      |
| `external_tools` als Datensätze          | Aufnahme der Generation-1-Werkzeuge ohne Code                |
| `agents` als Datensätze                  | sieben weitere Agenten ohne Code                             |
| Korrekturmechanismus über wirksame Sicht | Punkte, Qualifikation, jede provisionsrelevante Größe        |
| Generatoren für Bundles und Setup-Datei  | jede weitere Edge Function                                   |
| Regelwerk des Tagesplans                 | Fälligkeiten, Aktivierungsansicht, Benachrichtigungsauslöser |
| Anonymisierung der Wissenslücken         | Best-Practice-Vorschläge, Auswertungen                       |
| pgTAP-Prüfmuster aus F1                  | jede weitere Sicherheitsprüfung                              |

---

# Teil 2: Kapazitätsannahme

Aufwände sind ohne Kapazitätsangabe bedeutungslos. Dieser Plan nimmt an:

| Annahme                                       | Wert                                    |
| --------------------------------------------- | --------------------------------------- |
| Umsetzung                                     | eine Entwicklerkapazität, unterstützt   |
| Verifikation, Freigaben, Inhalte              | Sie, mit begrenzter Zeit                |
| Rechnerzugang für Werkzeugkette und Prüfungen | erforderlich, heute der knappste Faktor |
| Aufwandseinheit                               | **Arbeitstage netto**, ohne Wartezeiten |

**Der begrenzende Faktor ist nicht die Entwicklung, sondern der Rechnerzugang.** Sprint 0 und jede Prüfung brauchen eine Maschine mit Docker und der Supabase-Kommandozeile. Vom Telefon aus ist keiner dieser Schritte ausführbar. Das ist bei jedem Sprint in der Spalte Voraussetzungen benannt.

---

# Teil 3: Die Sprints

Zwölf Sprints bis Version 1.0. Danach die Erweiterungsphasen der Roadmap.

## Sprint 0: Werkzeugkette instandsetzen

|                        |                                                                                                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ziel**               | Prüfbarkeit herstellen. Ohne diesen Sprint ist kein späterer Schritt belegbar                                                                                                                                                         |
| **Voraussetzungen**    | **Rechner mit Docker und Supabase-Kommandozeile**                                                                                                                                                                                     |
| **Abhängigkeiten**     | keine. Muss zuerst                                                                                                                                                                                                                    |
| **Aufwand**            | 2 bis 3 Tage                                                                                                                                                                                                                          |
| **Inhalt**             | `package-lock.json` erzeugen und einchecken. `npm run db:types` gegen den lokalen Stapel, Datei einchecken. CI beide Aufgaben grün bekommen. pgTAP im lokalen Stapel. Migrationsverfolgung einrichten, damit der SQL-Editor-Weg endet |
| **Risiken**            | Der Typenabgleich der CI kann weitere Abweichungen zeigen als die vier von Hand ergänzten Tabellen. Mittel                                                                                                                            |
| **Teststrategie**      | `npm run lint`, `npm run typecheck`, `npm run build`, `npm run generate:check`, `supabase test db` müssen alle durchlaufen                                                                                                            |
| **Definition of Done** | CI vollständig grün. 94 von 94 Prüfungen ausgeführt und grün. Migration 12 auf einem Entwicklungsstand angewendet, ohne Fehler                                                                                                        |

Ohne diesen Sprint bleibt der gesamte Plan unbelegt. Er ist der einzige, der zwingend eine Maschine braucht und nicht verhandelbar ist.

## Sprint 1: F1 in Produktion

|                        |                                                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ziel**               | Die neun ungeprüften Funktionen absichern, bevor personenbezogene Daten Dritter entstehen                                                                                                               |
| **Voraussetzungen**    | Sprint 0 abgeschlossen. Sechs offene Einladungen zurückgehalten, siehe 0.3                                                                                                                              |
| **Abhängigkeiten**     | Sprint 0                                                                                                                                                                                                |
| **Aufwand**            | 1 bis 2 Tage                                                                                                                                                                                            |
| **Inhalt**             | Migration 12 auf Produktion anwenden. Die drei Edge Functions in ihrem aktuellen Stand ausrollen. Prüfungen gegen Produktion. Rauchtest der sechs Abläufe aus dem Meilenstein-1-Bericht                 |
| **Risiken**            | Die `CYCLE`-Klausel innerhalb `RETURN QUERY` ist nur eigenständig geprüft. Die Rechtebefehle mit `extensions.vector` in der Signatur sind ungeprüft. Beides mittel, beides in Sprint 0 vorab entdeckbar |
| **Teststrategie**      | 94 Prüfungen gegen Produktion. Danach manuell: registrieren, anmelden, Coach-Nachricht, Tagesplan, Struktur, Wissensupload                                                                              |
| **Definition of Done** | Prüfung J1 grün, also keine `SECURITY DEFINER`-Funktion mit `uuid`-Parameter ohne Aufruferprüfung. `anon` hat kein EXECUTE mehr auf `get_downline`. Coach antwortet. Einladungen wieder freigegeben     |

## Sprint 2: Identität und Mitgliedschaft

|                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ziel**               | Die Fundamentumstellung aus F2. Danach ist keine weitere Änderung dieser Art nötig                                                                                                                                                                                                                                                                                                                                                                            |
| **Voraussetzungen**    | Sprint 1 abgeschlossen und verifiziert                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Abhängigkeiten**     | Sprint 1. **Darf nicht parallel zu Sprint 1 laufen**, siehe 1.3                                                                                                                                                                                                                                                                                                                                                                                               |
| **Aufwand**            | 5 bis 8 Tage                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Inhalt**             | Identität und Mitgliedschaft trennen. Zwei bestehende Profile umziehen. `current_org_id()` zur validierten aktiven Organisation umbauen, Namen behalten. Auswahl der aktiven Organisation mit Abweisung bei Mehrdeutigkeit. Genealogie auf Mitgliedschaften. Kein kaskadierendes Löschen zwischen Identität und Mitgliedschaft. Benutzername an die Identität, global eindeutig. Zwei Wege bei der Einladung, neue Identität gegen zusätzliche Mitgliedschaft |
| **Risiken**            | **Höchstes Risiko des ganzen Plans.** Alle 31 Policies hängen an `current_org_id()`. Ein Fehler dort sperrt jeden Nutzer aus oder öffnet Mandantengrenzen. Gegenmaßnahme: Die Funktion behält ihren Namen, damit keine Policy angefasst wird, und die Prüfungen laufen vor und nach der Umstellung                                                                                                                                                            |
| **Teststrategie**      | Bestehende 94 Prüfungen müssen unverändert grün bleiben. Neu: Auswahl der aktiven Organisation in allen vier Fällen aus F2 Abschnitt 1.3, Abweisung bei Mehrdeutigkeit, zweite Mitgliedschaft anlegen, Mitgliedschaft beenden mit erhaltener Historie                                                                                                                                                                                                         |
| **Definition of Done** | Beide bestehenden Profile funktionieren unverändert. Eine Testidentität mit zwei Mitgliedschaften kann wechseln. Keine Mandantengrenze durchlässig. 94 plus neue Prüfungen grün                                                                                                                                                                                                                                                                               |

## Sprint 3: Berechtigungssystem

|                        |                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ziel**               | Die Auflösungsfunktion und die 19 Berechtigungen. Der am stärksten geteilte Baustein                                                                                                                                                                                                                                                                                 |
| **Voraussetzungen**    | Sprint 2                                                                                                                                                                                                                                                                                                                                                             |
| **Abhängigkeiten**     | Sprint 2                                                                                                                                                                                                                                                                                                                                                             |
| **Aufwand**            | 5 bis 7 Tage                                                                                                                                                                                                                                                                                                                                                         |
| **Inhalt**             | Erteilungen an der Mitgliedschaft, mit Geltungsbereich, Gültigkeitszeitraum und Nachweis. Auflösungsfunktion, die einen **Prinzipal** annimmt und nicht eine Nutzerkennung. Rollenstufen und die Regel der strikt niedrigeren Stufe. Vier Regeln gegen Rechteausweitung. Alle 31 Policies um den Berechtigungsteil erweitern. `role` aus `profiles_public` entfernen |
| **Risiken**            | Die Auflösungsfunktion wird je Zeile ausgewertet. Bei fehlender Kennzeichnung als `stable` bricht die Leistung ein. Mittel. Gegenmaßnahme: Messung an einer künstlich vergrößerten Struktur                                                                                                                                                                          |
| **Teststrategie**      | Die 18 Szenarien aus F2 Teil 6 als pgTAP-Prüfungen, insbesondere Regel 4 gegen mandantenübergreifende Erteilung. Leistungsmessung bei 200 Mitgliedschaften                                                                                                                                                                                                           |
| **Definition of Done** | Alle 18 Szenarien abgewiesen. Keine Selbsterteilung möglich. Keine Ausweitung durch Delegation. Prüfung J1 weiterhin grün. Leistung bei 200 Mitgliedschaften unter 500 Millisekunden für die Leaderansicht                                                                                                                                                           |

## Sprint 4: Tagesplanfunktionen, gebündelt

|                        |                                                                                                                                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ziel**               | Drei Änderungen an denselben sechs Funktionen in einem Durchgang                                                                                                                                                        |
| **Voraussetzungen**    | Sprint 3                                                                                                                                                                                                                |
| **Abhängigkeiten**     | Sprint 3                                                                                                                                                                                                                |
| **Aufwand**            | 3 bis 4 Tage                                                                                                                                                                                                            |
| **Inhalt**             | Die sechs Planungsfunktionen auf Mitgliedschaften umstellen, aus F2. Gleichzeitig F3 Befund T1: Parameter statt gerenderter Sätze speichern. Gleichzeitig F3 Befund T2: Zeitzone an der Identität, „heute" serverseitig |
| **Risiken**            | Gering. Nur drei Tagesplaneinträge betroffen                                                                                                                                                                            |
| **Teststrategie**      | Tagesplan wird für zwei Nutzer in zwei Zeitzonen korrekt erzeugt. Coach-Tageslimit und Tagesplan verwenden denselben Begriff von heute. Keine deutschen Sätze mehr in der Datenbank                                     |
| **Definition of Done** | `daily_plan_items` enthält Bezeichner und Parameter, keine Sätze. Ein Sprachwechsel ändert bestehende Einträge. Ein Nutzer in einer anderen Zeitzone erhält den richtigen Tag                                           |

**Begründung für die Bündelung.** F2 und F3 Befund T1 und T2 berühren dieselben sechs Funktionen. Getrennt umgesetzt wären es drei vollständige Zyklen aus Umbau, Prüfung und Auslieferung an denselben Objekten. Gebündelt ist es einer. **Das ist die größte Einzelersparnis dieses Plans**, etwa fünf bis sieben Tage.

## Sprint 5: Prüfprotokoll und Datenschutzpfade

|                        |                                                                                                                                                                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Ziel**               | Nachweisbarkeit und die beiden gesetzlichen Pflichten                                                                                                                                                                                                                                      |
| **Voraussetzungen**    | Sprint 3                                                                                                                                                                                                                                                                                   |
| **Abhängigkeiten**     | Sprint 3. Kann parallel zu Sprint 4 laufen, weil andere Objekte betroffen sind                                                                                                                                                                                                             |
| **Aufwand**            | 4 bis 5 Tage                                                                                                                                                                                                                                                                               |
| **Inhalt**             | Prüfprotokoll je Organisation, nur anfügen. Protokollierung von Rechte- und Rollenänderungen. Notfallpfad für fremde personenbezogene Daten mit Grund, Zeitfenster und Sichtbarkeit. Auskunftspfad nach Artikel 15. Löschpfad mit Trennung personenbezogener Daten und Geschäftsunterlagen |
| **Risiken**            | Der Auskunftspfad ist selbst ein Zugriffsweg auf personenbezogene Daten und braucht dieselbe Härte wie der Notfallpfad. Mittel                                                                                                                                                             |
| **Teststrategie**      | Protokoll ist nicht änderbar, auch nicht durch den Eigentümer. Notfallzugriff erzeugt einen Eintrag, der für den Betroffenen sichtbar ist. Auskunft enthält keine Daten anderer Organisationen                                                                                             |
| **Definition of Done** | Rechteänderung erzeugt einen Protokolleintrag. Auskunft für eine Testidentität vollständig und auf eine Organisation begrenzt. Löschung erhält anonymisierte Geschäftsunterlagen                                                                                                           |

## Sprint 6: Design-Fundament

|                        |                                                                                                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Ziel**               | Token, Symbole, Theme. Grundlage jeder Oberfläche                                                                                                                                                                                                            |
| **Voraussetzungen**    | **Logo als SVG.** Siehe F4, Lieferabhängigkeit                                                                                                                                                                                                               |
| **Abhängigkeiten**     | keine zur Datenbank. **Läuft parallel ab Sprint 1**                                                                                                                                                                                                          |
| **Aufwand**            | 4 bis 5 Tage                                                                                                                                                                                                                                                 |
| **Inhalt**             | Token `line-strong` ergänzen. Entscheidung zu FD-3 umsetzen. Lucide einbinden, 27 Verstöße in 14 Dateien ersetzen. Dark Mode verdrahten, Einstellung an der Identität. Dunkle Schiene als Träger des Symbols. Logische CSS-Eigenschaften ab hier verbindlich |
| **Risiken**            | Fehlt das SVG, ist das Symbol bei 16 und 24 Pixeln ein grauer Fleck. **Blockierend für den Symbolteil**, nicht für den Rest                                                                                                                                  |
| **Teststrategie**      | Kein Bildzeichen und kein Unicode-Symbol mehr in `src`. Kontrastprüfung in beiden Themes. Sichtprüfung des Symbols bei 16, 24 und 48 Pixeln                                                                                                                  |
| **Definition of Done** | Null Verstöße in der Prüfung. Beide Themes erfüllen 4,5 zu 1 für Text und 3 zu 1 für tragende Grafikelemente. Theme-Wechsel funktioniert und bleibt gespeichert                                                                                              |

## Sprint 7: Navigation und Suche

|                        |                                                                                                                                                                                                                                                                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ziel**               | Die Informationsarchitektur aus F4 umsetzen                                                                                                                                                                                                                                                                                         |
| **Voraussetzungen**    | Sprint 3 für Berechtigungen in der Navigation, Sprint 6 für Symbole                                                                                                                                                                                                                                                                 |
| **Abhängigkeiten**     | Sprint 3 und Sprint 6. **Nie parallel zu Sprint 6**, siehe 1.3                                                                                                                                                                                                                                                                      |
| **Aufwand**            | 6 bis 8 Tage                                                                                                                                                                                                                                                                                                                        |
| **Inhalt**             | Fünf Bereiche mit festen Positionen. Sechs Abteilungen unter Mehr. Rollenabhängige Sichtbarkeit über die Auflösungsfunktion. Zurück mit Zielbenennung. Suchindex über Bereiche, Gegenstände, Handlungen und Einstellungen, gefiltert nach Berechtigung. Schnellhandlungen. Zuletzt verwendet. Kontextsprung Ascent zu einem Kontakt |
| **Risiken**            | Der Suchindex darf nichts ausgeben, was der Prinzipal nicht sehen darf. Ein Treffer auf eine gesperrte Seite ist ein Informationsleck über die Existenz. Mittel                                                                                                                                                                     |
| **Teststrategie**      | Navigation für vier Prinzipale prüfen. Suchindex mit einem Berater gegen ein Verwaltungsobjekt. Bedienung mit einer Hand auf einem Telefon                                                                                                                                                                                          |
| **Definition of Done** | Berater ohne Downline sieht vier Bereiche, Positionen stabil. Verwaltung erscheint nur mit Berechtigung. Suche gibt kein unberechtigtes Ergebnis. Kontextsprung übergibt den Kontakt an Ascent                                                                                                                                      |

## Sprint 8: Wissensbasis aktivieren

|                        |                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ziel**               | Der Coach erhält Teamwissen. Behebt 16 erfasste Lücken                                                                                                                                                                                                                                                                                                                  |
| **Voraussetzungen**    | **Inhaltsspur hat mindestens sechs Dokumente geliefert**, siehe Teil 4                                                                                                                                                                                                                                                                                                  |
| **Abhängigkeiten**     | Sprint 3 für die Freigabeberechtigung                                                                                                                                                                                                                                                                                                                                   |
| **Aufwand**            | 4 bis 6 Tage Entwicklung. Der Inhalt entsteht parallel                                                                                                                                                                                                                                                                                                                  |
| **Inhalt**             | Statusmetadaten und Zielgruppe an Dokument und Ausschnitt, aus der Roadmap Phase 0. Trennung ingestierbar und nicht ingestierbar, Geheimnisse aus dem Korpus. Sprachangabe am Ausschnitt und Sprachparameter für die Wissenssuche, aus F3. Trennung Autor und Freigeber. Schwellwert je Sprachpaar messen statt schätzen. Auswertung der Wissenslücken mit Sprachangabe |
| **Risiken**            | Die 11 Ausschnitte mit Zugangsdaten dürfen nicht in den Korpus. Der Ausschnitt mit der Einkommenstabelle darf die Verwendungssperre nicht verlieren. **Hoch**, weil beides Compliance betrifft                                                                                                                                                                          |
| **Teststrategie**      | Kein Ausschnitt enthält ein Passwort. Die Einkommenstabelle wird nicht ohne ihre Sperre geliefert. Ein Berater sieht keine Entwürfe. Retrieval findet in der Nutzersprache und kennzeichnet Fallbacks                                                                                                                                                                   |
| **Definition of Done** | Mindestens sechs freigegebene Dokumente eingespeist. Der Coach zitiert daraus. Kein Geheimnis im Korpus. Schwellwert gemessen. Zehn Fragen aus dem Eval-Set korrekt beantwortet                                                                                                                                                                                         |

## Sprint 9: Vergütungsplan-Engine

|                        |                                                                                                                                                                                                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ziel**               | Rang, Qualifikation und Lizenzfrist. Der größte fachliche Wert der Roadmap                                                                                                                                                                                                    |
| **Voraussetzungen**    | Sprint 4                                                                                                                                                                                                                                                                      |
| **Abhängigkeiten**     | Sprint 3 und 4                                                                                                                                                                                                                                                                |
| **Aufwand**            | 7 bis 10 Tage                                                                                                                                                                                                                                                                 |
| **Inhalt**             | Karriereplan als versionierte Daten mit Auflösungsregel. Deterministischer Qualifikationsrechner als Funktion, nicht als Tabelle. Punkte je Mitgliedschaft, Linienvolumen als einzige Quelle. Lizenzuhr für die Sechs-Monats-Frist. Bestellcode als deterministische Funktion |
| **Risiken**            | Die Deckelung pro Linie ist laut Wissensdatenbank die häufigste Fehlerquelle in Rechnern. **Hoch.** Gegenmaßnahme: die dokumentierten Beispiele als Pflichtprüfungen, insbesondere 3.500 PT bei zwei Linien ergibt keinen Senior Leader                                       |
| **Teststrategie**      | Alle vier Qualifikationsregeln je einzeln. Grenzwerte genau auf der Schwelle. Der Konflikt bei der höchsten Stufe liefert einen Hinweis, kein Ergebnis. Bestellcode für ein-, zwei- und dreistellige Nummern                                                                  |
| **Definition of Done** | Die dokumentierten Beispiele stimmen. Ein Berater sieht seinen Rang und was ihm fehlt. Lizenzfrist erzeugt eine Warnkarte. Bestellcode nie durch ein Sprachmodell erzeugt                                                                                                     |

## Sprint 10: Aktivierung und Tagesführung

|                        |                                                                                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Ziel**               | Wirkung auf den dokumentierten Engpass, die direkte Ansprache                                                                                                                                          |
| **Voraussetzungen**    | Sprint 9                                                                                                                                                                                               |
| **Abhängigkeiten**     | Sprint 4 und 9                                                                                                                                                                                         |
| **Aufwand**            | 5 bis 7 Tage                                                                                                                                                                                           |
| **Inhalt**             | Aktivitätsziele aus Monatsziel und Zeitbudget. Fälligkeitslogik für Follow-up, die dokumentierte Lücke. Aktivierungsansicht für die Teamleitung, begrenzt auf die Downline und ohne Kontaktidentitäten |
| **Risiken**            | Die Aktivierungsansicht zeigt Aktivitätsdaten über Personen. Sie darf keine Kontaktnamen enthalten. Mittel, Gegenmaßnahme ist F2 Teil 5                                                                |
| **Teststrategie**      | Zielrechnung gegen die dokumentierte Tabelle. Fälligkeiten unterscheiden keine Antwort erhalten von hat bestellt und wartet. Aktivierungsansicht enthält keinen Kontaktnamen                           |
| **Definition of Done** | Ein Berater sieht Tageszahlen statt eines vagen Ziels. Fälligkeiten erscheinen im Tagesplan. Teamleitung sieht, wer wie lange inaktiv war                                                              |

## Sprint 11: Härtung

|                        |                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ziel**               | Betriebsfähigkeit. Beobachtbarkeit, Leistung, Fehlerverhalten                                                                                                                                                                                                                                                                                                           |
| **Voraussetzungen**    | Sprints 1 bis 10                                                                                                                                                                                                                                                                                                                                                        |
| **Abhängigkeiten**     | alle                                                                                                                                                                                                                                                                                                                                                                    |
| **Aufwand**            | 5 bis 7 Tage                                                                                                                                                                                                                                                                                                                                                            |
| **Inhalt**             | Fehlererfassung im Frontend und in den Edge Functions. Strukturierte Protokollierung mit Kennungen zur Zuordnung, ohne personenbezogene Daten. Leistungsmessung der Auflösungsfunktion und des Retrievals. Ladeplatzhalter und leere Zustände nach F4. Rückfall auf ein Skript, wenn Gemini nicht erreichbar ist. Offline: **nur lesender Zwischenspeicher**, siehe 5.4 |
| **Risiken**            | Protokollierung, die Kontaktnamen oder Coach-Inhalte enthält, wäre ein Datenschutzverstoß. Mittel                                                                                                                                                                                                                                                                       |
| **Teststrategie**      | Kein Protokolleintrag enthält personenbezogene Daten. Coach fällt bei abgeschalteter Schnittstelle auf das Skript zurück. Tagesplan lädt unter zwei Sekunden auf einer Mobilverbindung                                                                                                                                                                                  |
| **Definition of Done** | Fehler erscheinen zugeordnet. Kein Bildschirm wartet ohne Platzhalter. Der Coach wirkt bei Ausfall nie defekt                                                                                                                                                                                                                                                           |

## Sprint 12: Abnahme Version 1.0

|                        |                                                                                                                                                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ziel**               | Nachweis der Produktionsreife                                                                                                                                                                               |
| **Voraussetzungen**    | Sprints 0 bis 11                                                                                                                                                                                            |
| **Abhängigkeiten**     | alle                                                                                                                                                                                                        |
| **Aufwand**            | 3 bis 4 Tage                                                                                                                                                                                                |
| **Inhalt**             | Eval-Set vollständig durchspielen. Prüfungen vollständig. Manuelle Rauchtests aller Abläufe für vier Prinzipale. Beta-Checkliste durchgehen. Kontrastprüfung. Lastprobe mit künstlich vergrößerter Struktur |
| **Risiken**            | Das Eval-Set prüft Ton und Compliance. Beides ist modellabhängig und kann nach jeder Änderung an Systemanweisungen abweichen. Mittel                                                                        |
| **Teststrategie**      | Vollständige Suite, Eval-Set, manuelle Abläufe, Lastprobe bei 200 Mitgliedschaften                                                                                                                          |
| **Definition of Done** | Alle Prüfungen grün. Eval-Set ohne Compliance-Verstoß. Keine Regression gegenüber Sprint 1. Freigabe für den Beta-Betrieb                                                                                   |

## 3.1 Übersicht

| Sprint | Inhalt                        | Aufwand                   | Rechner nötig |
| ------ | ----------------------------- | ------------------------- | ------------- |
| 0      | Werkzeugkette                 | 2 bis 3                   | **ja**        |
| 1      | F1 in Produktion              | 1 bis 2                   | **ja**        |
| 2      | Identität und Mitgliedschaft  | 5 bis 8                   | ja            |
| 3      | Berechtigungssystem           | 5 bis 7                   | ja            |
| 4      | Tagesplanfunktionen gebündelt | 3 bis 4                   | ja            |
| 5      | Prüfprotokoll und Datenschutz | 4 bis 5                   | ja            |
| 6      | Design-Fundament              | 4 bis 5                   | nein          |
| 7      | Navigation und Suche          | 6 bis 8                   | nein          |
| 8      | Wissensbasis                  | 4 bis 6                   | ja            |
| 9      | Vergütungsplan-Engine         | 7 bis 10                  | ja            |
| 10     | Aktivierung und Tagesführung  | 5 bis 7                   | ja            |
| 11     | Härtung                       | 5 bis 7                   | ja            |
| 12     | Abnahme                       | 3 bis 4                   | ja            |
|        | **Summe**                     | **54 bis 76 Arbeitstage** |               |

Bei Parallelführung von Sprint 6 und 7 mit der Datenbankspur verkürzt sich die Kalenderdauer auf etwa **44 bis 63 Arbeitstage**.

Nicht enthalten und ausdrücklich nach Version 1.0: Produkte und Katalog, Termine, Benachrichtigungen mit Push, Nachrichten, Anerkennung, weitere Agenten, Desktop-Ausbau, Mehrsprachigkeit über die Vorbereitung hinaus.

---

# Teil 4: Parallelspuren

## 4.1 Vier Spuren

| Spur                           | Inhalt                                  | Läuft                          |
| ------------------------------ | --------------------------------------- | ------------------------------ |
| **A Datenbank und Sicherheit** | Sprints 0 bis 5, 8 bis 12               | seriell, keine Ausnahme        |
| **B Oberfläche**               | Sprints 6 und 7                         | ab Sprint 1 parallel zu A      |
| **C Inhalt**                   | Wissensdokumente                        | **ab heute**, ohne Entwicklung |
| **D Übersetzung**              | Nachrichtenkataloge, Sprachvorbereitung | ab Sprint 6, ohne Datenbank    |

Spur A ist streng seriell. Jeder ihrer Sprints ändert Objekte, die der nächste voraussetzt.

## 4.2 Die Inhaltsspur ist die wichtigste, und sie braucht keinen Entwickler

**Begründung aus den Zahlen:** 32 Coach-Nachrichten, 16 erfasste Lücken, 0 Wissensausschnitte.

Der Coach ist gebaut, läuft und hat nichts zu sagen. Kein Sprint dieses Plans verbessert seine Antworten so stark wie das erste eingespeiste Dokument.

Reihenfolge nach dokumentierter Nachfrage, aus der Roadmap:

| Rang | Dokument                                              |
| ---- | ----------------------------------------------------- |
| 1    | Unser Weg vom Lead zum Partner, die fünf Phasen       |
| 2    | Follow-up-Rhythmus, wann nachfassen, wann loslassen   |
| 3    | Die zehn häufigsten Einwände mit Antworten            |
| 4    | Der Business Fit Check                                |
| 5    | Der 3-Way-Call                                        |
| 6    | Vergütungsplan einfach erklärt, Fakten ohne Prognosen |

**Diese Spur startet heute und ist unabhängig von jedem Sprint.** Sprint 8 setzt lediglich voraus, dass sechs Dokumente vorliegen. Liegen sie früher vor, kann Sprint 8 vorgezogen werden. Liegen sie nicht vor, wäre Sprint 8 Arbeit an einer leeren Maschine.

Ab Sprint 8 wird die Spur nachfragegetrieben: Die erfassten Wissenslücken sagen, welches Dokument als nächstes fehlt. Bereits heute liegen 16 Hinweise vor.

## 4.3 Zwei Spuren, die nie zusammenfallen dürfen

Aus 1.3, hier als Termine:

- **Sprint 6 und Sprint 7 nie gleichzeitig.** Beide berühren dieselben 14 Oberflächendateien. Zusammengelegt sind die Änderungen nicht einzeln zurücknehmbar
- **Spur B pausiert während Sprint 2.** Nicht wegen technischer Konflikte, sondern weil Sprint 2 das höchste Risiko des Plans trägt und die volle Aufmerksamkeit braucht. Ein Fehler dort sperrt alle Nutzer aus

---

# Teil 6: Bereichsabdeckung

Jeder Bereich aus der Aufgabenliste, mit Sprintzuordnung. Drei Bereiche brauchen keine Planung, weil sie bestehen und tragen. Das ist ausdrücklich vermerkt, damit es nicht als Auslassung gelesen wird.

## 6.1 Bereiche, die bestehen und nicht geplant werden müssen

| Bereich                         | Istzustand                                                                  | Handlungsbedarf                                                                                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projektstruktur, Repository** | React, TypeScript, Vite. Ein Repository                                     | keiner                                                                                                                                                                  |
| **Ordnerstruktur**              | `src/app`, `src/features`, `src/shared`. Acht Fachbereiche unter `features` | keiner. Feature-orientiert, entspricht ADR-012                                                                                                                          |
| **Komponentenstruktur**         | Fachlogik je Bereich, geteilte Bausteine unter `shared/ui`                  | keiner. Neue Bereiche folgen dem Muster                                                                                                                                 |
| **State Management**            | TanStack Query. Kein zusätzlicher Zustandsspeicher                          | **keiner, und bewusst so.** Serverzustand über Query, Oberflächenzustand lokal. Ein zusätzlicher globaler Speicher wäre eine zweite Wahrheitsquelle neben der Datenbank |
| **Routing**                     | react-router-dom, zentrale Routendefinition                                 | Erweiterung in Sprint 7, kein Umbau                                                                                                                                     |
| **Supabase**                    | eingerichtet, 22 Tabellen, RLS aktiv                                        | laufend in Spur A                                                                                                                                                       |
| **PWA**                         | `vite-plugin-pwa` eingebunden                                               | Symbole in Sprint 6, Zwischenspeicher in Sprint 11                                                                                                                      |
| **Dateiupload**                 | Wissensupload mit Ziehen und Ablegen vorhanden, Textauslesung im Browser    | Statusmetadaten in Sprint 8. Kein Speicherdienst nötig, weil nur Text übertragen wird                                                                                   |
| **Testing**                     | Vitest eingebunden, pgTAP mit 94 Prüfungen geschrieben                      | Ausführbarkeit in Sprint 0. Frontend-Prüfungen sind eine offene Flanke, siehe 6.3                                                                                       |
| **CI und Deployment**           | drei CI-Aufgaben, Cloudflare Pages verbunden, Generatoren mit Abgleich      | Instandsetzung in Sprint 0                                                                                                                                              |

## 6.2 Bereiche mit Sprintzuordnung

| Bereich aus der Aufgabenliste | Sprint                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| RLS, Policies                 | 2, 3, 5                                                                                       |
| RPC-Funktionen                | 1, 2, 3, 4, 9                                                                                 |
| Edge Functions                | 1, 8                                                                                          |
| Authentifizierung             | 2, Trennung von Identität und Mitgliedschaft                                                  |
| Knowledge Base                | 8                                                                                             |
| KI, Coach                     | 8, Wissen. 11, Skriptrückfall                                                                 |
| Dashboard                     | 7, Übersichtsmuster. 9 und 10, Inhalte                                                        |
| Kontakte, Pipeline            | bestehen. Fälligkeitslogik in 10                                                              |
| Training                      | bestehen als Journey. Pflegeoberfläche nach 1.0                                               |
| Suche                         | 7                                                                                             |
| Monitoring, Logging           | 11                                                                                            |
| Performance                   | 3, Messung der Auflösung. 11, Gesamtmessung                                                   |
| Offline und Synchronisierung  | 11, ausschließlich lesender Zwischenspeicher, Begründung in 5.4                               |
| Admin                         | 7, Abteilung Verwaltung. Einzelfunktionen ab 3                                                |
| **Produkte**                  | **nach Version 1.0**, Roadmap Phase 4                                                         |
| **News**                      | **nach Version 1.0**, Roadmap Phase 7                                                         |
| **Benachrichtigungen**        | **nach Version 1.0**, Roadmap Phase 7. Setzt einen Zeitplandienst voraus, der nicht existiert |

## 6.3 Eine offene Flanke, die ich benennen muss

**Es gibt keine Frontend-Testinfrastruktur.** Vitest ist eingebunden, aber es existieren praktisch keine Oberflächenprüfungen. Die 94 Prüfungen decken ausschließlich die Datenbank ab.

| Umfang                                                           | Aufwand        | Empfehlung                                                                               |
| ---------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------- |
| Prüfungen für die Auflösung von Berechtigungen in der Oberfläche | 2 bis 3 Tage   | **ja**, in Sprint 7. Eine falsch sichtbare Verwaltungsfunktion ist ein Sicherheitsbefund |
| Prüfungen für die drei Layoutmuster                              | 3 bis 4 Tage   | nach Version 1.0                                                                         |
| Durchgängige Abläufe im Browser                                  | 1 bis 2 Wochen | nach Version 1.0                                                                         |

Begründung für die Einschränkung: Die Sicherheit liegt nach F2 in der Datenbank, nicht in der Oberfläche. Eine falsch sichtbare Schaltfläche führt zu einem abgewiesenen Aufruf, nicht zu einem Datenleck. Deshalb ist die Datenbankabdeckung die richtige Priorität, und die Oberfläche folgt.

Die eine Ausnahme ist die Navigation: Wenn ein Berater dort einen Verwaltungspunkt sieht, ist das zwar kein Leck, aber es verrät die Existenz von Funktionen und erzeugt Fehlversuche. Deshalb steht diese eine Prüfung in Sprint 7 und nicht danach.

---

# Teil 5: Kritische Analyse

## 5.1 Verbleibende technische Risiken

| #   | Risiko                                                     | Schwere                   | Wo es sich zeigt                                                                                               |
| --- | ---------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| R1  | **`current_org_id()` bei der Umstellung**                  | **höchste**               | Sprint 2. 31 Policies hängen daran. Ein Fehler sperrt jeden aus oder öffnet Mandantengrenzen                   |
| R2  | **Deckelung pro Linie im Qualifikationsrechner**           | hoch                      | Sprint 9. Laut Wissensdatenbank die häufigste Fehlerquelle. Ein falscher Rang zerstört das Vertrauen dauerhaft |
| R3  | **Geheimnisse und Verwendungssperren in der Wissensbasis** | hoch                      | Sprint 8. 11 Ausschnitte mit Zugangsdaten, ein Ausschnitt mit der Einkommenstabelle                            |
| R4  | Leistung der Auflösungsfunktion je Zeile                   | mittel                    | Sprint 3. Ohne Kennzeichnung als `stable` bricht die Leaderansicht ein                                         |
| R5  | Migration 12 ist ungeprüft                                 | mittel                    | Sprint 0. Zwei benannte Stolperstellen, beide vorab entdeckbar                                                 |
| R6  | Kein Rechnerzugang                                         | **hoch, organisatorisch** | Sprint 0 und jede Prüfung. Der knappste Faktor des ganzen Plans                                                |
| R7  | Fehlendes Logo-SVG                                         | mittel                    | Sprint 6. Blockiert nur den Symbolteil                                                                         |
| R8  | Eval-Set nach Änderungen an Systemanweisungen              | mittel                    | Sprint 12. Ton und Compliance sind modellabhängig                                                              |
| R9  | Doppelidentitäten durch übersehene Weichenstellung         | mittel                    | Sprint 2. Nachträglich nur unter Datenverlust zusammenführbar                                                  |
| R10 | Sechs offene Einladungen vor Sprint 1                      | mittel, terminlich        | siehe 0.3. Ohne Entwicklung entschärfbar                                                                       |

## 5.2 Welche Reihenfolge spätere Umbauten minimiert

Vier Entscheidungen dieses Plans dienen ausschließlich diesem Zweck.

**Erste: Keine neuen Tabellen vor Sprint 3.** Jede Tabelle mit Organisationsbezug, die vorher entsteht, wird zweimal angefasst. Bei fünf vorgezogenen Funktionen wären das fünf zusätzliche Umbauten in der ohnehin größten Migration des Plans.

**Zweite: Bündelung in Sprint 4.** Drei Änderungen an denselben sechs Funktionen in einem Durchgang statt in drei. Ersparnis etwa fünf bis sieben Tage, und wichtiger: zwei Prüf- und Auslieferungszyklen weniger an sicherheitsrelevanten Objekten.

**Dritte: `current_org_id()` behält den Namen.** Die Indirektion liegt in einer Funktion, nicht in 31 Policies. Ohne diese Vorarbeit aus Sprint 1 des Projekts wäre Sprint 2 kein Umbau, sondern ein Neubau.

**Vierte: Die Auflösungsfunktion nimmt einen Prinzipal.** Kostet heute eine Festlegung zur Signatur. Kommen später Dienstkonten für Unternehmenskunden, ist die Erweiterung additiv statt jede Prüfung zu berühren.

Und eine Entscheidung, die bereits getroffen ist und sich hier auszahlt: **Agenten und Werkzeuge sind Daten, nicht Code.** Sieben weitere Agenten sind sieben Zeilen. Zwölf Generation-1-Werkzeuge sind Datenpflege.

## 5.3 Wo Monate einzusparen sind

Nach Wirkung geordnet. Die ersten drei sind Verzichte, nicht Optimierungen.

**Erstens, etwa vier bis sechs Wochen: Kein eigener Desktop-Ausbau.** F4 empfiehlt es, und die Wissensdatenbank belegt Telefonnutzung als Regelfall. Eine responsive Darstellung aus denselben Bausteinen genügt. Sobald ein Unternehmenskunde mit Schreibtischarbeitsplätzen existiert, ist der Ausbau eine Erweiterung, kein Umbau.

**Zweitens, etwa drei bis fünf Wochen: Kein Kundenzugang.** F2 Entscheidung FD-5. Ein Kunde hat keine Genealogie, keinen Rang, keine Punkte. Er wäre ein eigener Prinzipaltyp. Die Kundenwerkzeuge der Generation 1 leisten das bereits und sind erprobt.

**Drittens, etwa vier bis acht Wochen: Keine echte Offline-Synchronisierung.** Beidseitige Synchronisierung mit Zeilenrechten und Mandantentrennung ist eine der schwierigsten Aufgaben im verteilten Rechnen. Konflikte bei Pipeline-Ereignissen berühren Provisionsansprüche. Ein **lesender Zwischenspeicher**, der Tagesplan und Kontaktliste ohne Netz anzeigt und Schreibvorgänge ablehnt, deckt den überwiegenden Teil des Nutzens zu einem Bruchteil des Aufwands.

**Viertens, etwa zwei bis drei Wochen: Punkte manuell erfassen statt Bilderkennung.** Zwei Minuten im Monat gegen eine Fehlerquelle, die einen falschen Rang erzeugt. Bereits in der Roadmap so entschieden.

**Fünftens, etwa zwei Wochen: Mehrsprachigkeit vorbereiten, nicht ausliefern.** Der Nachrichtenkatalog kommt in Sprint 6, damit keine weiteren Texte im Quelltext entstehen. Die zweite Sprache kommt, wenn ein Markt sie braucht. Die drei prüfpflichtigen Sprachen brauchen ohnehin Muttersprachler, und die sind eine organisatorische Voraussetzung, keine technische.

**Sechstens, nicht in Wochen messbar, aber die größte Wirkung: Die Inhaltsspur ab heute.** 16 erfasste Lücken bei 32 Nachrichten. Sechs Dokumente in einer Woche zu schreiben verändert den wahrgenommenen Wert des Produkts stärker als jeder Sprint dieses Plans. Und es kostet keine Entwicklungszeit.

## 5.4 Zur Offline-Fähigkeit, ausdrücklich

Der Bereich stand in der Aufgabenliste und braucht eine klare Aussage.

| Umfang                                               | Aufwand        | Empfehlung für Version 1.0 |
| ---------------------------------------------------- | -------------- | -------------------------- |
| Lesender Zwischenspeicher für Tagesplan und Kontakte | 3 bis 5 Tage   | **ja**, in Sprint 11       |
| Schreiben mit Warteschlange                          | 2 bis 3 Wochen | nein                       |
| Beidseitige Synchronisierung mit Konfliktauflösung   | 4 bis 8 Wochen | nein                       |

Begründung gegen die beiden größeren Stufen: Ein Konflikt bei einem Pipeline-Ereignis ist kein Anzeigeproblem, sondern berührt eine Provisionsgrundlage. Die Architektur hat für Korrekturen bereits einen Mechanismus über eine wirksame Sicht, aber der löst Konflikte nachträglich und nicht automatisch. Eine automatische Auflösung wäre eine fachliche Entscheidung, die niemand getroffen hat.

## 5.5 Der eigentliche Engpass des Plans

Nicht die Entwicklung. Zwei andere Dinge:

**Der Rechnerzugang.** Sprint 0 und jede Prüfung brauchen eine Maschine mit Docker und der Supabase-Kommandozeile. Vom Telefon aus ist keiner dieser Schritte ausführbar. Solange dieser Zugang nicht besteht, ist der Plan blockiert, und zwar an Sprint 0, also vor allem anderen.

**Der Inhalt.** Die Maschine läuft und ist leer. Das ist nicht mit Entwicklungszeit zu beheben.

Beides liegt außerhalb der Entwicklung. Ein Masterplan, der das verschweigt und stattdessen 54 bis 76 Arbeitstage in Aussicht stellt, wäre irreführend.

## 5.6 Empfehlung für die nächsten sieben Tage

| Tag     | Handlung                                                                          | Wer                         |
| ------- | --------------------------------------------------------------------------------- | --------------------------- |
| 1       | Sechs offene Einladungen zurückhalten oder ablaufen lassen                        | Sie, im SQL-Editor          |
| 1 bis 3 | Rechnerzugang herstellen, Sprint 0 ausführen                                      | Sie plus ich                |
| 1 bis 7 | Erste zwei Wissensdokumente schreiben, die fünf Phasen und der Follow-up-Rhythmus | Sie und Şeyda               |
| 4 bis 5 | Sprint 1, F1 in Produktion                                                        | ich, Verifikation durch Sie |
| 6 bis 7 | Sprint 2 vorbereiten, Umzugsplan für die zwei Profile                             | ich                         |

Der erste Punkt kostet zwei Minuten und entschärft die einzige Frist des Plans.
