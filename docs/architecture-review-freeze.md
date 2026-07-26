# Architecture Review vor Phase 0

Geprüft: Roadmap, alle 12 Migrationen, 3 Edge Functions, alle Policies und Funktionen der Live-Datenbank, Frontend-Navigation.
Datum: 24. Juli 2026. Keine Codeänderung.

Stilregeln nach 14_PROMPTS.md eingehalten.

---

## Vorbemerkung zum Ziel

Sie schreiben: Nach diesem Review dürfen keine grundlegenden Architekturänderungen mehr notwendig sein.

Das kann ich nicht zusichern, und niemand könnte es. Was ein Freeze leisten kann, ist eine andere Frage: Welche Entscheidungen sind später teuer zu revidieren, und sind die richtig getroffen? Genau darauf ist dieser Review ausgelegt.

Konkret unterscheide ich drei Klassen:

- **Teuer revidierbar.** Datenmodell, Mandantenfähigkeit, Mehrsprachigkeit, Sicherheitsgrundlage. Diese müssen jetzt stimmen. Findet man hier später einen Fehler, kostet er Migrationen über gefüllte Tabellen.
- **Mittel revidierbar.** Navigation, Berechtigungsgranularität, Benachrichtigungslogik. Änderbar, aber mit Nacharbeit.
- **Billig revidierbar.** Oberflächen, Texte, Prompts, Reihenfolge innerhalb einer Phase. Diese werden sich ändern, und das ist in Ordnung.

**Ergebnis vorab: Phase 0 ist noch nicht freigegeben.** Ein Befund ist ein aktiver Datenschutzverstoß, der unabhängig von der Roadmap existiert und vor allem anderen behoben werden muss. Details in F1.

20 Befunde. Drei blockierend, vier hoch, zehn mittel, drei niedrig.

---

# Blockierende Befunde

## F1. Sieben Datenbankfunktionen geben fremde Daten an unauthentifizierte Aufrufer

**Problem**

Neun Funktionen sind `security definer`, umgehen also RLS. Sieben davon nehmen eine fremde Nutzerkennung als Parameter, prüfen den Aufrufer nicht und sind für die Rolle `anon` ausführbar.

| Funktion | Parameter | Aufruferprüfung | Ausführbar von |
|---|---|---|---|
| `plan_signal_follow_up` | p_user, p_date | NEIN | anon, authenticated, PUBLIC |
| `plan_signal_fit_check` | p_user, p_date | NEIN | anon, authenticated, PUBLIC |
| `plan_signal_next_step` | p_user, p_date | NEIN | anon, authenticated, PUBLIC |
| `plan_signal_presentation` | p_user, p_date | NEIN | anon, authenticated, PUBLIC |
| `plan_signal_reactivate` | p_user, p_date | NEIN | anon, authenticated, PUBLIC |
| `plan_contact_state` | p_user | NEIN | anon, authenticated, PUBLIC |
| `get_downline` | root_user_id | NEIN | anon, authenticated, PUBLIC |
| `coach_messages_today` | p_user | NEIN | anon, authenticated, PUBLIC |
| `track_usage` | p_user, p_event, p_meta | NEIN, **schreibend** | PUBLIC |

Der Rückgabetyp von `plan_signal_follow_up` lautet `(contact_id, mission_type, title, reason, score)`, und `title` wird gebildet als `name || ' kontaktieren'`. Die Funktion gibt also **Klarnamen von Kontakten** zurück.

`get_downline` enthält zusätzlich **keinen `org_id`-Filter**. Die Rekursion läuft über die gesamte Tabelle `profiles`, unabhängig von der Organisation.

`track_usage` ist schreibend, für PUBLIC ausführbar und schreibt einen `usage_event` für eine beliebige übergebene Nutzerkennung.

**Auswirkung**

1. **Datenschutzverstoß gegenüber Dritten.** Die Namen in `contacts` gehören Personen, die AscendOS nicht kennen und nie zugestimmt haben. Mit dem anon-Schlüssel, der in jedem Browser-Bundle steht, und einer Nutzerkennung sind ihre Namen und der Zeitabstand zum letzten Kontakt abrufbar. Das ist die sensibelste Datenkategorie im ganzen System.
2. **Bruch der Mandantentrennung.** `get_downline` ohne `org_id`-Filter liefert Genealogiestruktur über Organisationsgrenzen. Heute existiert eine Organisation, weshalb der Schaden begrenzt ist. Ab Skalierungsstufe 5 ist es ein Mandantenleck, und dann liegen die Daten fremder Teams darin.
3. **Fälschbare Kennzahlen.** `track_usage` erlaubt jedem, Aktivitätsereignisse für jeden zu erzeugen. Phase 6 baut Kennzahlen auf `usage_events` auf, Phase 8.3 baut Anerkennung auf Aktivitätsmetriken auf. Eine Auszeichnung auf fälschbarer Grundlage ist schlimmer als keine.
4. **Die Roadmap verstärkt den Fehler.** Phase 3.2 nutzt die Fälligkeitslogik, Phase 3.3, 5.2 und 6.3 nutzen `get_downline`. Jede dieser Phasen erweitert die Angriffsfläche, statt sie zu verkleinern.

