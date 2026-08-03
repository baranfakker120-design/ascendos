> **ÜBERHOLT, Stand 25. Juli 2026.**
>
> Dieses Dokument ist der ERSTE ENTWURF von Meilenstein 2 und nicht mehr gültig.
> Verbindlich ist ausschliesslich `docs/f2-autorisierung-final.md`.
>
> Ersetzt durch zwei freigegebene Entscheidungen: Produktname AscendOS, und
> Trennung von Identität und Organisationszugehörigkeit (Blocker 1, Option B).
>
> Aufbewahrt wird der Entwurf nur zur Nachvollziehbarkeit der Entscheidung.
> Er darf NICHT als Grundlage für Implementierung dienen.

---

# Meilenstein 2: Autorisierungsarchitektur

Gegenstand: endgültiges Rollen- und Berechtigungsmodell, tragfähig für mindestens fünf Jahre.
Datum: 25. Juli 2026. Keine Implementierung, keine Migration, kein SQL.
F1 bleibt eingefroren, Status Verifikation ausstehend.

---

# Teil 0: Verbindliche Designvorgabe, technisch geprüft

Das Logo ist ab sofort Bestandteil der Design-Sprache. Ich habe die Datei vermessen, statt sie nur anzusehen, weil eine verbindliche Vorgabe überprüfbare Werte braucht.

## 0.1 Prüfergebnis der gelieferten Datei

| Prüfung                            | Ergebnis                                                          |
| ---------------------------------- | ----------------------------------------------------------------- |
| Format                             | PNG, RGBA, 1536 x 1024                                            |
| Transparenter Hintergrund          | **erfüllt.** Alpha an allen vier Ecken ist 0                      |
| Weiße Fläche hinter dem Logo       | **keine**                                                         |
| Schleier oder Artefakte am Rand    | **keine.** Maximales Alpha im 20-Pixel-Randstreifen ist 2 von 255 |
| Tatsächlicher Inhalt               | x 390 bis 1148, y 200 bis 729, also 758 x 530 Pixel               |
| Anteil der Nutzfläche an der Datei | 49 Prozent der Breite, 52 Prozent der Höhe                        |

Die Vorgaben transparenter Hintergrund, keine weiße Fläche und keine Schatten sind durch die Datei selbst bereits erfüllt.

## 0.2 Vermessene Bestandteile

Drei getrennte Inhaltsblöcke, gemessen über das Alpha-Zeilenprofil:

| Block | Bereich in der Datei          | Größe     | Bedeutung                                    |
| ----- | ----------------------------- | --------- | -------------------------------------------- |
| 1     | x 589 bis 948, y 200 bis 507  | 360 x 308 | **das stilisierte A, das offizielle Symbol** |
| 2     | x 389 bis 1148, y 572 bis 650 | 760 x 79  | Wortmarke ASCENDOS                           |
| 3     | x 446 bis 1082, y 710 bis 729 | 637 x 20  | Claim BUILD A BETTER TOMORROW                |

Abstand zwischen Symbol und Wortmarke: 65 Pixel. Dieser Wert dient als Mindestschutzraum, siehe 0.4.

## 0.3 Zwei Befunde, die vor dem ersten Einsatz zu klären sind

**Befund A: Das Symbol existiert noch nicht als eigenes Asset.**

Verbindlich gefordert ist das alleinstehende A für Favicon, Splash, Sidebar, Navigation, Mobile und den Coach-Header. Geliefert ist ausschließlich die Kombinationsmarke aus Symbol, Wortmarke und Claim. Ein reines Symbol-Asset ist nicht dabei.

Das Symbol daraus zu gewinnen ist **kein Neuentwurf und keine Veränderung**, sondern ein verlustfreier Beschnitt auf den bereits vermessenen Bereich. Die Regel „keine alternativen Logos erstellen" bleibt gewahrt, weil kein Pixel verändert wird.

Exakte Vorgabe für den Beschnitt: **Ursprung x 589, y 200, Breite 360, Höhe 308.**

**Befund B: Das Symbol ist nicht quadratisch, Icons sind es.**

Das Seitenverhältnis des Symbols ist 360 zu 308, also etwa 1,169 zu 1. Favicons, App-Icons und Kachelbilder sind quadratisch. Wer das Symbol in ein quadratisches Feld einpasst, indem er es streckt, verletzt die Vorgabe „keine Verzerrungen" durch genau die Handlung, mit der ein Favicon entsteht.

Verbindliche Regel daraus: Das Symbol wird in einem quadratischen Feld **zentriert** und mit Freiraum umgeben, niemals gestreckt oder beschnitten, um das Quadrat zu füllen.

## 0.4 Abgeleitete Design-Regeln, verbindlich

1. **Symbolquelle.** Ausschließlich der Beschnitt aus 0.3, Ursprung 589 / 200, Größe 360 x 308.
2. **Seitenverhältnis.** 1,169 zu 1, unveränderlich. In quadratischen Feldern zentrieren.
3. **Mindestschutzraum.** Rundum mindestens 18 Prozent der Symbolhöhe frei, abgeleitet aus dem gemessenen Abstand von 65 zu 308 Pixeln. Kein Element darf in diesen Raum reichen.
4. **Mindestgröße.** 16 Pixel Höhe für Favicon, 24 Pixel in der Navigation. Darunter verliert der Verlauf des Symbols seine Wirkung.
5. **Untergrund.** Das Symbol trägt einen Silberverlauf. Auf weißem Grund verliert die helle Innenkante an Kontrast. Verbindlich: dunkler oder mittlerer Untergrund bevorzugt, auf hellem Untergrund keine Anpassung des Logos, sondern Anpassung des Untergrunds.
6. **Kombinationsmarke.** Nur dort, wo Platz für alle drei Blöcke ist: Anmeldeseite, Splash, Impressum, ausgehende Dokumente. Nie in der Navigation.
7. **Coach-Header.** Ausschließlich das Symbol, oben rechts, transparenter Hintergrund, nicht die Wortmarke. So vorgegeben.

## 0.5 Ein Widerspruch in der Marke, der zu entscheiden ist

Ihr Auftrag schreibt durchgehend **AscentOS**. Das verbindliche Logo zeigt **ASCENDOS**. Die gesamte Projektdokumentation, alle 29 Architekturentscheidungen und die Wissensdatenbank verwenden **AscendOS**. Der KI-Coach heißt **Ascent**.

Eine verbindliche Design-Sprache mit zwei Produktnamen ist nicht tragfähig. Meine Empfehlung, weil sie den geringsten Änderungsbedarf erzeugt und dem verbindlichen Logo folgt:

- Produkt: **AscendOS**
- Coach: **Ascent**

Das ist eine Markenentscheidung, keine Architekturentscheidung. Ich treffe sie nicht. Im weiteren Dokument verwende ich AscendOS, weil das Logo verbindlich ist.

---

# Teil 1: Analyse des bestehenden Rollenmodells

## 1.1 Istzustand, belegt

| Element                              | Befund                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------ |
| Rollenwerte                          | `super_admin`, `leader`, `berater` in einer CHECK-Bedingung auf `profiles.role`      |
| Policies, die `leader` auswerten     | **0**                                                                                |
| Funktionen, die `leader` auswerten   | **0**                                                                                |
| Profile mit Rolle `leader`           | **0**                                                                                |
| Rollenprüfende Helfer                | `is_super_admin()`, `current_user_role()`                                            |
| Organisationsbezug                   | `current_org_id()`, in 31 Policies verwendet                                         |
| Beziehungsprüfung                    | `get_downline()`, `is_ancestor_of()`, nach F1 mit Organisationsfilter                |
| Schutz vor Selbstbeförderung         | `protect_profile_columns()`, Positivliste: `role`, `org_id`, `team_id`, `sponsor_id` |
| JWT-Ansprüche                        | ausschließlich `sub` und `role: authenticated`. Keine eigenen Ansprüche              |
| Rollen in `profiles_public` sichtbar | **ja**, Spalte `role` wird org-weit ausgeliefert                                     |

## 1.2 Die Wurzelursache

