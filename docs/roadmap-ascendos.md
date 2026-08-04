# AscendOS Roadmap

Grundlage: Wissensdatenbank Team Şeyda, Stand 24. Juli 2026, 20 Dateien, vollständig gelesen.
Erstellt: 24. Juli 2026. Keine Codeänderung, reine Planung.

Diese Roadmap folgt den Stilregeln aus 14_PROMPTS.md: keine Gedankenstriche, echte Umlaute, keine Emojis, vollständige Adressen.

---

# Teil A: Was die Wissensdatenbank verändert

## A1. Bewertung der Wissensdatenbank

Diese Bibliothek ist kein Dokumentenhaufen, sondern ein Redaktionssystem. Drei Eigenschaften machen sie ungewöhnlich wertvoll:

1. **Statuslegende an jeder Aussage.** BESTÄTIGT, BELEGT, AKTUELL, VERALTET, UNGEPRÜFT, KONFLIKT, LÜCKE. Damit ist Verlässlichkeit maschinell auswertbar und nicht Auslegungssache.
2. **Aufgelöste Konflikte mit Nachweis.** Neun Punkte wurden geklärt und der überholte Wert bleibt dokumentiert. Senior Manager PT, Länderzahl, Insider-Status, Kitpreise, Verkaufswege, Insider-Marge, Handelsspanne, Ambassador-Zugang, die Verkaufsfrage.
3. **Dokumentierte Fehlerhistorie.** Der Codefehler 33 statt 303, die Verwechslung Lolûm und Brilhome, StPageFlip auf Brave, das Streaming grosser PDFs. Fehler mit Ursache und Behebung sind wertvoller als jede Anleitung.

Der wichtigste Satz der ganzen Bibliothek steht in 01_TEAM_SEYDA.md, Abschnitt 9, und ist mehrfach bestätigt:

> Der Engpass liegt nicht im Werkzeugbestand, sondern in der direkten Ansprache. Werkzeugbau fühlt sich produktiv an und ersetzt dabei Vertriebsaktivität.

Daraus folgt die Prüffrage, die diese Roadmap auf jede Position anwendet.

## A2. Vier Befunde, die die Reihenfolge bestimmen

Diese Befunde stammen aus der Analyse, nicht aus einer Meinung. Zwei davon sind Vorbedingungen und keine Roadmap-Positionen.

### Befund 1: Die Wissensdatenbank enthält Geheimnisse, die der Coach zitieren würde

Kritisch. Muss vor der ersten Ingestion gelöst sein.

Ich habe die 20 Dateien durch den echten Chunking-Algorithmus aus `ingest-knowledge` laufen lassen. Ergebnis: 134 Chunks, davon **11 Chunks mit Zugangsdaten im Klartext**.

| Wert                                                                   | Fundstellen                            |
| ---------------------------------------------------------------------- | -------------------------------------- |
| `teamseyda2026`, Zugang zu Ultimate Tool und Duftparty                 | 01, 09, 10 zweimal, 11 zweimal, 18, 19 |
| `waytomoon`, Adminpasswort Produktpflege                               | 13, 19                                 |
| Google Drive Ordner-ID mit Hinweis auf den eingebetteten API-Schlüssel | 03, 10, 11                             |
| WhatsApp Einladungs-IDs beider Gruppen                                 | 01, 11                                 |
| Konto-E-Mails baranfakker120 und hacibekircayir                        | 03, 13                                 |

Die Bibliothek stellt in 11_NETLIFY_LINKS.md selbst die Regel auf: Passwörter niemals unaufgefordert ausgeben, vor der Ausgabe interner Adressen prüfen, ob die Person Berater ist.

**Das Problem: Diese Regel ist für einen Menschen formuliert, nicht für ein Abrufsystem.** RAG ruft Chunks nach Ähnlichkeit ab, nicht nach Berechtigung. Ein Chunk mit dem Passwort wird geliefert, sobald die Frage thematisch passt. Der Systemprompt kann darum bitten, das Passwort nicht zu nennen, aber er kann es nicht verhindern, wenn der Wert im Kontext steht. Zusätzlich: Ein einziges kompromittiertes Beraterkonto liest damit alles, ein gemeinsames Passwort lässt sich nicht personenbezogen entziehen.

Die Bibliothek benennt das Kernproblem selbst in 19_ZUKUNFT_KI_PLATTFORM.md: Die Passwortschleuse ist eine kosmetische Hürde, keine Zugriffskontrolle.

**Konsequenz:** Vor der Ingestion ein Redaktionsschritt. Geheimnisse gehören nicht in den Abrufkorpus, sondern in eine rollengeschützte Verwaltung. Details in Phase 0.

### Befund 2: Das Chunking zerstört genau das Qualitätssystem, das die Bibliothek auszeichnet

Kritisch. Betrifft die Compliance-Kernregel.

`ingest-knowledge` schneidet bei 1600 Zeichen mit 200 Zeichen Überlappung. Die Statuszeile steht am Abschnittsanfang, der Wert weiter unten. Bei einem Schnitt dazwischen verliert der Wert seine Kennzeichnung.

Nachgewiesen an 04_VERGÜTUNGSPLAN.md, sieben Chunks:

| Chunk | Problem                                                                                     |
| ----- | ------------------------------------------------------------------------------------------- |
| 2     | Enthält den Wert 3.000.000 ohne den Hinweis, dass er als KONFLIKT geführt und ungeprüft ist |
| 5     | **Enthält die vollständige Einkommenstabelle ohne die Verwendungssperre**                   |

Chunk 5 ist der schwerwiegende Fall. Die Tabelle trägt in der Quelldatei eine ausdrückliche Sperre: nicht in kundenseitigen, öffentlichen oder werblichen Materialien, weil Verdienstversprechen in Deutschland rechtlich heikel sind. Nach dem Chunking enthält der Textblock die Zahlen von 45 Euro bis 35.380 Euro, aber nicht die Sperre. Fragt ein Berater, was ein Emerald verdient, liefert das Retrieval diesen Chunk, und der Coach hat keine Information darüber, dass er die Zahlen nicht weitergeben darf.

Das verletzt die Regel, die in der Bibliothek am häufigsten wiederholt wird: keine Einkommensversprechen, nirgends, in keiner Form. Sie steht in 01, 02, 04, 09, 14, 17 und ist eine der fünf wichtigsten Regeln überhaupt.

Die Bibliothek fordert selbst die Lösung in 19_ZUKUNFT_KI_PLATTFORM.md: Statusfeld ist Pflicht an jedem Wissenssatz, nicht optional. Ohne Status keine Ausgabe.

**Konsequenz:** Status und Zielgruppe müssen Metadaten am Chunk sein, nicht Text im Chunk. Das ist eine Schemaerweiterung an `knowledge_docs` und `knowledge_chunks` und eine Filterbedingung in `match_knowledge`. Details in Phase 0.

### Befund 3: Ihr Phasenvorschlag beschreibt einen Neubau, AscendOS ist aber schon weiter

Ihre Phase 1 Fundament nennt Rollen, Berechtigungen, Benutzerverwaltung, Einstellungen, Aktivitätssystem. Das ist zu etwa 90 Prozent gebaut und in Produktion. Ebenso grosse Teile der Phasen 2, 3, 5 und 7.

Würde man Ihre Reihenfolge übernehmen, würden die ersten Wochen damit verbracht, Vorhandenes neu zu bauen. Die vollständige Gegenüberstellung steht in A3.

**Konsequenz:** Die Roadmap setzt am Ist-Stand an und ordnet nach Wirkung auf den Engpass. Jede Ihrer sieben Phasen kommt vollständig vor, nur an anderer Stelle und mit Angabe, was davon existiert.

### Befund 4: Der grösste freigeschaltete Wert steht nicht auf Ihrer Liste

Der Vergütungsplan ist in 04_VERGÜTUNGSPLAN.md **vollständig und rechenbar** dokumentiert: 16 Karrierestufen mit Provision, PT-Schwelle, Mindestzahl Erstlinien, Höchstanrechnung pro Linie und monatlicher Mindest-AP. Dazu die vier Qualifikationsregeln, die Auszahlungslogik, der Rechenwert 1 PT entspricht 1,27 Euro.

Damit ist ein deterministischer Qualifikationsrechner möglich. Vorher war er es nicht, weil die Zahlen fehlten.

Das ist aus drei Gründen die wertvollste neue Funktion:

1. **Es ist die häufigste Frage.** Abschnitt C der FAQ besteht überwiegend aus Rang- und Qualifikationsfragen. Die Frage "Warum erreiche ich meinen Rang nicht, obwohl ich genug Punkte habe" hat drei nichttriviale Ursachen, die kein Berater im Kopf hat.
2. **Es verhindert einen echten Verlust.** Die Sechs-Monats-Regel mit 300 AP kostet die Beraterlizenz, wenn niemand daran erinnert. Die Bibliothek fordert dafür ausdrücklich eine sichtbare Warnkarte, keine Fussnote.
3. **Es ist deterministisch, also KI-frei.** Rangberechnung darf nie ein Sprachmodell machen. Die Bibliothek nennt die Deckelung pro Linie die häufigste Fehlerquelle in Rechnern. Ein Modell, das eine Zahl vorhersagt, ist hier das falsche Werkzeug. Der Coach ruft die Funktion auf und erklärt das Ergebnis.

**Konsequenz:** Eigene Phase, direkt nach der Wissensaktivierung.

## A3. Ist-Stand gegen Ihren Phasenvorschlag

| Ihre Phase      | Position                   | Status in AscendOS                                                        | Was fehlt                                         |
| --------------- | -------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------- |
| 1 Fundament     | Rollen                     | **gebaut.** `profiles.role`, `current_user_role()`, `is_super_admin()`    | Rolle Kunde und Trennung Leader gegen Teamleitung |
| 1               | Berechtigungen             | **gebaut.** RLS auf allen 22 Tabellen, Policies geprüft                   | Rechtematrix als Dokument                         |
| 1               | Benutzerverwaltung         | **gebaut.** Invite-System, `create_invite`, `validate_invite`, Genealogie | Adminoberfläche zur Nutzerverwaltung              |
| 1               | Einstellungen              | **teilweise.** `organizations.settings` als jsonb                         | Oberfläche, Nutzereinstellungen                   |
| 1               | Aktivitätssystem           | **teilweise.** `usage_events`, `pipeline_events`, `daily_plans`           | AP- und PT-Erfassung, Fälligkeitslogik            |
| 2 Team          | Teamstruktur               | **gebaut.** organizations, teams, sponsor_id                              | Strukturwachstum über Zeit                        |
| 2               | Profilseiten               | **fehlt**                                                                 | vollständig                                       |
| 2               | Firstlines                 | **gebaut.** `get_downline()`, `firstline_journey_progress`                | Oberfläche über die Journey hinaus                |
| 2               | Downlines                  | **gebaut.** `get_downline()` rekursiv                                     | Oberfläche                                        |
| 2               | Leaderansicht              | **fehlt**                                                                 | vollständig                                       |
| 3 Wissen        | Wissensdatenbank           | **Maschine gebaut, leer.** knowledge_docs, chunks, gaps, Uploadseite      | Inhalt, Status-Metadaten, Redaktion               |
| 3               | Coach                      | **gebaut und live.** Ascent, drei Agenten, Router, RAG, Gemini            | Weitere Agenten, Werkzeugaufrufe                  |
| 3               | Trainings                  | **teilweise.** journeys, journey_steps                                    | Trainingsinhalte, Quizsperren                     |
| 3               | Dokumente                  | **gebaut.** Upload, Freigabe, Kategorien                                  | Versionierung über `supersedes_doc_id`            |
| 3               | Suche                      | **gebaut.** `match_knowledge` mit pgvector                                | Volltextsuche, Statusfilter                       |
| 4 Analyse       | Dashboards                 | **fehlt**                                                                 | vollständig                                       |
| 4               | KPIs                       | **Daten vorhanden, keine Auswertung**                                     | Kennzahlendefinition, Ansichten                   |
| 4               | Statistiken                | **fehlt**                                                                 | vollständig                                       |
| 4               | Teamanalysen               | **fehlt**                                                                 | vollständig                                       |
| 4               | KI-Empfehlungen            | **teilweise.** Regel-Engine im Tagesplan                                  | Proaktive Analyse                                 |
| 5 Motivation    | Profilrahmen               | **fehlt**                                                                 | vollständig                                       |
| 5               | Automatische Beförderungen | **fehlt**                                                                 | braucht Vergütungsplan-Engine                     |
| 5               | Auszeichnungen             | **gebaut.** achievements, user_achievements, `check_achievements()`       | Inhalte                                           |
| 5               | Networker des Monats       | **fehlt**                                                                 | vollständig, Compliance-Risiko, siehe C3          |
| 5               | Hall of Fame               | **fehlt**                                                                 | vollständig, Compliance-Risiko, siehe C3          |
| 5               | Missionen                  | **gebaut.** `update_mission_status()`, daily_plan_items                   | Inhalte                                           |
| 5               | Ziele                      | **fehlt**                                                                 | vollständig                                       |
| 6 Kommunikation | News                       | **fehlt**                                                                 | vollständig                                       |
| 6               | Benachrichtigungen         | **fehlt**                                                                 | vollständig                                       |
| 6               | Push                       | **fehlt**                                                                 | vollständig, braucht Scheduler und Git            |
| 6               | Events                     | **fehlt**                                                                 | vollständig, Seed-Daten liegen in der Bibliothek  |
| 6               | Kalender                   | **fehlt**                                                                 | vollständig                                       |
| 7 KI            | Intelligente Empfehlungen  | **teilweise**                                                             | Kontextquellen erweitern                          |
| 7               | Wissenslücken              | **gebaut.** `knowledge_gaps` mit Anonymisierung                           | Auswertungsoberfläche                             |
| 7               | Automatisierte Analysen    | **fehlt**                                                                 | braucht Phase 6                                   |
| 7               | Persönliche Assistenz      | **gebaut.** Ascent                                                        | Werkzeugaufrufe                                   |
| 7               | Leader-Unterstützung       | **fehlt**                                                                 | braucht Leaderansicht                             |