Einordnung, damit die Bewertung ehrlich bleibt: Ein Angreifer braucht eine gültige Nutzerkennung als Ausgangspunkt. UUIDs sind nicht erratbar. Der Befund ist damit keine offene Tür, sondern eine Tür ohne Schloss, für die man den Griff kennen muss. Das ändert die Priorität nicht, weil Nutzerkennungen in Einladungslinks, Fehlermeldungen und Netzwerkverkehr auftauchen.

**Empfohlene Lösung**

Drei Schritte, in dieser Reihenfolge, als eine Migration:

1. **Parameter entfernen, wo möglich.** Die `plan_signal_*`-Funktionen und `plan_contact_state` werden ausschließlich von `generate_daily_plan` für den aufrufenden Nutzer verwendet. Sie brauchen keinen Parameter. Ersetzen durch `auth.uid()` im Funktionskörper.
2. **Ausführungsrecht entziehen.** `revoke execute ... from anon, public` für alle neun Funktionen. Wo ein Aufruf durch das Frontend nötig ist, `grant execute ... to authenticated` und Aufruferprüfung im Körper.
3. **Aufruferprüfung, wo ein Parameter bleiben muss.** `get_downline` braucht den Parameter, weil eine Teamleitung die Downline einer anderen Person sehen soll. Also: `org_id`-Filter ergänzen und prüfen, dass der Aufrufer entweder der Wurzelknoten selbst, ein Vorgesetzter in derselben Linie oder `super_admin` ist.

Zusätzlich als Dauerregel: Jede neue `security definer`-Funktion mit einem Nutzerparameter braucht eine Aufruferprüfung. Das gehört als Prüfschritt in den Auslieferungsablauf, weil dieser Fehler nicht auffällt, solange man die Anwendung normal benutzt.

| | |
|---|---|
| Priorität | höchste, blockierend |
| Aufwand | eine Migration, etwa ein Tag inklusive Tests |
| Roadmap anpassen | **Ja.** Neue Phase 0.0 vor allem anderen. |

## F2. Die Rolle `leader` hat keine Wirkung, die Roadmap baut aber auf ihr auf

**Problem**

`leader` existiert an drei Stellen: in zwei CHECK-Bedingungen, in einem TypeScript-Typ und als Anzeigetext in der Oberfläche. Geprüft in der Live-Datenbank:

- 0 Policies erwähnen `leader`
- 0 Funktionen prüfen auf `leader`
- 0 Profile haben die Rolle
- Es gibt `is_super_admin()`, aber kein `is_leader()` und keine Funktion, die Sichtbarkeit entlang der Genealogie prüft

**Auswirkung**

Sechs Positionen der Roadmap setzen Teamleitungsrechte voraus, die es nicht gibt: Phase 3.3 Aktivierungsansicht, Phase 5.1 Profilseiten mit Downline-Sicht, Phase 5.2 Strukturansicht, Phase 6.3 Teamkennzahlen, Phase 7.2 Sponsor erhält Fristwarnung, Phase 8.3 Teamleitung vergibt Anerkennung.

Ohne Grundlage würde jede dieser Positionen ihre eigene Sichtbarkeitslogik erfinden. Das ist der Weg zu inkonsistenten Berechtigungen, und er ist schwer zurückzudrehen, sobald mehrere Module ihre eigene Regel mitbringen.

**Empfohlene Lösung**

Eine einzige Sichtbarkeitsfunktion als Grundlage, vor allen Leader-Features:

```
can_see_user(target uuid) returns boolean
```

Wahr, wenn: `target = auth.uid()`, oder `target` liegt in der Downline des Aufrufers innerhalb derselben Organisation, oder der Aufrufer ist `super_admin`.

Diese Funktion wird die einzige Sichtbarkeitsregel für Personendaten. Jede Policy und jede Ansicht nutzt sie, keine erfindet eine eigene. Dazu `is_leader()` für Funktionen, die eine Rolle statt einer Beziehung prüfen, etwa das Vergeben von Anerkennung.

Wichtig: Sichtbarkeit sollte an der **Beziehung** hängen, nicht an der Rolle. Ein Berater mit Downline ist für seine Downline die Teamleitung, unabhängig davon, ob in `profiles.role` `leader` steht. Die Wissensdatenbank definiert Upline Manager über den erreichten Rang, nicht über eine zugewiesene Rolle. Eine reine Rollenprüfung würde das falsch abbilden.

| | |
|---|---|
| Priorität | hoch, blockiert Phase 3.3 und alles danach |
| Aufwand | eine Migration plus Policy-Durchsicht, etwa zwei Tage |
| Roadmap anpassen | **Ja.** Als 0.5 aufnehmen, vor Phase 3. |

## F3. `admin_secrets` ist schwächer als das eigene dokumentierte Sicherheitsmuster

**Problem**

In Phase 0.1 hatte ich eine Tabelle `admin_secrets` mit einer `is_super_admin()`-Policy vorgesehen. Die Wissensdatenbank dokumentiert in 13_SUPABASE.md Abschnitt 4 ein stärkeres Muster und nennt es ausdrücklich Standardempfehlung: Row Level Security **ohne Policies**, wodurch die Tabelle nur über den `service_role`-Schlüssel im Backend erreichbar ist.

