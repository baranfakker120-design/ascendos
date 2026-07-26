# F3: Internationalisierungs- und Lokalisierungsarchitektur

Verbindliche Grundlage für die Implementierung.
Datum: 25. Juli 2026. Keine Implementierung, keine Migration, kein SQL.

F2 gilt unverändert als Grundlage. F1 bleibt eingefroren.

---

# Teil 0: Belegte Sprachfakten

Diese Architektur beruht nicht auf allgemeinen Annahmen zur Mehrsprachigkeit, sondern auf dem, was in der Wissensdatenbank belegt ist.

## 0.1 Sprachen mit dokumentierter Tonalität

Aus `07_ONBOARDING.md`, Status BELEGT. Sieben Tonalitätsgruppen, neun Sprachen:

| Sprache | Dokumentierte Tonalität |
|---|---|
| Deutsch | sachlich und strukturiert |
| Polnisch | direkt und respektvoll |
| Türkisch | warm und familiär |
| Bosnisch, Serbisch, Kroatisch | herzlich, loyal, gemeinschaftsorientiert. Grundhaltung: wir ziehen das zusammen durch |
| Spanisch | enthusiastisch |
| Englisch | professionell |
| Griechisch | warm |

Dazu aus `03_CHOGAN.md` die Sprachen der Quellkataloge: vorhanden DE, EN, PT, ES, RO, teils IT und FR. Nicht vorhanden und daher zu erzeugen: TR, EL, BS, PL.

Und aus `15_WORKFLOWS.md`: **Arabisch benötigt Rechts-nach-links-Darstellung.**

Damit umfasst der belegte Sprachraum bis zu **vierzehn** Sprachen: DE, EN, TR, PL, BS, SR, HR, ES, EL, PT, RO, IT, FR, AR.

## 0.2 Vier verbindliche Regeln aus dem Bestand

| Regel | Quelle |
|---|---|
| **Produktnamen, Codes und Preise werden nicht übersetzt** | 15_WORKFLOWS.md, 17_BEST_PRACTICES.md |
| **Kulturelle Tonalität pro Sprache, nicht generisch übersetzen** | 15_WORKFLOWS.md, 17_BEST_PRACTICES.md |
| **Griechisch, Bosnisch und Polnisch vor dem Livegang muttersprachlich prüfen** | 15_WORKFLOWS.md, 17_BEST_PRACTICES.md |
| **Anzeigetexte mit echten Umlauten, interne Bezeichner ASCII** | 03_CHOGAN.md, Beispiel Parfüm gegen parfum |

Die dritte Regel ist architektonisch folgenreich: Sie verlangt einen **Prüfstatus je Übersetzung je Sprache**. Ein Modell, das Übersetzungen nur als Wert speichert, kann diese Regel nicht abbilden.

## 0.3 Zwei belegte Fehlerquellen

| Fehlerquelle | Quelle |
|---|---|
| Apostrophe in türkischen Suffixen brechen Zeichenketten, Beispiele `Euro'dan`, `80'inde` | 15_WORKFLOWS.md |
| Doppelte Quelldateien mit Leerzeichen im Namen | 03_CHOGAN.md |

## 0.4 Der wichtigste Satz für diese Architektur

Aus `03_CHOGAN.md`, über die fehlenden Katalogsprachen:

> Das ist ein echter Aufwandsposten bei jedem mehrsprachigen Werkzeug, kein Nebenpunkt.

Und aus `07_ONBOARDING.md`:

> Die deutschen Lerninhalte, Module 1 bis 8, sind nur auf Deutsch verfügbar. In anderen Sprachen entfällt dieser Abschnitt.

Daraus folgt die zentrale Erkenntnis dieses Meilensteins: **Das Problem ist nicht die Übersetzung, sondern die Lücke.** Inhalte existieren nicht in allen Sprachen, und das ist der Normalzustand, nicht die Ausnahme. Eine Architektur, die vollständige Übersetzungen voraussetzt, scheitert am ersten Tag.

Jede Entscheidung in diesem Dokument beantwortet deshalb zuerst: Was passiert, wenn der Inhalt in der gewünschten Sprache **nicht** existiert?

---

# Teil 1: Die vier Sprachdimensionen

Der häufigste Konstruktionsfehler in Internationalisierungsarchitekturen ist die Annahme, ein Nutzer habe **eine** Sprache. Er hat vier, und sie können gleichzeitig verschieden sein.

| Dimension | Was sie steuert | Wo sie hängt | Fällt zurück auf |
|---|---|---|---|
| **Oberflächensprache** | Menüs, Schaltflächen, Beschriftungen, Fehlermeldungen | **Identität** | Organisationsvorgabe, dann Englisch |
| **Inhaltssprache** | Wissen, Trainings, Nachrichten, Produkte | **Organisation** | Kette je Sprache, dann Ausgangssprache mit Kennzeichnung |
| **Kommunikationssprache** | Benachrichtigungen, E-Mails, PDF | **Identität** | Oberflächensprache |
| **Gesprächssprache** | Ascent | **je Konversation** | Oberflächensprache |

## 1.1 Warum die Trennung nicht theoretisch ist

Der belegte Normalfall bei Team Şeyda: Ein türkischsprachiger Berater in einer deutschsprachigen Organisation.

| Dimension | Wert | Begründung |
|---|---|---|
| Oberflächensprache | Türkisch | seine Wahl |
| Inhaltssprache | Deutsch | die Lerninhalte existieren nur auf Deutsch, belegt in 07_ONBOARDING.md |
| Kommunikationssprache | Türkisch | seine Wahl |
| Gesprächssprache | Türkisch | er schreibt Ascent auf Türkisch |

Alle vier gleichzeitig, drei davon Türkisch, eine Deutsch. Ein Modell mit einer einzigen Spracheinstellung müsste hier entweder die Oberfläche auf Deutsch zwingen oder behaupten, die Inhalte lägen auf Türkisch vor. Beides ist falsch.

## 1.2 Ausgangssprache je Inhalt

Jeder übersetzbare Inhalt trägt eine **Ausgangssprache**. Sie ist nicht dasselbe wie eine Übersetzung.

Begründung: Ohne Ausgangssprache ist nicht entscheidbar, welche Fassung bei einem Widerspruch gilt. Wird ein Vergütungsdokument auf Deutsch geändert und die türkische Fassung nicht nachgeführt, muss das System wissen, dass Deutsch führt und Türkisch veraltet ist. Ohne diese Angabe entstehen zwei gleichrangige, widersprüchliche Wahrheiten.

Verbindlich: **Die Ausgangssprache führt. Übersetzungen sind abgeleitet und können veralten.** Eine veraltete Übersetzung ist kenntlich zu machen, nicht stillschweigend auszuliefern.

## 1.3 Die Fallback-Kette

Kein einzelner Fallback, sondern eine Kette je Sprache. Sie folgt Sprachverwandtschaft und tatsächlicher Verständlichkeit, nicht einer Standardliste.

| Angeforderte Sprache | Kette |
|---|---|
| Bosnisch | Bosnisch, Kroatisch, Serbisch, Englisch, Ausgangssprache |
| Serbisch | Serbisch, Bosnisch, Kroatisch, Englisch, Ausgangssprache |
| Kroatisch | Kroatisch, Bosnisch, Serbisch, Englisch, Ausgangssprache |
| Türkisch | Türkisch, Englisch, Ausgangssprache |
| Polnisch | Polnisch, Englisch, Ausgangssprache |
| Griechisch | Griechisch, Englisch, Ausgangssprache |
| Spanisch | Spanisch, Portugiesisch, Englisch, Ausgangssprache |
| Portugiesisch | Portugiesisch, Spanisch, Englisch, Ausgangssprache |
| Italienisch | Italienisch, Englisch, Ausgangssprache |
| Rumänisch | Rumänisch, Italienisch, Englisch, Ausgangssprache |
| Französisch | Französisch, Englisch, Ausgangssprache |
| Arabisch | Arabisch, Englisch, Ausgangssprache |
| Englisch | Englisch, Ausgangssprache |
| Deutsch | Deutsch, Englisch |