Kurzfassung: Fundament und Coach stehen. Was fehlt, sind Zahlen, Ansichten und Benachrichtigungen.

## A4. Der Maßstab

Jede Position in dieser Roadmap beantwortet die Prüffrage aus 01_TEAM_SEYDA.md und 19_ZUKUNFT_KI_PLATTFORM.md:

> Welche konkrete Vertriebsaktivität erhöht dieses Vorhaben messbar? Ohne Antwort wird es nicht gebaut.

Die Bibliothek stellt in 01_TEAM_SEYDA.md Abschnitt 9 als Regel fest, dass Werkzeugbau sich produktiv anfühlt und dabei Vertriebsaktivität ersetzt. Daraus folgt die Prüfpflicht: kein Modul ohne belegten Beitrag zu einer Vertriebsaktivität.

Drei Wirkungsklassen werden unterschieden:

- **A, wirkt direkt auf den Engpass.** Erhöht Ansprache, Follow-up oder Aktivierung messbar.
- **B, entfernt eine Reibung.** Spart Zeit oder verhindert einen Fehler, der Aktivität kostet.
- **C, Fundament.** Wirkt nicht selbst, ist aber Voraussetzung für A oder B.

Positionen ohne A, B oder C stehen nicht in dieser Roadmap.

---

# Teil B: Die Phasen

Zehn Phasen, Phase 0 als Vorbedingung. Zeitangaben sind Grössenordnungen für eine Person, die mobil arbeitet, nicht Zusagen.

---

## Phase 0: Redaktion und Absicherung der Wissensbasis

**Vorbedingung, keine Wahlmöglichkeit.** Ohne diese Phase ist die Ingestion gefährlich statt unvollständig.

Grössenordnung: Tage, nicht Wochen. Komplexität mittel. Priorität höchste. Wirkungsklasse C.

### 0.1 Trennung ingestierbar und nicht ingestierbar

|                      |                                                                                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Warum wichtig**    | 11 von 134 Chunks enthalten Zugangsdaten. RAG kennt keine Berechtigungen, es kennt Ähnlichkeit.                                                                         |
| **Vorteil**          | Der Coach kann keine Passwörter mehr ausgeben, auch nicht versehentlich und auch nicht auf geschickte Nachfrage.                                                        |
| **Benötigt**         | nichts                                                                                                                                                                  |
| **Tabellen**         | `knowledge_docs` um `is_ingestible boolean` und `contains_secrets boolean` erweitern. Neue Tabelle `admin_secrets` mit rollengeschütztem Zugriff, nicht im Abrufkorpus. |
| **Rollen**           | Betreiber pflegt, niemand ruft über den Coach ab                                                                                                                        |
| **Rechte**           | `admin_secrets` nur `is_super_admin()`, kein SELECT für Berater, keine Aufnahme in `match_knowledge`                                                                    |
| **KI-Unterstützung** | keine. Ausdrücklich ein Redaktionsschritt durch Menschen.                                                                                                               |
| **Später möglich**   | Automatische Erkennung von Geheimnismustern beim Upload als Warnung, nicht als Automatik                                                                                |

Konkretes Vorgehen: Aus 13_SUPABASE.md und 11_NETLIFY_LINKS.md werden die Abschnitte mit Zugangsdaten entfernt und durch einen Verweis ersetzt. Die Werte wandern in die Adminverwaltung. Die Linkliste selbst bleibt ingestierbar, weil sie fachlich wertvoll ist, nur ohne Passwortspalte.

### 0.2 Status und Zielgruppe als Metadaten

|                      |                                                                                                                                                                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Warum wichtig**    | Chunk 5 der Vergütungsdatei liefert Einkommenszahlen ohne die Verwendungssperre. Das verletzt die am häufigsten wiederholte Compliance-Regel.                                                                                                   |
| **Vorteil**          | Statusverlust wird strukturell unmöglich, nicht durch Sorgfalt vermieden.                                                                                                                                                                       |
| **Benötigt**         | 0.1                                                                                                                                                                                                                                             |
| **Tabellen**         | `knowledge_docs`: `knowledge_status text` mit den sieben Werten der Legende, `audience text` mit berater, kunde, intern, `source_ref text`. `knowledge_chunks`: dieselben Felder als vererbte Kopie, weil das Retrieval auf Chunkebene filtert. |
| **Rollen**           | Betreiber und Teamleitung setzen Status, Berater sehen ihn im Coach als Hinweis                                                                                                                                                                 |
| **Rechte**           | Statusänderung nur `is_super_admin()`. `match_knowledge` erhält Pflichtparameter `p_audience` und schliesst UNGEPRÜFT, KONFLIKT und intern für kundenseitige Antworten aus.                                                                     |
| **KI-Unterstützung** | Der Systemprompt erhält den Status je Ausschnitt und formuliert entsprechend. UNGEPRÜFT wird als zu prüfend gekennzeichnet, VERALTET gar nicht ausgegeben.                                                                                      |
| **Später möglich**   | Statusabhängige Gültigkeitswarnung. Preise älter als ein Quartal löst die Prüfaufforderung aus, die 19_ZUKUNFT bereits als Benachrichtigung vorsieht.                                                                                           |

Wichtige Präzisierung: `knowledge_docs` hat bereits `status` mit draft, approved, archived. Das ist der Freigabestatus und etwas anderes als der Wissensstatus der Bibliothek. Beide müssen getrennt bleiben, sonst entsteht genau die Verwechslung, die die Bibliothek an anderen Stellen sorgfältig vermeidet.

### 0.3 Dokumentzerlegung statt Grossdatei

|                      |                                                                                                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Warum wichtig**    | Eine Datei mit einem einzigen Status ist die einfachste Lösung für 0.2. 04_VERGÜTUNGSPLAN.md enthält BELEGT, AKTUELL, KONFLIKT, LÜCKE und eine Verwendungssperre in einem Dokument. |
| **Vorteil**          | Jeder Abschnitt trägt einen einheitlichen Status. Das Chunking kann ihn nicht mehr verlieren.                                                                                       |
| **Benötigt**         | 0.2                                                                                                                                                                                 |
| **Tabellen**         | keine neuen                                                                                                                                                                         |
| **Rollen**           | Betreiber                                                                                                                                                                           |
| **Rechte**           | unverändert                                                                                                                                                                         |
| **KI-Unterstützung** | Vorschlag der Schnittstellen anhand der Statuszeilen, Prüfung durch Menschen                                                                                                        |
| **Später möglich**   | Automatische Zerlegung beim Upload nach Statuszeilen                                                                                                                                |

Aus 20 Dateien werden dabei etwa 45 bis 60 Dokumente. Das ist kein Nachteil: Die Kategoriezuordnung wird präziser und das Retrieval trifft genauer.

### 0.4 Redaktionsprotokoll

|                      |                                                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Warum wichtig**    | 19_ZUKUNFT fordert es ausdrücklich: wer hat wann welchen Wissenssatz geändert. Die Bibliothek lebt von Nachvollziehbarkeit. |
| **Vorteil**          | Konflikte lassen sich auflösen statt vermehren. Ein falscher Wert ist auf seine Quelle zurückführbar.                       |
| **Benötigt**         | 0.2                                                                                                                         |
| **Tabellen**         | `knowledge_review_log` mit doc_id, changed_by, changed_at, field, old_value, new_value, reason                              |
| **Rollen**           | Betreiber, Teamleitung                                                                                                      |
| **Rechte**           | INSERT durch Trigger, SELECT nur `is_super_admin()`, kein UPDATE und kein DELETE                                            |
| **KI-Unterstützung** | keine                                                                                                                       |
| **Später möglich**   | Quartalsbericht über offene LÜCKEN und KONFLIKTE                                                                            |

### Phase 0 zusammengefasst

|                  |                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------- |
| Komplexität      | mittel                                                                             |
| Priorität        | höchste, blockierend                                                               |
| Abhängigkeiten   | keine                                                                              |
| Nutzen Berater   | mittelbar. Verhindert falsche Auskünfte, die er weitergeben würde.                 |
| Nutzen Leader    | Nachvollziehbarkeit der Wissensqualität                                            |
| Nutzen Betreiber | Rechtssicherheit und Kontrolle über Geheimnisse                                    |
| Prüffrage        | Klasse C. Verhindert, dass die Wissensaktivierung Compliance-Verstösse produziert. |

---

## Phase 1: Wissen aktivieren

Entspricht Ihrer Phase 3. Die Maschine steht, sie ist leer.

Grössenordnung: eine bis zwei Wochen, überwiegend Redaktionsarbeit. Komplexität niedrig bis mittel. Priorität höchste. Wirkungsklasse A.

### 1.1 Ingestion der redigierten Bibliothek

|                      |                                                                                                                                                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Warum wichtig**    | `knowledge_chunks` ist bei null. Der Coach behandelt heute jede Fachfrage als Wissenslücke. Die Bibliothek ist laut 01_TEAM_SEYDA.md und 19_ZUKUNFT das wertvollste Unternehmensvermögen, aktuell aber nicht abrufbar. |
| **Vorteil**          | Ascent antwortet ab sofort mit Team-Şeyda-Wissen statt mit allgemeinen Vertriebsfloskeln. Das ist der Unterschied zwischen einer Netzwerk-App und AscendOS.                                                            |
| **Benötigt**         | Phase 0 vollständig                                                                                                                                                                                                    |
| **Tabellen**         | `knowledge_docs`, `knowledge_chunks`, vorhanden                                                                                                                                                                        |
| **Rollen**           | Betreiber lädt, alle Berater lesen über den Coach                                                                                                                                                                      |
| **Rechte**           | Upload nur `super_admin`, Lesen über `knowledge_docs_select_approved`                                                                                                                                                  |
| **KI-Unterstützung** | Einbettung über `gemini-embedding-001` mit `RETRIEVAL_DOCUMENT`, vorhanden                                                                                                                                             |
| **Später möglich**   | Zoom-Transkription. 19_ZUKUNFT und 08_TRAININGS sehen Aufzeichnungen als Wissensquelle vor. Aufwand eigener Art, nicht jetzt.                                                                                          |

Kategoriezuordnung der Bibliothek auf die neun Kategorien von AscendOS:

| Datei                    | Kategorie             | Zielgruppe                                      |
| ------------------------ | --------------------- | ----------------------------------------------- |
| 01 Team Şeyda            | prozess               | berater                                         |
| 02 Essence Tribe         | prozess, verguetung   | gemischt, abschnittsweise                       |
| 03 Chogan                | produkte              | kunde und berater                               |
| 04 Vergütungsplan        | verguetung            | berater, Einkommensteil intern                  |
| 05 Produkte              | produkte              | kunde und berater                               |
| 06 Recruiting            | recruiting, einwaende | berater                                         |
| 07 Onboarding            | prozess, schulung     | berater                                         |
| 08 Trainings             | schulung              | berater                                         |
| 09 FAQ                   | faq                   | abschnittsweise A kunde, B kunde, C berater     |
| 10 Tools, 11 Links       | prozess               | berater, ohne Zugangsdaten                      |
| 12, 13, 15, 16 technisch | nicht ingestieren     | intern, Adminverwaltung                         |
| 14 Prompts               | nicht ingestieren     | gehört in den Systemprompt, nicht in den Korpus |
| 17 Best Practices        | prozess, verkauf      | berater                                         |
| 18 Glossar               | faq                   | gemischt                                        |
| 19 Zukunft               | nicht ingestieren     | Planung, kein Beraterwissen                     |