Das bestehende Modell versucht, mit einer einzigen Spalte drei voneinander unabhängige Autoritätsquellen abzubilden. Das kann nicht funktionieren, und `leader` ist der Beweis: Die Rolle existiert seit Sprint 1, hat nie eine Policy erhalten und ist niemandem zugewiesen. Nicht aus Nachlässigkeit, sondern weil nicht entscheidbar war, was sie bedeuten soll.

In einem Vertriebsnetzwerk entsteht Autorität aus drei Quellen:

| Quelle        | Wesen                   | Beispiel                                                      | Woher                                   |
| ------------- | ----------------------- | ------------------------------------------------------------- | --------------------------------------- |
| **Beziehung** | dynamisch, abgeleitet   | Ich habe dich gesponsert, also darf ich deine Aktivität sehen | `sponsor_id`, Genealogie                |
| **Rang**      | erworben, berechnet     | Ab Manager gibt es Zugriff auf Leader-Auswertungen            | Vergütungsplan, `qualification_results` |
| **Funktion**  | zugewiesen, delegierbar | Ich pflege den Produktkatalog                                 | Zuweisung durch einen Berechtigten      |

Diese drei sind orthogonal. Ein Berater ohne jeden Rang kann Produktpfleger sein. Ein Emerald kann null administrative Funktion haben. Ein Sponsor sieht seine Downline unabhängig von beidem.

**Zentrale Entscheidung dieses Entwurfs: Rollen kodieren ausschließlich Funktion. Beziehung und Rang sind Daten und werden nie zu Rollen.**

## 1.3 Dokumentierte Schwachstellen

| #   | Schwachstelle                                                                  | Art                                                                                                                    | Schwere                |
| --- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| S1  | `leader` ohne Wirkung, aber im Datenmodell vorhanden                           | Scheinsicherheit. Ein Betreiber vergibt die Rolle und glaubt, damit Rechte erteilt zu haben                            | hoch                   |
| S2  | Keine Delegation möglich. Jede administrative Handlung erfordert `super_admin` | Verstoß gegen Least Privilege. In der Praxis führt es dazu, dass mehrere Personen `super_admin` erhalten               | hoch                   |
| S3  | Kein Berechtigungsbegriff. Rechte sind an drei Rollen gebunden                 | Jede neue Funktion erzwingt entweder eine neue Rolle oder eine Rechteausweitung bestehender Rollen                     | hoch                   |
| S4  | Rang ist nirgends autorisierungsrelevant abgebildet                            | Rangabhängige Sichten sind nicht darstellbar, ohne Rollen zu missbrauchen                                              | mittel                 |
| S5  | `profiles_public` liefert `role` org-weit aus                                  | Jeder Angemeldete kann den Betreiber identifizieren. Erleichtert gezielte Angriffe                                     | mittel                 |
| S6  | Kein Prüfprotokoll für Rechteänderungen                                        | DSGVO-Nachweispflicht nicht erfüllbar. Rechteausweitung nicht rekonstruierbar                                          | mittel                 |
| S7  | Keine zeitlich begrenzten Rechte                                               | Vertretung im Urlaub führt zu dauerhafter Rechteausweitung, weil niemand zurücknimmt                                   | mittel                 |
| S8  | Keine Trennung Autor und Freigeber bei Wissen                                  | Wer Wissen schreibt, kann es selbst freigeben. Die Freigabepflicht der Wissensdatenbank wird damit zur Formsache       | mittel                 |
| S9  | Identität ist 1 zu 1 an eine Organisation gebunden                             | `profiles.id = auth.users.id` und `profiles.org_id` als Einzelspalte. Eine Person kann nie in zwei Organisationen sein | **hoch, siehe Teil 8** |
| S10 | Kein Prinzipal für den Plattformbetreiber                                      | Support für Fremdmandanten wäre nur über `super_admin` in deren Organisation möglich                                   | mittel                 |
| S11 | Keine Rangordnung zwischen Rollen                                              | „Darf Admin einen Super-Admin bearbeiten" ist im Modell nicht beantwortbar                                             | hoch                   |

## 1.4 Bewertung der vorgeschlagenen Rollen

| Vorgeschlagen   | Bewertung                      | Begründung                                                                                                                                                                                                                                                                                                                                             |
| --------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `user`          | **umbenennen nicht empfohlen** | Der Bestand nutzt `berater`. Ein Umbenennen berührt die CHECK-Bedingung und jede Stelle, die den Wert vergleicht, ohne fachlichen Gewinn. `berater` ist zudem präziser: es bezeichnet einen Lizenzinhaber, nicht einen beliebigen Kontoinhaber                                                                                                         |
| `leader`        | **nicht als Rolle**            | Die gemeinte Befugnis ist beziehungsbasiert und mit `is_ancestor_of()` seit F1 gelöst. Eine Rolle daneben erzeugt eine zweite, widersprüchliche Wahrheitsquelle                                                                                                                                                                                        |
| `senior_leader` | **nicht als Rolle**            | Der Vergütungsplan hat 16 Stufen. Eine Teilmenge als Rollen zu kodieren heißt entweder 16 Rollen oder willkürliche Grenzen. Die Wissensdatenbank belegt, dass Chogan Planwerte ändert: die PT-Schwelle für Senior Manager ist dort als VERALTET geführt. Eine Planänderung würde dann eine Migration erzwingen. Rang gehört in `qualification_results` |
| `admin`         | **übernehmen**                 | Schließt die Delegationslücke S2. Braucht aber eine trennscharfe Abgrenzung zu `super_admin`, sonst ist es Dekoration                                                                                                                                                                                                                                  |
| `super_admin`   | **übernehmen**                 | Bleibt Mandanteneigentümer                                                                                                                                                                                                                                                                                                                             |

Ergebnis: aus fünf vorgeschlagenen Rollen werden **drei Rollen plus ein Prinzipal außerhalb der Mandanten**. Alles Weitere wird Daten. Das ist keine Vereinfachung aus Bequemlichkeit, sondern die Konsequenz aus 1.2. Weniger Rollen bei gleichzeitig feinerer Steuerung, weil die Steuerung in die Berechtigungen wandert.

---

# Teil 2: Neues Rollenmodell

Jede Rolle trägt eine **Stufe**. Die Stufe existiert ausschließlich, um S11 zu lösen: Ein Prinzipal darf nur Prinzipale mit **strikt niedrigerer** Stufe verändern.

| Rolle               | Stufe | Anzahl je Organisation                |
| ------------------- | ----- | ------------------------------------- |
| `berater`           | 10    | beliebig                              |
| `admin`             | 50    | wenige                                |
| `super_admin`       | 90    | mindestens einer, empfohlen zwei      |
| `platform_operator` | 99    | außerhalb der Organisation, siehe 2.4 |

## 2.1 berater

**Zweck.** Der Normalfall. Ein Vertriebspartner mit Lizenz, der die Plattform für seine eigene Arbeit nutzt.

**Verantwortlichkeiten.** Eigene Kontakte pflegen, eigene Pipeline führen, eigene Aktivität erfassen, eigene Downline führen.

**Sichtbare Daten.**

- Alles Eigene, ohne Einschränkung
- Von der eigenen Downline: aggregierte Aktivität, Rang, Journey-Fortschritt, Fristenstatus
- Von der eigenen Organisation: Teamliste mit Namen und Benutzernamen, freigegebenes Wissen, Produkte, Ereignisse, Nachrichten

**Änderbare Daten.** Eigenes Profil ohne die geschützten Spalten. Eigene Kontakte, Ereignisse, Ziele, Punkte. Eigene Einladungen mit Rolle `berater`.

**Verbotene Daten, ausdrücklich.**

- **Kontakte anderer Personen, auch in der eigenen Downline.** Das ist die wichtigste Grenze des ganzen Modells. Kontakte enthalten Namen und Notizen zu Menschen, die AscendOS nicht kennen und nicht zugestimmt haben. Ein Sponsor braucht die Kennzahl „fünf offene Follow-ups", nicht die Namen
- Coach-Gesprächsinhalte anderer Personen
- Sidelines, also Zweige außerhalb der eigenen Struktur
- Alles aus fremden Organisationen
- Wissensentwürfe