Die Gruppe Bosnisch, Serbisch, Kroatisch bildet die Wissensdatenbank bereits als eine Tonalitätsgruppe ab. Sprachlich sind die drei weitgehend gegenseitig verständlich, weshalb sie füreinander der beste Fallback sind, deutlich besser als Englisch.

**Zwei verbindliche Regeln zur Kette:**

1. **Ein Fallback wird immer gekennzeichnet.** Der Nutzer sieht, dass er eine andere Sprache liest. Stillschweigende Sprachwechsel wirken wie Fehler
2. **Die Kette endet immer bei der Ausgangssprache, nie bei einem Leerwert.** Ein fehlender Inhalt ist schlimmer als ein Inhalt in der falschen Sprache

---

# Teil 2: Sprache und Rechtsraum sind zwei Achsen

Dies ist der wichtigste Befund dieses Meilensteins und er wird in Internationalisierungsprojekten regelmäßig übersehen.

## 2.1 Der Befund

Die Wissensdatenbank stellt an mindestens sechs Stellen die Regel auf, dass keine Einkommensversprechen gemacht werden dürfen, und begründet sie mit der Rechtslage **in Deutschland**.

Diese Regel bindet nicht an die Sprache, sondern an den **Rechtsraum**:

| Person | Sprache | Rechtsraum | Welche Regeln gelten |
|---|---|---|---|
| Türkischsprachiger Berater in Deutschland | Türkisch | Deutschland | deutsche |
| Deutschsprachiger Berater in Österreich | Deutsch | Österreich | österreichische |
| Türkischsprachiger Berater in der Türkei | Türkisch | Türkei | türkische |

Eine Compliance-Regel an die Sprache zu binden wäre in allen drei Fällen falsch. Sprache steuert **Tonalität**, Rechtsraum steuert **Zulässigkeit**.

## 2.2 Was daraus folgt

`profiles.country` existiert bereits im Bestand und wird nach F2 zum Feld der Mitgliedschaft. Es ist der Schlüssel für den Rechtsraum.

| Was | Bindet an | Beispiel |
|---|---|---|
| Tonalität, Anrede, Wärme | Sprache | Türkisch warm und familiär |
| Verbot von Einkommensversprechen | Rechtsraum | Deutschland |
| Zulässige Produktaussagen | Rechtsraum | Heilaussagen, Nahrungsergänzung |
| Pflichtangaben und Widerruf | Rechtsraum | |
| Steuerliche Hinweise | Rechtsraum | |

**Verbindlich für die Systemanweisung von Ascent:** Sie besteht aus zwei getrennten Teilen. Der Tonalitätsteil wird je Sprache gepflegt. Der Compliance-Teil wird je Rechtsraum gepflegt und **in jede Sprache mit maximaler Genauigkeit übersetzt und muttersprachlich geprüft**. Der Compliance-Teil darf bei der Übersetzung nicht weicher werden.

Warum das wichtig ist: Eine sinngemäße Übersetzung von „keine Einkommensversprechen" kann im Türkischen leicht zu „sei vorsichtig bei Verdienstangaben" werden. Das ist keine Übersetzung mehr, sondern eine Aufweichung einer Rechtspflicht.

## 2.3 Was ich hier nicht entscheide

Welche Regeln in welchem Rechtsraum gelten, ist Rechtsberatung. Die Architektur stellt bereit, dass Regeln je Rechtsraum gepflegt werden können. Der **Inhalt** je Rechtsraum ist vor dem Markteintritt fachlich zu klären. Das steht als offener Punkt in Teil 10.

---

# Teil 3: Datenmodell, vollständige Klassifikation

Grundlage ist die vollständige Erhebung aller Textspalten der 22 AscendOS-Tabellen. Vier Klassen.

## 3.1 Klasse A: übersetzbar, organisationsbezogen

Inhalt, den eine Organisation selbst erstellt und der in mehreren Sprachen vorliegen kann.

| Tabelle | Spalten | Bemerkung |
|---|---|---|
| `achievements` | `title`, `description` | `key` und `icon` bleiben unübersetzt |
| `agents` | `name`, `system_prompt` | **Sonderfall, siehe 3.5** |
| `external_tools` | `name`, `description` | `url` unübersetzt, aber siehe 3.6 |
| `journeys` | `title`, `description` | |
| `journey_steps` | `title` | |
| `knowledge_docs` | `title` | Inhalt liegt in `knowledge_chunks`, siehe Teil 6 |
| Künftig: `catalog_products` | `description`, `application`, `benefits` | **nicht** `name`, `code`, `price_eur` |
| Künftig: `events` | `title`, `description` | |
| Künftig: `news_posts` | `title`, `body` | |
| Künftig: `notification_templates` | Nachrichtentext | |

## 3.2 Klasse B: niemals übersetzen, technische Bezeichner

Diese Werte sind Schlüssel, nicht Text. Eine Übersetzung würde Vergleiche und Verknüpfungen brechen.

| Tabelle | Spalten |
|---|---|
| `achievements` | `key` |
| `agents` | `key`, `model` |
| `coach_convos` | `agent_key` |
| `coach_messages` | `role` |
| `daily_plan_items` | `mission_type`, `status` |
| `external_tools` | `key`, `share_event_type`, `result_event_type` |
| `invites` | `code`, `role` |
| `journey_steps` | `content_type` |
| `knowledge_docs` | `category`, `status`, `source_type` |
| `pipeline_events` | `event_type`, `source` |
| `profiles` | `role` |
| `usage_events` | `event_type` |

Damit ist die Regel aus `03_CHOGAN.md` erfüllt: interne Bezeichner ASCII, Anzeigetexte mit echten Umlauten. Der Anzeigetext zu `category = 'produkte'` ist eine Übersetzung, der Wert `produkte` selbst nie.

**Konkreter Befund im Bestand:** In `src/features/knowledge/knowledgeApi.ts` sind die Anzeigebezeichnungen der neun Kategorien als deutsche Zeichenketten fest hinterlegt. Das ist heute korrekt, weil es Oberflächentext ist, und gehört nach Teil 5 in einen Nachrichtenkatalog, nicht in die Datenbank.

## 3.3 Klasse C: niemals übersetzen, Nutzer- und Personendaten

| Tabelle | Spalten | Begründung |
|---|---|---|
| `contacts` | `name`, `phone`, `email`, `notes`, `next_step` | Eingaben des Nutzers. Eine Übersetzung wäre eine Verfälschung |
| `profiles` | `first_name`, `last_name`, `username`, `phone`, `avatar_url` | Personennamen werden nicht übersetzt |
| `organizations` | `name` | Eigenname. Team Şeyda bleibt Team Şeyda |
| `teams` | `name` | Eigenname |
| `coach_messages` | `content` | Gesprächsverlauf. Bleibt in der Sprache des Gesprächs |
| `knowledge_gaps` | `question` | Bereits anonymisierte Nutzerfrage. Bleibt in der Originalsprache, sonst verliert die Auswertung ihren Wert |
| `invite_validation_attempts` | `ip` | technisch |

`knowledge_gaps.question` verdient eine Anmerkung: Es ist verlockend, die Lücken zur besseren Auswertung in eine Sprache zu übersetzen. Das wäre ein Fehler. Die Formulierung der Frage ist selbst ein Signal, und ein Bündel türkischer Fragen zu einem Thema bedeutet etwas anderes als ein deutsches Bündel: Es zeigt, dass Inhalte in Türkisch fehlen.

## 3.4 Klasse D: sprachneutral, aber lokalisiert dargestellt

Werte, die nicht übersetzt, sondern formatiert werden. Behandlung in Teil 7.