Begründung zu 14: Stilregeln im Abrufkorpus sind wirkungslos und potenziell schädlich, weil das Modell sie als Inhalt zitiert statt zu befolgen. Sie gehören in `CORE_RULES`, wo sie nicht überschreibbar sind. Das fordert 14_PROMPTS.md in Abschnitt 7 selbst.

### 1.2 Schwellwert kalibrieren

|                      |                                                                                                                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Warum wichtig**    | `coach_min_similarity` steht auf 0,2 als Annahme. Bisher gab es nichts zu messen. Zu hoch heisst keine Treffer, zu niedrig heisst falsche Treffer, die als oberste Wahrheit behandelt werden. |
| **Vorteil**          | Retrieval trifft belegbar statt vermutlich.                                                                                                                                                   |
| **Benötigt**         | 1.1                                                                                                                                                                                           |
| **Tabellen**         | `organizations.settings`, vorhanden, keine Schemaänderung                                                                                                                                     |
| **Rollen**           | Betreiber                                                                                                                                                                                     |
| **Rechte**           | UPDATE auf organizations nur `is_super_admin()`                                                                                                                                               |
| **KI-Unterstützung** | keine, reine Messung                                                                                                                                                                          |
| **Später möglich**   | Kategorieabhängige Schwellwerte. Faktenfragen brauchen höhere Präzision als Gesprächsführung.                                                                                                 |

Messmethode: 20 echte Fragen aus 09_FAQ.md gegen die eingebettete Bibliothek stellen, Ähnlichkeitswerte protokollieren, Schwelle unter das schwächste erwünschte Ergebnis legen.

### 1.3 Zielgruppentrennung im Coach

|                      |                                                                                                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Warum wichtig**    | 19_ZUKUNFT fordert es klar: Antworten für Kunden dürfen keine Strukturbegriffe wie Downline, PT oder Karrierestufe enthalten. Heute gibt es diese Trennung nicht. |
| **Vorteil**          | Der Coach ist gegenüber Kunden verwendbar, ohne interne Begriffe zu verraten. Öffnet den Coach für den Kundenkontakt.                                             |
| **Benötigt**         | 0.2                                                                                                                                                               |
| **Tabellen**         | `coach_convos` um `audience text` erweitern                                                                                                                       |
| **Rollen**           | Berater wählt am Einstieg, wie in 08_TRAININGS.md Abschnitt 5 als Architekturentscheidung festgelegt                                                              |
| **Rechte**           | unverändert                                                                                                                                                       |
| **KI-Unterstützung** | Zweiter Systemprompt-Baustein je Zielgruppe, Retrieval mit `p_audience` gefiltert                                                                                 |
| **Später möglich**   | Eigener Kundenzugang. Grosse Entscheidung, siehe C4.                                                                                                              |

Wichtig: Die Rollenwahl geschieht am Eingang und der Agent wechselt sie nicht intern. Das ist eine bereits getroffene und begründete Entscheidung aus 08_TRAININGS.md, keine offene Frage.

### 1.4 Wissenslückenauswertung

|                      |                                                                                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Warum wichtig**    | `knowledge_gaps` sammelt anonymisiert, was fehlt. Es gibt keine Oberfläche. 19_ZUKUNFT nennt die wöchentliche Sichtung als Dokumentations-Einkaufsliste. |
| **Vorteil**          | Die Bibliothek wächst nachfragegetrieben statt nach Vermutung. Die dokumentierten LÜCKEN aus 00_INDEX.md bekommen eine Priorität aus echten Fragen.      |
| **Benötigt**         | 1.1                                                                                                                                                      |
| **Tabellen**         | `knowledge_gaps`, vorhanden. Ergänzung `resolved_by_doc_id`, `resolved_at`                                                                               |
| **Rollen**           | Betreiber, Teamleitung                                                                                                                                   |
| **Rechte**           | SELECT nur `is_super_admin()`. Enthält trotz Anonymisierung Nutzungsmuster.                                                                              |
| **KI-Unterstützung** | Themenbündelung ähnlicher Lücken, Vorschlag von Dokumenttiteln                                                                                           |
| **Später möglich**   | Automatischer Dokumententwurf aus Lückenbündel plus Coach-Antwort, mit Pflichtfreigabe                                                                   |

### Phase 1 zusammengefasst

|                  |                                                                                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Komplexität      | niedrig bis mittel                                                                                                                                                                          |
| Priorität        | höchste                                                                                                                                                                                     |
| Abhängigkeiten   | Phase 0                                                                                                                                                                                     |
| Nutzen Berater   | Beantwortet die Fragen, die er heute in WhatsApp stellt, sofort und korrekt. Codelogik, Kitpreise, Insider-Regel, Einwände.                                                                 |
| Nutzen Leader    | Weniger identische Rückfragen. Sichtbarkeit, was das Team nicht versteht.                                                                                                                   |
| Nutzen Betreiber | Die Bibliothek wird vom Dokument zum Betriebsmittel.                                                                                                                                        |
| Prüffrage        | Klasse A. Der Berater sucht nicht mehr nach Informationen und kann direkt ansprechen. Reduziert die Erklärlast, die laut 07_ONBOARDING.md ausdrücklich von Werkzeugen getragen werden soll. |

---

## Phase 2: Vergütungsplan als Engine

Steht nicht auf Ihrer Liste. Nach der Analyse die wertvollste neue Funktion.

Grössenordnung: zwei bis drei Wochen. Komplexität hoch. Priorität sehr hoch. Wirkungsklasse A und B.

### 2.1 Karriereplan als versionierte Daten

|                      |                                                                                                                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Warum wichtig**    | 16 Stufen mit fünf Parametern, vollständig dokumentiert. Als Code wäre jede Planänderung durch Chogan ein Deployment. Die Bibliothek verlangt für Werte mit Änderungsrisiko ausdrücklich Gültigkeitsdaten. |
| **Vorteil**          | Planänderungen sind Datenpflege. Historische Berechnungen bleiben nachvollziehbar.                                                                                                                         |
| **Benötigt**         | nichts                                                                                                                                                                                                     |
| **Tabellen**         | `comp_plan_ranks`: rank_key, club, provision_pct, pt_required, min_firstlines, max_per_line, min_ap_monthly, sort_order, valid_from, valid_until, knowledge_status, org_id nullable                        |
| **Rollen**           | Betreiber pflegt, alle lesen                                                                                                                                                                               |
| **Rechte**           | SELECT für alle authentifizierten Nutzer der Organisation, Schreiben nur `is_super_admin()`                                                                                                                |
| **KI-Unterstützung** | keine. Bewusst.                                                                                                                                                                                            |
| **Später möglich**   | Mandantenfähigkeit über `org_id`, Voraussetzung für Skalierungsstufe 5                                                                                                                                     |

Der KONFLIKT bei der Höchstpunktzahl der letzten Stufe, 3.000.000 gegen 1.000.000, wird als `knowledge_status = 'KONFLIKT'` geführt. Die Engine liefert dort kein Ergebnis, sondern einen Hinweis. Das ist korrekter als eine erfundene Sicherheit und betrifft nur die Präsidentenstufe.

### 2.2 Deterministischer Qualifikationsrechner

|                      |                                                                                                                                                                                                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Warum wichtig**    | Die vier Regeln aus 04_VERGÜTUNGSPLAN.md Abschnitt 7 sind zwingend und nicht offensichtlich. Die Deckelung pro Linie ist laut Bibliothek die häufigste Fehlerquelle in Rechnern. Ein Beispiel aus der Quelle: 3.500 PT bei nur 2 Linien ergeben keinen Senior Leader. |
| **Vorteil**          | Beantwortet die häufigste Partnerfrage korrekt. Berater sehen, was konkret fehlt, statt zu rätseln.                                                                                                                                                                   |
| **Benötigt**         | 2.1, 2.3                                                                                                                                                                                                                                                              |
| **Tabellen**         | `qualification_results`: user_id, period_month, computed_rank, qualified, missing_pt, missing_ap, missing_firstlines, capped_pt_total, reasons jsonb, computed_at                                                                                                     |
| **Rollen**           | Berater sieht eigene, Teamleitung sieht Firstline, Betreiber alle                                                                                                                                                                                                     |
| **Rechte**           | RLS: eigene Zeile immer, Downline nur über `get_downline()`, kein Querzugriff auf Sidelines                                                                                                                                                                           |
| **KI-Unterstützung** | Der Coach ruft die Funktion auf und **erklärt** das Ergebnis in Klartext. Er berechnet es nie selbst. Rangberechnung durch Tokenvorhersage ist der falsche Mechanismus.                                                                                               |
| **Später möglich**   | Vorausrechnung. Was fehlt bis zum nächsten Rang, welche Linie lohnt Förderung am meisten.                                                                                                                                                                             |

Als SQL-Funktion, nicht in der Anwendung. Begründung: Die Regeln müssen in Ansichten, Benachrichtigungen und Coach identisch gelten. Eine Implementierung, drei Nutzer.

Pflichttests, abgeleitet aus den dokumentierten Beispielen:

- Linie mit 800 PT bei Deckel 300 zählt 300.
- 3.500 PT bei 2 Linien ergibt nicht Senior Leader.
- Mindest-AP nicht erfüllt ergibt nicht qualifiziert trotz ausreichendem PT.
- Grenzwerte genau auf der Schwelle.

### 2.3 Punkteerfassung

|                      |                                                                                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Warum wichtig**    | Ohne AP und PT ist die Engine ein Taschenrechner ohne Eingabe. Es gibt keine Chogan-Schnittstelle, die Daten kommen aus der Essence Tribe App.                          |
| **Vorteil**          | Aus einer Rechenhilfe wird ein persönlicher Status.                                                                                                                     |
| **Benötigt**         | 2.1                                                                                                                                                                     |
| **Tabellen**         | `member_points`: user_id, period_month, ap, pt, cp, icp, source (manuell, import), entered_by, entered_at. `line_volumes`: user_id, period_month, firstline_user_id, pt |
| **Rollen**           | Berater trägt eigene Werte ein, Teamleitung kann für Firstline eintragen                                                                                                |
| **Rechte**           | INSERT und UPDATE nur für eigene Zeile oder eigene Firstline. Historische Monate nach Abschluss gesperrt.                                                               |
| **KI-Unterstützung** | Später Bildauswertung eines Screenshots aus der ET Pro App. Nicht in v1, weil Fehler hier teuer sind und die manuelle Eingabe monatlich zwei Minuten kostet.            |
| **Später möglich**   | CSV-Import, falls Chogan Auswertungen exportierbar macht                                                                                                                |

Bewusst manuell in v1. Der Zeitaufwand ist minimal, die Fehleranfälligkeit einer Bilderkennung dagegen hoch, und ein falscher Rang zerstört Vertrauen sofort. `cp` und `icp` werden erfasst, aber nicht berechnet, weil die Berechnungsgrundlage laut 04_VERGÜTUNGSPLAN.md eine LÜCKE ist.

### 2.4 Lizenzuhr, Sechs-Monats-Frist

|                      |                                                                                                                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Warum wichtig**    | Die härteste Regel im ganzen System. 300 AP in 6 Monaten, sonst Verlust der Beraterlizenz und Wechsel in den Insider-Status. Die Bibliothek verlangt an zwei Stellen ausdrücklich eine deutlich sichtbare Warnkarte, keine Fussnote. |
| **Vorteil**          | Verhindert einen Verlust, der ohne Erinnerung eintritt. Das ist messbarer Schaden, der abgewendet wird.                                                                                                                              |
| **Benötigt**         | 2.3                                                                                                                                                                                                                                  |
| **Tabellen**         | `license_status`: user_id, activated_at, window_start, ap_in_window, deadline, status (aktiv, gefährdet, insider), computed_at                                                                                                       |
| **Rollen**           | Berater sieht eigene, Sponsor sieht Firstline. 19_ZUKUNFT nennt beide als Empfänger.                                                                                                                                                 |
| **Rechte**           | eigene Zeile plus Firstline über Sponsorbeziehung                                                                                                                                                                                    |
| **KI-Unterstützung** | Der Coach macht daraus eine Handlungsaufforderung. Nicht "dir fehlen 80 AP", sondern welche konkrete Bestellung oder welcher Verkauf die Lücke schliesst.                                                                            |
| **Später möglich**   | Reaktivierungsvorschlag für Insider in der eigenen Struktur. Laut 09_FAQ.md verdient der Sponsor an einem Insider 12,5 Prozent weiter. Ein Insider ist kein verlorener Partner.                                                      |