Mein Vorschlag ist schwächer: Eine `is_super_admin()`-Policy bedeutet, dass jede Sitzung eines Super-Admins die Geheimnisse über die öffentliche API lesen kann. Ein gestohlenes Sitzungstoken genügt.

Zweiter, wichtigerer Punkt: Braucht AscendOS diese Geheimnisse überhaupt? `teamseyda2026` ist ein Zugangswort für externe Netlify-Werkzeuge. `waytomoon` ist ein Adminpasswort einer anderen Anwendung. AscendOS benötigt beide nicht, um zu funktionieren.

**Auswirkung**

Eine Tabelle mit Zugangsdaten, die niemand zum Betrieb braucht, ist reine Angriffsfläche. Sie erzeugt zusätzlich den Eindruck, AscendOS sei der richtige Ort für Geheimnisverwaltung, was zu weiteren Einträgen führt.

**Empfohlene Lösung**

Tabelle streichen. Die Geheimnisse werden bei der Redaktion aus der Wissensbasis entfernt und nicht anderswo in AscendOS gespeichert. Wo sie hingehören, entscheidet der Betreiber außerhalb dieses Systems, etwa in einem Passwortmanager.

Falls später doch ein Geheimnis in AscendOS gebraucht wird, etwa ein Schlüssel für eine Fremdschnittstelle: RLS ohne Policies plus Zugriff ausschließlich über eine Edge Function, wie die Wissensdatenbank es beschreibt. Nie über die Client-API.

| | |
|---|---|
| Priorität | hoch |
| Aufwand | gering, es entfällt Arbeit |
| Roadmap anpassen | **Ja.** Phase 0.1 ändern, Tabelle aus der Übersicht in C2 entfernen. |

---

# Hohe Befunde

## F4. Abgeleitete Daten als Tabellen, ohne festgelegten Aktualisierungsweg

**Problem**

`qualification_results` und `license_status` haben ein Feld `computed_at`, aber ich habe nie festgelegt, wer sie neu berechnet und wann. Beide sind vollständig aus `member_points`, `line_volumes` und `comp_plan_ranks` ableitbar.

**Auswirkung**

Ein Berater trägt seine Monatspunkte ein, der Rang bleibt auf dem alten Wert. Für eine Engine, deren einziger Zweck Vertrauenswürdigkeit ist, ist das der schlimmste Fehlermodus. Die Wissensdatenbank warnt an vergleichbarer Stelle: veraltete Werte sind gefährlicher als fehlende.

**Empfohlene Lösung**

Die Funktion ist die Wahrheit, die Tabelle höchstens ein Zwischenspeicher.

1. `compute_qualification(p_user uuid, p_month date)` als Funktion, die immer frisch rechnet. Alle Anzeigen und der Coach rufen sie auf.
2. `qualification_results` nur als Zwischenspeicher für Auswertungen über viele Nutzer, mit Invalidierung per Trigger auf `member_points` und `line_volumes`.
3. Wenn der Zwischenspeicher in v1 nicht gebraucht wird, entfällt die Tabelle vorerst. Das ist die einfachere und ehrlichere Variante.

Dasselbe für `license_status`: Der Stand der Sechs-Monats-Frist ist eine Berechnung über `member_points`, kein zu pflegender Zustand.

| | |
|---|---|
| Priorität | hoch |
| Aufwand | mittel, betrifft die Kernlogik von Phase 2 |
| Roadmap anpassen | **Ja.** Phase 2.2 und 2.4 präzisieren, zwei Tabellen aus C2 möglicherweise entfernen. |

## F5. Zwei Quellen für dieselbe Größe, ohne Konsistenzregel

**Problem**

`member_points.pt` speichert das Teamvolumen einer Person. `line_volumes` speichert das Volumen je Erstlinie. Beide werden manuell erfasst. `sum(line_volumes.pt)` und `member_points.pt` können sich widersprechen, und es gibt keine Regel, welche Zahl gilt.

**Auswirkung**

Die Rangberechnung braucht beides: die Summe für die PT-Schwelle und die Einzelwerte für die Deckelung pro Linie. Bei Widerspruch rechnet die Engine falsch, und zwar unauffällig. Die Wissensdatenbank nennt die Deckelung pro Linie die häufigste Fehlerquelle in Rechnern.

**Empfohlene Lösung**

`line_volumes` ist die einzige Quelle. `member_points.pt` entfällt als eingegebener Wert. Die Gesamtsumme ergibt sich aus der Summe der Linien und wird nicht separat erfasst.

Damit bleibt in `member_points` nur, was wirklich eigen ist: `ap`, `cp`, `icp`. Das ist auch fachlich korrekt, weil AP laut Wissensdatenbank Eigenpunkte sind und PT Teamvolumen. Zwei verschiedene Dinge in einer Tabelle waren die Ursache der Unklarheit.

Zusatzregel: Wer keine Linien erfasst, hat 0 PT und damit Rang Member. Das ist korrekt und braucht keine Sonderbehandlung.

| | |
|---|---|
| Priorität | hoch |
| Aufwand | gering, wenn jetzt entschieden |
| Roadmap anpassen | **Ja.** Phase 2.3 überarbeiten. |

## F6. Mehrsprachigkeit fehlt im Datenmodell vollständig