| Art | Beispiele |
|---|---|
| Datum und Zeit | `created_at`, `plan_date`, `occurred_at`, `next_step_due` |
| Zahlen | Punkte, Provisionsprozente, Mengen |
| Währung | Preise, künftig `price_eur` |
| Namenssortierung | Teamlisten, Kontaktlisten |

## 3.5 Sonderfall `agents.system_prompt`

Die Systemanweisung ist **keine gewöhnliche Übersetzung**. Sie ist der Ort, an dem die Tonalitätsvorgaben aus Teil 0.1 wirksam werden.

Verbindlich:

1. Je Sprache eine **eigenständig verfasste** Anweisung, keine Übersetzung. Die Wissensdatenbank fordert kulturelle Tonalität, nicht generische Übersetzung
2. Der Compliance-Teil wird getrennt geführt, bindet an den Rechtsraum, siehe Teil 2
3. Fehlt eine Sprache, gilt die Kette. Ascent antwortet dann in der Nutzersprache, arbeitet aber mit der Anweisung der Fallback-Sprache
4. Änderungen unterliegen dem Eval-Set. Eine geänderte Systemanweisung ändert das Verhalten für alle Nutzer dieser Sprache

## 3.6 Sonderfall `external_tools.url`

Die URL ist technisch und wird nicht übersetzt. Aber: Die Werkzeuge der Generation 1 sind selbst mehrsprachig, teils mit Sprachparameter in der Adresse.

Verbindlich: `external_tools` erhält neben der Basisadresse eine Angabe, **wie** die Sprache übergeben wird, sofern das Werkzeug es unterstützt. Andernfalls wird dem Nutzer die verfügbare Sprache des Werkzeugs angezeigt, damit er nicht überrascht wird.

Ohne diese Angabe würde ein türkischsprachiger Nutzer aus einer türkischen Oberfläche in ein deutsches Werkzeug geschickt, ohne Vorwarnung.

## 3.7 Global gegen organisationsbezogen

| Inhalt | Ebene | Begründung |
|---|---|---|
| Oberflächentexte | **global**, ausgeliefert mit der Anwendung | ändern sich mit dem Code |
| Fehlermeldungen | global | |
| Standard-Auszeichnungen | global, je Organisation überschreibbar | Plattform liefert Vorlagen, Organisation darf abweichen |
| Wissen, Trainings, Nachrichten | **organisationsbezogen** | gehört der Organisation |
| Produktdaten | organisationsbezogen mit globaler Grundlage | Chogan-Sortiment ist gemeinsam, Beschreibungen dürfen abweichen |
| Systemanweisungen | organisationsbezogen | `agents` trägt bereits `org_id` |

Auflösungsregel, gleiches Muster wie beim Karriereplan in F2: **Existiert eine organisationsbezogene Übersetzung, gewinnt sie. Sonst gilt die globale.** Ein Vorrang, keine Vermischung.

---

# Teil 4: Übersetzungsspeicher

## 4.1 Die Anforderung, die das Modell bestimmt

Die Regel „Griechisch, Bosnisch und Polnisch vor dem Livegang muttersprachlich prüfen" verlangt einen **Prüfstatus je Übersetzung je Sprache**. Das schließt den naheliegenden Ansatz aus, Übersetzungen als Wertesammlung in der Zeile des Inhalts zu führen.

Begründung im Detail: Ein Feld, das alle Sprachen als Wertesammlung enthält, kann keinen Status je Sprache tragen, ohne dass die Struktur ausartet. Und die Frage „welche griechischen Übersetzungen sind noch ungeprüft" wäre nur durch vollständiges Durchsuchen aller Inhalte beantwortbar.

## 4.2 Aufbau

Ein **eigenständiger Übersetzungsbestand**, fachlich beschrieben, ohne Schemafestlegung:

| Bestandteil | Zweck |
|---|---|
| Bezug auf Inhaltsart und Inhalt | welcher Datensatz |
| Feld | welche Spalte |
| Sprache | |
| Wert | die Übersetzung |
| Ausgangssprache | woraus übersetzt wurde |
| Prüfstatus | Entwurf, übersetzt, muttersprachlich geprüft, freigegeben |
| Geprüft von, geprüft am | Nachweis für die Regel aus 0.2 |
| Fassung der Quelle | siehe 4.4 |
| Organisation | leer für global, gesetzt für organisationsbezogen |

Die Organisation direkt an der Übersetzungszeile ist eine bewusste Entscheidung. Sie macht die Zugriffsregel einfach: Sichtbar ist, was zur aktiven Organisation gehört oder global ist. Ohne dieses Feld müsste die Zugriffsregel für jede Inhaltsart einen eigenen Weg zur Organisation kennen, und das ist genau die Art verschachtelter Prüfung, die in F1 zu neun offenen Funktionen geführt hat.

## 4.3 Prüfstatus, vier Stufen

| Status | Bedeutung | Auslieferung |
|---|---|---|
| `draft` | angelegt, unvollständig | nein |
| `translated` | übersetzt, nicht geprüft | nur wenn die Sprache keine Prüfpflicht hat |
| `reviewed` | muttersprachlich geprüft | ja |
| `stale` | Quelle hat sich geändert | ja, **mit Kennzeichnung** |

**Prüfpflichtige Sprachen sind Griechisch, Bosnisch und Polnisch**, belegt in 15_WORKFLOWS.md. Für diese drei wird `translated` nicht ausgeliefert. Für andere Sprachen ist `translated` ausreichend, aber `reviewed` bleibt das Ziel.

Die Liste prüfpflichtiger Sprachen ist **Daten, nicht Code**. Kommt eine Sprache hinzu, deren Qualität unsicher ist, wird sie eingetragen, nicht programmiert.

## 4.4 Veralten erkennen

Ändert sich der Inhalt in der Ausgangssprache, sind alle Übersetzungen fachlich überholt, technisch aber unverändert vorhanden. Ohne Erkennung liefert das System stillschweigend veraltete Übersetzungen aus. Bei einem Vergütungsdokument wäre das ein Compliance-Vorfall, nicht nur ein Qualitätsmangel.

Verbindlich: Die Übersetzung merkt sich die **Fassung der Quelle**, aus der sie entstanden ist. Weicht die aktuelle Fassung ab, gilt sie als `stale` und wird gekennzeichnet ausgeliefert.

`knowledge_docs` trägt bereits eine Fassungsnummer. Für die übrigen übersetzbaren Inhalte ist eine gleichwertige Angabe erforderlich. Das ist eine Ergänzung, keine Umstellung.

## 4.5 Warum nicht maschinell übersetzen

Verlockend, weil Ascent es könnte. Ich empfehle es für Inhalte **nicht**, aus drei Gründen:

1. **Die Wissensdatenbank verlangt kulturelle Tonalität, nicht Übersetzung.** Eine maschinelle Übersetzung erfüllt das nicht
2. **Compliance-Inhalte dürfen nicht weicher werden.** Siehe 2.2
3. **Die Prüfpflicht für drei Sprachen wird durch maschinelle Erzeugung nicht erfüllt**, sondern nur der Aufwand verlagert

Zulässig ist maschinelle Übersetzung als **Vorschlag** im Status `draft`, den ein Mensch prüft. Das entspricht dem Muster für Best Practices aus der Produktvision: erzeugen, prüfen, freigeben.

---

# Teil 5: Oberflächensprachen

## 5.1 Oberflächentexte gehören nicht in die Datenbank

Verbindliche Trennung:

| Art | Ort | Begründung |
|---|---|---|
| Oberflächentexte, Schaltflächen, Beschriftungen, Fehlermeldungen | **Nachrichtenkataloge in der Anwendung** | ändern sich mit dem Code, müssen ohne Datenbankzugriff verfügbar sein |
| Inhalte | **Datenbank**, siehe Teil 4 | gehören der Organisation, ändern sich unabhängig vom Code |