**Erlaubte Aktionen.** Kontakte anlegen und pflegen, Pipeline-Ereignisse erfassen und korrigieren, Tagesplan erzeugen und abschließen, Coach nutzen, Berater einladen, eigene Punkte eintragen, Wissen vorschlagen.

**Verbotene Aktionen.** Rollen oder Berechtigungen vergeben, Wissen freigeben, Produkte oder Preise ändern, Nachrichten veröffentlichen, Organisationseinstellungen ändern, fremde Profile bearbeiten, Leader- oder Admin-Einladungen erzeugen.

**Begründung der Grenze bei Kontakten.** Ein Sponsor hat ein legitimes Interesse an der Aktivität seiner Downline, aber kein legitimes Interesse an den Identitäten fremder Interessenten. Die Trennung von Kennzahl und Identität ist die Umsetzung von Privacy by Design an der sensibelsten Stelle des Systems.

## 2.2 admin

**Zweck.** Operativer Delegierter innerhalb einer Organisation. Existiert, damit nicht jede Pflegeaufgabe einen Mandanteneigentümer erfordert.

**Verantwortlichkeiten.** Inhaltspflege und Betrieb: Wissen, Produkte, Trainings, Ereignisse, Nachrichten, Nutzerverwaltung im Rahmen der erteilten Berechtigungen.

**Sichtbare Daten.** Alles, was `berater` sieht. Zusätzlich, sofern per Berechtigung erteilt: Wissensentwürfe, organisationsweite Auswertungen als Aggregat, Nutzerliste mit Status, Wissenslücken, Nutzungsereignisse als Aggregat.

**Änderbare Daten.** Wissen, Produkte, Trainings, Ereignisse, Nachrichten. Profile von Prinzipalen **niedrigerer Stufe**, und dort nur die betrieblichen Felder.

**Verbotene Daten.**

- **Kontakte fremder Personen. Auch als Admin.** Eine administrative Funktion begründet keinen Zugriff auf personenbezogene Daten Dritter. Das ist der Kern von Least Privilege in diesem System
- Coach-Gesprächsinhalte
- Prüfprotokoll, sofern nicht ausdrücklich erteilt
- Organisationseinstellungen, die Sicherheit betreffen

**Verbotene Aktionen, hart und nicht delegierbar.**

- Berechtigungen vergeben oder entziehen. `can_manage_permissions` bleibt ausschließlich bei `super_admin`
- Rollen zuweisen
- Einen `super_admin` oder einen anderen `admin` bearbeiten, Stufenregel
- Sich selbst Berechtigungen erteilen
- Die eigene Rolle ändern
- Die Organisation löschen

**Begründung.** Ein Admin, der Berechtigungen vergeben darf, ist funktional ein Super-Admin, nur mit anderem Namen. Diese eine Grenze trägt die gesamte Trennung.

## 2.3 super_admin

**Zweck.** Mandanteneigentümer. Trägt die Verantwortung für Organisation, Rechtevergabe und Compliance.

**Verantwortlichkeiten.** Rollen und Berechtigungen, Organisationseinstellungen, Freigabe von Wissen, Prüfprotokoll, Datenschutzauskünfte und Löschungen.

**Sichtbare Daten.** Alles innerhalb der eigenen Organisation, **mit einer Einschränkung**: Kontakte und Coach-Gespräche anderer Personen sind auch für `super_admin` nicht im Normalbetrieb sichtbar. Zugriff ist nur über einen ausdrücklich protokollierten Notfallpfad möglich, siehe 3.6.

**Änderbare Daten.** Alles innerhalb der Organisation, außer den geschützten Spalten des eigenen Profils und außer anderen `super_admin`.

**Verbotene Aktionen.**

- Sich selbst die eigene Rolle ändern. Der bestehende Schutz `protect_profile_columns` bleibt und gilt auch hier
- Einen anderen `super_admin` bearbeiten. Gleiche Stufe ist nicht erlaubt, nur strikt niedrigere. Verhindert, dass ein kompromittiertes Konto den zweiten Eigentümer entfernt und den Mandanten übernimmt
- Fremde Organisationen berühren
- Das Prüfprotokoll verändern oder löschen. Nur Anfügen, nie Ändern

**Begründung der Regel „gleiche Stufe nicht erlaubt".** Ohne sie genügt ein übernommenes Konto, um alle anderen Eigentümer zu entfernen. Mit ihr braucht die Entfernung eines Eigentümers einen zweiten Eigentümer oder den Plattformbetreiber, also ein Vieraugenprinzip an der empfindlichsten Stelle.

## 2.4 platform_operator

**Zweck.** Der Betreiber von AscendOS selbst. Notwendig ab dem Moment, in dem ein zweiter Mandant existiert, also ab Skalierungsstufe 5.

**Warum keine Rolle in `profiles`.** Ein Plattformbetreiber hat keine Organisation. Ihn als `super_admin` in jeden Mandanten einzutragen wäre aus drei Gründen falsch: er erschiene in der Teamliste, er wäre von Mandantenadmins nicht unterscheidbar, und sein Zugriff wäre nicht von regulärer Nutzung trennbar.

**Ausgestaltung.** Ein eigener Prinzipaltyp außerhalb von `profiles`, mit drei zwingenden Eigenschaften:

1. **Zeitlich begrenzt.** Jeder Zugriff auf einen Mandanten hat ein Ablaufdatum, ohne Ausnahme
2. **Zweckgebunden und protokolliert.** Jeder Zugriff nennt einen Grund und erzeugt einen Prüfprotokolleintrag
3. **Für den Mandanten sichtbar.** Der Mandanteneigentümer sieht, wann und warum zugegriffen wurde

**Verbotene Daten, auch für den Plattformbetreiber.** Kontakte und Coach-Gespräche. Für Support genügen Struktur, Konfiguration und Fehlerzustände.

**Begründung.** Ohne diesen Prinzipal ist AscendOS nicht an Unternehmen verkäuflich. Jede Sicherheitsprüfung eines Enterprise-Kunden fragt, wer beim Anbieter Zugriff hat, wie lange und wie es nachweisbar ist. Wird das nachträglich gebaut, ist es teuer und wirkt konstruiert.

## 2.5 Was bewusst keine Rolle wird

| Konzept                                  | Wo es hingehört                       | Begründung                                                                                       |
| ---------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Leader, Teamleitung                      | Beziehung, `is_ancestor_of()`         | Dynamisch, ändert sich mit der Struktur. Eine Rolle würde veralten                               |
| Senior Leader und die weiteren 14 Stufen | `qualification_results.computed_rank` | Berechnet, Planwerte ändern sich. Siehe 1.4                                                      |
| Insider, Lizenz verloren                 | `license_status`                      | Zustand, nicht Funktion. Ergibt sich aus der Sechs-Monats-Regel                                  |
| Kunde                                    | offene Produktentscheidung            | Heute hat AscendOS keinen Kundenzugang. Die Kundenwerkzeuge der Generation 1 leisten das bereits |
| Produktpfleger, Wissensredakteur         | Berechtigung                          | Genau der Fall, für den Berechtigungen existieren                                                |

## 2.6 Umgang mit dem bestehenden Wert `leader`

Der Wert bleibt zunächst in der CHECK-Bedingung, wird aber niemandem mehr zugewiesen und ist als überholt dokumentiert. Begründung: Ein Entfernen ist eine Migration ohne funktionalen Gewinn, und es sind ohnehin null Profile betroffen. Entfernt wird er in einer späteren Aufräum-Migration, gemeinsam mit anderen Altlasten.

---

# Teil 3: Berechtigungssystem

## 3.1 Das entscheidende Konstruktionsmerkmal: Berechtigungen haben einen Geltungsbereich

Ein reiner Wahrheitswert je Berechtigung ist der klassische Fehler, der im zweiten Jahr einen Umbau erzwingt. `can_view_reports` beantwortet nicht die eigentliche Frage: Auswertungen über wen?

Jede Erteilung trägt deshalb einen Geltungsbereich:

| Geltungsbereich | Bedeutung                                         |
| --------------- | ------------------------------------------------- |
| `self`          | nur eigene Daten                                  |
| `downline`      | eigene Struktur, über `is_ancestor_of()` bestimmt |
| `team`          | das eigene Team, `team_id`                        |
| `org`           | die gesamte Organisation                          |