Dieser letzte Punkt ist eine der stärksten Erkenntnisse der Bibliothek und heute in keinem Werkzeug abgebildet: Kontakt zu inaktiven Beratern zu halten lohnt sich wirtschaftlich.

### 2.5 Bestellcode-Funktion

|                      |                                                                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Warum wichtig**    | 03_CHOGAN.md nennt die Codelogik geschäftskritisch und den häufigsten Fehlerpunkt bei Bestellungen. Ohne korrekten Code keine korrekte Bestellung.                             |
| **Vorteil**          | Beseitigt eine Fehlerquelle, die direkt Umsatz kostet. Kleine Funktion, überdurchschnittlicher Nutzen.                                                                         |
| **Benötigt**         | nichts                                                                                                                                                                         |
| **Tabellen**         | keine                                                                                                                                                                          |
| **Rollen**           | alle Berater                                                                                                                                                                   |
| **Rechte**           | keine Einschränkung                                                                                                                                                            |
| **KI-Unterstützung** | Der Coach ruft die Funktion auf. **Er berechnet den Code nie selbst.** Ein Sprachmodell, das Ziffern vorhersagt, produziert genau den historischen Fehler 33 statt 303 wieder. |
| **Später möglich**   | Umkehrung. Aus einem Code die Grösse und Duftnummer ableiten, für Bestellprüfung.                                                                                              |

Regel aus der Bibliothek, wörtlich zu implementieren:

```
30 ml:  "3" + String(n).padStart(2, "0")
70 ml:  String(n).padStart(3, "0")
```

Pflichttests mit ein-, zwei- und dreistelligen Nummern, wie 17_BEST_PRACTICES.md verlangt. Sonderfall ab 100 ergibt vierstellige 30-ml-Codes, das ist korrekt und keine Ausnahme.

### Phase 2 zusammengefasst

|                  |                                                                                                                                                             |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Komplexität      | hoch. Die Qualifikationslogik ist die anspruchsvollste Rechenaufgabe im Projekt.                                                                            |
| Priorität        | sehr hoch                                                                                                                                                   |
| Abhängigkeiten   | keine harten. Läuft parallel zu Phase 1 möglich.                                                                                                            |
| Nutzen Berater   | Weiss jederzeit, wo er steht, was fehlt und ob seine Provision qualifiziert ist. Verliert seine Lizenz nicht aus Unwissen.                                  |
| Nutzen Leader    | Sieht, welche Firstline in Gefahr ist, bevor die Frist abläuft. Führung wird konkret statt allgemein.                                                       |
| Nutzen Betreiber | Der Vergütungsplan ist nur an einer Stelle implementiert, nicht in mehreren Werkzeugen mit abweichenden Werten.                                             |
| Prüffrage        | Klasse A und B. Verhindert Lizenzverluste, ersetzt Rückfragen, macht Zielarbeit möglich. Erhöht Aktivität, weil sichtbar wird, was eine Bestellung bewirkt. |

---

## Phase 3: Aktivierung und Tagesführung

Entspricht Ihrer Phase 1, Position Aktivitätssystem. Greift direkt am dokumentierten Engpass an.

Grössenordnung: zwei Wochen. Komplexität mittel. Priorität sehr hoch. Wirkungsklasse A.

### 3.1 Aktivitätsziele aus Monatsziel und Zeitbudget

|                      |                                                                                                                                                                                                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Warum wichtig**    | 06_RECRUITING.md Abschnitt 8 enthält eine fertige Tabelle: Monatsziel, benötigte aktive Partner, Direktnachrichten pro Tag, Follow-ups, EOM-Einladungen, Zeitraum. Dazu die Anpassung nach verfügbarer Zeit. Diese Rechnung existiert heute nur im Ultimate Tool als Zielrechner. |
| **Vorteil**          | Der Berater erhält Tageszahlen statt eines vagen Ziels. Die Bibliothek nennt genau das den wertvollsten Beitrag einer eigenen KI.                                                                                                                                                 |
| **Benötigt**         | nichts                                                                                                                                                                                                                                                                            |
| **Tabellen**         | `activity_targets`: user_id, monthly_goal_eur, hours_per_week, dm_per_day, followups_per_day, eom_invites_per_day, valid_from                                                                                                                                                     |
| **Rollen**           | Berater setzt eigene, Teamleitung sieht Firstline                                                                                                                                                                                                                                 |
| **Rechte**           | eigene Zeile schreiben, Firstline lesen                                                                                                                                                                                                                                           |
| **KI-Unterstützung** | Der Coach führt das Zielgespräch und schlägt realistische Werte vor. Die Umrechnung selbst ist deterministisch aus der Tabelle.                                                                                                                                                   |
| **Später möglich**   | Abgleich Ziel gegen tatsächliche Aktivität aus `pipeline_events`. Zeigt die Lücke zwischen Plan und Tun.                                                                                                                                                                          |

Zwingender Hinweis: Diese Zahlen sind laut Bibliothek Aktivitätsziele, keine Einkommensversprechen. Der Hinweistext ist Pflicht, wie bei jedem Rechner.

### 3.2 Follow-up-Fälligkeitslogik

|                      |                                                                                                                                                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Warum wichtig**    | 16_AUTOMATISIERUNGEN.md und 19_ZUKUNFT benennen diese Lücke wörtlich: Statuskategorien vorhanden, Fälligkeitslogik fehlt. AscendOS hat die Pipeline, die Bibliothek hat den Rhythmus. Beides zusammen ergibt die fehlende Funktion. |
| **Vorteil**          | Follow-up wird ein fester Tagesblock statt einer Reaktion nach Gefühl, genau wie 06_RECRUITING.md es fordert.                                                                                                                       |
| **Benötigt**         | Pipeline, vorhanden                                                                                                                                                                                                                 |
| **Tabellen**         | `follow_up_rules`: phase, event_type, due_after_days, escalation_days, org_id. Nutzt `effective_pipeline_events`, vorhanden                                                                                                         |
| **Rollen**           | Berater                                                                                                                                                                                                                             |
| **Rechte**           | Regeln lesen alle, schreiben nur `is_super_admin()`                                                                                                                                                                                 |
| **KI-Unterstützung** | Der Tagesplan priorisiert Fälligkeiten. Der Coach entwirft die konkrete Nachricht mit dem in der Bibliothek geforderten neuen Anknüpfungspunkt statt einer Wiederholung.                                                            |
| **Später möglich**   | Wann loslassen. 07_ONBOARDING.md nennt das als Teil des Follow-up-Rhythmus. Ein Kontakt ohne Reaktion nach n Versuchen wird archiviert statt endlos nachgefasst.                                                                    |

Die Bibliothek verlangt ausdrücklich die Trennung zweier Zielgruppen: keine Antwort erhalten gegen hat bestellt und wartet. Das sind zwei verschiedene Aufgaben mit verschiedenen Texten und muss im Tagesplan getrennt erscheinen.

### 3.3 Aktivierungsansicht für Leader

|                      |                                                                                                                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Warum wichtig**    | 06_RECRUITING.md nennt die Aktivierung bestehender Partner, die nicht selbst rekrutieren, einen eigenen Arbeitsschwerpunkt und den grössten ungenutzten Hebel. Heute ist nicht sichtbar, wer wie lange nicht aktiv war und woran es liegt. |
| **Vorteil**          | Führung wird gezielt. Statt allgemeiner Motivation in der Gruppe sieht der Leader, wer seit wann keinen Kontakt angelegt hat.                                                                                                              |
| **Benötigt**         | 2.3, 2.4, 3.1                                                                                                                                                                                                                              |
| **Tabellen**         | Ansicht über `profiles`, `usage_events`, `pipeline_events`, `member_points`, `license_status`. Keine neue Tabelle.                                                                                                                         |
| **Rollen**           | Teamleitung, Betreiber                                                                                                                                                                                                                     |
| **Rechte**           | Nur eigene Downline über `get_downline()`. Keine Sidelines, wie in 01_TEAM_SEYDA.md als Strukturbegriff definiert.                                                                                                                         |
| **KI-Unterstützung** | Wöchentliche Zusammenfassung für den Leader. Wer braucht Aufmerksamkeit, mit Begründung und Gesprächsvorschlag. Das ist die Leader-Unterstützung aus Ihrer Phase 7.                                                                        |
| **Später möglich**   | Aktivierungssprint. 08_TRAININGS.md nennt den Sieben-Tage-Aktionssprint als erprobtes Format bei niedriger Motivation.                                                                                                                     |

Datenschutzhinweis: Diese Ansicht zeigt Aktivitätsdaten über Personen. Sie muss auf die Downline begrenzt bleiben und darf keine Coach-Gesprächsinhalte enthalten. Die anonymisierte Lückenerfassung aus AscendOS ist hier das richtige Vorbild.

### Phase 3 zusammengefasst

|                  |                                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| Komplexität      | mittel                                                                                                           |
| Priorität        | sehr hoch                                                                                                        |
| Abhängigkeiten   | Phase 2 für 3.3                                                                                                  |
| Nutzen Berater   | Weiss morgens, was heute zu tun ist, mit Zahlen statt Gefühl.                                                    |
| Nutzen Leader    | Sieht, wo Aktivierung wirkt, und führt gezielt.                                                                  |
| Nutzen Betreiber | Der dokumentierte Engpass wird messbar statt behauptet.                                                          |
| Prüffrage        | Klasse A, die direkteste Wirkung in der ganzen Roadmap. Erhöht Ansprache, Follow-up und Aktivierung unmittelbar. |

---

## Phase 4: Produkt- und Bestellkern

Steht auf Ihrer Liste nicht, ist aber Position 3 der Roadmap aus 19_ZUKUNFT.

Grössenordnung: zwei bis vier Wochen, abhängig vom Datenumfang. Komplexität mittel bis hoch. Priorität hoch. Wirkungsklasse B.

### 4.1 Zentrale Produkt- und Preisquelle

|                      |                                                                                                                                                                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Warum wichtig**    | 19_ZUKUNFT nennt es Priorität 3, 17_BEST_PRACTICES fordert eine zentrale Quelle statt mehrfacher Ablage. Heute liegen Preise fest verdrahtet in mehreren Werkzeugen. Der Business Fit Check muss laut Bibliothek bei jeder Preisänderung manuell geprüft werden. |
| **Vorteil**          | Eine Preisänderung wird an einer Stelle gepflegt statt in mehreren Auslieferungen. Die Prüfpflicht entfällt.                                                                                                                                                     |
| **Benötigt**         | nichts                                                                                                                                                                                                                                                           |
| **Tabellen**         | `catalog_products`: org_id, code, brand, category, name, price_eur, size, description, application, benefits, tags[], images[], similar[], valid_from, valid_until, knowledge_status. `price_history` für Nachvollziehbarkeit.                                   |
| **Rollen**           | Produktpflege durch benannte Berechtigte, laut 05_PRODUKTE.md und 13_SUPABASE.md heute drei Personen. Das ist eine eigene Berechtigung, keine Vollrolle. Wer sie hält, ist Konfiguration und gehört nicht in die Spezifikation.                                  |
| **Rechte**           | Neue Berechtigung `can_manage_products`, unabhängig von der Rolle. Die Bibliothek betont: Wer Produkte pflegt, braucht keinen Datenbankzugang und keine weiteren Rechte.                                                                                         |
| **KI-Unterstützung** | Produktfinder über `tags[]`. 03_CHOGAN.md nennt dieses Feld ausdrücklich den Schlüssel für einen KI-Produktfinder. Beispiel BS05B mit erfrischend, menthol, koerper, sommer.                                                                                     |
| **Später möglich**   | Cross-Selling-Vorschlag über `similar[]`. Die Bibliothek nennt Verbrauchsprodukte als Stammkundenmotor.                                                                                                                                                          |