Die häufige Fehlentscheidung an dieser Stelle lautet, alle Texte in eine Tabelle zu legen. Folge: Die Anwendung kann vor dem ersten Datenbankzugriff nichts anzeigen, jede Anmeldeseite braucht einen Rundlauf, und Texte lassen sich nicht mit dem Code prüfen.

**Ausnahme, eng begrenzt:** Eine Organisation darf einzelne Oberflächentexte überschreiben, etwa eine eigene Begrüßung. Das ist eine kleine Überschreibungsschicht über dem Katalog, nicht die Verlagerung des Katalogs.

## 5.2 Istzustand und Umfang

| Befund | Wert |
|---|---|
| Dateien in `src/` | 48 |
| Davon mit deutschen Texten im Quelltext | **36** |
| Vorhandene Übersetzungsbibliothek | **keine** |
| Fest hinterlegte Gebietseinstellung `de-DE` | 3 Stellen |

Das ist Umsetzungsarbeit, kein Architekturmangel. Der Umfang ist trotzdem zu benennen: Drei Viertel aller Oberflächendateien sind betroffen.

## 5.3 Anforderungen an den Nachrichtenkatalog

| Anforderung | Begründung |
|---|---|
| Schlüssel statt Text im Code | ein deutscher Text im Code ist kein Schlüssel, sondern eine Sprache |
| Pluralformen nach ICU-Regeln | siehe 7.5 |
| Platzhalter mit Benennung | Reihenfolge ändert sich zwischen Sprachen |
| Fehlender Schlüssel fällt auf die Kette zurück und wird protokolliert | ein leerer Text ist schlimmer als ein englischer |
| Katalog wird beim Bau geprüft | fehlende Schlüssel brechen die Auslieferung, nicht die Laufzeit |
| Kataloge werden nach Sprache getrennt geladen | vierzehn Sprachen im Startpaket wären ein Ladezeitproblem auf dem Mobilgerät |

Der letzte Punkt ist auf einem Mobilgerät wesentlich. Vierzehn vollständige Kataloge im ersten Ladevorgang würden die Startzeit messbar verschlechtern, und AscendOS wird laut Wissensdatenbank überwiegend vom Telefon genutzt.

---

# Teil 6: KI, Coach und Retrieval

Der anspruchsvollste Teil, weil hier vier Sprachen gleichzeitig auftreten können: die Frage, die Dokumente, die Systemanweisung und die Antwort.

## 6.1 Spracherkennung

| Ebene | Verfahren |
|---|---|
| Grundlage | Oberflächensprache der Identität |
| Je Konversation | Sprache der ersten Nutzernachricht, wenn sie eindeutig abweicht |
| Innerhalb einer Konversation | **kein automatischer Wechsel** |

Die dritte Regel ist wichtig. Ein Nutzer, der ein deutsches Zitat in eine türkische Unterhaltung einfügt, wechselt nicht die Sprache. Eine Erkennung je Nachricht würde die Antwortsprache mitten im Gespräch umschlagen lassen. Das wirkt wie ein Fehler.

Ein Wechsel erfolgt nur auf ausdrückliche Anforderung oder beim Beginn einer neuen Unterhaltung. `coach_convos` erhält dafür eine Sprachangabe.

## 6.2 Aufbau der Systemanweisung

Drei Teile mit unterschiedlicher Bindung. Diese Trennung ist die Umsetzung von Teil 2.

| Teil | Bindet an | Pflege |
|---|---|---|
| Verhaltens- und Tonalitätsregeln | **Sprache** | eigenständig verfasst je Sprache, nach der Tonalitätstabelle |
| Compliance-Regeln | **Rechtsraum** | je Rechtsraum verfasst, dann genau übersetzt und geprüft |
| Fachliche Spezialisierung | Sprache | `agents.system_prompt` je Sprache |

Zusätzlich verbindlich: Die Anweisung enthält die Anweisung, **in welcher Sprache zu antworten ist**, ausdrücklich und nicht implizit. Ein Modell, das deutsche Dokumente im Kontext hat und eine türkische Frage liest, neigt ohne ausdrückliche Anweisung dazu, in der Sprache der Dokumente zu antworten.

## 6.3 Retrieval, die zentrale Entscheidung

Drei Möglichkeiten, mit unterschiedlichen Fehlermodi:

| Möglichkeit | Verhalten | Fehlermodus |
|---|---|---|
| A: nur Nutzersprache | filtert streng | **Bei Inhalten, die nur auf Deutsch existieren, findet ein türkischer Nutzer nichts.** Ascent meldet eine Wissenslücke, obwohl das Wissen vorhanden ist |
| B: sprachneutral | kein Filter | Ascent übersetzt Ausschnitte selbst, auch compliance-kritische. Unkontrollierte Übersetzung |
| C: **bevorzugt, dann Kette, mit Kennzeichnung** | zuerst Nutzersprache, bei zu wenig Treffern die Kette | keiner der beiden oben |

**Verbindlich ist C.**

Begründung gegen A: Die Wissensdatenbank belegt, dass Inhalte nicht in allen Sprachen existieren. Möglichkeit A würde aus einer Sprachlücke eine Wissenslücke machen, und der Coach würde bei vorhandenem Wissen behaupten, keines zu haben. Das ist der schlechteste mögliche Fehler für ein System, dessen Wert die Wissensbasis ist.

Begründung gegen B: Die Einkommenstabelle des Vergütungsplans trägt eine Verwendungssperre. Eine unkontrollierte Übersetzung dieser Inhalte durch das Modell ist ein Compliance-Risiko.

Ausgestaltung von C, verbindlich:

1. Erste Suche in der Nutzersprache
2. Liegen weniger als die gewünschte Anzahl Treffer über der Schwelle, wird die Kette hinzugenommen
3. Jeder Ausschnitt wird mit seiner Sprache an das Modell übergeben
4. Die Anweisung lautet: Antworte in der Nutzersprache, kennzeichne Inhalte, die du aus einer anderen Sprache überträgst
5. Bei compliance-kritischen Kategorien, insbesondere Vergütung, wird **nicht** über die Kette gesucht. Dort gilt A, und bei fehlender Übersetzung wird ausdrücklich auf die vorhandene Sprachfassung verwiesen

Punkt 5 ist die Ausnahme, die das Compliance-Risiko schließt, ohne die Wissensbasis unbrauchbar zu machen.

**Auswirkung auf `match_knowledge`:** Die Funktion braucht einen Sprachparameter. Sie hat heute keinen. Diesen nachträglich in eine Signatur einzufügen, die von Edge Functions aufgerufen wird, ist unnötige Nacharbeit. Er sollte bei der nächsten Änderung mitkommen, auch wenn er zunächst immer Deutsch enthält. Das war bereits Empfehlung aus dem Architektur-Review.

## 6.4 Einbettungen

| Frage | Antwort |
|---|---|
| Ein Vektorraum oder mehrere? | **einer** |
| Getrennte Indizes je Sprache? | **nein** |
| Modell | `gemini-embedding-001`, mehrsprachig |
| Dimension | 1536, unverändert |

Begründung: Das Modell ist mehrsprachig trainiert. Eine türkische Frage und ein deutsches Dokument mit gleicher Bedeutung liegen im selben Raum nahe beieinander. Genau das macht Möglichkeit C überhaupt erst möglich. Getrennte Räume je Sprache würden sprachübergreifende Suche ausschließen und wären ein Rückschritt.

`knowledge_docs.language` existiert bereits und dient als **Filter**, nicht als Raumtrennung. Die Sprache muss zusätzlich am Ausschnitt verfügbar sein, weil das Retrieval auf Ausschnittsebene filtert. Dieselbe Vererbung wie bei Status und Zielgruppe, die in Phase 0 vorgesehen ist.

## 6.5 Zwei nicht offensichtliche Folgen der Mehrsprachigkeit

**Folge 1: Die Ähnlichkeitsschwelle ist sprachpaarabhängig.**