**Problem**

Die Wissensdatenbank dokumentiert bis zu zwölf Sprachen in bestehenden Werkzeugen, sieben davon mit ausdrücklich unterschiedlicher Tonalität, und stellt Regeln auf: kulturelle Tonalität statt generischer Übersetzung, Produktnamen und Codes und Preise werden nicht übersetzt, Griechisch und Bosnisch und Polnisch brauchen muttersprachliche Prüfung.

Meine Roadmap enthält kein einziges Sprachfeld. Betroffen sind mindestens sechs neue Tabellen mit übersetzbarem Text:

| Tabelle | Übersetzbare Felder | Nicht übersetzbar |
|---|---|---|
| `catalog_products` | description, application, benefits | code, name, price_eur, size |
| `events` | title, description | starts_at, url |
| `news_posts` | title, body | publish_at |
| `notification_templates` | Nachrichtentext | kind |
| `achievements` | Titel, Beschreibung | key |
| `comp_plan_ranks` | eventuell Rangbezeichnung | rank_key, alle Zahlen |
| `coach_fallback_scenarios` | response, follow_up | agent_key |

**Auswirkung**

AscendOS ist heute einsprachig deutsch. Das ist für den Start richtig. Aber: Die bestehenden Werkzeuge sind bereits mehrsprachig, die Struktur reicht laut Wissensdatenbank über mehr als 46 Länder, und die Onboarding-Strecke unterstützt zwölf Sprachen. Der Bedarf ist belegt, nicht spekulativ.

Mehrsprachigkeit nachträglich in sechs gefüllte Tabellen einzuziehen ist teuer: Migration, Datenumzug, Anpassung jeder Abfrage. Genau die Art Entscheidung, die ein Freeze fangen soll.

Zweiter Aspekt, der leicht übersehen wird: Die Wissensbasis selbst. `knowledge_docs` hat ein Feld `language`. Wenn ein Dokument auf Deutsch und Türkisch existiert, sind das zwei Dokumente mit zwei Einbettungen, und das Retrieval muss auf die Sprache des Nutzers filtern. Sonst antwortet der Coach auf eine türkische Frage mit einem deutschen Ausschnitt. `match_knowledge` hat heute keinen Sprachparameter.

**Empfohlene Lösung**

Muster jetzt festlegen, Umsetzung später. Zwei tragfähige Wege:

**Weg A, jsonb pro Feld.** `description jsonb` mit `{"de": "...", "tr": "..."}`. Einfach, keine Verbunde, gut für wenige Felder. Nachteil: keine referenzielle Integrität, Übersetzungsstand schwer auswertbar.

**Weg B, eigene Übersetzungstabelle.** `catalog_product_i18n (product_id, lang, field, value)`. Sauber, auswertbar, ein Verbund mehr. Ermöglicht eine Übersetzungsverwaltung, die 19_ZUKUNFT als fehlende Adminfunktion nennt.

Empfehlung: **Weg B**, aus zwei Gründen. Erstens fordert die Wissensdatenbank eine Übersetzungsverwaltung mit Prüfschritt, und die braucht auswertbaren Übersetzungsstand. Zweitens ist die muttersprachliche Prüfung für drei Sprachen eine dokumentierte Auflage, die einen Status pro Übersetzung verlangt.

Mindestens jetzt festzulegen, auch wenn v1 einsprachig bleibt:

1. Jede Tabelle mit Text wird als übersetzbar oder nicht übersetzbar markiert.
2. Nicht übersetzbare Felder werden explizit benannt, nach der Regel der Wissensdatenbank: Codes, Namen, Preise.
3. `match_knowledge` erhält einen Sprachparameter, auch wenn er zunächst immer `de` ist. Nachträglich einen Parameter in eine Funktionssignatur einzufügen, die von Edge Functions aufgerufen wird, ist unnötige Nacharbeit.

| | |
|---|---|
| Priorität | hoch |
| Aufwand | Entscheidung jetzt nahezu kostenlos, Nachrüstung später hoch |
| Roadmap anpassen | **Ja.** Eigener Querschnittsabschnitt in Teil C, plus Sprachparameter in Phase 0.2. |

## F7. Navigation nicht geplant, entgegen der ausdrücklichen Lehre der Wissensdatenbank

**Problem**

AscendOS hat vier Navigationseinträge: Heute, Kontakte, Ascent, Mehr. Die Roadmap fügt etwa elf neue Oberflächen hinzu: Wissensdatenbank, Rang und Qualifikation, Lizenzstatus, Aktivitätsziele, Aktivierungsansicht, Produktkatalog, Profilseiten, Strukturansicht, Dashboard, Trichteranalyse, Teamkennzahlen, Events, News, Ziele, Anerkennung.

Die Wissensdatenbank warnt an drei Stellen ausdrücklich davor. 08_TRAININGS.md Abschnitt 8: Ein Werkzeug mit sehr vielen Inhalten wirkt überwältigend, das Ultimate Tool wurde deshalb bereinigt und Bereiche wurden entfernt. 17_BEST_PRACTICES.md: Bei umfangreichen Werkzeugen entscheidet die Navigation über den Nutzen, nicht der Inhaltsumfang. 19_ZUKUNFT_KI_PLATTFORM.md nennt als Lehre: Phasenlogik statt Werkzeugliste.