`can_view_reports` mit `downline` und `can_view_reports` mit `org` sind zwei völlig verschiedene Befugnisse. Ohne diese Dimension müsste man beide als getrennte Berechtigungen führen, und die Anzahl der Berechtigungen würde sich mit jedem neuen Bereich vervielfachen.

## 3.2 Aufbau einer Erteilung

Fachliche Bestandteile, ohne Schemafestlegung:

| Bestandteil             | Zweck                             |
| ----------------------- | --------------------------------- |
| Prinzipal               | wer                               |
| Berechtigung            | was                               |
| Geltungsbereich         | über wen                          |
| Organisation            | in welchem Mandanten              |
| Gültig ab, gültig bis   | zeitlich begrenzte Rechte, S7     |
| Erteilt von, erteilt am | Prüfbarkeit, S6                   |
| Grund                   | Nachvollziehbarkeit bei Prüfungen |

Zwei Regeln zur Gültigkeit:

1. **Die Prüffunktion vergleicht immer den Zeitraum.** Sie verlässt sich nie darauf, dass ein Aufräumlauf abgelaufene Erteilungen entfernt. Ohne diese Regel bleibt ein abgelaufenes Recht wirksam, solange kein Zeitplan läuft, und einen Zeitplan gibt es heute nicht.
2. **Erteilungen sind unveränderlich.** Änderung heißt: alte Erteilung beenden, neue anlegen. Damit ist der Verlauf lückenlos.

## 3.3 Wirksame Berechtigungen

Wirksam ist die Vereinigung aus der Grundausstattung der Rolle und den ausdrücklichen Erteilungen.

**Ausschließlich additiv, keine Verbotslisten.** Begründung: Eine Mischung aus Erlauben und Verbieten erzeugt Auflösungsfragen, die nach wenigen Jahren niemand mehr sicher beantwortet. Wenn eine Rolle zu viel enthält, ist die Rolle falsch geschnitten und wird geändert. Der Preis dieser Entscheidung ist geringere Feinsteuerung, der Gewinn ist Nachvollziehbarkeit. Bei Berechtigungen ist Nachvollziehbarkeit mehr wert.

## 3.4 Berechtigungen

Generische Namen, wie vorgegeben. Der zulässige Geltungsbereich ist Teil der Definition.

**Team und Struktur**

| Berechtigung      | Zulässiger Bereich  | Bedeutung                                              |
| ----------------- | ------------------- | ------------------------------------------------------ |
| `can_view_team`   | downline, team, org | Struktur und Kennzahlen sehen, ohne Kontaktidentitäten |
| `can_manage_team` | downline, team      | Teamzuordnung ändern, Journey zuweisen                 |

**Inhalte**

| Berechtigung            | Zulässiger Bereich | Bedeutung                                            |
| ----------------------- | ------------------ | ---------------------------------------------------- |
| `can_manage_documents`  | org                | Wissen anlegen und bearbeiten, Status bleibt Entwurf |
| `can_approve_documents` | org                | Entwurf freigeben                                    |
| `can_manage_training`   | org                | Journeys und Trainings pflegen                       |
| `can_manage_products`   | org                | Produkte und Preise pflegen                          |
| `can_manage_news`       | org, team          | Nachrichten veröffentlichen                          |
| `can_manage_events`     | org                | Termine pflegen                                      |

**Trennung von `can_manage_documents` und `can_approve_documents`.** Das ist die Behebung von S8. Die Wissensdatenbank verlangt eine Freigabe durch eine zweite Person. Fällt beides zusammen, ist die Freigabe eine Formsache. Wissen ist für den Coach oberste Wahrheit, ein Fehler darin wirkt auf jede Antwort.

**Auswertung**

| Berechtigung           | Zulässiger Bereich  | Bedeutung                      |
| ---------------------- | ------------------- | ------------------------------ |
| `can_view_reports`     | downline, team, org | Auswertungen sehen, aggregiert |
| `can_export_reports`   | downline, team, org | Ausleitung als Datei           |
| `can_manage_dashboard` | org                 | Standardansichten festlegen    |

**Getrennt von `can_view_reports`, weil eine Ausleitung die Daten aus dem System entfernt und damit aus jeder weiteren Kontrolle. Das ist DSGVO-relevant und braucht eine eigene Entscheidung.**

**Nutzer und Rechte**

| Berechtigung             | Zulässiger Bereich | Bedeutung                                                                  |
| ------------------------ | ------------------ | -------------------------------------------------------------------------- |
| `can_manage_users`       | org                | Nutzer anlegen, deaktivieren, betriebliche Felder pflegen                  |
| `can_manage_roles`       | org                | Rollen zuweisen, nur unterhalb der eigenen Stufe                           |
| `can_manage_permissions` | org                | Berechtigungen erteilen. **Nicht delegierbar, ausschließlich super_admin** |

**Betrieb**

| Berechtigung          | Zulässiger Bereich | Bedeutung                                            |
| --------------------- | ------------------ | ---------------------------------------------------- |
| `can_manage_settings` | org                | Organisationseinstellungen                           |
| `can_manage_ai`       | org                | Agenten, Systemanweisungen, Modellwahl, Schwellwerte |
| `can_manage_system`   | org                | Wartung, Sicherheitsrelevantes                       |
| `can_view_audit`      | org                | Prüfprotokoll lesen                                  |

**`can_manage_ai` ist bewusst eigenständig und nicht Teil von `can_manage_settings`.** Wer Systemanweisungen ändern kann, ändert das Verhalten des Coaches gegenüber allen Nutzern, einschließlich der Compliance-Grenzen zu Einkommensversprechen. Das ist eine der wirksamsten Befugnisse im System und darf nicht als Nebenwirkung einer allgemeinen Einstellungsberechtigung mitkommen.

## 3.5 Drei unverhandelbare Regeln gegen Rechteausweitung

**Regel 1: Keine Selbsterteilung.** Ein Prinzipal kann sich niemals selbst eine Berechtigung erteilen, auch nicht mit `can_manage_permissions`. Erteilung erfordert immer eine andere Person.

**Regel 2: Keine Ausweitung durch Delegation.** Ein Prinzipal kann nur erteilen, was er selbst besitzt, und nur in einem Bereich, der nicht weiter ist als der eigene. Wer `can_view_reports` mit Bereich `downline` hat, kann nicht `org` erteilen.

**Regel 3: Stufenregel.** Verändert werden dürfen nur Prinzipale mit strikt niedrigerer Stufe. Beantwortet „Admin bearbeitet Super Admin" mit nein und „Super Admin bearbeitet Super Admin" ebenfalls mit nein.

## 3.6 Notfallzugriff

Es gibt einen Fall, in dem jemand fremde Kontaktdaten sehen muss: eine DSGVO-Auskunft oder eine Löschung. Dafür gibt es keine dauerhafte Berechtigung, sondern einen Notfallpfad mit vier Eigenschaften:

1. Nur `super_admin`
2. Zwingende Angabe eines Grundes
3. Zeitfenster von Stunden, nicht Tagen
4. Prüfprotokolleintrag, für den Betroffenen sichtbar

Begründung: Eine dauerhafte Berechtigung „Kontakte aller sehen" würde mit Sicherheit für Alltagszwecke verwendet, sobald sie existiert. Ein Notfallpfad, der wehtut, wird nur benutzt, wenn er gebraucht wird.

---

# Teil 4: Verwendung der Berechtigungen

**Grundsatz.** Es gibt genau **eine** Auflösungsfunktion, die alle Fragen beantwortet: Hat dieser Prinzipal diese Berechtigung für dieses Ziel? Jede Policy, jede RPC-Funktion, jede Edge Function und jede Oberfläche ruft ausschließlich diese Funktion. Keine Komponente baut eigene Logik nach.

Begründung: F1 hat gezeigt, was passiert, wenn Berechtigungslogik an mehreren Orten entsteht. Neun Funktionen prüften nichts, weil jede ihre eigene Annahme mitbrachte. Eine Funktion ist prüfbar, testbar und an einer Stelle korrigierbar.

## 4.1 SQL-Policies

Jede Policy besteht aus drei Teilen, in dieser Reihenfolge:

1. Mandantengrenze über `current_org_id()`
2. Beziehung oder Eigentum
3. Berechtigung über die Auflösungsfunktion

Die Mandantengrenze steht immer zuerst, damit sie nicht durch eine spätere Bedingung umgangen werden kann.

**Leistungshinweis.** Die Auflösungsfunktion wird in Policies je Zeile ausgewertet. Sie muss als `stable` deklariert sein, damit der Planer sie je Abfrage einmal auswerten kann, und sie darf keine Rekursion über große Mengen auslösen. Für den Bereich `downline` ist die teuerste Prüfung `is_ancestor_of()`. Empfehlung: bei Auswertungen über viele Personen die Zugriffsprüfung einmal mengenweise durchführen und nicht je Zeile, entsprechend Befund F12 des Architektur-Reviews.

## 4.2 RPC-Funktionen

Verbindlich gilt die Security Baseline aus F1, insbesondere:

- Kein Nutzerparameter, wenn immer der eigene Nutzer gemeint ist
- Bleibt ein Fremdparameter, ist die Aufruferprüfung Pflicht
- Bei fehlender Berechtigung: lesend leere Menge, schreibend Ausnahme
- `SECURITY DEFINER` nur mit dokumentierter Begründung

Ergänzung für das Berechtigungsmodell: Eine RPC-Funktion prüft die Berechtigung **im Funktionskörper**, nicht im aufrufenden Code. Der Aufrufweg ist beliebig, die Funktion ist die Grenze.

## 4.3 REST-API

Die von Supabase erzeugte REST-Schnittstelle ist derselbe Zugriffsweg wie die Oberfläche. Es gibt keine zusätzliche Prüfebene und es darf keine geben, denn eine zweite Ebene würde suggerieren, dass die erste unvollständig ist.

Konsequenz aus Zero Trust: Was über die Oberfläche nicht erlaubt ist, muss über die Schnittstelle scheitern, ohne dass dafür etwas eigens gebaut wird. Erreicht wird das dadurch, dass die Prüfung ausschließlich in der Datenbank liegt.

## 4.4 Edge Functions

Edge Functions arbeiten mit dem Zugangstoken des Aufrufers, nie mit dem Dienstschlüssel, außer für ausdrücklich benannte Ausnahmen. Heute gibt es eine solche Ausnahme, `validate-invite`, weil dort noch kein Konto existiert.

**Zwingende Regel für den Coach:** Die Function darf niemals Daten in den Kontext des Modells legen, die der Nutzer nicht selbst lesen könnte. Da sie unter dessen RLS arbeitet, ist das strukturell erfüllt und muss so bleiben. Ein Wechsel auf den Dienstschlüssel wäre eine Umgehung des gesamten Modells.

## 4.5 Frontend, Navigation, Schaltflächen

Berechtigungen im Frontend dienen **ausschließlich der Darstellung**, niemals der Sicherheit.

| Zweck                     | Erlaubt  |
| ------------------------- | -------- |
| Menüpunkt ausblenden      | ja       |
| Schaltfläche deaktivieren | ja       |
| Zugriff verhindern        | **nein** |

Eine ausgeblendete Schaltfläche verhindert einen Fehlversuch, keinen Angriff. Der Angreifer ruft die Schnittstelle direkt. Deshalb gilt: Jede Oberflächenprüfung hat eine gleichlautende Prüfung in der Datenbank, und die Datenbank ist die Autorität.

## 4.6 Dashboard und Auswertungen

Kacheln werden nach Berechtigung und Geltungsbereich gefüllt, nicht nach Rolle. Eine Kachel „Team-Aktivität" liefert bei Bereich `downline` die eigene Struktur, bei `org` die Organisation, und ohne Berechtigung erscheint sie nicht.

## 4.7 Coach und KI

Vier Regeln:

1. **Der Coach erbt die Rechte des Nutzers.** Er ist kein eigener Prinzipal mit eigenen Rechten
2. **Retrieval filtert nach Freigabestatus und Zielgruppe.** Entwürfe erscheinen nur für Berechtigte, interne Inhalte nie in kundenseitigen Antworten
3. **Werkzeugaufrufe des Coaches unterliegen denselben Prüfungen.** Ein Rangrechner, den der Coach aufruft, prüft die Berechtigung genauso wie bei direktem Aufruf
4. **`can_manage_ai` ist von Einstellungen getrennt**, weil Systemanweisungen die Compliance-Grenzen des Coaches definieren

Zum Szenario „KI fordert geschützte Daten an": Ein Prompt kann nach fremden Kontakten fragen. Die Antwort scheitert nicht daran, dass das Modell sich weigert, sondern daran, dass die Daten nie in seinen Kontext gelangen. Weigerung ist eine Bitte, RLS ist eine Grenze.

---

# Teil 5: Berechtigungsmatrix

Zeichen: ✓ erlaubt, ✗ verboten, △ eingeschränkt.
Bei △ steht der Grund in der Fußnote.

| Berechtigung               | berater | admin | super_admin | platform_operator |
| -------------------------- | ------- | ----- | ----------- | ----------------- |
| `can_view_team`            | △ 1     | △ 2   | ✓           | △ 3               |
| `can_manage_team`          | ✗       | △ 2   | ✓           | ✗                 |
| `can_manage_documents`     | ✗       | △ 2   | ✓           | ✗                 |
| `can_approve_documents`    | ✗       | ✗ 4   | ✓           | ✗                 |
| `can_manage_training`      | ✗       | △ 2   | ✓           | ✗                 |
| `can_manage_products`      | ✗       | △ 2   | ✓           | ✗                 |
| `can_manage_news`          | ✗       | △ 2   | ✓           | ✗                 |
| `can_manage_events`        | ✗       | △ 2   | ✓           | ✗                 |
| `can_view_reports`         | △ 1     | △ 2   | ✓           | △ 3               |
| `can_export_reports`       | ✗       | △ 5   | ✓           | ✗                 |
| `can_manage_dashboard`     | ✗       | △ 2   | ✓           | ✗                 |
| `can_manage_users`         | ✗       | △ 6   | ✓           | ✗                 |
| `can_manage_roles`         | ✗       | ✗ 7   | △ 8         | ✗                 |
| `can_manage_permissions`   | ✗       | ✗ 9   | ✓           | ✗                 |
| `can_manage_settings`      | ✗       | △ 2   | ✓           | △ 3               |
| `can_manage_ai`            | ✗       | ✗ 10  | ✓           | ✗                 |
| `can_manage_system`        | ✗       | ✗     | ✓           | △ 3               |
| `can_view_audit`           | ✗       | ✗ 11  | ✓           | △ 3               |
| Eigene Kontakte            | ✓       | ✓     | ✓           | ✗                 |
| **Fremde Kontakte**        | **✗**   | **✗** | **△ 12**    | **✗ 13**          |
| **Fremde Coach-Gespräche** | **✗**   | **✗** | **✗ 14**    | **✗**             |

**Fußnoten**

1. Nur Bereich `downline`, ausschließlich Aggregate, keine Kontaktidentitäten
2. Nur wenn ausdrücklich erteilt. Keine Grundausstattung der Rolle, sondern Delegation im Einzelfall
3. Nur zeitlich begrenzt, zweckgebunden und protokolliert, siehe 2.4
4. Trennung Autor und Freigeber. Ein Admin darf Wissen schreiben, aber nicht selbst freigeben
5. Getrennt erteilbar, weil eine Ausleitung Daten der weiteren Kontrolle entzieht
6. Nur Prinzipale niedrigerer Stufe, nur betriebliche Felder, nie Rolle oder Berechtigungen
7. Rollenzuweisung bleibt beim Mandanteneigentümer. Ein Admin, der Rollen vergibt, kann sich Gehilfen schaffen
8. Nur strikt niedrigere Stufe. Andere `super_admin` sind ausgeschlossen
9. Nicht delegierbar. Diese Grenze trägt die Trennung zwischen Admin und Eigentümer
10. Systemanweisungen definieren die Compliance-Grenzen des Coaches
11. Wer geprüft wird, verwaltet das Protokoll nicht
12. Ausschließlich über den Notfallpfad aus 3.6, mit Grund, Zeitfenster und Protokoll
13. Auch für den Anbieter nicht. Für Support genügen Struktur und Konfiguration
14. Ohne Ausnahme. Coach-Gespräche enthalten die persönlichsten Inhalte des Systems. Es gibt keinen legitimen administrativen Grund, sie zu lesen