Bei sprachübergreifender Suche ist die Ähnlichkeit systematisch niedriger als innerhalb einer Sprache, auch bei gleicher Bedeutung. Ein einziger Schwellwert führt dazu, dass sprachübergreifende Treffer entweder nie erscheinen oder innerhalb einer Sprache zu viel Unpassendes durchlässt.

Verbindlich: Die Schwelle ist je Richtung konfigurierbar, mindestens getrennt nach gleicher Sprache und Fallback. `coach_min_similarity` liegt bereits in den Organisationseinstellungen und ist damit ohne Schemaänderung erweiterbar. Die Kalibrierung erfolgt je Sprachpaar mit echten Inhalten, nicht durch Schätzung.

**Folge 2: Die Ausschnittsgröße wirkt je Sprache unterschiedlich.**

Die Zerlegung erfolgt bei 1600 Zeichen. Das entspricht in verschiedenen Sprachen unterschiedlich vielen Wörtern und Bedeutungseinheiten. Türkisch ist agglutinierend und hat längere Wörter, Griechisch und Arabisch verwenden andere Schriften mit anderer Zeichendichte.

Die Folge ist keine Fehlfunktion, aber ungleiche Trefferqualität zwischen Sprachen. Verbindlich: Die Zerlegung bleibt zeichenbasiert, weil eine tokenbasierte Zerlegung eine Modellabhängigkeit einführen würde. Die Ausschnittsgröße wird aber je Sprache geprüft und darf abweichen.

## 6.6 Wissenslücken

`knowledge_gaps` erhält die Sprache der Anfrage. Damit wird auswertbar, ob eine Lücke inhaltlich fehlt oder nur sprachlich.

Das ist der wertvollste einzelne Zusatz dieses Teils. Ohne Sprachangabe sieht ein Betreiber zehn Lücken zu einem Thema und schreibt ein neues Dokument. Mit Sprachangabe sieht er, dass das Dokument existiert und die türkische Übersetzung fehlt. Das sind völlig verschiedene Aufgaben mit verschiedenem Aufwand.

## 6.7 Sprachwechsel

| Wechsel | Wirkung |
|---|---|
| Oberflächensprache | sofort, keine Datenänderung |
| Laufende Unterhaltung | **keine.** Bestehende Unterhaltungen behalten ihre Sprache |
| Neue Unterhaltung | neue Sprache |
| Gespeicherte Tagesplaneinträge | siehe Teil 9, Befund T1 |
| Benachrichtigungen | ab dem Wechsel |

Bestehende Unterhaltungen nicht umzustellen ist bewusst. Ein Verlauf, dessen frühere Nachrichten in einer anderen Sprache stehen als die neuen, ist unvermeidbar, weil die alten Nachrichten nicht rückwirkend übersetzt werden. Ein Übersetzen des Verlaufs wäre eine Verfälschung des Gesprächs.

---

# Teil 7: Formate und Darstellung

## 7.1 Zeitzonen, ein bestehender Widerspruch

**Befund im Bestand:** Es gibt zwei verschiedene Begriffe von „heute", und keine Zeitzone ist gespeichert.

| Ort | Wie „heute" bestimmt wird |
|---|---|
| Tagesplan | clientseitig, lokales Datum des Geräts |
| Coach-Tageslimit | serverseitig, `date_trunc('day', now())`, also nach Datenbankzeitzone |

Für einen Nutzer in der Türkei um 01:30 Ortszeit ist das lokale Datum bereits der neue Tag, die Datenbank steht aber noch bei 22:30 des Vortages. Der Tagesplan ist neu, das Nachrichtenlimit nicht zurückgesetzt.

Das ist heute kaum sichtbar, weil alle Nutzer in derselben Zeitzone sind. Es wird sichtbar, sobald AscendOS über eine Zeitzone hinaus genutzt wird, und dann als scheinbar zufälliger Fehler in Randstunden.

**Verbindlich:**

1. Die Zeitzone wird an der **Identität** gespeichert. `country` genügt nicht, weil mehrere Länder mehrere Zeitzonen haben
2. „Heute" wird **serverseitig** aus dieser Zeitzone bestimmt, nicht clientseitig
3. Zeitstempel werden weiterhin mit Zeitzone gespeichert und erst bei der Anzeige umgerechnet
4. Kalendertage wie `plan_date` sind Datumswerte ohne Zeit und beziehen sich auf die Zeitzone der Identität

Der bestehende Weg über eine schwedische Gebietseinstellung, um ein ISO-Datum zu erhalten, ist ein funktionierender Behelf und semantisch irreführend. Er sollte durch eine ausdrückliche Datumsbildung ersetzt werden.

## 7.2 Datum und Zahlen

Fest hinterlegte Gebietseinstellungen an drei Stellen im Bestand. Verbindlich: Formatierung immer über die Oberflächensprache der Identität, nie fest.

Zu beachten: Kalenderwochen beginnen je Land verschieden, und der EOM ist laut Wissensdatenbank auf Montag festgelegt. Eine Wochenansicht muss den Wochenbeginn aus dem Gebiet ableiten, darf aber die fachliche Bedeutung des Montags nicht verschieben.

## 7.3 Währung

| Regel | Begründung |
|---|---|
| **Führend ist der Euro** | Chogan ist italienischer Hersteller, Preise werden in Euro gesetzt |
| Anzeige in Landeswährung nur mit Kurs und Datum | ein Preis ohne Kursdatum ist keine Information |
| **Provisions- und Punkteberechnung ausschließlich in Euro und PT** | die Umrechnung 1 PT zu 1,27 Euro ist Teil des Plans |
| Umgerechnete Beträge werden **nie** als Berechnungsgrundlage gespeichert | sonst hängt ein Provisionsanspruch am Kurs des Erfassungstages |

Die letzte Regel ist die wichtigste. Der belegte Sprachraum umfasst Länder außerhalb der Eurozone, darunter Polen, Rumänien, die Türkei, Serbien und Bosnien. Würde eine Provision in Landeswährung berechnet und gespeichert, wäre sie nachträglich nicht mehr nachvollziehbar.

## 7.4 Sortierung

Ein einziges Sortierverhalten für die Datenbank ist bei vierzehn Sprachen zwangsläufig für die meisten falsch. Deutsch behandelt Umlaute anders als Türkisch, Griechisch verwendet ein anderes Alphabet.

Verbindlich: Sortierung wird **je Abfrage** nach der Oberflächensprache bestimmt, nicht global für die Datenbank festgelegt. Begründung: Ein mehrmandantenfähiges System bedient mehrere Sprachen gleichzeitig, eine globale Festlegung kann daher nicht für alle richtig sein.

Betroffen sind Teamlisten, Kontaktlisten, Produktlisten und jede alphabetische Auswahl.

## 7.5 Pluralformen

| Sprache | Formen | Beispiel |
|---|---|---|
| Deutsch, Englisch | 2 | 1 Tag, 2 Tage |
| Türkisch | 1 nach Zahlwort | 2 gün, nicht günler |
| Polnisch | 3 | 1, 2 bis 4, 5 und mehr |
| Arabisch | 6 | |

Der Bestand umgeht das Problem mit der Schreibweise `Tag(en)`. Das ist im Deutschen ein akzeptabler Behelf und in den anderen Sprachen keine Lösung, weil dort nicht die Endung, sondern die Wortwahl variiert.

Verbindlich: Pluralformen nach ICU-Regeln im Nachrichtenkatalog, nicht durch Zeichenverkettung. Damit ist die Erzeugung von Sätzen in SQL ausgeschlossen, siehe Teil 9, Befund T1.

## 7.6 Rechts nach links

Arabisch ist belegt. Betroffen sind:

| Bereich | Anforderung |
|---|---|
| Layoutrichtung | logische CSS-Eigenschaften statt links und rechts |
| Navigation | Reihenfolge spiegelt sich |
| Fortschrittsbalken, Diagramme | Laufrichtung spiegelt sich |
| Symbole mit Richtung | Pfeile spiegeln sich, Uhren nicht |
| **Das Logo** | **spiegelt sich nicht.** Das Symbol ist eine Marke, keine Richtungsangabe |
| Zahlen | westarabische Ziffern beibehalten, ostarabische nur auf Wunsch |