Meine Roadmap hat 35 Funktionen geplant und kein Wort über Informationsarchitektur verloren. Das ist der eine Punkt, an dem ich die Wissensdatenbank gelesen und ihre wichtigste UX-Lehre trotzdem ignoriert habe.

**Auswirkung**

Ohne Plan entsteht das, was in der Wissensdatenbank als größte Schwäche des bestehenden Portfolios beschrieben ist: Einzeln gut, zusammen überwältigend. Die Folge war dort das Entfernen von Bereichen, also verworfene Arbeit.

**Empfohlene Lösung**

Informationsarchitektur als eigene Position, vor Phase 5, und als Auflage für jede Phase ab 2.

Grundsätze, abgeleitet aus der Wissensdatenbank:

1. **Die vier Tabs bleiben.** Höchstens fünf. Sie entsprechen den Tageszuständen eines Beraters, nicht den Funktionsgruppen der Software.
2. **Neue Funktionen erscheinen im Kontext, nicht als eigener Menüpunkt.** Der Rang gehört ins Profil, nicht in einen Reiter Karriere. Die Fälligkeit gehört in Heute. Der Produktcode gehört in den Kontakt und in den Coach.
3. **Leader-Funktionen bekommen einen eigenen Bereich**, sichtbar nur mit Downline. Das ist die einzige Stelle, an der ein fünfter Einstieg zu rechtfertigen ist.
4. **Alles Administrative bleibt unter Mehr.** Wissenspflege, Produktpflege, Events.
5. **Jede neue Oberfläche verdrängt eine bestehende oder wird kontextuell eingehängt.** Nichts wird nur hinzugefügt.

| | |
|---|---|
| Priorität | hoch |
| Aufwand | Konzept etwa zwei Tage, spart später Umbauten |
| Roadmap anpassen | **Ja.** Neue Position vor Phase 5, plus Auflage in Teil C. |

---

# Mittlere Befunde

## F8. Doppelte Funktion: `activity_targets` und `goals`

**Problem** Phase 3.1 führt `activity_targets` mit Monatsziel und abgeleiteten Tageszahlen. Phase 8.1 führt `goals` mit Zieltyp, Zielwert und Frist. Beide speichern Ziele einer Person.

**Auswirkung** Zwei Orte für dieselbe Frage. Ein Nutzer, der sein Monatsziel ändert, erwartet nicht, es an zwei Stellen zu tun.

**Lösung** `goals` als allgemeine Tabelle mit `kind`. Das Monatsziel ist ein Zieltyp darin, die abgeleiteten Tageszahlen sind eine Berechnung, keine Speicherung. `activity_targets` entfällt.

| Priorität | mittel | Aufwand | gering | Roadmap anpassen | **Ja**, Phase 3.1 und 8.1 zusammenführen |
|---|---|---|---|---|---|

## F9. Redundante Tabelle: `rank_history`

**Problem** Phase 8.2 führt `rank_history`. Phase 2.2 berechnet den Rang je Monat. Der Verlauf ist die Folge der Monatsergebnisse.

**Lösung** Streichen. Der Verlauf ist eine Abfrage, keine Tabelle. Ein Beförderungsereignis, das eine Benachrichtigung auslöst, gehört in `notifications`, nicht in eine eigene Verlaufstabelle.

| Priorität | mittel | Aufwand | gering | Roadmap anpassen | **Ja**, Tabelle aus C2 entfernen |
|---|---|---|---|---|---|

## F10. Fragwürdige Tabelle: `structure_snapshots`

**Problem** Phase 5.2 führt `structure_snapshots` für Strukturwachstum über Zeit. Wachstum ist aus `profiles.created_at` und `sponsor_id` ableitbar.

**Lösung** Nur nötig, wenn die Struktur rückdatiert korrigiert werden kann, also wenn ein Sponsor nachträglich geändert wird. Das ist über `protect_profile_columns()` heute nur Super-Admins erlaubt. Wenn solche Korrekturen selten sind, entfällt die Tabelle. Zu klären, dann entscheiden.

| Priorität | mittel | Aufwand | gering | Roadmap anpassen | **Ja**, als offene Entscheidung aufnehmen |
|---|---|---|---|---|---|

## F11. Neue Berechtigungen fallen aus dem Schutz vor Selbstbeförderung

**Problem** `protect_profile_columns()` schützt eine feste Liste: `role`, `org_id`, `team_id`, `sponsor_id`. Ich habe in Teil C1 zwei neue Berechtigungen eingeführt, `can_manage_products` und `can_manage_knowledge`, ohne festzulegen, wo sie leben. Als Spalten auf `profiles` wären sie **nicht** geschützt. Ein Berater könnte sie sich selbst erteilen, weil die Update-Policy auf `profiles` das eigene Profil erlaubt.

**Auswirkung** Rechteausweitung durch einen einzigen API-Aufruf. `can_manage_knowledge` bedeutet Freigaberecht für Wissensinhalte, die der Coach als oberste Wahrheit behandelt.