**Diese Matrix ist ab sofort die einzige Referenz.** Weicht eine Policy, Funktion oder Oberfläche davon ab, gilt die Matrix und die Abweichung ist ein Fehler.

---

# Teil 6: Sicherheitsprüfung der Szenarien

| #   | Szenario                          | Ergebnis       | Womit verhindert                                                                                                                            | Bewertung                                            |
| --- | --------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 1   | Leader sieht fremde Organisation  | **abgewiesen** | Mandantengrenze in jeder Policy als erste Bedingung, Organisationsfilter in `get_downline()` seit F1                                        | gedeckt, sofern F1 verifiziert ist                   |
| 2   | Leader ändert Rollen              | **abgewiesen** | `leader` ist keine Rolle mehr. `can_manage_roles` nur `super_admin`, Stufenregel                                                            | gedeckt                                              |
| 3   | Admin bearbeitet Super Admin      | **abgewiesen** | Stufenregel: strikt niedrigere Stufe. Admin 50 gegen Super-Admin 90                                                                         | gedeckt. War im alten Modell nicht beantwortbar, S11 |
| 4   | Berater öffnet fremde Kontakte    | **abgewiesen** | RLS auf Eigentum. Kontaktidentitäten sind für **keine** Rolle im Normalbetrieb sichtbar                                                     | gedeckt                                              |
| 5   | Manipulierte Nutzerkennung        | **abgewiesen** | Kein Fremdparameter, wo der eigene Nutzer gemeint ist. Bleibt einer, ist die Aufruferprüfung Pflicht. Lehre aus F1                          | gedeckt durch die Baseline                           |
| 6   | Manipulierte Organisationskennung | **abgewiesen** | Organisation kommt nie aus dem Aufruf, immer aus `current_org_id()`. Wo ein Parameter bleibt, wird er gegen die eigene Organisation geprüft | gedeckt                                              |
| 7   | Direkter RPC-Aufruf               | **abgewiesen** | Prüfung liegt im Funktionskörper, nicht im Aufrufer. Ausführungsrechte für `anon` entzogen                                                  | gedeckt                                              |
| 8   | Direkter API-Aufruf               | **abgewiesen** | Dieselbe RLS wie in der Oberfläche. Keine zweite Ebene, deshalb keine Lücke zwischen den Ebenen                                             | gedeckt                                              |
| 9   | KI fordert geschützte Daten an    | **abgewiesen** | Der Coach arbeitet unter der RLS des Nutzers. Geschützte Daten gelangen nicht in den Kontext. Retrieval filtert Status und Zielgruppe       | gedeckt                                              |

## 6.1 Zusätzlich geprüfte Szenarien

| #   | Szenario                                                         | Ergebnis   | Bemerkung                                                            |
| --- | ---------------------------------------------------------------- | ---------- | -------------------------------------------------------------------- |
| 10  | Admin erteilt sich selbst Rechte                                 | abgewiesen | Regel 1, keine Selbsterteilung                                       |
| 11  | Admin erteilt einem Berater mehr, als er selbst hat              | abgewiesen | Regel 2, keine Ausweitung durch Delegation                           |
| 12  | Kompromittierter Super-Admin entfernt den zweiten Eigentümer     | abgewiesen | Stufenregel, gleiche Stufe ist ausgeschlossen                        |
| 13  | Urlaubsvertretung behält Rechte dauerhaft                        | abgewiesen | Gültigkeitszeitraum, und die Prüffunktion vergleicht ihn immer       |
| 14  | Autor gibt eigenes Wissen frei                                   | abgewiesen | Trennung `can_manage_documents` und `can_approve_documents`          |
| 15  | Sponsor liest Kontaktnamen der Downline                          | abgewiesen | Aggregat statt Identität. Die zentrale Privacy-Grenze                |
| 16  | Anbieter greift ohne Anlass auf Mandantendaten zu                | abgewiesen | Zeitfenster, Zweckbindung, Protokoll, Sichtbarkeit für den Mandanten |
| 17  | Abgelaufenes Recht wirkt weiter, weil kein Aufräumlauf existiert | abgewiesen | Prüfung vergleicht den Zeitraum, verlässt sich nicht auf Bereinigung |
| 18  | Frontend blendet Schaltfläche aus, Angreifer ruft Schnittstelle  | abgewiesen | Frontend ist Darstellung, Datenbank ist Autorität                    |

## 6.2 Ein Szenario, das nicht vollständig gedeckt ist

| #   | Szenario                                                                  | Ergebnis             |
| --- | ------------------------------------------------------------------------- | -------------------- |
| 19  | Berater exportiert die eigene Kontaktliste und nimmt sie beim Wechsel mit | **nicht verhindert** |

Der Berater ist Eigentümer seiner Kontakte und darf sie lesen. Technisch ist das nicht zu unterbinden, und es wäre auch falsch: Es sind seine Kontakte.

Das ist keine technische, sondern eine vertragliche Frage, und sie gehört in die Nutzungsbedingungen, nicht in die Autorisierung. `can_export_reports` schränkt nur Auswertungen über andere ein. Ich führe es auf, weil ein Modell, das diese Lücke verschweigt, Sicherheit verspricht, die es nicht hat.

---

# Teil 7: Architekturprüfung

| Bereich                   | Auswirkung                                                                                                                                                                                     | Bewertung                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| **RLS**                   | Jede Policy erhält als dritten Teil die Berechtigungsprüfung. Bestehende Policies bleiben gültig, sie werden erweitert, nicht ersetzt                                                          | mittlerer Umfang, kein Bruch |
| **JWT-Ansprüche**         | **Keine Berechtigungen im Token.** Begründung unten                                                                                                                                            | keine Änderung nötig         |
| **`current_user_role()`** | Bleibt. Wird um die Stufenauflösung ergänzt, damit die Stufenregel prüfbar ist                                                                                                                 | kleine Erweiterung           |
| **`current_org_id()`**    | Bleibt unverändert und bleibt erste Bedingung jeder Policy                                                                                                                                     | keine Änderung               |
| **RPC-Funktionen**        | Prüfen künftig zusätzlich Berechtigungen. Die Baseline aus F1 gilt unverändert weiter                                                                                                          | Erweiterung je Funktion      |
| **Views**                 | `security_invoker` bleibt Standard. **`profiles_public` verliert die Spalte `role`**, siehe S5                                                                                                 | eine Änderung                |
| **Realtime**              | Abonnements unterliegen RLS. Wichtig: Ein Rechteentzug beendet ein bestehendes Abonnement nicht automatisch. Empfehlung: bei Rechteänderung die Sitzung des Betroffenen als ungültig markieren | Punkt für die Umsetzung      |
| **Storage**               | Heute nicht in Gebrauch. Sobald Dateien hinzukommen, gelten dieselben drei Policy-Teile. Ablagepfade müssen die Organisation enthalten, damit die Grenze am Pfad prüfbar ist                   | Vorgabe für später           |
| **Wissensdatenbank**      | Freigabe wird zweistufig, Autor und Freigeber getrennt. Retrieval erhält den Zielgruppenfilter                                                                                                 | passt zu F6                  |
| **KI**                    | Coach bleibt ohne eigene Rechte. `can_manage_ai` wird eigenständig                                                                                                                             | klein                        |

## 7.1 Die Entscheidung gegen Berechtigungen im Zugangstoken

Naheliegend wäre, Berechtigungen als eigene Ansprüche ins Token zu schreiben. Das würde die Auswertung in Policies verbilligen, weil kein Tabellenzugriff nötig ist.

**Ich empfehle es nicht.** Drei Gründe:

1. **Verzögerter Entzug.** Ein Token bleibt bis zum Ablauf gültig. Ein entzogenes Recht wirkt bis dahin weiter. Bei `can_manage_permissions` ist das nicht hinnehmbar
2. **Veraltete Ansprüche.** Eine neue Erteilung wirkt erst nach Erneuerung des Tokens. Nutzer erleben das als Fehler
3. **Zero Trust.** Der Anspruch kommt vom Client. Er ist signiert, aber sein Inhalt wurde zum Ausstellungszeitpunkt festgelegt. Autorität muss beim Server liegen