**Verbindlich ab sofort, unabhängig davon, wann Arabisch kommt:** Neue Oberflächen verwenden logische CSS-Eigenschaften. Begründung in Teil 9, Befund T4.

## 7.7 Unicode-Normalisierung

**Befund im Bestand:** Bei Benutzernamen und Einladungscodes findet keine Normalisierung statt.

Zur Genauigkeit: Die verwendete Umwandlung in Groß- und Kleinbuchstaben ist gebietsunabhängig. Das bekannte türkische Problem mit dem punktlosen i tritt hier deshalb **nicht** auf. Der Bestand ist an dieser Stelle korrekt, und ich hatte einen Fehler vermutet, wo keiner ist.

Ein anderes Problem besteht dennoch. Buchstaben mit Zeichen wie `ö` können in Unicode auf zwei Weisen dargestellt werden, als ein Zeichen oder als Grundbuchstabe mit angehängtem Zeichen. Beide sehen identisch aus und sind nicht gleich. Ohne Normalisierung sind zwei optisch identische Benutzernamen möglich, und die Eindeutigkeitsprüfung greift nicht.

Bei einer Nutzerschaft mit türkischen, griechischen und bosnischen Namen ist das kein Randfall.

Verbindlich: Benutzernamen, Einladungscodes und Anmeldedaten werden vor Speicherung und Vergleich normalisiert. Für Benutzernamen zusätzlich zu prüfen, ob eine Einschränkung auf einen festgelegten Zeichenumfang sinnvoller ist als eine Normalisierung mit allen Zeichen.

## 7.8 Türkische Apostrophe

Die Wissensdatenbank dokumentiert, dass Apostrophe in türkischen Suffixen Zeichenketten brechen, Beispiele `Euro'dan` und `80'inde`.

In AscendOS betrifft das nicht den Anwendungscode, weil dort keine Texte in Zeichenketten zusammengesetzt werden, sondern **die Inhaltserfassung**: Übersetzungen, Systemanweisungen, Nachrichtenvorlagen. Verbindlich: Inhalte werden als Daten behandelt und niemals in Code eingefügt. Bei der Ausleitung von Vorlagen, etwa in Systemanweisungen, ist auf korrekte Behandlung zu achten.

---

# Teil 8: DSGVO und Sprache

## 8.1 Wo Sprache gespeichert wird

Nach F2 gilt: Was in zwei Organisationen unterschiedlich sein darf, gehört an die Mitgliedschaft.

| Angabe | Ebene | Begründung |
|---|---|---|
| Oberflächensprache | **Identität** | Ein Mensch hat eine Sprache, unabhängig von der Zahl seiner Organisationen |
| Kommunikationssprache | **Identität**, kann von der Oberflächensprache abweichen | manche lesen die Oberfläche auf Englisch, wollen Nachrichten aber muttersprachlich |
| Zeitzone | **Identität** | hängt am Wohnort, nicht an der Organisation |
| Rechtsraum | **Mitgliedschaft** | eine Person kann für Organisationen in verschiedenen Ländern tätig sein |
| Vorgabesprache | **Organisation** | greift nur, wenn die Identität nichts gewählt hat |
| Inhaltssprachen | **Organisation** | welche Sprachen sie pflegt |

Der Rechtsraum an der Mitgliedschaft ist eine bewusste Abweichung von der Sprache. Begründung in Teil 2: Sprache folgt der Person, Zulässigkeit folgt der Organisation und ihrem Markt.

## 8.2 Überschreiben

| Ebene | Darf überschreiben |
|---|---|
| Identität | die Vorgabe der Organisation, immer |
| Organisation | **nichts** an der Identität |

Eine Organisation darf einer Person keine Anzeigesprache aufzwingen. Begründung: Die Sprache ist eine persönliche Zugänglichkeitseinstellung. Eine Vorgabe, die die Wahl der Person überschreibt, kann für Menschen, die die Vorgabesprache nicht beherrschen, den Zugang zum System verhindern.

Eine Organisation darf eine **Vorgabe** setzen, die für Personen ohne eigene Wahl gilt, und sie darf festlegen, welche Sprachen sie inhaltlich pflegt.

## 8.3 Sprache bei Benachrichtigungen

Kette: Kommunikationssprache der Identität, dann Oberflächensprache, dann Vorgabe der Organisation, dann Englisch.

Zwei Sonderfälle:

| Fall | Sprache |
|---|---|
| Benachrichtigung mit rechtlichem Bezug, etwa Fristablauf der Lizenz | Sprache der Identität **und** Verweis auf die maßgebliche Fassung im Rechtsraum |
| Benachrichtigung an einen Sponsor über eine andere Person | Sprache des **Empfängers**, nicht der betroffenen Person |

Der zweite Fall ist leicht zu übersehen. Eine Fristwarnung, die an den Sponsor geht, muss in dessen Sprache verfasst sein, auch wenn die betroffene Person eine andere spricht.

## 8.4 Auskunft und Löschung

| Frage | Antwort |
|---|---|
| Sprache der Auskunft nach Artikel 15 | Sprache der Identität. Eine Auskunft in einer Sprache, die die Person nicht versteht, erfüllt den Zweck nicht |
| Sind Spracheinstellungen personenbezogene Daten? | ja, sie gehören in die Auskunft |
| Verrät die Sprache mehr als nötig? | möglicherweise. Sprache kann auf Herkunft hindeuten, also auf eine besondere Datenkategorie |

Zum dritten Punkt: Die Spracheinstellung ist funktional notwendig und ihre Verarbeitung dadurch gedeckt. Sie darf aber **nicht** für Auswertungen nach Herkunft verwendet werden. Verbindlich: Sprache erscheint in keiner Auswertung als Gliederungsmerkmal über Personen. Eine Auswertung, welche Inhaltssprachen fehlen, ist zulässig, weil sie Inhalte betrifft. Eine Auswertung, welche Sprachgruppen weniger verkaufen, ist es nicht.

Das ist eine Grenze, die technisch leicht zu überschreiten und im Dashboard verlockend ist.

---

# Teil 9: Teure Stellen im Bestand

Der Kern dieses Meilensteins. Jede Stelle, an der eine spätere Umstellung teuer wird, mit Begründung und Kostenvergleich.

## T1: Der Tagesplan speichert gerenderte deutsche Sätze

**Schwere: hoch. Die teuerste Stelle im ganzen Bestand.**

**Befund.** Das Regelwerk erzeugt in SQL vollständige deutsche Sätze und speichert sie in `daily_plan_items.title` und `reason`. Belegt sind unter anderem:

- `name || ' kontaktieren'`
- `'3-Way-Call mit ' || name || ' organisieren'`
- `'Präsentation vor ' || tage || ' Tagen gesendet, noch nicht angesehen.'`
- `'Bei ' || name || ' seit ' || tage || ' Tag(en) überfällig.'`
- `'Drei neue Menschen ansprechen'`

Zehn Zeichenkettenverkettungen über fünf Signalfunktionen.

**Warum das später teuer wird.** Drei Gründe, der dritte ist der entscheidende:

1. Ein Sprachwechsel ändert bestehende Einträge nicht. Der Verlauf bleibt deutsch
2. Übersetzung in SQL würde vierzehn Sprachvarianten je Satz bedeuten, und Pluralformen sind dort nicht abbildbar
3. **Aus einem gerenderten Satz lassen sich die Parameter nicht zurückgewinnen.** Aus `Mehmet kontaktieren` ist nicht verlässlich rekonstruierbar, dass der Name `Mehmet` und die Aufgabe `kontaktieren` war. Ein Kontakt namens „Anna kontaktieren GmbH" bricht jede Rückwandlung