**Lösung** Berechtigungen nicht als Spalten auf `profiles`, sondern eigene Tabelle `user_permissions (user_id, permission, granted_by, granted_at)` mit eigener Policy: Lesen für den Betroffenen und Vorgesetzte, Schreiben ausschließlich `is_super_admin()`. Das trennt Identität von Rechten und ist der Grund, warum es kein Trigger-Problem mehr gibt.

Falls Spalten auf `profiles` bevorzugt werden: `protect_profile_columns()` muss zwingend erweitert werden, und zwar in derselben Migration, in der die Spalte entsteht.

| Priorität | mittel bis hoch, Sicherheit | Aufwand | gering | Roadmap anpassen | **Ja**, Teil C1 präzisieren |
|---|---|---|---|---|---|

## F12. Performanceproblem bei der Leaderansicht

**Problem** `get_downline` ist rekursiv. Die Qualifikation wird je Nutzer und Monat berechnet. Eine Leaderansicht über eine wachsende Downline ruft beides pro Person auf.

**Auswirkung** Bei 200 Personen entstehen 200 Qualifikationsberechnungen, jede mit einer Aggregation über `line_volumes`. Auf einer Mobilverbindung ist das eine mehrsekündige Ansicht. Die Wissensdatenbank stellt Mobile an erste Stelle.

**Lösung** Mengenbasiert rechnen. `compute_qualification_bulk(p_users uuid[], p_month date)` in einem Aufruf, mit einer Aggregation über alle Nutzer statt einer pro Nutzer. Zusätzlich Index auf `line_volumes (user_id, period_month)` und `member_points (user_id, period_month)`.

Positiv anzumerken: `profiles_sponsor_id_idx` existiert bereits, die Rekursion selbst ist also nicht das Problem.

| Priorität | mittel | Aufwand | mittel | Roadmap anpassen | **Ja**, in Phase 2.2 und 6.3 vermerken |
|---|---|---|---|---|---|

## F13. `notifications` wächst unbegrenzt

**Problem** Sieben Auslöserarten, tägliche Prüfung, keine Aufbewahrungsregel.

**Auswirkung** Bei täglichen Fälligkeitserinnerungen entstehen pro Nutzer und Jahr hunderte Zeilen. Die Tabelle wird zur größten im System, ohne fachlichen Wert nach dem Lesen.

**Lösung** Aufbewahrung 90 Tage für gelesene, 1 Jahr für ungelesene, danach Löschung. Als geplante Funktion. Dauerhaft aufzubewahrende Ereignisse, etwa eine Rangerreichung, gehören nicht in `notifications`, sondern sind aus den Fachdaten ableitbar.

| Priorität | mittel | Aufwand | gering | Roadmap anpassen | **Ja**, Phase 7.2 ergänzen |
|---|---|---|---|---|---|

## F14. Architekturwiderspruch zwischen Wissensdatenbank und AscendOS

**Problem** 13_SUPABASE.md Abschnitt 4 nennt als bewährtes Muster: Das Frontend spricht nie direkt mit der Datenbank, sämtlicher Zugriff läuft über das Backend. AscendOS macht das Gegenteil: Der Client spricht mit dem anon-Schlüssel direkt mit Postgres, die Absicherung liegt in RLS.

Beide Wege sind legitim. Aber der Widerspruch ist nicht entschieden, und die Wissensdatenbank ist ab sofort offizielle Grundlage. Ohne Entscheidung wird bei jedem neuen Modul neu diskutiert.

**Auswirkung** Inkonsistenz. Ein Entwickler, der die Wissensdatenbank als Autorität liest, baut eine Edge Function für etwas, das RLS erledigt. Oder umgekehrt.

**Lösung** Entscheidung dokumentieren, mit Begründung. Meine Empfehlung: **Der AscendOS-Weg gewinnt.** RLS-first skaliert besser für native Apps und künftige Schnittstellen, weil die Regel an den Daten hängt und nicht an einem Zugriffspfad. Jeder neue Client erbt die Absicherung automatisch.

Aber mit einer Auflage, die F1 belegt: RLS-first funktioniert nur bei Disziplin gegenüber `security definer`. Jede definer-Funktion ist ein Loch in der RLS. Die Regel lautet deshalb: definer nur, wenn zwingend nötig, immer mit Aufruferprüfung, niemals für `anon`.

Für die bestehenden Werkzeuge gilt die Empfehlung der Wissensdatenbank unverändert weiter. Sie haben keine Konten und keine RLS, dort ist der Backend-Weg richtig.

| Priorität | mittel | Aufwand | Dokumentation | Roadmap anpassen | **Ja**, als Architekturentscheidung in Teil C |
|---|---|---|---|---|---|

## F15. Phase 0.3 macht die bereits gebaute Upload-Oberfläche unpassend

**Problem** Phase 0.3 zerlegt die 20 Dateien in etwa 45 bis 60 Dokumente nach Status. Die in der letzten Sitzung gebaute Upload-Seite arbeitet nach dem Muster eine Datei ergibt ein Dokument mit einer Kategorie und einer Zielgruppe.

**Auswirkung** Entweder werden die 60 Dokumente von Hand einzeln hochgeladen, jeweils mit Kategorie- und Statuswahl, oder die Oberfläche wird angepasst. Beides ist Arbeit, die in der Roadmap nicht steht.