Namenshinweis: Im Supabase-Projekt existiert bereits eine Tabelle `products`. Ob sie zum Geschäftssystem gehört, ist zu klären, siehe C4. Bis dahin `catalog_products` als Name, um eine Kollision zu vermeiden.

Das Datenmodell ist in 03_CHOGAN.md Abschnitt 6 vollständig vorgegeben und wird übernommen, nicht neu erfunden.

### 4.2 Smartlink-Unterstützung

|                      |                                                                                                                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Warum wichtig**    | 02_ESSENCE_TRIBE.md nennt den Smartlink den wichtigsten Mechanismus für Kunden mit Hemmschwelle und den wichtigsten gegen Kaufabbrüche. Der Kunde kauft ohne Registrierung. In keinem AscendOS-Modul abgebildet. |
| **Vorteil**          | Senkt die Hürde von Interesse zu Kauf auf einen Klick. Direkter Umsatzhebel.                                                                                                                                     |
| **Benötigt**         | 4.1                                                                                                                                                                                                              |
| **Tabellen**         | `smartlinks`: user_id, org_id, products jsonb, created_at, opened_at, converted_at                                                                                                                               |
| **Rollen**           | Berater                                                                                                                                                                                                          |
| **Rechte**           | eigene Zeilen                                                                                                                                                                                                    |
| **KI-Unterstützung** | Der Coach stellt aus dem Gespräch die Produktliste zusammen. Aus "sie sucht etwas Frisches fürs Büro" wird ein fertiger Link.                                                                                    |
| **Später möglich**   | Konversionsmessung. Welche Zusammenstellungen führen zum Kauf.                                                                                                                                                   |

Einschränkung, ehrlich: Wie ein Smartlink bei Chogan technisch erzeugt wird, ist in der Bibliothek nicht dokumentiert. Vor dem Bau zu klären. Bis dahin ist die Zusammenstellung möglich, die Linkerzeugung nicht.

### 4.3 Katalogzugang

|                      |                                                                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Warum wichtig**    | Die Bibliothek unter `https://chogankatalogs.netlify.app` ist laut 10_TOOLS.md das technisch durchdachteste Werkzeug und lädt PDFs live aus Google Drive. Es muss nicht neu gebaut werden. |
| **Vorteil**          | AscendOS wird der Einstieg, ohne Vorhandenes zu ersetzen.                                                                                                                                  |
| **Benötigt**         | `external_tools`, vorhanden                                                                                                                                                                |
| **Tabellen**         | `external_tools`, vorhanden, wird mit dem Register aus 10_TOOLS.md befüllt                                                                                                                 |
| **Rollen**           | alle, mit Freigabestufe je Werkzeug                                                                                                                                                        |
| **Rechte**           | Interne Werkzeuge nur für Berater, öffentliche für alle. Die Trennung aus 11_NETLIFY_LINKS.md wird zu einem Feld.                                                                          |
| **KI-Unterstützung** | Der Coach empfiehlt Werkzeug plus Nutzungszeitpunkt. 11_NETLIFY_LINKS.md verlangt das ausdrücklich: bei jeder Empfehlung den Zeitpunkt mitgeben.                                           |
| **Später möglich**   | Absorption der Generation-1-Werkzeuge, wie in der Produktvision vorgesehen                                                                                                                 |

Der Aufwand ist Datenpflege, nicht Entwicklung. Zwölf Werkzeuge mit Zweck, Phase, Zielgruppe, Zeitpunkt und Freigabestufe sind in 10_TOOLS.md vollständig beschrieben.

### Phase 4 zusammengefasst

|                  |                                                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| Komplexität      | mittel bis hoch, abhängig davon, wie viele der 158 Düfte und rund 200 weiteren Artikel übernommen werden |
| Priorität        | hoch                                                                                                     |
| Abhängigkeiten   | keine harten                                                                                             |
| Nutzen Berater   | Ein Ort für Produkt, Preis, Code und Anwendung. Kein Wechsel zwischen Werkzeugen im Kundengespräch.      |
| Nutzen Leader    | Einheitliche Produktinformation im Team, keine abweichenden Preise.                                      |
| Nutzen Betreiber | Preispflege an einer Stelle. Die Prüfpflicht aus 02_ESSENCE_TRIBE.md entfällt.                           |
| Prüffrage        | Klasse B. Beseitigt Codefehler und Preisabweichungen und verkürzt das Beratungsgespräch.                 |

---

## Phase 5: Team, Struktur und Leaderansicht

Entspricht Ihrer Phase 2. Fundament vorhanden, Ansichten fehlen.

Grössenordnung: zwei Wochen. Komplexität niedrig bis mittel. Priorität mittel. Wirkungsklasse B.

### 5.1 Profilseiten

|                      |                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Warum wichtig**    | Es gibt keine Ansicht einer Person. Sponsor, Firstline, Rang, Aktivstatus und Journey-Fortschritt liegen in der Datenbank, sind aber nicht darstellbar. |
| **Vorteil**          | Der Leader sieht eine Person statt einer Zeile. Voraussetzung für gezielte Gespräche.                                                                   |
| **Benötigt**         | 2.2 für den Rang                                                                                                                                        |
| **Tabellen**         | `profiles`, `profiles_public`, vorhanden. Ergänzung um Sichtbarkeitseinstellungen.                                                                      |
| **Rollen**           | alle sehen eigenes Profil, Teamleitung die Downline                                                                                                     |
| **Rechte**           | `profiles_public` existiert bereits für eingeschränkte Sicht und wird genutzt. `protect_profile_columns()` verhindert Selbstbeförderung.                |
| **KI-Unterstützung** | Gesprächsvorbereitung. Was sollte der Leader mit dieser Person besprechen, abgeleitet aus Aktivität, Rang und Frist.                                    |
| **Später möglible**  | Notizen des Leaders zur Person, mit klarer Datenschutzregel                                                                                             |

### 5.2 Struktur- und Downline-Ansicht

|                      |                                                                                                                                                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Warum wichtig**    | `get_downline()` existiert rekursiv, es gibt keine Darstellung. 04_VERGÜTUNGSPLAN.md nennt eine Baumvisualisierung als erwarteten Bestandteil.                                                                                      |
| **Vorteil**          | Der Berater versteht seine Struktur. Die Deckelung pro Linie wird sichtbar statt abstrakt.                                                                                                                                          |
| **Benötigt**         | 2.3 für PT pro Linie                                                                                                                                                                                                                |
| **Tabellen**         | vorhanden, plus `structure_snapshots` für Wachstum über Zeit                                                                                                                                                                        |
| **Rollen**           | Berater eigene Struktur, Teamleitung Downline                                                                                                                                                                                       |
| **Rechte**           | strikt über `get_downline()`, keine Sidelines                                                                                                                                                                                       |
| **KI-Unterstützung** | Welche Linie lohnt Förderung. Bei Deckelung pro Linie ist eine zweite mittlere Linie oft wertvoller als eine stärkere erste. Dieser Zusammenhang ist nicht offensichtlich und genau die Art Einsicht, die eine Engine liefern kann. |
| **Später möglich**   | Was-wäre-wenn-Rechnung für Rangplanung                                                                                                                                                                                              |

Zur Darstellungsgrenze: Ein vollständiger Strukturbaum bleibt bis etwa 100 Personen lesbar. Darüber braucht es Aggregation je Linie mit Aufklappen auf Anforderung. Die Grenze ist eine Frage der Lesbarkeit, nicht der Abfrageleistung, weil `get_downline()` rekursiv arbeitet.

### Phase 5 zusammengefasst

|                  |                                                                 |
| ---------------- | --------------------------------------------------------------- |
| Komplexität      | niedrig bis mittel                                              |
| Priorität        | mittel                                                          |
| Abhängigkeiten   | Phase 2                                                         |
| Nutzen Berater   | Versteht die eigene Struktur und die Wirkung der Deckelung.     |
| Nutzen Leader    | Kernwerkzeug. Ohne diese Ansicht ist Führung Vermutung.         |
| Nutzen Betreiber | Überblick über das Wachstum in Richtung 200.                    |
| Prüffrage        | Klasse B. Macht Förderentscheidungen begründbar statt zufällig. |

---

## Phase 6: Analyse und Kennzahlen

Entspricht Ihrer Phase 4. Daten liegen vor, Auswertung fehlt.

Grössenordnung: zwei Wochen. Komplexität mittel. Priorität mittel. Wirkungsklasse B.

### 6.1 Beraterdashboard

|                      |                                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Warum wichtig**    | Der Berater hat keinen Ort, an dem sein Stand zusammenläuft. 04_VERGÜTUNGSPLAN.md nennt ein Dashboard mit Aktivstatus und Monatsstatus als erwarteten Bestandteil. |
| **Vorteil**          | Ein Blick statt fünf Ansichten.                                                                                                                                    |
| **Benötigt**         | 2.2, 2.4, 3.1                                                                                                                                                      |
| **Tabellen**         | keine neuen, Ansichten über Vorhandenes                                                                                                                            |
| **Rollen**           | Berater                                                                                                                                                            |
| **Rechte**           | eigene Daten                                                                                                                                                       |
| **KI-Unterstützung** | Ein Satz Lagebeurteilung mit einer konkreten Handlung. Die Handlungspflicht aus `CORE_RULES` gilt auch hier.                                                       |
| **Später möglich**   | Vergleich zum Vormonat, Trendanzeige                                                                                                                               |

### 6.2 Trichteranalyse

|                      |                                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Warum wichtig**    | `pipeline_events` und `contact_phases` liegen seit Sprint 2 vor und wurden nie ausgewertet. Die acht Phasen von Lead bis Partner ergeben einen messbaren Trichter. |
| **Vorteil**          | Zeigt, wo Kontakte verloren gehen. Das ist eine Diagnose, die kein Coachinggespräch ersetzt.                                                                       |
| **Benötigt**         | Pipeline, vorhanden                                                                                                                                                |
| **Tabellen**         | `effective_pipeline_events`, vorhanden. Korrekturbereinigt, deshalb belastbar.                                                                                     |
| **Rollen**           | Berater eigene, Teamleitung aggregiert                                                                                                                             |
| **Rechte**           | Downline aggregiert, keine Einzelkontakte fremder Berater. Kontaktdaten sind persönlich.                                                                           |
| **KI-Unterstützung** | Engpassdiagnose. Viele Präsentationen, wenige Fit Checks bedeutet ein Problem an einer bestimmten Übergangsstelle, nicht generell zu wenig Aktivität.              |
| **Später möglich**   | Vergleich gegen Teamdurchschnitt, nur anonymisiert                                                                                                                 |

### 6.3 Teamkennzahlen

|                      |                                                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Warum wichtig**    | Der Leader braucht Aggregate. Wie viele aktiv, wie viele in Gefahr, wie viele im Onboarding, Wachstum in Richtung 200. |
| **Vorteil**          | Führung nach Zahlen statt nach Eindruck.                                                                               |
| **Benötigt**         | 5.2, 6.1                                                                                                               |
| **Tabellen**         | `structure_snapshots` für Zeitreihen                                                                                   |
| **Rollen**           | Teamleitung, Betreiber                                                                                                 |
| **Rechte**           | Downline                                                                                                               |
| **KI-Unterstützung** | Wöchentliche Zusammenfassung mit den drei wichtigsten Beobachtungen                                                    |
| **Später möglich**   | Prognose. Bei aktueller Rate wird die Zielgrösse zu diesem Zeitpunkt erreicht.                                         |

### Phase 6 zusammengefasst

|                  |                                                                                 |
| ---------------- | ------------------------------------------------------------------------------- |
| Komplexität      | mittel                                                                          |
| Priorität        | mittel                                                                          |
| Abhängigkeiten   | Phasen 2, 3, 5                                                                  |
| Nutzen Berater   | Sieht den eigenen Trichter und weiss, welcher Schritt hakt.                     |
| Nutzen Leader    | Führung nach Zahlen.                                                            |
| Nutzen Betreiber | Belegt, ob die Roadmap wirkt. Ohne Phase 6 bleibt die Prüffrage unbeantwortbar. |
| Prüffrage        | Klasse B, mit Sonderstellung. Diese Phase macht alle anderen messbar.           |

---

## Phase 7: Kommunikation, Events, Benachrichtigungen

Entspricht Ihrer Phase 6. Erste Phase mit einer harten technischen Vorbedingung.

Grössenordnung: drei Wochen. Komplexität hoch. Priorität hoch, aber blockiert. Wirkungsklasse A.

### Vorbedingung: Git-Anbindung