**Erlaubt bleibt** ein Anspruch mit der Organisation als reiner **Hinweis** für die Wegewahl im Frontend, ausdrücklich als nicht autoritativ gekennzeichnet und niemals in einer Policy verwendet.

Der Preis dieser Entscheidung ist Leistung. Gegenmaßnahme: Die Auflösungsfunktion ist `stable`, die Erteilungstabelle ist klein, und der Zugriff läuft über einen Index auf Prinzipal und Berechtigung. Bei Auswertungen über viele Personen wird die Prüfung einmal mengenweise durchgeführt.

---

# Teil 8: Zukunftssicherheit, fünf Jahre

## 8.1 Das größte Risiko: Identität ist an eine Organisation gebunden

**Befund.** `profiles.id` ist gleich `auth.users.id`, und `profiles.org_id` ist eine einzelne Spalte. Daraus folgt zwingend: **Eine Person kann in genau einer Organisation sein.**

**Wann das bricht.** In jedem dieser Fälle, und mindestens einer davon tritt in fünf Jahren ein:

- Ein Berater gehört zu zwei Teams, die als getrennte Mandanten geführt werden
- Ein Berater von Team Şeyda wechselt in ein anderes Team und soll seine Historie behalten
- Ein Trainer arbeitet für mehrere Mandanten
- Der Plattformbetreiber braucht ein eigenes Konto, das nicht in einem Mandanten hängt
- Ein Unternehmenskunde führt mehrere Marken als getrennte Mandanten mit gemeinsamem Personal

**Kosten einer späteren Behebung.** Sehr hoch. `profiles` müsste in Identität und Mitgliedschaft getrennt werden. Betroffen wären alle 22 Tabellen mit `org_id`, alle 31 Policies mit `current_org_id()`, `current_org_id()` selbst, weil es dann mehrdeutig wird, jede Sitzung bräuchte einen aktiven Mandanten, und die Genealogie wäre je Mitgliedschaft zu führen. Das ist kein Umbau, das ist ein zweites Fundament.

**Kosten einer Entscheidung heute.** Gering. Die Trennung von Identität und Mitgliedschaft ist eine Strukturentscheidung, die vor Phase 0 nahezu nichts kostet, weil die betroffenen Tabellen noch fast leer sind.

**Das ist die wichtigste Entscheidung dieses Meilensteins, und ich treffe sie nicht.** Drei Optionen:

| Option                                | Nutzen                                                                        | Kosten und Risiken                                                                                                                        | Empfehlung                                       |
| ------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **A: Grenze ausdrücklich annehmen**   | keine Arbeit jetzt                                                            | Bei Eintritt eines der fünf Fälle ein zweites Fundament. Enterprise-Verkauf mit gemeinsamem Personal wird unmöglich                       | nur, wenn Mehrmandantenfähigkeit aufgegeben wird |
| **B: Mitgliedschaft jetzt einführen** | Alle fünf Fälle bleiben offen. Der Plattformbetreiber wird sauber darstellbar | Ein Konzept mehr im Modell, jede Policy erhält eine Ebene, `current_org_id()` wird zu „aktive Mitgliedschaft". Aufwand jetzt überschaubar | **empfohlen**                                    |
| **C: Bewusst später**                 | Nichts jetzt, Entscheidung dokumentiert                                       | Kosten steigen mit jedem Datensatz. Der Zeitpunkt kommt erfahrungsgemäß, wenn ein Kunde wartet                                            | Notlösung                                        |

Zu beachten: Ihre Wissensdatenbank führt Skalierungsstufe 5 als Ziel und nennt Chogan, Essence Tribe und Team Şeyda als drei Ebenen. Option A widerspricht dem erklärten Ziel.

## 8.2 Weitere Risiken

| #   | Risiko                                                                                                              | Schwere  | Empfehlung                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Z1  | Keine Markenebene über der Organisation. Chogan, Essence Tribe und Team Şeyda sind drei Ebenen, das Modell hat zwei | mittel   | Jetzt nicht bauen, aber nie voraussetzen, dass `org_id` die oberste Ebene ist                                                           |
| Z2  | Zeitlich begrenzte Rechte brauchen eine Uhr                                                                         | mittel   | Die Prüffunktion vergleicht immer den Zeitraum. Regel steht in 3.2                                                                      |
| Z3  | Prüfprotokoll wächst unbegrenzt                                                                                     | niedrig  | Aufbewahrung nach Kategorie festlegen. Rechteänderungen dauerhaft, Zugriffe begrenzt                                                    |
| Z4  | Löschung nach DSGVO und die Kontakte eines ausgeschiedenen Beraters                                                 | **hoch** | Ungeklärt: Wem gehören Kontakte, wenn der Eigentümer geht. Braucht eine Aufbewahrungs- und Übergaberegel, bevor der erste Fall eintritt |
| Z5  | Auskunftspflicht nach DSGVO ist nicht umsetzbar                                                                     | hoch     | Es gibt keinen Weg, alle Daten einer Person auszugeben. Braucht eine eigene Berechtigung und einen Ausleitungspfad                      |
| Z6  | `profiles_public` gibt `role` org-weit aus                                                                          | mittel   | Spalte entfernen, siehe S5                                                                                                              |
| Z7  | Rechteentzug beendet ein Realtime-Abonnement nicht                                                                  | mittel   | Bei Rechteänderung Sitzung des Betroffenen ungültig machen                                                                              |
| Z8  | Kein Kundenzugang, aber die Wissensdatenbank sieht die Rolle Kunde vor                                              | mittel   | Produktentscheidung. Falls Kunden Zugang erhalten, kommt ein Prinzipaltyp ohne Genealogie hinzu                                         |
| Z9  | Leistung der Berechtigungsauflösung bei großen Strukturen                                                           | mittel   | Mengenweise Prüfung statt je Zeile, entspricht F12                                                                                      |
| Z10 | Mandantenübergreifende Auswertungen für den Anbieter                                                                | niedrig  | Nur über aggregierte, nicht personenbezogene Sichten                                                                                    |

**Z4 und Z5 sind DSGVO-Pflichten, keine Wünsche.** Beide sind heute nicht erfüllbar. Sie gehören in Phase 0, nicht in eine späte Phase.

---

# Teil 9: Architecture Review

## 9.1 Zusammenfassung

Das bestehende Modell hat drei Rollen, von denen eine wirkungslos ist, kein Berechtigungssystem, keine Delegation und keine Rangordnung. Der vorgeschlagene Ersatz mit fünf Rollen hätte das Grundproblem nicht behoben, sondern verschoben: Er kodiert weiterhin Beziehung und Rang als Rollen.

Der hier entworfene Ersatz besteht aus drei Rollen, einem Prinzipal außerhalb der Mandanten, 18 Berechtigungen mit Geltungsbereich, drei Regeln gegen Rechteausweitung und einem Notfallpfad. Beziehung und Rang bleiben Daten.

Alle neun geforderten Szenarien werden abgewiesen, dazu neun weitere, die ich ergänzt habe. Ein Szenario wird ausdrücklich **nicht** abgewiesen und ist als vertragliche Frage gekennzeichnet.

## 9.2 Stärken

1. **Eine Wahrheitsquelle.** Eine Auflösungsfunktion für alle Ebenen. F1 hat gezeigt, was die Alternative kostet
2. **Geltungsbereich statt Vervielfachung.** 18 Berechtigungen mit vier Bereichen ersetzen sonst über 70 Einzelrechte
3. **Delegation ohne Rechteausweitung.** Drei Regeln, die zusammen jede bekannte Ausweitungsroute schließen
4. **Kontaktidentitäten sind für niemanden im Normalbetrieb sichtbar.** Privacy by Design an der sensibelsten Stelle, auch gegen Admin und Eigentümer
5. **Rang bleibt Daten.** Eine Planänderung durch Chogan erzwingt keine Migration
6. **Der Plattformbetreiber ist von Anfang an vorgesehen.** Zeitbegrenzt, zweckgebunden, protokolliert
7. **Frontend ist ausdrücklich nicht Sicherheit.** Verhindert die häufigste Fehlannahme in Berechtigungssystemen