**Lösung** Die Redaktion in Phase 0.3 erzeugt fertige Einzeldateien mit einem Kopfblock für Kategorie, Status und Zielgruppe. Die Upload-Seite liest diesen Kopfblock, statt die Auswahl vom Nutzer zu verlangen. Das ist eine kleine Erweiterung und macht den Upload zugleich wiederholbar, was für Nachpflege wichtig ist.

| Priorität | mittel | Aufwand | gering bis mittel | Roadmap anpassen | **Ja**, Phase 0.3 um den Kopfblock ergänzen |
|---|---|---|---|---|---|

## F16. Fehlende Beziehung: Smartlink zur Pipeline

**Problem** `smartlinks` hat `opened_at` und `converted_at`, aber keine Verbindung zu `contacts` oder `pipeline_events`.

**Auswirkung** Ein Smartlink, der zum Kauf führt, ist das aussagekräftigste Ereignis im ganzen Trichter, und es würde nirgends ankommen. Phase 6.2 könnte den wichtigsten Übergang nicht messen.

**Lösung** `smartlinks.contact_id` als optionale Fremdbeziehung. Bei `converted_at` ein `pipeline_event` mit `source = 'smartlink'`. Das nutzt die vorhandene Korrekturlogik in `effective_pipeline_events` mit.

| Priorität | mittel | Aufwand | gering | Roadmap anpassen | **Ja**, Phase 4.2 ergänzen |
|---|---|---|---|---|---|

## F17. `recognitions.metric` als Freitext ist nicht auditierbar

**Problem** In Phase 8.3 hatte ich als Auflage festgelegt, dass nur Aktivitätsmetriken erlaubt sind, nicht Umsatz. Umgesetzt ist die Auflage nicht: `metric` ist ein Textfeld.

**Auswirkung** Die Auflage ist ein Kommentar, keine Regel. Jemand trägt `monatsumsatz` ein und die Compliance-Auflage ist umgangen, ohne dass es auffällt.

**Lösung** Erlaubte Metriken als Tabelle `recognition_metrics` mit Fremdbeziehung, gefüllt ausschließlich mit den in 06_RECRUITING.md dokumentierten Aktivitätsgrößen. Ergänzend eine CHECK-Bedingung. Damit ist die Auflage in der Datenbank verankert und nicht im Dokument.

| Priorität | mittel | Aufwand | gering | Roadmap anpassen | **Ja**, Phase 8.3 präzisieren |
|---|---|---|---|---|---|

---

# Niedrige Befunde

## F18. Emojis in der Navigation widersprechen der eigenen Stilregel

**Problem** `AppShell.tsx` nutzt Emojis als Navigationssymbole. 14_PROMPTS.md und 01_TEAM_SEYDA.md verlangen: keine Emojis, ausschließlich SVG-Symbole.

**Auswirkung** Gering funktional, aber die Wissensdatenbank nennt Einheitlichkeit den größten Hebel für wahrgenommene Professionalität und uneinheitliche Symbolik ausdrücklich als Schwäche des bestehenden Portfolios. Für eine Premium-Plattform ist es ein sichtbarer Widerspruch zur eigenen Regel.

**Lösung** Vier SVG-Symbole ersetzen die Emojis. Nebeneffekt: konsistente Darstellung über Geräte, was Emojis nicht leisten.

| Priorität | niedrig | Aufwand | gering | Roadmap anpassen | Nein, als Aufgabe in Phase 7 der Informationsarchitektur |
|---|---|---|---|---|---|

## F19. `comp_plan_ranks.org_id` nullable ohne Auflösungsregel

**Problem** Ich hatte `org_id nullable` für globale Standardwerte vorgesehen, plus organisationsspezifische Zeilen. Welche Zeile gewinnt, wenn beide existieren, ist nicht festgelegt.

**Lösung** Explizite Regel: Existiert eine Zeile mit passender `org_id` und `rank_key`, gewinnt sie. Sonst greift die Zeile mit `org_id is null`. Als Sicht `effective_comp_plan` implementieren, damit keine Abfrage die Regel selbst nachbaut. Das entspricht dem Muster von `effective_pipeline_events`, das im Projekt bereits existiert und sich bewährt hat.

| Priorität | niedrig, aber jetzt festzulegen | Aufwand | gering | Roadmap anpassen | **Ja**, Phase 2.1 ergänzen |
|---|---|---|---|---|---|

## F20. Ambassador-Programm fehlt ohne dokumentierte Begründung

**Problem** Die Wissensdatenbank führt das Ambassador-Programm mit Grundprinzip und dem Weg über die Seller Kits Gold und Platinum, markiert die Stufenleiter aber als LÜCKE. Meine Roadmap erwähnt es nicht.

**Auswirkung** Keine, solange die Auslassung bewusst ist. Ohne Vermerk wirkt sie wie ein Versehen und wird später als Lücke gemeldet.

**Lösung** Als bewusste Auslassung dokumentieren, mit Bedingung für die Aufnahme: Sobald die Stufenleiter vorliegt, ist es eine Erweiterung von `comp_plan_ranks` um eine zweite Leiter, keine neue Struktur.

| Priorität | niedrig | Aufwand | Dokumentation | Roadmap anpassen | **Ja**, in die offenen Punkte |
|---|---|---|---|---|---|