12_GITHUB.md und 16_AUTOMATISIERUNGEN.md sind eindeutig: Zeitgesteuerte Funktionen werden nur bei Git-Anbindung zuverlässig registriert. Bei Drag-and-Drop ist die Registrierung unzuverlässig.

AscendOS ist bereits ein Git-Projekt mit Cloudflare-Pages-Anbindung und Supabase Edge Functions. Für AscendOS ist diese Vorbedingung damit erfüllt. Sie bleibt offen für die Generation-1-Werkzeuge, die laut 12_GITHUB.md kein Repository haben.

Anzumerken: Ihr Berater-Tagesrhythmus aus 01_TEAM_SEYDA.md ist zeitgebunden. Morgens Direktnachrichten, mittags Follow-ups, abends EOM-Einladungen. Benachrichtigungen ohne Zeitsteuerung würden diesen Rhythmus nicht abbilden können.

### 7.1 Events und Kalender

|                      |                                                                                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Warum wichtig**    | Der Meetingplan ist fest und wiederkehrend: EOM Montag 20:30, Coaching 21:15, Coaching Mittwoch 20:30. Dazu Alpha Seven Academy und drei bekannte Grossveranstaltungen. Alles in der Bibliothek dokumentiert. |
| **Vorteil**          | Der Berater verpasst den zentralen Recruiting-Termin nicht und lädt rechtzeitig ein.                                                                                                                          |
| **Benötigt**         | nichts                                                                                                                                                                                                        |
| **Tabellen**         | `events`: org_id, title, kind (eom, coaching, academy, offline, major), starts_at, recurrence, language, cost_eur, url, visibility, description                                                               |
| **Rollen**           | alle lesen, Teamleitung und Betreiber pflegen                                                                                                                                                                 |
| **Rechte**           | SELECT nach `visibility`, Schreiben nur Teamleitung und höher                                                                                                                                                 |
| **KI-Unterstützung** | Erinnerung mit fertiger Einladungsvorlage. 06_RECRUITING.md gibt die Struktur vor, formuliert im Namen von Essence Tribe, nicht im eigenen.                                                                   |
| **Später möglich**   | Teilnahmeerfassung. Moon Experience 2027 verlangt den Besuch von Pflichtveranstaltungen als Qualifikationskriterium.                                                                                          |

Seed-Daten sind vollständig vorhanden: der wöchentliche Plan aus 01_TEAM_SEYDA.md, die Grossveranstaltungen aus 02_ESSENCE_TRIBE.md mit EuroEvent Turin September 2026, AlphaSeven Leadership Pro München Oktober 2026, MoonRun ShowPalast München Juni 2027.

Die Verhaltensregel gehört mit in die Erinnerung: Am EOM selbst teilnehmen und gleichzeitig eigene Interessenten einladen. Nicht nur weiterleiten.

### 7.2 Benachrichtigungen

|                      |                                                                                                                                                                                           |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Warum wichtig**    | 19_ZUKUNFT enthält eine fertige Auslösertabelle, abgeleitet aus bestehenden Regeln. Sieben Auslöser mit Nachricht und Empfänger. Diese Funktion muss nicht konzipiert werden, nur gebaut. |
| **Vorteil**          | Verhindert vermeidbare Statusverluste. Das ist die stärkste Einzelwirkung, weil ein Lizenzverlust nicht rückgängig zu machen ist, ausser über eine 350-AP-Bestellung.                     |
| **Benötigt**         | 2.4, 3.2, 7.1, Git                                                                                                                                                                        |
| **Tabellen**         | `notification_templates`, `notifications` (user_id, kind, payload jsonb, scheduled_for, sent_at, read_at), `notification_preferences`                                                     |
| **Rollen**           | alle empfangen, Betreiber pflegt Vorlagen                                                                                                                                                 |
| **Rechte**           | eigene Benachrichtigungen lesen, Vorlagen nur `is_super_admin()`                                                                                                                          |
| **KI-Unterstützung** | Formulierung im Ton der Bibliothek, mit konkretem nächsten Schritt statt reiner Statusmeldung                                                                                             |
| **Später möglich**   | Kanalwahl. In-App, Push, E-Mail, gegebenenfalls WhatsApp.                                                                                                                                 |

Die Auslöser aus der Bibliothek, unverändert übernommen:

| Auslöser                                           | Empfänger           |
| -------------------------------------------------- | ------------------- |
| AP unter Monatsminimum, Monat läuft                | Partner             |
| Sechs-Monats-Frist läuft ab, 300 AP nicht erreicht | Partner und Sponsor |
| Follow-up fällig                                   | Berater             |
| EOM in einer Stunde                                | Berater             |
| Alpha Seven Academy angekündigt                    | alle                |
| Neue Katalogdatei im Drive-Ordner                  | Betreiber           |
| Preisliste älter als ein Quartal                   | Betreiber           |

Regel, die ich ergänze: Benachrichtigungen brauchen eine Obergrenze pro Tag und eine Abschaltmöglichkeit je Art. Ein System, das zu oft meldet, wird stummgeschaltet, und dann geht auch die wichtige Fristwarnung verloren.

### 7.3 Push-Mitteilungen

|                      |                                                                                                                                                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Warum wichtig**    | AscendOS ist eine PWA, iPhone hat laut Bibliothek Vorrang. Ohne Push erreicht eine Fristwarnung den Berater nur, wenn er die App ohnehin öffnet. Genau die Partner, deren Aktivierung das Ziel ist, öffnen sie nicht von sich aus. |
| **Vorteil**          | Erreicht die Zielgruppe, die den grössten Hebel darstellt.                                                                                                                                                                         |
| **Benötigt**         | 7.2, Service Worker, vorhanden                                                                                                                                                                                                     |
| **Tabellen**         | `push_subscriptions`: user_id, endpoint, keys jsonb, created_at, last_seen_at                                                                                                                                                      |
| **Rollen**           | alle                                                                                                                                                                                                                               |
| **Rechte**           | eigene Zeilen                                                                                                                                                                                                                      |
| **KI-Unterstützung** | keine. Push ist Auslieferung, nicht Inhalt.                                                                                                                                                                                        |
| **Später möglich**   | Zeitfenster je Nutzer, passend zum Tagesrhythmus                                                                                                                                                                                   |

Technische Einschränkung, die vor der Planung geklärt sein muss: Web Push auf iOS verlangt, dass die App zum Home-Bildschirm hinzugefügt wurde. Das ist ein Onboarding-Schritt, kein technisches Detail, und muss in die Journey aufgenommen werden.

### 7.4 News

|                      |                                                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Warum wichtig**    | Ankündigungen laufen heute über die WhatsApp-Info-Gruppe, in der nur Administratoren posten. Das funktioniert, ist aber nicht durchsuchbar und nicht an Rollen gebunden. |
| **Vorteil**          | Ankündigungen bleiben auffindbar. Neue Partner sehen, was sie verpasst haben.                                                                                            |
| **Benötigt**         | 7.1                                                                                                                                                                      |
| **Tabellen**         | `news_posts`: org_id, team_id nullable, title, body, publish_at, audience, author_id, pinned                                                                             |
| **Rollen**           | Teamleitung und Betreiber schreiben, alle lesen                                                                                                                          |
| **Rechte**           | SELECT nach `audience` und `team_id`, Schreiben nur Teamleitung und höher                                                                                                |
| **KI-Unterstützung** | Zusammenfassung verpasster Meldungen beim ersten Öffnen nach längerer Abwesenheit                                                                                        |
| **Später möglich**   | Lesebestätigung für wichtige Ankündigungen wie Regeländerungen                                                                                                           |

Bewusst niedrig priorisiert: WhatsApp funktioniert und ist dort, wo die Menschen ohnehin sind. Diese Funktion ersetzt nichts, sie ergänzt.

### Phase 7 zusammengefasst

|                  |                                                                              |
| ---------------- | ---------------------------------------------------------------------------- |
| Komplexität      | hoch, überwiegend wegen Zustellung und Zeitsteuerung                         |
| Priorität        | hoch                                                                         |
| Abhängigkeiten   | Phasen 2, 3, Git-Anbindung                                                   |
| Nutzen Berater   | Verpasst weder Frist noch EOM noch Follow-up.                                |
| Nutzen Leader    | Wird bei Gefährdung der Firstline mitinformiert und kann eingreifen.         |
| Nutzen Betreiber | Erinnerung an Preis- und Katalogpflege.                                      |
| Prüffrage        | Klasse A. Bringt den Berater zur Handlung, ohne dass er die App öffnen muss. |

---

## Phase 8: Motivation und Anerkennung

Entspricht Ihrer Phase 5. Bewusst spät, mit einer Einschränkung.

Grössenordnung: zwei Wochen. Komplexität mittel. Priorität mittel bis niedrig. Wirkungsklasse A, aber nur bei richtiger Ausgestaltung.

### Warum spät und nicht früh

Zwei Gründe, beide sachlich:

1. **Ohne echte Zahlen ist Gamification Theater.** Ein Abzeichen für 10 Direktnachrichten setzt voraus, dass 10 Direktnachrichten gemessen werden. Diese Messung entsteht in Phase 3 und 6.
2. **Es gibt ein Compliance-Risiko, das ausgeräumt werden muss.** Details in C3. Kurzfassung: Eine öffentliche Rangliste nach Umsatz oder Punkten kann als Verdienstbeispiel wirken und widerspricht der Regel kein Druck, keine Manipulation. Die Lösung ist eine Rangliste nach Aktivität statt nach Ergebnis.

### 8.1 Ziele

|                      |                                                                                                                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Warum wichtig**    | 08_TRAININGS.md nennt Moon Shot als eigenen Trainingsbereich für Zielsetzung. `activity_targets` aus Phase 3 deckt Monatsziele ab, nicht persönliche Ziele wie einen Rang bis zu einem Datum. |
| **Vorteil**          | Ziel und Tagesaufgabe hängen zusammen. Der Tagesplan wird begründet statt vorgegeben.                                                                                                         |
| **Benötigt**         | 2.2, 3.1                                                                                                                                                                                      |
| **Tabellen**         | `goals`: user_id, kind (rang, umsatz, struktur, aktivitaet), target_value, target_date, progress, status                                                                                      |
| **Rollen**           | Berater setzt eigene, Teamleitung sieht Firstline nur bei Freigabe                                                                                                                            |
| **Rechte**           | eigene Zeilen, Sichtbarkeit für den Sponsor ausdrücklich opt-in                                                                                                                               |
| **KI-Unterstützung** | Rückwärtsrechnung. Aus Rangziel und Frist ergibt sich der nötige monatliche PT-Zuwachs und daraus die Tagesaktivität. Diese Kette ist mit der Engine aus Phase 2 vollständig rechenbar.       |
| **Später möglich**   | Zielanpassung bei Abweichung, statt Scheitern am starren Plan                                                                                                                                 |

### 8.2 Auszeichnungen und automatische Beförderung

|                      |                                                                                                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Warum wichtig**    | `achievements` und `check_achievements()` existieren ohne Inhalte. Mit der Vergütungsengine wird eine Rangerreichung ein echtes Ereignis statt einer Selbstauskunft. |
| **Vorteil**          | Anerkennung im Moment des Erreichens. Bei 16 Stufen gibt es viele echte Anlässe.                                                                                     |
| **Benötigt**         | 2.2                                                                                                                                                                  |
| **Tabellen**         | vorhanden. Ergänzung `rank_history` für Beförderungsverlauf.                                                                                                         |
| **Rollen**           | alle                                                                                                                                                                 |
| **Rechte**           | eigene, Anzeige im Team nur bei Freigabe                                                                                                                             |
| **KI-Unterstützung** | Gratulationstext plus Hinweis auf den nächsten Schritt                                                                                                               |
| **Später möglich**   | Benachrichtigung an den Sponsor. Eine Beförderung in der Firstline ist ein Führungsanlass.                                                                           |

Wichtig: Auszeichnungen an Aktivität und Meilensteine binden, nicht an Umsatzhöhe. Ein Abzeichen für die erste Duftparty ist unproblematisch, eines für 5.000 Euro Monatsumsatz ist ein Verdienstbeispiel.

### 8.3 Anerkennung im Team