Punkt 3 bedeutet: Wird dies nicht vor dem breiten Einsatz geändert, bleibt der bis dahin entstandene Verlauf **dauerhaft** deutsch. Es gibt keine spätere Reparatur.

**Empfohlene Lösung.** Die Grundlage liegt bereits vor: `mission_type` existiert als technischer Bezeichner mit Werten wie `follow_up_overdue` und `fit_check_next_step`. Verbindlich:

- Das Regelwerk speichert `mission_type` und die **Parameter** in strukturierter Form, etwa Kontaktkennung und Anzahl der Tage
- Der Satz wird bei der Anzeige aus dem Nachrichtenkatalog gebildet
- `title` und `reason` entfallen als gespeicherte Sätze, oder sie bleiben als Zwischenspeicher mit Sprachkennzeichnung

**Kostenvergleich.** Heute enthält `daily_plans` fast keine Daten. Die Änderung ist damit nahezu kostenlos. Nach einem Jahr Betrieb ist der gesamte Verlauf betroffen und nicht mehr heilbar.

**Wichtige Einschränkung zur Reihenfolge.** Betroffen sind genau die fünf Signalfunktionen, die F1 verändert und die F2 erneut verändert. Diese Änderung muss **hinter F1 einsortiert** werden, sonst wird ein unverifizierter Stand ein zweites Mal verändert.

## T2: Keine Zeitzone, zwei Begriffe von heute

**Schwere: hoch.**

Befund und Lösung in 7.1.

**Warum später teuer.** Jeder Datumswert, der ohne Zeitzonenbezug entstanden ist, ist im Nachhinein nicht mehr eindeutig zuzuordnen. Bei `plan_date` und den Punkteperioden bedeutet das, dass Monatsgrenzen für Nutzer außerhalb der Datenbankzeitzone rückwirkend nicht korrigierbar sind. Bei einer Provisionsperiode ist das ein Abrechnungsfehler.

**Kostenvergleich.** Jetzt: eine Angabe an der Identität plus eine Änderung an der Bestimmung von „heute". Später: nicht korrigierbare Vergangenheit.

## T3: `match_knowledge` ohne Sprachparameter

**Schwere: mittel.**

**Befund.** Die Funktion hat keinen Sprachparameter. Das Retrieval kann daher nicht nach Sprache filtern, obwohl `knowledge_docs.language` existiert.

**Warum später teuer.** Die Funktion wird von einer Edge Function aufgerufen. Eine Signaturänderung erfordert die gleichzeitige Anpassung von Funktion, Edge Function und deren Auslieferung. Wird der Parameter bei einer ohnehin anstehenden Änderung mitgenommen, kostet er nichts.

**Empfehlung.** Beim nächsten Eingriff mitnehmen, zunächst mit festem Wert. Die Erweiterung um Status und Zielgruppe ist in Phase 0 ohnehin vorgesehen.

## T4: Keine logischen CSS-Eigenschaften

**Schwere: mittel, Umfang hoch.**

**Befund.** 36 von 48 Oberflächendateien enthalten Gestaltung mit richtungsgebundenen Angaben.

**Warum später teuer.** Die Umstellung auf logische Eigenschaften ist einzeln trivial und betrifft praktisch jede Datei. Sie ist mechanisch, aber nicht automatisierbar, weil einige Angaben tatsächlich links bedeuten und nicht Anfang, etwa bei einem Diagramm mit fester Achsenlage.

**Kostenvergleich.** Für neue Oberflächen kostet die Regel nichts. Rückwirkend sind es 36 Dateien und eine vollständige Sichtprüfung.

**Empfehlung.** Ab sofort verbindlich für neues, kein rückwirkender Umbau vor der Entscheidung über Arabisch.

## T5: Keine Fassungsangabe an übersetzbaren Inhalten außer bei Wissen

**Schwere: mittel.**

**Befund.** `knowledge_docs` trägt eine Fassungsnummer. `achievements`, `journeys`, `journey_steps`, `external_tools` und `agents` nicht.

**Warum später teuer.** Ohne Fassungsangabe ist nicht feststellbar, ob eine Übersetzung veraltet ist. Nachträglich lässt sich das nicht rekonstruieren: Alle bestehenden Übersetzungen müssten als möglicherweise veraltet behandelt und vollständig neu geprüft werden.

**Kostenvergleich.** Jetzt eine Angabe je Tabelle. Später eine vollständige Neuprüfung aller Übersetzungen.

## T6: Keine Sprachangabe an Wissenslücken

**Schwere: niedrig, Nutzen hoch.**

**Befund.** `knowledge_gaps` erfasst die anonymisierte Frage ohne Sprache.

**Warum wertvoll.** Ohne Sprache ist eine inhaltliche Lücke nicht von einer sprachlichen zu unterscheiden. Das sind verschiedene Aufgaben mit verschiedenem Aufwand, siehe 6.6.

**Kostenvergleich.** Jetzt eine Angabe. Später sind die bis dahin erfassten Lücken nicht mehr zuzuordnen.

## T7: Kategoriebezeichnungen als deutsche Zeichenketten im Code

**Schwere: niedrig.**

**Befund.** Die neun Wissenskategorien tragen in `knowledgeApi.ts` fest hinterlegte deutsche Bezeichnungen und Hinweistexte.

**Bewertung.** Das ist Oberflächentext an der richtigen Stelle, nur ohne Katalog. Der Umbau ist Teil der allgemeinen Katalogeinführung und nicht gesondert teuer. Der technische Bezeichner ist bereits sauber getrennt, wie die Wissensdatenbank es verlangt.

## T8: Behelf mit schwedischer Gebietseinstellung

**Schwere: niedrig.**

**Befund.** Das lokale Datum wird über eine schwedische Gebietseinstellung erzeugt, weil diese das gewünschte Format liefert.

**Bewertung.** Funktioniert, ist aber semantisch irreführend und hängt von der Formatierung einer fremden Gebietseinstellung ab. Sollte im Zuge von T2 durch eine ausdrückliche Datumsbildung ersetzt werden.

## T9: Keine Übersetzungsbibliothek

**Schwere: niedrig als Architekturfrage, hoch als Umfang.**

**Befund.** Keine Bibliothek vorhanden, 36 Dateien mit Text im Quelltext.

**Bewertung.** Kein Architekturmangel, sondern Umsetzungsarbeit. Wird nicht teurer, solange keine weiteren Oberflächen entstehen. Neue Oberflächen sollten ab sofort Schlüssel verwenden, damit der Rückstand nicht wächst.

## Übersicht

| Befund | Schwere | Jetzt | Später |
|---|---|---|---|
| T1 Tagesplan speichert Sätze | **hoch** | nahezu kostenlos | **nicht heilbar** |
| T2 Keine Zeitzone | **hoch** | eine Angabe plus Logik | Vergangenheit nicht korrigierbar |
| T3 `match_knowledge` ohne Sprache | mittel | mit dem nächsten Eingriff | drei Bausteine gleichzeitig |
| T4 Keine logischen CSS-Eigenschaften | mittel | kostenlos für Neues | 36 Dateien plus Sichtprüfung |
| T5 Keine Fassungsangabe | mittel | eine Angabe je Tabelle | vollständige Neuprüfung |
| T6 Lücken ohne Sprache | niedrig | eine Angabe | Erfasstes nicht zuzuordnen |
| T7 Kategorietexte im Code | niedrig | Teil der Katalogeinführung | unverändert |
| T8 Schwedischer Behelf | niedrig | mit T2 | unverändert |
| T9 Keine Bibliothek | niedrig | Umsetzung | wächst mit jeder Oberfläche |

---

# Teil 10: Architecture Review

## 10.1 Bewertung