## 9.3 Schwächen

1. **Höhere Einstiegskomplexität.** Rolle plus Berechtigung plus Bereich ist mehr als eine Spalte. Gegenmaßnahme: Rollen bringen sinnvolle Grundausstattungen mit, sodass der Normalfall keine Erteilung braucht
2. **Leistungskosten durch die Entscheidung gegen Token-Ansprüche.** Bewusst in Kauf genommen, weil sofortiger Entzug wichtiger ist
3. **Nur additiv, keine Verbotslisten.** Weniger Feinsteuerung, dafür nachvollziehbar
4. **Der Notfallpfad ist eine Ermessensentscheidung.** Er kann missbraucht werden. Gegenmaßnahme ist ausschließlich die Sichtbarkeit für den Betroffenen
5. **Die Trennung Autor und Freigeber braucht mindestens zwei Personen.** In einer kleinen Organisation ist das lästig. Ich empfehle trotzdem, es nicht aufzuweichen

## 9.4 Risiken

Vollständig in Teil 8. Nach Schwere:

| Priorität | Risiko                                                                  |
| --------- | ----------------------------------------------------------------------- |
| 1         | 8.1, Identität an eine Organisation gebunden. Entscheidung erforderlich |
| 2         | Z4, Kontakte eines ausgeschiedenen Beraters. DSGVO                      |
| 3         | Z5, Auskunftspflicht nicht umsetzbar. DSGVO                             |
| 4         | Z1, keine Markenebene                                                   |
| 5         | Z6, `role` in `profiles_public`                                         |
| 6         | Z7, Realtime nach Rechteentzug                                          |
| 7         | Z9, Leistung bei großen Strukturen                                      |

## 9.5 Empfohlene Änderungen, mit Begründung

Nach Ihren Arbeitsregeln jede mit Nutzen, Risiko, Alternative und Auswirkung.

**Ä1: Mitgliedschaft von Identität trennen.** Siehe 8.1. Nutzen: alle fünf Mehrmandantenfälle bleiben offen. Risiko: eine Ebene mehr in jeder Policy. Alternative: Grenze annehmen und Mehrmandantenfähigkeit aufgeben. Auswirkung: `current_org_id()` wird zu „aktive Mitgliedschaft", alle 31 Policies erhalten eine Indirektion. **Freigabe erforderlich.**

**Ä2: `role` aus `profiles_public` entfernen.** Nutzen: der Betreiber ist nicht mehr org-weit identifizierbar. Risiko: gering, sofern keine Oberfläche das Feld nutzt. Alternative: belassen und in Kauf nehmen. Auswirkung: eine Änderung an einem View. **Empfohlen.**

**Ä3: Aufbewahrung und Übergabe von Kontakten festlegen.** Nutzen: DSGVO-Pflicht erfüllt, Z4. Risiko: keins technisch, es ist eine Regelfrage. Alternative: keine. Auswirkung: eine Regel plus ein Übergabepfad. **Erforderlich vor dem ersten Ausscheiden eines Beraters.**

**Ä4: Auskunfts- und Löschpfad nach DSGVO.** Nutzen: Z5. Risiko: der Pfad selbst ist ein Zugriffsweg auf personenbezogene Daten und braucht dieselbe Härte wie der Notfallpfad. Alternative: keine, es ist eine gesetzliche Pflicht. Auswirkung: eine Berechtigung, ein Ausleitungspfad, Protokollpflicht. **Erforderlich.**

**Ä5: `leader` als überholt markieren, nicht entfernen.** Nutzen: keine Migration, keine Scheinsicherheit mehr. Risiko: keins, null Profile betroffen. Alternative: sofort entfernen, kostet eine Migration ohne Gewinn. Auswirkung: Dokumentation. **Empfohlen.**

## 9.6 Offene Punkte

| #   | Offener Punkt                                         | Entscheider   |
| --- | ----------------------------------------------------- | ------------- |
| O1  | Ä1, Mitgliedschaft trennen oder Grenze annehmen       | Sie           |
| O2  | Produktname AscendOS oder AscentOS, siehe 0.5         | Sie           |
| O3  | Symbol-Asset aus dem Logo gewinnen, Beschnitt aus 0.3 | Sie, dann ich |
| O4  | Erhalten Kunden Zugang, Z8                            | Sie           |
| O5  | Aufbewahrungsfrist für das Prüfprotokoll je Kategorie | Sie           |
| O6  | Grundausstattung je Rolle im Detail festlegen         | ich, nach O1  |

## 9.7 Langfristige Skalierbarkeit

| Zeitraum                                   | Tragfähigkeit                         |
| ------------------------------------------ | ------------------------------------- |
| 1 Jahr, ein Mandant                        | tragfähig ohne Ä1                     |
| 2 bis 3 Jahre, mehrere Teams als Mandanten | tragfähig nur mit Ä1                  |
| 3 bis 5 Jahre, Unternehmenskunden          | Ä1, Ä3, Ä4 und Z1 erforderlich        |
| über 5 Jahre, mehrere Marken               | Markenebene über der Organisation, Z1 |

Das Berechtigungssystem selbst, also 18 Berechtigungen mit Geltungsbereich und drei Ausweitungsregeln, halte ich ohne Umbau über fünf Jahre für tragfähig. Neue Bereiche kommen als neue Berechtigungen hinzu, nicht als neue Rollen. Das war das Ziel.

Der begrenzende Faktor ist nicht das Rollenmodell, sondern 8.1.

---

# Abschluss

## NEIN

Das Rollen- und Berechtigungsmodell ist **nicht produktionsreif**.

Der Entwurf ist vollständig und in sich stimmig. Er ist es aber nicht als Umsetzungsgrundlage, weil eine Entscheidung offen ist, die das Fundament betrifft, und weil zwei gesetzliche Pflichten heute nicht erfüllbar sind. Würde jetzt implementiert, entstünde entweder ein Modell, das bei der ersten Mehrmandantenanforderung ein zweites Fundament braucht, oder eines, das die DSGVO-Pflichten nachträglich aufgesetzt bekommt.

## Blocker nach Priorität

| Priorität | Blocker                                                                                                   | Art            | Behebung                                                                                                                     |
| --------- | --------------------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **1**     | **Ä1, Identität an eine Organisation gebunden.** Entscheidung erforderlich, bevor irgendetwas gebaut wird | Fundament      | Ihre Freigabe für Option A, B oder C aus 8.1                                                                                 |
| **2**     | **Ä3, Aufbewahrung und Übergabe von Kontakten**                                                           | DSGVO          | Regel festlegen                                                                                                              |
| **3**     | **Ä4, Auskunfts- und Löschpfad**                                                                          | DSGVO          | Berechtigung und Pfad entwerfen                                                                                              |
| **4**     | O1 bis O6, offene Punkte aus 9.6                                                                          | Entscheidungen | siehe Tabelle                                                                                                                |
| **5**     | F1 unverifiziert                                                                                          | Voraussetzung  | Der Organisationsfilter in `get_downline()` trägt Szenario 1. Solange F1 nicht verifiziert ist, ist diese Deckung unbewiesen |

Blocker 5 verdient eine ausdrückliche Bemerkung: Szenario 1 der Sicherheitsprüfung, Leader sieht fremde Organisation, wird durch den Organisationsfilter abgewiesen, den F1 einführt. Dieser Filter ist geschrieben, aber nie ausgeführt. Bis zur Verifikation von F1 ist die Deckung von Szenario 1 eine begründete Annahme, kein Nachweis.

## Was ich nicht getan habe

Keine Implementierung, keine Migration, kein SQL, keine Oberfläche. Reine Architektur, wie vorgegeben.

Ich habe außerdem keine der fünf vorgeschlagenen Rollen einfach übernommen. Wo ich abweiche, steht die Begründung in 1.4. Sollten Sie an `leader` und `senior_leader` als Rollen festhalten wollen, setze ich das um, dann aber mit dem ausdrücklichen Vermerk, dass Rang damit an ein Datenmodell gebunden wird, das sich bei jeder Planänderung durch Chogan verschiebt.