|                      |                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Warum wichtig**    | Ihre Liste nennt Networker des Monats und Hall of Fame. Anerkennung wirkt in Vertriebsorganisationen nachweislich. |
| **Vorteil**          | Sichtbarkeit motiviert und macht Vorbilder erkennbar.                                                              |
| **Benötigt**         | 6.2, 8.2                                                                                                           |
| **Tabellen**         | `recognitions`: org_id, period, kind, user_id, metric, metric_value, visibility, awarded_by                        |
| **Rollen**           | Teamleitung vergibt, alle sehen bei Freigabe                                                                       |
| **Rechte**           | Vergabe nur Teamleitung und höher. **Anzeige nur mit Zustimmung der ausgezeichneten Person.**                      |
| **KI-Unterstützung** | Vorschlag anhand von Aktivitätsdaten, Entscheidung durch Menschen. Keine automatische Vergabe.                     |
| **Später möglich**   | Kategorien jenseits von Leistung. Beste Unterstützung im Team, konstanteste Aktivität.                             |

**Zwingende Auflage, damit diese Funktion gebaut werden darf:** Die Kennzahl ist eine Aktivitätskennzahl, nicht Umsatz, nicht Punkte, nicht Rang. Zulässig sind die in 06_RECRUITING.md dokumentierten Aktivitätsgrössen: Direktnachrichten, Follow-ups, EOM-Einladungen, durchgeführte Duftpartys, abgeschlossene Trainings.

Begründung: Aktivität ist von jedem beeinflussbar, coachbar und rechtlich unbedenklich. Umsatz hängt von Struktur und Vorlauf ab, benachteiligt Neue systematisch und erzeugt genau den Druck, den die Bibliothek untersagt. Zusätzlich vermeidet eine Aktivitätskennzahl den Anschein eines Verdienstbeispiels.

### 8.4 Profilrahmen

|                      |                                                                    |
| -------------------- | ------------------------------------------------------------------ |
| **Warum wichtig**    | Kleine visuelle Anerkennung, ohne Zahlen offenzulegen.             |
| **Vorteil**          | Rang wird sichtbar, ohne dass Umsätze sichtbar werden.             |
| **Benötigt**         | 5.1, 8.2                                                           |
| **Tabellen**         | `profiles` um `frame_key` erweitern                                |
| **Rollen**           | alle                                                               |
| **Rechte**           | Rahmen wird vergeben, nicht gewählt. Ableitung aus `rank_history`. |
| **KI-Unterstützung** | keine                                                              |
| **Später möglich**   | Saisonale Rahmen für Eventteilnahmen wie EuroEvent oder MoonRun    |

### Phase 8 zusammengefasst

|                  |                                                                                                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Komplexität      | mittel                                                                                                                                                                 |
| Priorität        | mittel bis niedrig                                                                                                                                                     |
| Abhängigkeiten   | Phasen 2, 6                                                                                                                                                            |
| Nutzen Berater   | Fortschritt wird sichtbar, auch vor der ersten Provision. Wichtig für jeden, der die erste Provisionsstufe noch nicht erreicht hat und sonst keine Rückmeldung erhält. |
| Nutzen Leader    | Anerkennung als Führungsinstrument, ohne Umsatzvergleiche.                                                                                                             |
| Nutzen Betreiber | Bindung.                                                                                                                                                               |
| Prüffrage        | Klasse A, aber nur bei Bindung an Aktivität. Eine Rangliste nach Umsatz erhöht keine Aktivität, sie demotiviert die Mehrheit.                                          |

---

## Phase 9: KI-Ausbau

Entspricht Ihrer Phase 7. Der Coach existiert, diese Phase erweitert ihn.

Grössenordnung: laufend. Komplexität mittel bis hoch. Priorität laufend. Wirkungsklasse A.

### 9.1 Werkzeugaufrufe für den Coach

|                      |                                                                                                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Warum wichtig**    | Der Coach kann heute nur reden. Mit den Engines aus Phase 2 und 4 kann er rechnen lassen. Die Trennung ist entscheidend: Sprache vom Modell, Zahlen von der Datenbank. |
| **Vorteil**          | Der Coach beantwortet Rang-, Code- und Preisfragen exakt statt plausibel. Das ist der Unterschied zwischen brauchbar und gefährlich.                                   |
| **Benötigt**         | 2.2, 2.5, 4.1                                                                                                                                                          |
| **Tabellen**         | keine neuen                                                                                                                                                            |
| **Rollen**           | alle Berater                                                                                                                                                           |
| **Rechte**           | Werkzeuge laufen unter der RLS des Aufrufers, wie das Retrieval heute                                                                                                  |
| **KI-Unterstützung** | Das ist die Funktion selbst                                                                                                                                            |
| **Später möglich**   | Weitere Werkzeuge: Smartlink erzeugen, Kontakt anlegen, Follow-up planen                                                                                               |

Regel, die nicht verhandelbar ist: Jede Zahl, die eine Entscheidung trägt, kommt aus einer Funktion. Das Modell formuliert, es rechnet nicht.

### 9.2 Weitere Agenten

Die Bibliothek nennt in 19_ZUKUNFT sieben Agentenrollen mit jeweiliger Grundlage im Bestand. AscendOS hat drei.

| Agent                | Grundlage                                                 | Voraussetzung |
| -------------------- | --------------------------------------------------------- | ------------- |
| Produktberater       | Fragefolge aus 03_CHOGAN.md, 158 Notenpyramiden, `tags[]` | 4.1           |
| Bestellhelfer        | Codelogik, Versandtabelle, Smartlink                      | 2.5, 4.2      |
| Kit-Berater          | Fünf Kits mit Preisen, Inhalten, Zielgruppen              | 4.1           |
| Qualifikationsprüfer | Karriereplan und vier Regeln                              | 2.2           |
| Einwandtrainer       | Fünf Kerneinwände, vier Szenarien, Rollenspielaufbau      | 1.1           |
| Aktivitätscoach      | Zielrechner, Kontaktliste, Fälligkeiten                   | 3.1, 3.2      |
| Redaktionsagent      | Stilregeln und Prüfschritte aus 14_PROMPTS.md             | 0.4           |

Neue Agenten sind Datensätze in `agents`, kein Code. Diese Entscheidung wurde in AscendOS früh getroffen und zahlt sich hier aus: sieben Agenten sind sieben Zeilen plus Systemprompt plus Kategoriezuordnung.

Der Leadership Coach und der Content Coach aus der ursprünglichen Produktvision fehlen weiterhin. Leadership braucht Phase 5 und 6, Content braucht keine neuen Voraussetzungen und ist damit der günstigste nächste Agent.

### 9.3 Skript-Rückfall

|                      |                                                                                                                                                                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Warum wichtig**    | 08_TRAININGS.md und 19_ZUKUNFT nennen es Pflicht: Ein Rückfall auf den Skript-Modus bei nicht erreichbarer KI, damit die Anwendung nie defekt wirkt. AscendOS hat das nicht. Der Coach antwortet bei Gemini-Ausfall mit einer Fehlermeldung. |
| **Vorteil**          | Die App wirkt nie kaputt. Bei Modellabschaltungen wie am 9. Juli oder Free-Tier-Grenzen bleibt sie benutzbar.                                                                                                                                |
| **Benötigt**         | 1.1                                                                                                                                                                                                                                          |
| **Tabellen**         | `coach_fallback_scenarios`: agent_key, trigger_pattern, response, follow_up                                                                                                                                                                  |
| **Rollen**           | alle                                                                                                                                                                                                                                         |
| **Rechte**           | SELECT für alle, Pflege durch Betreiber                                                                                                                                                                                                      |
| **KI-Unterstützung** | keine, das ist der Sinn                                                                                                                                                                                                                      |
| **Später möglich**   | Häufigste Fragen aus `knowledge_gaps` als Skriptszenarien hinterlegen                                                                                                                                                                        |

Diese Funktion ist wichtiger, als sie klingt. Free-Tier-Grenzen bei Gemini sind ein realistischer Ausfallgrund, und ein Berater im Kundengespräch, dessen Coach nicht antwortet, nutzt ihn nicht wieder.

### 9.4 Conversation Memory

|                      |                                                                                                                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Warum wichtig**    | In der Produktvision festgelegt: Gute Coach-Antworten sollen nach Prüfung Teil der Wissensbasis werden. Die Anonymisierung ist in AscendOS gebaut, der Vorschlagsweg fehlt.                                      |
| **Vorteil**          | Die Bibliothek wächst aus der Praxis, nicht nur aus Dokumenten. Die Erhebung von Praxiswissen über strukturierte Fragenlisten, laut 17_BEST_PRACTICES.md ein bewährtes Verfahren, bekommt einen laufenden Kanal. |
| **Benötigt**         | 0.4, 1.1                                                                                                                                                                                                         |
| **Tabellen**         | `knowledge_docs` um `source_convo_id` erweitern, plus `best_practice_proposals`                                                                                                                                  |
| **Rollen**           | Berater schlägt vor, Inhaber von `can_manage_knowledge` gibt frei                                                                                                                                                |
| **Rechte**           | Vorschlag für alle, Freigabe nur `is_super_admin()`. Dreistufig, wie festgelegt.                                                                                                                                 |
| **KI-Unterstützung** | Automatische Anonymisierung und Generalisierung, dann Freigabe durch Menschen. Aus einer Situation mit Namen wird ein Einwandmuster.                                                                             |
| **Später möglich**   | Duftparty-Volltext auf diesem Weg erfassen. Der Inhalt liegt laut 08_TRAININGS.md im Werkzeug, aber nicht in der Bibliothek.                                                                                     |

### Phase 9 zusammengefasst

|                  |                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------ |
| Komplexität      | mittel bis hoch                                                                      |
| Priorität        | laufend, parallel zu allem ab Phase 2                                                |
| Abhängigkeiten   | Phasen 1, 2, 4                                                                       |
| Nutzen Berater   | Ein Ansprechpartner für alles, mit exakten Zahlen.                                   |
| Nutzen Leader    | Wöchentliche Teamzusammenfassung mit Handlungsvorschlägen.                           |
| Nutzen Betreiber | Die Wissensbasis wächst aus dem Gebrauch.                                            |
| Prüffrage        | Klasse A. Ersetzt Suchen durch Fragen und senkt die Hürde vor der nächsten Handlung. |

---

## Horizont: Mandantenfähigkeit

Skalierungsstufe 5 aus 19_ZUKUNFT. Kein Datum, aber eine Architekturauflage ab heute.

AscendOS ist von Beginn an mandantenfähig gebaut: `org_id` auf jeder Tabelle, `current_org_id()` in jeder Policy. Diese Vorarbeit ist geleistet und darf nicht verwässert werden. Konkret: Jede neue Tabelle dieser Roadmap trägt `org_id`, auch wenn es heute nur eine Organisation gibt.

Der Karriereplan ist der Prüfstein. Er ist für Chogan spezifisch. Als Daten mit `org_id` ist ein anderes Netzwerk eine Datenzeile, als Code wäre es eine Abspaltung.

Wichtige Einschränkung aus der Bibliothek: Der Verkauf an Berater konkurrierender Netzwerke wurde ausdrücklich abgelehnt. Eine Weitergabe innerhalb von Essence Tribe ist davon nicht betroffen. Mandantenfähigkeit heisst hier andere Teams innerhalb desselben Netzwerks, nicht Wettbewerber.

---

# Teil C: Querschnitt

## C1. Rollen und Rechte

Die Bibliothek schlägt in 19_ZUKUNFT fünf Rollen vor. AscendOS hat drei. Vorschlag zur Zusammenführung:

| Rolle Bibliothek  | Rolle AscendOS | Status                                                               |
| ----------------- | -------------- | -------------------------------------------------------------------- |
| Gast, Interessent | keine          | Nicht als Rolle bauen. Funnel sind öffentliche Werkzeuge ohne Konto. |
| Kunde             | keine          | Offene Entscheidung, siehe C4                                        |
| Berater           | `berater`      | vorhanden                                                            |
| Teamleitung       | `leader`       | vorhanden, in der Anwendung kaum genutzt                             |
| Betreiber         | `super_admin`  | vorhanden                                                            |

Zusätzlich eine Berechtigung unabhängig von der Rolle, weil die Bibliothek genau das als bewährtes Prinzip beschreibt:

| Berechtigung           | Wer              | Warum getrennt                                                                                                         |
| ---------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `can_manage_products`  | einzeln vergeben | Produktpflege verlangt keinen Vollzugriff. Die Bibliothek betont: Wer Produkte pflegt, braucht keinen Datenbankzugang. |
| `can_manage_knowledge` | einzeln vergeben | Wissensfreigabe ist eine redaktionelle Rolle, keine technische                                                         |

Rechtematrix der neuen Bereiche:

| Bereich                     | Berater            | Teamleitung                     | Betreiber                 |
| --------------------------- | ------------------ | ------------------------------- | ------------------------- |
| Eigene Punkte, Rang, Lizenz | lesen, schreiben   | plus Firstline lesen            | alle                      |
| Downline-Struktur           | eigene             | eigene Downline                 | alle                      |
| Aktivierungsansicht         | nein               | eigene Downline                 | alle                      |
| Produktkatalog              | lesen              | lesen                           | pflegen über Berechtigung |
| Wissensbasis                | lesen, freigegeben | lesen, plus Entwürfe            | pflegen und freigeben     |
| Wissenslücken               | nein               | nein                            | lesen                     |
| Events                      | lesen              | pflegen                         | pflegen                   |
| Benachrichtigungen          | eigene             | eigene plus Firstline-Warnungen | alle plus Systemhinweise  |
| Anerkennung                 | eigene sehen       | vergeben                        | alle                      |
| Geheimnisverwaltung         | nein               | nein                            | ausschliesslich           |

Grundregel, die aus der Bibliothek übernommen wird: Sidelines sind unsichtbar. Ein Berater sieht seine Downline über `get_downline()`, niemals parallele Strukturen.

## C2. Neue Datenbanktabellen im Überblick

23 neue Tabellen über alle Phasen. Alle mit `org_id` und RLS.

| Phase | Tabellen                                                                                                            |
| ----- | ------------------------------------------------------------------------------------------------------------------- |
| 0     | `admin_secrets`, `knowledge_review_log`, Erweiterungen an `knowledge_docs` und `knowledge_chunks`                   |
| 2     | `comp_plan_ranks`, `member_points`, `line_volumes`, `qualification_results`, `license_status`                       |
| 3     | `activity_targets`, `follow_up_rules`                                                                               |
| 4     | `catalog_products`, `price_history`, `smartlinks`                                                                   |
| 5     | `structure_snapshots`                                                                                               |
| 7     | `events`, `notification_templates`, `notifications`, `notification_preferences`, `push_subscriptions`, `news_posts` |
| 8     | `goals`, `rank_history`, `recognitions`                                                                             |
| 9     | `coach_fallback_scenarios`, `best_practice_proposals`                                                               |

Regeln, die für jede dieser Tabellen gelten, abgeleitet aus den bestehenden Architekturentscheidungen und der Bibliothek:

1. `org_id` immer, auch bei einer Organisation.
2. RLS aktiviert, Policies explizit. Kein Vorbild an `duftnoten_all`, das die Bibliothek selbst als Sicherheitsproblem benennt.
3. Migrationen werden nie editiert, Korrekturen sind neue Migrationen.
4. Werte mit Änderungsrisiko tragen `valid_from` und `valid_until`. Preise und Planwerte immer.
5. Wissenssätze tragen `knowledge_status`. Ohne Status keine Ausgabe.
6. Rechnen in SQL, nicht in der Anwendung, wenn mehrere Verbraucher dieselbe Regel brauchen.

## C3. Was ich nicht empfehle

Vier Positionen, die naheliegend wirken und die ich nach Lesen der Bibliothek nicht bauen würde.

### Rangliste nach Umsatz oder Punkten

Ihre Liste nennt Networker des Monats und Hall of Fame ohne Kennzahl. Eine Rangliste nach Umsatz, Punkten oder Provision halte ich für einen Fehler, aus drei Gründen:

1. **Compliance.** Eine öffentliche Tabelle mit Umsatz- oder Punktzahlen neben Namen kommt einem Verdienstbeispiel sehr nahe. Die Bibliothek verbietet Verdienstbeispiele in öffentlichen Materialien ohne Ausnahme und nennt die Rechtslage in Deutschland als Grund.
2. **Widerspruch zur eigenen Methodik.** Kein Druck, keine Manipulation ist eine nicht verhandelbare Grenze, formuliert für den Umgang mit Interessenten. Sie sollte innerhalb des Teams nicht unterschritten werden.
3. **Falsche Wirkung.** In jeder Vertriebsstruktur erzeugt ein kleiner Teil den überwiegenden Umsatz. Eine Umsatzrangliste gewinnen deshalb dauerhaft dieselben Personen. Wer noch aufbaut, sieht ausschliesslich, dass er nicht vorkommt, und das trifft genau die Gruppe, deren Aktivierung der eigentliche Hebel ist.

Empfehlung: Anerkennung nach Aktivität, opt-in sichtbar. Details in 8.3.

### Automatisierte Erstansprache

Nicht auf Ihrer Liste, wird aber bei KI-Plattformen regelmässig gewünscht. 16_AUTOMATISIERUNGEN.md hat das mit sechs Begründungen endgültig verworfen: kein zulässiger API-Weg, häufigster Sperrgrund, schnelle Erkennung, rechtliches Vorgehen der Plattformen, Sperre bereits bei fünf bis zehn kalten Nachrichten, Widerspruch zur eigenen Methodik.

Das Instagram-Konto ist laut Bibliothek das wichtigste Vertriebsgut, und ein Verlust ist nicht durch Vorsicht abwendbar, wenn das Verhalten selbst der Verstoss ist. Ich würde diese Entscheidung nicht erneut aufrollen. Freigegeben ist Inbound: Die Person hebt zuerst die Hand.

### Eigenbau der Comment-to-DM-Automatisierung

Ebenfalls entschieden: kaufen statt bauen, mit wirtschaftlicher Begründung. Fertige Dienste liefern dasselbe regelkonform für etwa 14 Euro monatlich, ein Eigenbau bräuchte Business-Konto, App-Prüfung, OAuth und einen laufenden Webhook-Server. Ich sehe keinen Grund, davon abzuweichen.

### Automatische AP-Erfassung per Bilderkennung in v1

Naheliegend, weil die Eingabe monatlich lästig ist. Dagegen: Ein falsch erkannter Punktwert erzeugt einen falschen Rang, und ein falscher Rang zerstört das Vertrauen in die Engine sofort und dauerhaft. Die manuelle Eingabe kostet zwei Minuten pro Monat. Erst wenn die Engine sich bewährt hat, lohnt die Erkennung, dann mit Bestätigungsschritt.

## C4. Offene Entscheidungen

Vier Punkte, die ich nicht entscheiden kann.

### 1. Bekommen Kunden Zugang zu AscendOS?

Die Bibliothek führt Kunde als Rolle mit Rechten für Produktwissen, Kataloge, Bestellhilfe und Codelogik. AscendOS hat heute keinen Kundenzugang, es ist ein Beraterwerkzeug.

Das ist keine technische, sondern eine Produktentscheidung mit grosser Wirkung: Kundenzugang bedeutet öffentliche Registrierung, Datenschutz für Nicht-Partner, eigene Oberfläche, andere Sprachanforderungen. Meine Empfehlung: nicht in dieser Roadmap. Die Kundenwerkzeuge der Generation 1 leisten das bereits und sind erprobt. AscendOS bleibt Beraterwerkzeug, bis die Beraterseite vollständig ist.

### 2. Gehören `products` und `duftnoten` zum Geschäftssystem?

Sie hatten mir gesagt, `kabelkatalog_state` und weitere Tabellen im Supabase-Projekt stammten aus einem anderen Projekt, und ich solle sie ignorieren. Daran habe ich mich gehalten.

Beim Lesen von 13_SUPABASE.md ergibt sich ein Widerspruch: Die Tabelle `duftnoten` mit den Spalten `nr, kopf, herz, basis, bild, halt, sill, updated_at` ist dort als Datenbasis der 3D-Duftpyramide und des Duftparty-Werkzeugs dokumentiert. Das wäre kein Fremdprojekt, sondern Ihr eigener Werkzeugbestand, im selben Projekt wie AscendOS.

Das ist relevant, weil dort möglicherweise 158 gepflegte Notenpyramiden liegen, die Phase 4 als Grundlage nutzen könnte, statt sie neu zu erfassen. Ausserdem betrifft es die offene Policy `duftnoten_all`, die die Bibliothek selbst als Sicherheitsproblem benennt und die im selben Projekt wie AscendOS liegt.

Ich habe die Tabellen nicht angesehen, weil Sie das untersagt hatten. Bitte klären: Fremdprojekt oder eigener Bestand?

### 3. Hosting-Functions (historisch Netlify) oder Supabase Edge Functions?

13_SUPABASE.md und 19_ZUKUNFT führen das als offene Architekturentscheidung. Für AscendOS ist sie faktisch getroffen: Edge Functions sind im Einsatz, mit Nähe zur Datenbank und RLS an einer Stelle. Offen bleibt sie für die Generation-1-Werkzeuge. Meine Empfehlung: Neues in AscendOS, Bestehendes nicht anfassen, solange es läuft.

### 4. Wird die Bibliothek zur Systemquelle oder bleibt sie ein Dokument?

Nach der Ingestion existiert das Wissen zweimal: als Markdown-Datei und als `knowledge_docs`. Ohne Entscheidung laufen beide auseinander, und zwar innerhalb von Wochen.

Zwei Wege. Erstens: Die Dateien bleiben führend, Änderungen laufen über Datei plus Neu-Ingestion. Zweitens: Die Datenbank wird führend, die Dateien sind ein Export. Meine Empfehlung ist der zweite Weg, ab dem Zeitpunkt, an dem die Redaktionsoberfläche steht, weil sonst jede Statusänderung einen Dateidurchlauf braucht.

## C5. Grenzen dieser Roadmap

Zwei Grenzen, die vor dem Start klar sein sollten.

**Software erhöht keine Vertriebsaktivität von sich aus.** Die Bibliothek stellt in ihrem meistbestätigten Satz fest, dass der Engpass in der direkten Ansprache liegt und Werkzeugbau sich produktiv anfühlt, während er Vertriebsaktivität ersetzt. Als Konsequenz nennt 08_TRAININGS.md bei niedriger Motivation ausdrücklich einen Sieben-Tage-Aktionssprint statt eines neuen Werkzeugs. Diese Roadmap kann Reibung entfernen, Fristen überwachen und den nächsten Schritt vorgeben. Ein Gespräch führen kann sie nicht.

**Der Nutzen skaliert mit der Strukturgrösse.** Eine kleine Struktur lässt sich mit einer Gruppe und einer Tabelle führen. Ab dem Punkt, an dem eine Teamleitung nicht mehr überblickt, wer seit wann nichts getan hat und wessen Frist läuft, wird aus Komfort eine Notwendigkeit. Phase 3 und Phase 5 markieren genau diesen Punkt.

Konsequenz für die Reihenfolge: Phase 1 und Phase 3 wirken am unmittelbarsten auf Aktivität, weil beantwortete Fragen und eine konkrete Tagesaufgabe sofort Zeit für Ansprache freisetzen. Alles andere richtet sich danach.

---

# Anhang: Reihenfolge auf einen Blick

| Phase | Inhalt                                 | Komplexität        | Priorität          | Wirkung                 | Grössenordnung |
| ----- | -------------------------------------- | ------------------ | ------------------ | ----------------------- | -------------- |
| 0     | Redaktion und Absicherung Wissensbasis | mittel             | blockierend        | C                       | Tage           |
| 1     | Wissen aktivieren                      | niedrig bis mittel | höchste            | A                       | 1 bis 2 Wochen |
| 2     | Vergütungsplan als Engine              | hoch               | sehr hoch          | A und B                 | 2 bis 3 Wochen |
| 3     | Aktivierung und Tagesführung           | mittel             | sehr hoch          | A                       | 2 Wochen       |
| 4     | Produkt- und Bestellkern               | mittel bis hoch    | hoch               | B                       | 2 bis 4 Wochen |
| 5     | Team, Struktur, Leaderansicht          | niedrig bis mittel | mittel             | B                       | 2 Wochen       |
| 6     | Analyse und Kennzahlen                 | mittel             | mittel             | B                       | 2 Wochen       |
| 7     | Kommunikation, Events, Push            | hoch               | hoch               | A                       | 3 Wochen       |
| 8     | Motivation und Anerkennung             | mittel             | mittel bis niedrig | A bei Aktivitätsbindung | 2 Wochen       |
| 9     | KI-Ausbau                              | mittel bis hoch    | laufend            | A                       | laufend        |

Phase 2 kann parallel zu Phase 1 laufen, weil sie keine Wissensbasis braucht. Phase 9 läuft ab Phase 2 begleitend, weil jeder neue Agent nur ein Datensatz ist.

Vor jeder Phase gilt die Prüffrage. Ändert sich die Lage, ändert sich die Reihenfolge.