| Bereich | Bewertung | Begründung |
|---|---|---|
| **Skalierbarkeit** | tragfähig | Neue Sprache heißt: Eintrag in der Sprachliste, Kette ergänzen, Katalog liefern, Inhalte übersetzen. Kein Schemaeingriff |
| **Wartbarkeit** | gut, mit einer Einschränkung | Ein Übersetzungsbestand statt neun Nebentabellen. Einschränkung: Der Bestand ist polymorph und verliert dadurch die Verweisintegrität zum Inhalt. Verwaiste Übersetzungen sind harmlos und werden aufgeräumt |
| **Performance** | tragfähig, zwei Punkte zu beachten | Kataloge werden je Sprache getrennt geladen, das ist auf dem Mobilgerät wesentlich. Übersetzungen werden je Inhaltsart und Sprache gebündelt abgefragt, nicht je Datensatz |
| **KI** | tragfähig, neu bewertet | Ein Vektorraum, mehrsprachiges Modell, Kette mit Kennzeichnung, Ausnahme für compliance-kritische Kategorien |
| **Mehrmandantenfähigkeit** | tragfähig | Organisation an der Übersetzungszeile, Vorrang der organisationsbezogenen Fassung, gleiches Muster wie beim Karriereplan |
| **Suche** | tragfähig | Sortierung je Abfrage statt global. Volltextsuche braucht später Sprachkonfigurationen je Sprache, siehe offene Punkte |
| **Wissensdatenbank** | tragfähig | `language` vorhanden, muss an den Ausschnitt vererbt werden, gleiche Vererbung wie Status und Zielgruppe |
| **Übersetzbarkeit** | vollständig geklärt | Vier Klassen, jede Spalte der 22 Tabellen zugeordnet |
| **Risiken** | sieben, siehe 10.2 | |

## 10.2 Risiken

| Priorität | Risiko | Bewertung |
|---|---|---|
| 1 | **T1 nicht vor dem breiten Einsatz behoben** | Der Verlauf bleibt dauerhaft deutsch. Nicht heilbar |
| 2 | **T2 nicht behoben, Nutzung über Zeitzonen hinweg** | Monats- und Periodengrenzen rückwirkend falsch. Bei Provisionen ein Abrechnungsfehler |
| 3 | **Compliance-Inhalte werden bei der Übersetzung weicher** | Teil 2.2. Rechtsrisiko, nicht Qualitätsmangel. Gegenmaßnahme ist muttersprachliche Prüfung mit Rechtsbezug |
| 4 | Inhaltslücken werden als Wissenslücken wahrgenommen | Gegenmaßnahme ist Möglichkeit C in 6.3 plus T6 |
| 5 | Schwelle nicht je Sprachpaar kalibriert | Sprachübergreifende Treffer erscheinen nie oder zu viel Unpassendes durchläuft |
| 6 | Veraltete Übersetzungen werden stillschweigend ausgeliefert | Gegenmaßnahme ist T5 plus Status `stale` |
| 7 | Sprache wird zum Auswertungsmerkmal über Personen | Teil 8.4. Gegenmaßnahme ist eine ausdrückliche Grenze, technisch nicht erzwingbar |

Risiko 7 verdient eine Anmerkung: Es ist das einzige, das technisch nicht verhindert werden kann. Eine Auswertung nach Sprachgruppen ist mit den vorhandenen Daten jederzeit möglich. Die Grenze ist eine Festlegung, keine Sperre.

## 10.3 Offene Punkte

| # | Punkt | Art | Entscheider |
|---|---|---|---|
| O1 | Welche Sprachen zum Start, und in welcher Reihenfolge | geschäftlich | Sie |
| O2 | Compliance-Regeln je Rechtsraum, inhaltlich | rechtlich | Rechtsberatung |
| O3 | Kommt Arabisch, und damit die Rechts-nach-links-Darstellung | geschäftlich | Sie |
| O4 | Volltextsuche neben der Vektorsuche, und mit welchen Sprachkonfigurationen | Architektur, später | ich, wenn Volltextsuche ansteht |
| O5 | Benutzernamen auf einen festgelegten Zeichenumfang begrenzen oder normalisieren | Architektur | ich, mit Ihrer Bestätigung |
| O6 | Wer übersetzt, und wer prüft muttersprachlich | organisatorisch | Sie |

O6 ist kein technischer Punkt und trotdem der kritischste für den Erfolg. Die Architektur stellt Prüfstatus und Nachweis bereit. Ob für Griechisch, Bosnisch und Polnisch tatsächlich Muttersprachler zur Verfügung stehen, entscheidet, ob diese Sprachen ausgeliefert werden können. Ohne Prüfer bleibt der Status `translated`, und diese drei Sprachen werden nach 4.3 nicht ausgeliefert.

## 10.4 Was diese Architektur nicht leistet

Zur Vollständigkeit, weil ein Bericht ohne Grenzen unglaubwürdig ist:

1. **Sie beschafft keine Übersetzungen.** Die Wissensdatenbank nennt die fehlenden Katalogsprachen ausdrücklich einen echten Aufwandsposten. Das bleibt so
2. **Sie erzwingt keine Übersetzungsqualität.** Der Prüfstatus dokumentiert eine Prüfung, er ersetzt sie nicht
3. **Sie verhindert nicht, dass Sprache zum Auswertungsmerkmal wird.** Siehe Risiko 7
4. **Sie löst die Inhaltslücke nicht.** Wenn Module 1 bis 8 nur auf Deutsch existieren, liefert die Kette Deutsch. Das ist die richtige Antwort auf eine Lücke, aber es füllt sie nicht

---

# Abschluss

## JA

Die Internationalisierungsarchitektur ist produktionsreif als verbindliche Implementierungsgrundlage.

Begründung: Alle Textspalten der 22 Tabellen sind klassifiziert. Die vier Sprachdimensionen sind getrennt und ihre Fallback-Ketten festgelegt. Die Trennung von Sprache und Rechtsraum ist geklärt und war der wesentliche fachliche Befund. Das Retrieval hat eine begründete Entscheidung mit Ausnahme für compliance-kritische Inhalte. Neun teure Stellen im Bestand sind benannt und bewertet.

Die offenen Punkte sind Geschäfts-, Rechts- und Organisationsfragen. Keiner davon kann die Architektur noch verändern. O5 ist eine Detailfestlegung, die ich treffe.

## Zwei Bedingungen zur Umsetzung

Diese Bedingungen betreffen nicht die Architektur, sondern die Reihenfolge. Beide halte ich für zwingend.

**Bedingung 1: T1 wird vor dem breiten Einsatz des Tagesplans behoben.**

Das ist die einzige Stelle im gesamten Bestand, die später **nicht heilbar** ist. Aus einem gerenderten Satz lassen sich die Parameter nicht zurückgewinnen. Heute ist die Änderung nahezu kostenlos, weil kaum Daten vorliegen. Nach einem Jahr Betrieb ist der gesamte Verlauf dauerhaft deutsch.

**Bedingung 2: T1 wird hinter F1 einsortiert.**

Betroffen sind genau die fünf Signalfunktionen, die F1 verändert und die F2 erneut verändert. Ein unverifizierter Stand darf nicht ein zweites Mal geändert werden, weil sich Fehler dann nicht mehr zuordnen lassen.

Daraus ergibt sich die Reihenfolge: F1 verifizieren, dann F2 umsetzen, dann T1 und T2, dann die übrigen Befunde.

## Anmerkung zum nächsten Meilenstein

Meilenstein 4, Informationsarchitektur, erhält aus dieser Fassung drei verbindliche Vorgaben, die dort einzuarbeiten sind:

1. Die aktive Organisation muss bei mehreren Mitgliedschaften dauerhaft sichtbar sein, aus F2
2. Ein Sprachwechsler ist erforderlich, und ein Fallback muss am Inhalt erkennbar sein, aus 1.3
3. Logische CSS-Eigenschaften sind ab sofort verbindlich, aus T4

Der dritte Punkt ist der wichtigste für Meilenstein 4: Wenn dort Oberflächen entworfen werden, ohne diese Regel zu berücksichtigen, wächst T4 mit jedem Entwurf.