---

# Was die Prüfung nicht beanstandet

Damit der Review nicht nur Mängel listet, hier die Punkte, die ich geprüft und für tragfähig befunden habe.

| Geprüft | Befund |
|---|---|
| Mandantenfähigkeit im Datenmodell | `org_id` auf allen 22 bestehenden Tabellen, `current_org_id()` in jeder Policy. Solide Grundlage. Einzige Ausnahme ist F1. |
| RLS-Abdeckung | Alle 22 AscendOS-Tabellen haben RLS aktiv, alle bis auf `invite_validation_attempts` haben Policies, und dort ist die Policy-Freiheit dokumentierte Absicht. |
| `match_knowledge` Sicherheitsmodell | `stable`, `security invoker`. RLS greift durch, Entwürfe bleiben für Berater unsichtbar. Korrekt. |
| Migrationsdisziplin | Angewendete Migrationen werden nicht editiert, Korrekturen sind neue Migrationen. Konsequent über 12 Migrationen durchgehalten. |
| Provider-Abstraktion | `_shared/gemini.ts` als einzige Stelle mit Schlüssel und Endpunkt. Der Wechsel von Anthropic über OpenAI zu Gemini hat das bestätigt. |
| Agenten als Daten | Sieben neue Agenten sind sieben Zeilen, kein Code. Trägt in Phase 9. |
| Korrekturfähige Ereignisse | `effective_pipeline_events` rechnet Korrekturen heraus. Richtige Grundlage für Phase 6.2. |
| Deterministische Kernlogik | Rangberechnung und Codelogik bewusst ohne Sprachmodell. Genau richtig. |
| Generierte Setup-Artefakte | `npm run generate:check` verhindert Drift zwischen Quellen und Dashboard-Dateien. |
| Freigabepflicht für Wissen | Entwurf bis Freigabe, erzwungen über RLS statt über die Oberfläche. |

---

# Freigabeurteil

**Phase 0 ist nicht freigegeben.**

Grund ist ausschließlich F1. Sieben Datenbankfunktionen geben personenbezogene Daten Dritter an unauthentifizierte Aufrufer und eine erlaubt das Fälschen von Aktivitätsdaten. Das ist unabhängig von der Roadmap und wird durch jede weitere Phase schlimmer, weil mehr Module darauf aufbauen.

## Freigabebedingungen

**Vor Phase 0, zwingend:**

| Befund | Inhalt | Aufwand |
|---|---|---|
| F1 | Aufruferprüfung, Ausführungsrechte, `org_id`-Filter | etwa 1 Tag |
| F3 | `admin_secrets` streichen | Streichung |

**Vor Phase 2, zwingend, weil sonst das Datenmodell falsch entsteht:**

| Befund | Inhalt | Aufwand |
|---|---|---|
| F4 | Abgeleitete Daten als Funktion, nicht als Tabelle | etwa 1 Tag Entscheidung |
| F5 | `line_volumes` als einzige PT-Quelle | Entscheidung |
| F6 | Übersetzungsmuster festlegen, Sprachparameter in `match_knowledge` | etwa 1 Tag |
| F11 | Berechtigungen in eigene Tabelle | etwa 1 Tag |
| F19 | Auflösungsregel für den Karriereplan | Entscheidung |

**Vor Phase 3, zwingend:**

| Befund | Inhalt | Aufwand |
|---|---|---|
| F2 | `can_see_user()` als einzige Sichtbarkeitsregel | etwa 2 Tage |

**Vor Phase 5:**

| Befund | Inhalt |
|---|---|
| F7 | Informationsarchitektur als Konzept |
| F12 | Mengenbasierte Berechnung |

**Laufend, ohne Blockade:** F8, F9, F10, F13, F14, F15, F16, F17, F18, F20.

## Gesamteinschätzung

Die Architektur trägt. Von 20 Befunden betrifft genau einer die Grundlage, und der ist ein Umsetzungsfehler in bestehenden Funktionen, kein Denkfehler im Entwurf. Die Mandantenfähigkeit ist von Beginn an angelegt, die Provider-Abstraktion hat drei Anbieterwechsel überlebt, die Migrationsdisziplin ist über zwölf Migrationen konsequent.

Die teuerste Auslassung ist F6, Mehrsprachigkeit. Sie kostet heute eine Entscheidung und später eine Migration über gefüllte Tabellen. Der peinlichste Befund ist F7, weil die Wissensdatenbank ihre wichtigste UX-Lehre dreimal ausspricht und ich sie beim Schreiben der Roadmap trotzdem übergangen habe.

Zur Erwartung aus Ihrer Aufgabenstellung, abschließend und ehrlich: Nach diesem Review werden weiterhin Änderungen nötig sein. Oberflächen, Prompts, Reihenfolgen innerhalb der Phasen, Benachrichtigungstexte, Schwellwerte. Das ist normal und kein Mangel des Freeze. Was nach Behebung der Freigabebedingungen nicht mehr nötig sein sollte, sind Änderungen am Datenmodell, an der Mandantenfähigkeit, am Sicherheitsmodell und am Übersetzungsmuster. Das sind die vier, die wirklich teuer sind, und für die ist dieser Freeze gemacht.
