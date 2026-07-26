# F2: Endgültige Autorisierungsarchitektur

Verbindliche Grundlage für die Implementierung.
Datum: 25. Juli 2026. Keine Implementierung, keine Migration, kein SQL.

Beruht auf zwei freigegebenen Entscheidungen:
1. Produktname **AscendOS**, KI-Coach **Ascent**.
2. Identität und Organisationszugehörigkeit werden logisch getrennt. Eine Person kann mehreren Organisationen angehören.

Diese Fassung ersetzt den Entwurf aus Meilenstein 2 vollständig.

---

# Teil 0: Benennung, abgeschlossen

## 0.1 Markenfrage: keine Abweichung

Sie hatten die Dokumentation eines Branding-Themas nur für den Fall verlangt, dass die Wortmarke von der beschlossenen Schreibweise abweicht. Ich habe die Wortmarke vermessen, statt sie zu beurteilen.

| Abschnitt der Wortmarke | Bereich | Deckungsgrad |
|---|---|---|
| ASCEND | x 389 bis 975 | 15,98 Prozent |
| OS | x 985 bis 1148 | 37,35 Prozent |

`OS` trägt mehr als die doppelte Deckung von `ASCEND`. Das ist keine Zufälligkeit der Buchstabenformen, sondern ein bewusster typografischer Gewichtungswechsel: leichter Schnitt für `ASCEND`, fetter Schnitt für `OS`.

Die Wortmarke ist damit strukturell als **ASCEND + OS** gesetzt und in Versalien ausgeführt. Die beschlossene Textschreibweise **AscendOS** ist genau diese Zusammensetzung in gemischter Schreibung.

**Ergebnis: keine Abweichung. Es gibt kein Branding-Thema zu dokumentieren, und am Logo ist nichts zu tun.**

Der frühere Widerspruch lag nicht im Logo, sondern in der Schreibweise „AscentOS" in den Auftragsdokumenten. Er ist mit Ihrer Entscheidung erledigt.

## 0.2 Verbindliche Schreibregeln

| Begriff | Korrekt | Falsch |
|---|---|---|
| Produkt | **AscendOS** | AscentOS, Ascend OS, ASCENDOS im Fließtext, AscendOs |
| KI-Coach | **Ascent** | Ascend, AscentAI, Coach |
| Wortmarke im Logo | ASCENDOS in Versalien | jede andere Auszeichnung |

**Warnung, die in die Vorlagen gehört:** Produkt und Coach unterscheiden sich in einem einzigen Buchstaben, **Ascend** gegen **Ascent**. Diese Verwechslung wird ohne Regel dauerhaft auftreten, und jemand wird eines von beiden „korrigieren". Merkregel: Das Produkt steigt auf, `Ascend`. Der Coach ist der Aufstieg selbst, `Ascent`.

Betrifft ab sofort: alle Dokumente, ADRs, Wireframes, UI-Texte, Systemanweisungen, Fehlermeldungen, Prüfungsnamen.

## 0.3 Logo, unverändert übernommen

Original abgelegt unter `docs/brand/ascendos-logo-original.png`, bitweise identisch zur Lieferung. Die vermessenen Vorgaben aus Meilenstein 2 gelten unverändert weiter:

| Vorgabe | Wert |
|---|---|
| Symbolquelle | Beschnitt Ursprung x 589, y 200, Größe 360 x 308 |
| Seitenverhältnis Symbol | 1,169 zu 1, in quadratischen Feldern zentrieren, nie strecken |
| Mindestschutzraum | 18 Prozent der Symbolhöhe |
| Mindestgröße | 16 Pixel Favicon, 24 Pixel Navigation |
| Coach-Header | ausschließlich Symbol, oben rechts, transparent |

---

# Teil 1: Das beschlossene Identitätsmodell

## 1.1 Drei Ebenen statt einer

Die Trennung erzeugt drei Begriffe, die sauber auseinandergehalten werden müssen. Jede Verwechslung an dieser Stelle erzeugt später eine Sicherheitslücke.

| Ebene | Was sie ist | Anzahl | Beispiel |
|---|---|---|---|
| **Identität** | ein Mensch, ein Anmeldekonto | eine je Person | Baran |
| **Mitgliedschaft** | die Zugehörigkeit einer Identität zu einer Organisation | beliebig viele je Identität | Baran bei Team Şeyda |
| **Organisation** | der Mandant | beliebig viele | Team Şeyda, ein Fremdteam |

**Die Mitgliedschaft ist die zentrale Einheit der Autorisierung.** Nicht die Identität. Jede Rolle, jede Berechtigung, jede Genealogiebeziehung und jeder operative Datensatz hängt an einer Mitgliedschaft.

Begründung: Eine Identität sagt nur, wer jemand ist. Was jemand darf, ergibt sich immer aus dem Kontext einer Organisation. Ohne diese Trennung ist Ihre Entscheidung nicht umsetzbar.

## 1.2 Was wohin gehört

Diese Zuordnung ist die wichtigste Tabelle des ganzen Dokuments. Eine falsche Einordnung führt entweder zu Datenverlust beim Wechsel oder zu einem Datenleck zwischen Organisationen.

| Angabe | Ebene | Begründung |
|---|---|---|
| Anmeldedaten, E-Mail | Identität | Ein Mensch, ein Konto |
| Vorname, Nachname | Identität | Der Name ändert sich nicht je Organisation |
| Benutzername | Identität, **global eindeutig** | Siehe FD-3 in Teil 10 |
| Sprache, Anzeigeeinstellungen | Identität | persönliche Voreinstellung |
| **Rolle** | **Mitgliedschaft** | Berater in einer Organisation, Admin in einer anderen |
| **Berechtigungen** | **Mitgliedschaft** | ausdrücklich so entschieden |
| **Team** | **Mitgliedschaft** | Teams gehören zu Organisationen |
| **Sponsor** | **Mitgliedschaft** | Siehe 1.5 |
| Kontakte | **Mitgliedschaft** | Siehe 1.6 |
| Coach-Gespräche | **Mitgliedschaft** | Wissenskontext ist organisationsspezifisch |
| Punkte, Rang, Lizenzstatus | **Mitgliedschaft** | PT in einer Organisation hat mit einer anderen nichts zu tun |
| Pipeline-Ereignisse | **Mitgliedschaft** | Geschäftsvorfall in einem Mandanten |
| Journey-Fortschritt | **Mitgliedschaft** | Journeys tragen bereits `org_id` |
| Auszeichnungen | **Mitgliedschaft** | Bezug auf organisationsspezifische Ziele |
| Nutzungsereignisse | **Mitgliedschaft** | Kennzahlen sind mandantenbezogen |

**Faustregel für jede künftige Tabelle:** Wenn eine Angabe in zwei Organisationen unterschiedlich sein kann oder unterschiedlich sein darf, gehört sie an die Mitgliedschaft. Im Zweifel: Mitgliedschaft. Der Fehler in die eine Richtung ist eine Redundanz, in die andere Richtung ein Datenleck.

## 1.3 Die aktive Organisation

Sobald eine Person mehreren Organisationen angehören kann, ist die Frage „welche Organisation gilt gerade" nicht mehr aus den Daten allein beantwortbar. Sie braucht einen Selektor.

**Kernunterscheidung, von der alles Weitere abhängt:**

> Die aktive Organisation ist ein **Selektor**, keine Berechtigung.

Sie sagt, **welche** Mitgliedschaft betrachtet wird. Sie sagt nicht, **ob** sie gültig ist. Die Gültigkeit wird immer serverseitig gegen die Mitgliedschaften geprüft.

Damit ist es zulässig, dass der Selektor vom Client kommt, obwohl das auf den ersten Blick nach Vertrauen in den Client aussieht. Der Client wählt eine Sichtweise, der Server entscheidet, ob sie ihm zusteht. Das ist die gleiche Logik wie bei einer Kennung in einer Abfrage: Der Client darf sie nennen, der Server prüft sie.

**Auflösungsregel, vier Fälle, in dieser Reihenfolge:**

| Fall | Verhalten |
|---|---|
| Selektor gesetzt und zeigt auf eine aktive Mitgliedschaft der Identität | diese Organisation gilt |
| Selektor gesetzt, zeigt aber nicht auf eine aktive Mitgliedschaft | **abweisen.** Nicht auf eine andere ausweichen |
| Selektor nicht gesetzt, Identität hat genau eine aktive Mitgliedschaft | diese gilt |
| Selektor nicht gesetzt, Identität hat mehrere aktive Mitgliedschaften | **abweisen** |

Der vierte Fall ist die wichtigste Regel dieses Abschnitts: **Bei Mehrdeutigkeit wird abgewiesen, nie geraten.** Ein System, das bei zwei Mitgliedschaften „die erste" nimmt, erzeugt einen mandantenübergreifenden Datenzugriff, der nur bei bestimmten Sortierungen auftritt und deshalb kaum reproduzierbar ist.

Der dritte Fall stellt sicher, dass der heutige Zustand unverändert funktioniert. Alle bestehenden Nutzer haben genau eine Mitgliedschaft.

**Auswirkung auf `current_org_id()`.** Die Funktion bleibt im Namen, ändert aber ihre Bedeutung: Sie liefert nicht mehr „die Organisation des Profils", sondern „die validierte aktive Organisation". Alle 31 Policies, die sie verwenden, bleiben unverändert gültig. Das ist der wesentliche Grund, diese Änderung jetzt vorzunehmen: Die Indirektion liegt in einer Funktion, nicht in 31 Policies.

## 1.4 Zustände einer Mitgliedschaft

| Zustand | Bedeutung | Zugriff | Historie |
|---|---|---|---|
| `pending` | eingeladen, noch nicht angenommen | keiner | entsteht erst |
| `active` | regulär | vollständig gemäß Rolle und Berechtigungen | wächst |
| `suspended` | vorübergehend gesperrt | keiner | bleibt vollständig |
| `ended` | ausgeschieden | keiner | bleibt vollständig |

**Mitgliedschaften werden niemals gelöscht, nur beendet.** Das ist die technische Umsetzung Ihrer Vorgabe, dass Historien erhalten bleiben und ein Organisationswechsel keine Daten verliert. Ein Wechsel ist: alte Mitgliedschaft auf `ended`, neue Mitgliedschaft anlegen. Beide Datenbestände bleiben, getrennt und zuordenbar.

`suspended` ist bewusst von `ended` getrennt. Eine Sperre während einer Compliance-Prüfung darf nicht als Ausscheiden erscheinen, weil das die Genealogie und die Provisionsberechnung verändern würde.

**Nicht zu verwechseln:** Der Insider-Status aus der Wissensdatenbank, also der Verlust der Beraterlizenz nach sechs Monaten ohne 300 AP, ist **kein** Mitgliedschaftszustand. Er ist ein Attribut der Mitgliedschaft und liegt im Lizenzstatus. Ein Insider bleibt `active` und verdient dem Sponsor weiter 12,5 Prozent. Diese Trennung ist wichtig, weil eine Zusammenlegung die Vergütung falsch berechnen würde.

## 1.5 Genealogie pro Mitgliedschaft

Der Sponsor verweist auf eine **Mitgliedschaft**, nicht auf eine Identität.

Begründung: Eine Person kann in Organisation A von X gesponsert sein und in Organisation B von Y. Ein Verweis auf die Identität könnte diesen Unterschied nicht abbilden.

**Zwingende Strukturregel:** Eine Sponsorbeziehung verbindet ausschließlich Mitgliedschaften **derselben** Organisation. Eine Beziehung über Organisationsgrenzen ist kein Sonderfall, sondern ein Fehler. Sie würde die Deckelung pro Linie und damit den gesamten Vergütungsplan unberechenbar machen.

**Auswirkung auf die bestehenden Funktionen.** `is_ancestor_of()` und `get_downline()` arbeiten künftig auf Mitgliedschaften innerhalb einer Organisation. Der Organisationsfilter, den F1 einführt, wird dadurch nicht überflüssig, sondern präziser: Er filtert dann nicht auf `profiles.org_id`, sondern auf die Organisation der Mitgliedschaft. Die Logik der Rekursion bleibt identisch.

## 1.6 Kontakte: Zuordnung und Verantwortlichkeit

Dies ist die heikelste Einordnung im ganzen Modell, weil sie Datenschutz, Geschäftsinteresse und Ihre Vorgabe zur Historie gleichzeitig berührt.

**Verantwortlicher im Sinne der DSGVO ist die Organisation**, nicht der Berater. Die Organisation legt Zweck und Mittel der Verarbeitung fest, der Berater arbeitet in ihrem System. Ein Interessent, dessen Name erfasst wird, hat seine Rechte gegenüber der Organisation.

Daraus folgt zwingend:

1. Kontakte hängen an der **Mitgliedschaft**, in deren Kontext sie entstanden sind.
2. Beim Ausscheiden bleiben sie bei der Organisation. Die Historie bleibt vollständig.
3. Der Zugriff des Beraters endet mit der Mitgliedschaft, weil er nicht mehr für die Organisation handelt.
4. Kontakte einer Organisation erscheinen **nie** in einer anderen, auch nicht bei derselben Person. Das ist die Trennlinie, die ein Mehrmandantenmodell überhaupt zulässig macht.

**Ein Parameter bleibt geschäftlich zu entscheiden**, nicht technisch: Erhält ein ausscheidender Berater eine Ausleitung seiner Kontakte? Die Architektur trägt beides. Voreinstellung ist nein, weil das die datenschutzrechtlich klare Variante ist. Eine Ausleitung wäre kein Architekturthema, sondern eine Regel in den Nutzungsbedingungen plus ein protokollierter Ausleitungspfad. Siehe Teil 8.4.

## 1.7 Einladung und Registrierung trennen sich

Heute erzeugt eine Einladung genau einen Weg: neues Konto plus Profil. Künftig gibt es zwei Wege, und die Unterscheidung ist verpflichtend:

| Fall | Ergebnis |
|---|---|
| Die eingeladene Person hat noch keine Identität | Identität anlegen **und** Mitgliedschaft anlegen |
| Die eingeladene Person hat bereits eine Identität | **nur** Mitgliedschaft anlegen, keine zweite Identität |

Der zweite Fall existiert heute nicht und ist die häufigste Fehlerquelle bei dieser Art Umstellung. Wird er übersehen, entstehen Doppelidentitäten desselben Menschen, die sich nachträglich nur unter Datenverlust zusammenführen lassen.

**Sicherheitshinweis dazu:** Der Weg über eine bestehende Identität darf niemals darüber entscheiden, ob eine E-Mail bereits registriert ist. Andernfalls wird die Einladungsstrecke zu einem Werkzeug, um Kontoexistenz abzufragen. Die Prüfung gehört hinter die Anmeldung: Erst wer sich anmeldet, löst die Einladung ein, und erst dann entscheidet das System zwischen den beiden Wegen.

---

# Teil 2: Rollenmodell

Rollen kodieren ausschließlich **Funktion**. Beziehung ergibt sich aus der Genealogie, Rang aus der Vergütungsberechnung. Diese Grundentscheidung aus dem Entwurf bleibt unverändert und wird durch die Mehrorganisationsfähigkeit bestätigt: Eine Rolle, die an einer Identität hängen würde, wäre in zwei Organisationen zwangsläufig falsch.

**Die Rolle hängt an der Mitgliedschaft.** Dieselbe Person kann Berater in einer und Admin in einer anderen Organisation sein.

| Rolle | Stufe | Ebene | Anzahl |
|---|---|---|---|
| `berater` | 10 | Mitgliedschaft | beliebig |
| `admin` | 50 | Mitgliedschaft | wenige je Organisation |
| `super_admin` | 90 | Mitgliedschaft | mindestens einer, empfohlen zwei |
| `platform_operator` | 99 | **Identität, ohne Mitgliedschaft** | sehr wenige |

Die Stufe existiert für eine einzige Regel: Verändert werden dürfen nur Prinzipale mit **strikt niedrigerer** Stufe.

## 2.1 berater

**Zweck.** Vertriebspartner mit Lizenz in einer Organisation.

**Sichtbar.** Alles Eigene innerhalb dieser Mitgliedschaft. Von der eigenen Downline: Aggregate zu Aktivität, Rang, Journey und Fristen. Von der Organisation: Teamliste, freigegebenes Wissen, Produkte, Termine, Nachrichten.

**Änderbar.** Eigenes Profil auf Identitätsebene ohne die geschützten Felder. Eigene Kontakte, Ereignisse, Ziele, Punkte innerhalb der Mitgliedschaft. Einladungen mit Rolle `berater`.

**Verboten.**
- Kontakte anderer Personen, auch in der eigenen Downline
- Coach-Gespräche anderer Personen
- Sidelines
- **Alles aus anderen Organisationen, auch aus eigenen anderen Mitgliedschaften.** Neu und wichtig: Die Trennung gilt auch innerhalb derselben Identität. Wer in zwei Organisationen ist, sieht in jeder nur deren Daten
- Wissensentwürfe

**Verboten an Aktionen.** Rollen oder Berechtigungen vergeben, Wissen freigeben, Produkte oder Preise ändern, Nachrichten veröffentlichen, Einstellungen ändern, fremde Profile bearbeiten, Admin- oder Eigentümer-Einladungen erzeugen.

## 2.2 admin

**Zweck.** Operativer Delegierter in **einer** Organisation.

**Sichtbar.** Wie `berater`, zusätzlich bei erteilter Berechtigung: Wissensentwürfe, organisationsweite Aggregate, Nutzerliste, Wissenslücken.

**Änderbar.** Inhalte gemäß Berechtigung. Mitgliedschaften von Prinzipalen **niedrigerer Stufe**, und dort nur die betrieblichen Felder.

**Verboten, hart und nicht delegierbar.**
- Berechtigungen erteilen oder entziehen
- Rollen zuweisen
- Einen `super_admin` oder einen anderen `admin` bearbeiten
- Sich selbst Berechtigungen erteilen
- Die eigene Rolle ändern
- Die Organisation löschen
- **Identitätsdaten bearbeiten.** Neu: Ein Admin verwaltet Mitgliedschaften, nicht Menschen. Name, E-Mail und Benutzername gehören der Identität und damit der Person. Ein Admin, der sie ändern könnte, könnte eine Identität übernehmen

Der letzte Punkt ist eine unmittelbare Folge der Trennung und war im alten Modell nicht formulierbar, weil dort alles in einer Tabelle lag.

## 2.3 super_admin

**Zweck.** Mandanteneigentümer einer Organisation.

**Sichtbar.** Alles in der eigenen Organisation, **mit zwei Ausnahmen**: Kontakte und Coach-Gespräche anderer Personen. Zugriff darauf nur über den Notfallpfad aus Teil 3.6.

**Verboten.**
- Die eigene Rolle ändern
- Einen anderen `super_admin` bearbeiten, gleiche Stufe genügt nicht
- Fremde Organisationen berühren, auch wenn dieselbe Identität dort Mitglied ist
- Identitätsdaten bearbeiten, siehe 2.2
- Das Prüfprotokoll verändern oder löschen

**Begründung zur Regel bei gleicher Stufe.** Ohne sie genügt ein übernommenes Konto, um alle weiteren Eigentümer zu entfernen und den Mandanten zu übernehmen. Mit ihr braucht die Entfernung eines Eigentümers einen zweiten Eigentümer oder den Plattformbetreiber.

## 2.4 platform_operator

Die Trennung von Identität und Mitgliedschaft löst hier ein Problem, das im alten Modell nur umschrieben werden konnte.

**Ein Plattformbetreiber ist eine Identität ohne Mitgliedschaft.** Er erscheint in keiner Teamliste, ist in keiner Organisation Mitglied und ist von Mandantenadmins strukturell unterscheidbar. Im alten Modell hätte er ein Profil mit einer `org_id` gebraucht und wäre damit in einem Mandanten sichtbar geworden.

**Drei zwingende Eigenschaften jedes Zugriffs:**

1. **Zeitlich begrenzt.** Jeder Zugriff auf einen Mandanten hat ein Ablaufdatum, ohne Ausnahme
2. **Zweckgebunden und protokolliert.** Grund ist Pflichtangabe, Protokolleintrag entsteht automatisch
3. **Für den Mandanten sichtbar.** Der Eigentümer sieht Zeitpunkt, Dauer und Grund

**Verboten, auch für den Plattformbetreiber:** Kontakte und Coach-Gespräche. Für Support genügen Struktur, Konfiguration und Fehlerzustände.

Ohne diesen Prinzipal ist AscendOS nicht an Unternehmen verkäuflich. Jede Sicherheitsprüfung fragt, wer beim Anbieter Zugriff hat, wie lange und wie es nachweisbar ist.

## 2.5 Was bewusst keine Rolle wird

| Konzept | Wo es hingehört | Begründung |
|---|---|---|
| Leader, Teamleitung | Beziehung, `is_ancestor_of()` | dynamisch, veraltet als Rolle |
| Senior Leader und 14 weitere Stufen | Rangberechnung | 16 Stufen, und die Wissensdatenbank führt eine Planschwelle bereits als VERALTET. Als Rolle würde jede Planänderung eine Migration erzwingen |
| Insider | Lizenzstatus der Mitgliedschaft | Zustand, nicht Funktion |
| Kunde | offene Produktentscheidung | siehe Teil 10, FD-5 |
| Produktpfleger, Wissensredakteur | Berechtigung | genau der Fall, für den Berechtigungen existieren |

Der bestehende Wert `leader` bleibt als überholt markiert im Datenmodell, wird niemandem zugewiesen und in einer späteren Aufräum-Migration entfernt. Null Profile betroffen.

---

# Teil 3: Berechtigungssystem

## 3.1 Erteilungen hängen an der Mitgliedschaft

Eine Erteilung gilt für eine Mitgliedschaft, nicht für eine Identität. Damit ist ausgeschlossen, dass eine Berechtigung aus einer Organisation in eine andere durchschlägt.

## 3.2 Geltungsbereich

| Bereich | Bedeutung |
|---|---|
| `self` | nur eigene Daten innerhalb der Mitgliedschaft |
| `downline` | eigene Struktur, über `is_ancestor_of()` innerhalb der Organisation |
| `team` | eigenes Team |
| `org` | die gesamte Organisation der Mitgliedschaft |

Es gibt bewusst **keinen** Bereich über die Organisation hinaus. Ein solcher Bereich wäre der einzige Weg, die Mandantengrenze zu durchbrechen, und er soll nicht existieren. Mandantenübergreifende Sichten sind ausschließlich dem Plattformbetreiber möglich, über den gesonderten, protokollierten Pfad, und auch dort nur auf Aggregate.

## 3.3 Aufbau einer Erteilung

| Bestandteil | Zweck |
|---|---|
| Mitgliedschaft | wer, in welcher Organisation |
| Berechtigung | was |
| Geltungsbereich | über wen |
| Gültig ab, gültig bis | zeitlich begrenzte Rechte |
| Erteilt von, erteilt am | Prüfbarkeit |
| Grund | Nachvollziehbarkeit |

**Zwei Regeln:**

1. **Die Prüffunktion vergleicht immer den Gültigkeitszeitraum.** Sie verlässt sich nie auf einen Aufräumlauf. Es gibt heute keinen Zeitplan, und ohne diese Regel bliebe ein abgelaufenes Recht wirksam
2. **Erteilungen sind unveränderlich.** Änderung heißt beenden und neu anlegen. Der Verlauf bleibt lückenlos

## 3.4 Wirksame Berechtigungen

Wirksam ist die Vereinigung aus der Grundausstattung der Rolle und den ausdrücklichen Erteilungen der Mitgliedschaft. **Ausschließlich additiv, keine Verbotslisten.**

Begründung: Eine Mischung aus Erlauben und Verbieten erzeugt Auflösungsfragen, die nach wenigen Jahren niemand sicher beantwortet. Ist eine Rolle zu weit, wird die Rolle geändert. Der Preis ist geringere Feinsteuerung, der Gewinn Nachvollziehbarkeit.

## 3.5 Die Berechtigungen

**Team und Struktur**

| Berechtigung | Zulässiger Bereich |
|---|---|
| `can_view_team` | downline, team, org |
| `can_manage_team` | downline, team |

**Inhalte**

| Berechtigung | Zulässiger Bereich |
|---|---|
| `can_manage_documents` | org |
| `can_approve_documents` | org |
| `can_manage_training` | org |
| `can_manage_products` | org |
| `can_manage_news` | org, team |
| `can_manage_events` | org |

Die Trennung von `can_manage_documents` und `can_approve_documents` bleibt bestehen. Die Wissensdatenbank verlangt eine Freigabe durch eine zweite Person. Fällt beides zusammen, ist die Freigabe eine Formsache, und Wissen ist für Ascent oberste Wahrheit.

**Auswertung**

| Berechtigung | Zulässiger Bereich |
|---|---|
| `can_view_reports` | downline, team, org |
| `can_export_reports` | downline, team, org |
| `can_manage_dashboard` | org |

**Nutzer und Rechte**

| Berechtigung | Zulässiger Bereich |
|---|---|
| `can_manage_users` | org |
| `can_manage_roles` | org |
| `can_manage_permissions` | org, ausschließlich `super_admin`, nicht delegierbar |

**Betrieb**

| Berechtigung | Zulässiger Bereich |
|---|---|
| `can_manage_settings` | org |
| `can_manage_ai` | org |
| `can_manage_system` | org |
| `can_view_audit` | org |

**Datenschutz, neu gegenüber dem Entwurf**

| Berechtigung | Zulässiger Bereich | Zweck |
|---|---|---|
| `can_manage_privacy` | org | Auskunft und Löschung nach DSGVO durchführen |

Diese Berechtigung ist neu und notwendig, weil die DSGVO-Pflichten sonst über `can_manage_users` mitliefen und damit an jeden Nutzerverwalter gingen. Sie ist ausschließlich `super_admin` zugänglich und jeder Aufruf ist protokollpflichtig.

Damit sind es **19 Berechtigungen**.

## 3.6 Vier unverhandelbare Regeln gegen Rechteausweitung

**Regel 1: Keine Selbsterteilung.** Ein Prinzipal kann sich niemals selbst eine Berechtigung erteilen.

**Regel 2: Keine Ausweitung durch Delegation.** Man kann nur erteilen, was man selbst besitzt, und nur in einem Bereich, der nicht weiter ist als der eigene.

**Regel 3: Stufenregel.** Nur strikt niedrigere Stufe.

**Regel 4, neu und durch die Mehrorganisationsfähigkeit notwendig: Keine mandantenübergreifende Erteilung.** Eine Erteilung wirkt ausschließlich in der Organisation ihrer Mitgliedschaft. Wer in Organisation A `super_admin` ist, hat in Organisation B genau die Rechte seiner dortigen Mitgliedschaft, und keine mehr.

Regel 4 ist die wichtigste Neuerung dieses Teils. Ohne sie wäre die Mehrorganisationsfähigkeit ein Rechteausweitungsweg: Man ließe sich in einer beliebigen kleinen Organisation zum Eigentümer machen und hätte damit Ansprüche in allen.

## 3.7 Notfallpfad für fremde personenbezogene Daten

Vier Eigenschaften, unverändert aus dem Entwurf, ergänzt um die Berechtigung:

1. Nur `super_admin` mit `can_manage_privacy`
2. Grund ist Pflichtangabe
3. Zeitfenster in Stunden, nicht Tagen
4. Protokolleintrag, für den Betroffenen einsehbar

---

# Teil 4: Verwendung

**Grundsatz.** Es gibt genau **eine** Auflösungsfunktion: Hat dieser Prinzipal diese Berechtigung in diesem Bereich für dieses Ziel? Jede Policy, jede RPC-Funktion, jede Edge Function und jede Oberfläche ruft ausschließlich diese Funktion.

F1 hat gezeigt, was die Alternative kostet: Neun Funktionen prüften nichts, weil jede ihre eigene Annahme mitbrachte.

**Wichtige Vorgabe für die Signatur dieser Funktion:** Sie nimmt einen **Prinzipal**, nicht eine Nutzerkennung. Heute ist jeder Prinzipal eine Identität mit Mitgliedschaft. Künftig können Dienstkonten hinzukommen, siehe Teil 10, FD-1. Wird die Funktion von Beginn an über einen Prinzipalbegriff definiert, ist diese Erweiterung additiv. Wird sie über eine Nutzerkennung definiert, berührt die Erweiterung jede Prüfung.

## 4.1 SQL-Policies

Drei Teile, in dieser Reihenfolge:

1. Mandantengrenze über die validierte aktive Organisation
2. Beziehung oder Eigentum, auf Mitgliedschaftsebene
3. Berechtigung über die Auflösungsfunktion

Die Mandantengrenze steht immer zuerst und wird nie durch eine spätere Bedingung relativiert.

**Leistung.** Die Auflösungsfunktion wird je Zeile ausgewertet. Sie ist als `stable` zu deklarieren. Für den Bereich `downline` ist `is_ancestor_of()` die teuerste Prüfung. Bei Auswertungen über viele Personen wird die Zugriffsprüfung einmal mengenweise durchgeführt, nicht je Zeile.

## 4.2 RPC-Funktionen

Die Security Baseline aus F1 gilt unverändert. Ergänzend: Die Berechtigungsprüfung liegt im Funktionskörper, nie im Aufrufer. Der Aufrufweg ist beliebig, die Funktion ist die Grenze.

## 4.3 REST-Schnittstelle

Dieselbe RLS wie in der Oberfläche. Keine zweite Prüfebene, weil eine zweite Ebene suggerieren würde, dass die erste unvollständig ist.

## 4.4 Edge Functions

Immer mit dem Zugangstoken des Aufrufers, nie mit dem Dienstschlüssel, außer bei ausdrücklich benannten Ausnahmen. Heute gibt es eine, `validate-invite`, weil dort noch kein Konto existiert.

**Zwingend für Ascent:** Die Function darf niemals Daten in den Modellkontext legen, die der Nutzer nicht selbst lesen könnte. Da sie unter dessen RLS arbeitet, ist das strukturell erfüllt und muss so bleiben.

**Neu:** Die aktive Organisation muss an die Edge Function weitergegeben und dort validiert werden. Sonst arbeitet Ascent unter Umständen im Kontext der falschen Mitgliedschaft und zitiert Wissen aus der falschen Organisation.

## 4.5 Frontend, Navigation, Schaltflächen

Berechtigungen im Frontend dienen ausschließlich der Darstellung, niemals der Sicherheit.

| Zweck | Erlaubt |
|---|---|
| Menüpunkt ausblenden | ja |
| Schaltfläche deaktivieren | ja |
| Zugriff verhindern | **nein** |

**Neu, mit unmittelbarer UI-Folge:** Bei mehreren aktiven Mitgliedschaften braucht die Oberfläche einen sichtbaren Organisationswechsler, und die aktive Organisation muss **dauerhaft sichtbar** sein. Ein Nutzer, der nicht erkennt, in welcher Organisation er arbeitet, erzeugt Fehleingaben, die nachträglich schwer zu bereinigen sind. Diese Anforderung geht in Meilenstein 4 ein.

## 4.6 Ascent und KI

1. Ascent erbt die Rechte des Nutzers in der aktiven Mitgliedschaft. Er ist kein eigener Prinzipal
2. Retrieval filtert nach Organisation, Freigabestatus und Zielgruppe
3. Werkzeugaufrufe von Ascent unterliegen denselben Prüfungen
4. `can_manage_ai` ist von `can_manage_settings` getrennt, weil Systemanweisungen die Compliance-Grenzen definieren

Zum Szenario „KI fordert geschützte Daten an": Die Antwort scheitert nicht daran, dass das Modell sich weigert, sondern daran, dass die Daten nie in seinen Kontext gelangen. Weigerung ist eine Bitte, RLS ist eine Grenze.

---

# Teil 5: Berechtigungsmatrix

Zeichen: ✓ erlaubt, ✗ verboten, △ eingeschränkt.
Alle Angaben gelten **je Mitgliedschaft**.

| Berechtigung | berater | admin | super_admin | platform_operator |
|---|---|---|---|---|
| `can_view_team` | △ 1 | △ 2 | ✓ | △ 3 |
| `can_manage_team` | ✗ | △ 2 | ✓ | ✗ |
| `can_manage_documents` | ✗ | △ 2 | ✓ | ✗ |
| `can_approve_documents` | ✗ | ✗ 4 | ✓ | ✗ |
| `can_manage_training` | ✗ | △ 2 | ✓ | ✗ |
| `can_manage_products` | ✗ | △ 2 | ✓ | ✗ |
| `can_manage_news` | ✗ | △ 2 | ✓ | ✗ |
| `can_manage_events` | ✗ | △ 2 | ✓ | ✗ |
| `can_view_reports` | △ 1 | △ 2 | ✓ | △ 3 |
| `can_export_reports` | ✗ | △ 5 | ✓ | ✗ |
| `can_manage_dashboard` | ✗ | △ 2 | ✓ | ✗ |
| `can_manage_users` | ✗ | △ 6 | ✓ | ✗ |
| `can_manage_roles` | ✗ | ✗ 7 | △ 8 | ✗ |
| `can_manage_permissions` | ✗ | ✗ 9 | ✓ | ✗ |
| `can_manage_settings` | ✗ | △ 2 | ✓ | △ 3 |
| `can_manage_ai` | ✗ | ✗ 10 | ✓ | ✗ |
| `can_manage_system` | ✗ | ✗ | ✓ | △ 3 |
| `can_view_audit` | ✗ | ✗ 11 | ✓ | △ 3 |
| `can_manage_privacy` | ✗ | ✗ 12 | ✓ | ✗ |
| Eigene Kontakte | ✓ | ✓ | ✓ | ✗ |
| **Fremde Kontakte** | **✗** | **✗** | **△ 13** | **✗ 14** |
| **Fremde Coach-Gespräche** | **✗** | **✗** | **✗ 15** | **✗** |
| **Identitätsdaten anderer** | **✗** | **✗ 16** | **✗ 16** | **✗** |
| **Daten anderer Organisationen** | **✗ 17** | **✗ 17** | **✗ 17** | **△ 3** |

**Fußnoten**

1. Nur Bereich `downline`, ausschließlich Aggregate, keine Kontaktidentitäten
2. Nur bei ausdrücklicher Erteilung, keine Grundausstattung der Rolle
3. Nur zeitlich begrenzt, zweckgebunden, protokolliert, für den Mandanten sichtbar, nur Aggregate
4. Trennung Autor und Freigeber
5. Getrennt erteilbar, weil eine Ausleitung Daten der Kontrolle entzieht
6. Nur Mitgliedschaften niedrigerer Stufe, nur betriebliche Felder
7. Rollenzuweisung bleibt beim Eigentümer
8. Nur strikt niedrigere Stufe, andere `super_admin` ausgeschlossen
9. Nicht delegierbar. Diese Grenze trägt die Trennung Admin gegen Eigentümer
10. Systemanweisungen definieren die Compliance-Grenzen von Ascent
11. Wer geprüft wird, verwaltet das Protokoll nicht
12. DSGVO-Handlungen bleiben beim Eigentümer und sind protokollpflichtig
13. Ausschließlich über den Notfallpfad aus 3.7
14. Auch für den Anbieter nicht. Für Support genügen Struktur und Konfiguration
15. Ohne Ausnahme, für niemanden
16. **Neu.** Name, E-Mail und Benutzername gehören der Identität. Wer sie ändern könnte, könnte eine Identität übernehmen
17. **Neu.** Gilt auch für eigene weitere Mitgliedschaften derselben Identität. Regel 4

**Diese Matrix ist ab sofort die einzige Referenz.** Weicht eine Policy, Funktion oder Oberfläche ab, gilt die Matrix und die Abweichung ist ein Fehler.

---

# Teil 6: Sicherheitsprüfung

## 6.1 Die geforderten Szenarien

| # | Szenario | Ergebnis | Womit verhindert |
|---|---|---|---|
| 1 | Leader sieht fremde Organisation | abgewiesen | Mandantengrenze als erste Policy-Bedingung, Organisationsfilter in `get_downline()` |
| 2 | Leader ändert Rollen | abgewiesen | `leader` ist keine Rolle. `can_manage_roles` nur Eigentümer, Stufenregel |
| 3 | Admin bearbeitet Super Admin | abgewiesen | Stufenregel, 50 gegen 90 |
| 4 | Berater öffnet fremde Kontakte | abgewiesen | Eigentum auf Mitgliedschaftsebene. Für keine Rolle im Normalbetrieb sichtbar |
| 5 | Manipulierte Nutzerkennung | abgewiesen | Kein Fremdparameter, wo der eigene gemeint ist. Sonst Aufruferprüfung Pflicht |
| 6 | Manipulierte Organisationskennung | abgewiesen | Organisation kommt aus der validierten aktiven Mitgliedschaft, nie aus dem Aufruf |
| 7 | Direkter RPC-Aufruf | abgewiesen | Prüfung im Funktionskörper, Ausführungsrechte für `anon` entzogen |
| 8 | Direkter API-Aufruf | abgewiesen | Dieselbe RLS, keine zweite Ebene und damit keine Lücke dazwischen |
| 9 | KI fordert geschützte Daten an | abgewiesen | Ascent arbeitet unter der RLS des Nutzers, Retrieval filtert Organisation, Status und Zielgruppe |

## 6.2 Szenarien aus dem Mehrorganisationsmodell, neu

Diese Szenarien existieren erst durch Ihre Entscheidung und sind die eigentliche Prüfung dieser Fassung.

| # | Szenario | Ergebnis | Womit verhindert |
|---|---|---|---|
| 20 | Eigentümer in Organisation A greift auf Organisation B zu, wo er nur Berater ist | **abgewiesen** | Regel 4. Rechte hängen an der Mitgliedschaft, nicht an der Identität |
| 21 | Person lässt sich in einer selbst gegründeten Kleinorganisation zum Eigentümer machen und erwartet Rechte überall | **abgewiesen** | Regel 4. Der wichtigste neue Angriffsweg, deshalb eine eigene Regel |
| 22 | Selektor der aktiven Organisation zeigt auf eine fremde Organisation | **abgewiesen** | Validierung gegen aktive Mitgliedschaften. Selektor ist keine Berechtigung |
| 23 | Selektor zeigt auf eine beendete Mitgliedschaft | **abgewiesen** | Nur `active` zählt |
| 24 | Kein Selektor gesetzt, Person hat zwei Mitgliedschaften | **abgewiesen** | Fail closed bei Mehrdeutigkeit, nie raten |
| 25 | Kontakte aus Organisation A erscheinen in Organisation B | **abgewiesen** | Kontakte hängen an der Mitgliedschaft |
| 26 | Sponsorbeziehung über Organisationsgrenzen | **abgewiesen** | Strukturregel 1.5. Würde sonst die Deckelung pro Linie unberechenbar machen |
| 27 | Admin ändert die E-Mail einer Identität und übernimmt das Konto | **abgewiesen** | Identitätsdaten sind für keine Mitgliedschaftsrolle änderbar, Fußnote 16 |
| 28 | Ausgeschiedener Berater greift weiter zu | **abgewiesen** | Mitgliedschaft `ended`, Historie bleibt, Zugriff endet |
| 29 | Gesperrte Mitgliedschaft wird als Ausscheiden gewertet und verändert die Genealogie | **abgewiesen** | `suspended` und `ended` sind getrennt |
| 30 | Einladungsstrecke wird genutzt, um zu prüfen, ob eine E-Mail registriert ist | **abgewiesen** | Weichenstellung erst nach der Anmeldung, 1.7 |
| 31 | Zwei Identitäten für denselben Menschen durch zwei Einladungen | **abgewiesen** | Zweiter Weg in 1.7, Mitgliedschaft ohne neue Identität |
| 32 | Plattformbetreiber erscheint in einer Teamliste | **abgewiesen** | Identität ohne Mitgliedschaft |
| 33 | Plattformbetreiber greift ohne Anlass zu | **abgewiesen** | Zeitfenster, Zweckbindung, Protokoll, Sichtbarkeit |
| 34 | Abgelaufenes Recht wirkt weiter, weil kein Zeitplan läuft | **abgewiesen** | Prüffunktion vergleicht immer den Zeitraum |
| 35 | Autor gibt eigenes Wissen frei | **abgewiesen** | Trennung der beiden Wissensberechtigungen |
| 36 | Sponsor liest Kontaktnamen der Downline | **abgewiesen** | Aggregat statt Identität |
| 37 | Frontend blendet Schaltfläche aus, Angreifer ruft Schnittstelle | **abgewiesen** | Frontend ist Darstellung, Datenbank ist Autorität |

## 6.3 Ein Szenario, das nicht verhindert wird

| # | Szenario | Ergebnis |
|---|---|---|
| 38 | Berater liest seine eigenen Kontakte, sichert sie und nimmt sie beim Ausscheiden mit | **nicht verhindert** |

Solange die Mitgliedschaft aktiv ist, darf er seine Kontakte lesen. Das ist seine Arbeitsgrundlage. Technisch ist Lesen nicht von Abschreiben unterscheidbar.

Dies ist eine vertragliche Frage und gehört in die Nutzungsbedingungen, nicht in die Autorisierung. Ich führe es auf, weil ein Modell, das diese Lücke verschweigt, Sicherheit verspricht, die es nicht hat.

---

# Teil 7: Architekturprüfung

## 7.1 Was sich konkret ändert

| Element | Änderung | Umfang |
|---|---|---|
| `profiles` | wird in Identität und Mitgliedschaft getrennt | **strukturell, der Kern der Umstellung** |
| `current_org_id()` | Bedeutung wird „validierte aktive Organisation". Name bleibt | eine Funktion. **Deshalb bleiben alle 31 Policies unverändert** |
| `is_ancestor_of()` | arbeitet auf Mitgliedschaften | eine Funktion |
| `get_downline()` | arbeitet auf Mitgliedschaften, Organisationsfilter bleibt | eine Funktion |
| `protect_profile_columns()` | schützt künftig die Mitgliedschaft statt des Profils. Identitätsfelder werden gegen Fremdzugriff geschützt | eine Funktion, Bedeutung erweitert |
| `handle_new_user()` | muss zwischen neuer Identität und zusätzlicher Mitgliedschaft unterscheiden | eine Funktion, **neue Fallunterscheidung** |
| `create_invite()` | Einladung zielt auf eine Organisation, nicht auf ein Profil | eine Funktion |
| `profiles_public` | wird Mitgliederliste je Organisation. **Spalte `role` entfällt** | ein View |
| Alle 22 Tabellen mit `org_id` | Bezug wandert von Profil auf Mitgliedschaft | Schemaarbeit, aber gleichförmig |
| RLS-Policies | Struktur bleibt dreiteilig, Bezug wird Mitgliedschaft | gleichförmig |
| Edge Functions | müssen die aktive Organisation weitergeben und validieren | drei Functions |
| Frontend | Organisationswechsler, aktive Organisation dauerhaft sichtbar | Meilenstein 4 |

**Der entscheidende Punkt zur Umsetzbarkeit:** Die Indirektion liegt in `current_org_id()`. Weil alle 31 Policies diese Funktion aufrufen und nicht direkt auf `profiles.org_id` zugreifen, bleiben sie unverändert gültig. Diese Vorarbeit aus Sprint 1 ist der Grund, warum die Umstellung jetzt bezahlbar ist.

## 7.2 Zugangstoken

**Keine Berechtigungen im Token.** Begründung unverändert: verzögerter Entzug, veraltete Ansprüche, Zero Trust.

**Der Selektor der aktiven Organisation darf im Token oder in einem Kopffeld stehen**, weil er kein Recht ist, sondern eine Auswahl, und weil er serverseitig gegen die Mitgliedschaften validiert wird. Diese Unterscheidung muss in der Umsetzung ausdrücklich dokumentiert werden, sonst wirkt sie wie ein Widerspruch zur Regel darüber.

## 7.3 Weitere Bereiche

| Bereich | Bewertung |
|---|---|
| **Views** | `security_invoker` bleibt Standard. `profiles_public` verliert `role` |
| **Realtime** | Abonnements unterliegen RLS. Ein Rechteentzug beendet ein bestehendes Abonnement nicht. **Neu hinzu:** Ein Organisationswechsel muss laufende Abonnements beenden, sonst empfängt der Client weiter Ereignisse der alten Organisation |
| **Storage** | Noch nicht in Gebrauch. Ablagepfade müssen die Organisation enthalten, damit die Grenze am Pfad prüfbar ist |
| **Wissensdatenbank** | Freigabe zweistufig. Retrieval filtert Organisation, Status und Zielgruppe |
| **Ascent** | Kein eigener Prinzipal. Aktive Organisation muss durchgereicht werden |
| **Vergütungsberechnung** | Punkte und Rang strikt je Mitgliedschaft. Eine Zusammenführung über Organisationen wäre fachlich falsch |

Der Realtime-Punkt ist neu und leicht zu übersehen: Ein Wechsel der Organisation ohne Beendigung der Abonnements ist ein mandantenübergreifendes Leck, das nur im laufenden Betrieb auftritt und in Tests nicht erscheint.

---

# Teil 8: DSGVO

Dieser Teil löst die Blocker 2 und 3 aus Meilenstein 2.

## 8.1 Jede Organisation ist eigener Verantwortlicher

Eine Person in drei Organisationen hat drei Verantwortliche. Das ist keine Feinheit, sondern bestimmt die gesamte Umsetzung:

- Ein Auskunftsersuchen richtet sich an **eine** Organisation und wird für **deren** Verarbeitung beantwortet
- Eine Löschung wirkt in **einer** Organisation. Die Mitgliedschaften in den anderen bleiben unberührt
- Aufbewahrungspflichten gelten je Organisation

Eine plattformweite Löschung über alle Organisationen hinweg gibt es nicht, und es darf sie nicht geben. Sie würde in fremde Aufbewahrungspflichten eingreifen.

## 8.2 Trennung von personenbezogenen Daten und Geschäftsunterlagen

Dies ist die zentrale Strukturregel dieses Teils. Ohne sie sind Löschpflicht und Aufbewahrungspflicht nicht gleichzeitig erfüllbar.

| Kategorie | Beispiele | Bei Löschung |
|---|---|---|
| **Personenbezogene Daten** | Kontakte mit Namen und Notizen, Coach-Gespräche, Identitätsdaten | **löschen oder anonymisieren** |
| **Geschäftsunterlagen** | Punkte, Pipeline-Ereignisse, Qualifikationsergebnisse, Provisionsgrundlagen | **anonymisieren und aufbewahren** |

Eine Provisionsabrechnung ist steuerlich aufbewahrungspflichtig. Sie zu löschen wäre ein Verstoß in die andere Richtung. Anonymisiert bleibt sie auswertbar, ohne die Person zu identifizieren.

## 8.3 Kein kaskadierendes Löschen von der Identität zur Mitgliedschaft

**Diese Regel ist verbindlich und wichtiger, als sie klingt.**

Das heutige Schema verwendet `profiles.id references auth.users(id) on delete cascade`. Wird dieses Muster auf die Mitgliedschaft übertragen, entsteht ein Widerspruch zur Aufbewahrungspflicht: Das Löschen einer Identität würde Geschäftsunterlagen dreier Organisationen mitreißen.

Vorgabe: Die Mitgliedschaft verweist auf die Identität **ohne** kaskadierendes Löschen. Eine Löschung der Identität ist erst zulässig, wenn keine Mitgliedschaft mehr einer Aufbewahrungspflicht unterliegt. Bis dahin wird die Identität **anonymisiert**, nicht entfernt: Anmeldedaten und Name werden ersetzt, die Kennung bleibt als Pseudonym erhalten.

Wird das erst nach dem Aufbau bemerkt, ist die Behebung eine Schemaänderung auf gefüllten Tabellen mit Fremdschlüsselketten. Jetzt kostet es eine Festlegung.

## 8.4 Kontakte beim Ausscheiden

| Frage | Antwort |
|---|---|
| Wer ist Verantwortlicher? | die Organisation |
| Wo bleiben die Daten? | bei der beendeten Mitgliedschaft, vollständig |
| Sieht der ausgeschiedene Berater sie weiter? | **nein**, Voreinstellung. Er handelt nicht mehr für die Organisation |
| Sieht sie danach jemand anderes? | nein, außer über den Notfallpfad |
| Gibt es eine Ausleitung beim Ausscheiden? | **geschäftliche Entscheidung**, siehe unten |

Die Architektur trägt beide Varianten. Voreinstellung ist keine Ausleitung, weil das die datenschutzrechtlich klare Variante ist. Eine Ausleitung wäre kein Architekturthema, sondern eine Regel in den Nutzungsbedingungen plus ein protokollierter Ausleitungspfad über `can_manage_privacy`.

**Zu entscheiden ist nur der Parameter, nicht die Struktur.** Damit ist Blocker 2 aus Meilenstein 2 architektonisch erledigt.

## 8.5 Auskunft nach Artikel 15

| Eigenschaft | Festlegung |
|---|---|
| Berechtigung | `can_manage_privacy`, nur `super_admin` |
| Umfang | Identitätsdaten plus alle Daten der Mitgliedschaft in **dieser** Organisation |
| Nicht enthalten | Daten anderer Organisationen. Andere Verantwortliche |
| Kontaktdaten Dritter | enthalten, soweit die Person Betroffene ist, nicht soweit sie Erfasserin ist |
| Protokoll | jeder Aufruf, mit Grund |
| Frist | ein Monat, gesetzlich |

Die Unterscheidung in Zeile vier ist wichtig und wird häufig falsch gemacht: Ein Berater, der 200 Interessenten erfasst hat, erhält bei seiner eigenen Auskunft nicht die Daten dieser 200 Menschen. Er ist dort nicht Betroffener, sondern Erfasser.

Damit ist Blocker 3 aus Meilenstein 2 architektonisch erledigt.

## 8.6 Prüfprotokoll

| Eigenschaft | Festlegung |
|---|---|
| Bezug | **je Organisation.** Ein Eigentümer sieht nur Einträge seiner Organisation |
| Schreibweise | **nur anfügen.** Kein Ändern, kein Löschen, auch nicht für Eigentümer |
| Was wird protokolliert | Rechteänderungen, Rollenänderungen, DSGVO-Handlungen, Notfallzugriffe, Zugriffe des Plattformbetreibers, Organisationswechsel |
| Was wird nicht protokolliert | Lesen eigener Daten. Menge ohne Erkenntniswert |
| Aufbewahrung | Rechteänderungen dauerhaft, Zugriffe begrenzt. **Frist ist zu entscheiden** |
| Sichtbarkeit für Betroffene | Notfallzugriffe und Zugriffe des Anbieters sind für den Betroffenen einsehbar |

Der Bezug je Organisation ist eine Folge der Mehrmandantenfähigkeit: Ein globales Protokoll würde einem Eigentümer Einträge über andere Organisationen zeigen.

---

# Teil 9: Enterprise-Szenarien

Die Trennung von Identität und Mitgliedschaft macht mehrere Enterprise-Anforderungen von strukturellen Umbauten zu additiven Erweiterungen. Das ist der eigentliche Gewinn Ihrer Entscheidung.

| Anforderung | Vorher | Jetzt |
|---|---|---|
| Ein Mensch in mehreren Mandanten | unmöglich | vorgesehen |
| Anmeldung über den Unternehmensverzeichnisdienst | schwierig, weil Anmeldung und Mitgliedschaft verschränkt waren | die Anmeldung betrifft die Identität, die Mitgliedschaft bleibt getrennt. Additiv |
| Automatische Bereitstellung von Nutzern | nicht darstellbar | die Bereitstellung erzeugt Mitgliedschaften. Additiv |
| Mehrere Marken eines Kunden | nicht darstellbar | Markenebene über der Organisation, siehe FD-4 |
| Datenhaltung je Kunde | schwer, weil Daten am Profil hingen | Daten hängen an der Mitgliedschaft und damit an der Organisation. Deutlich einfacher |
| Support durch den Anbieter | nur über einen Eigentümerzugang im Mandanten | eigener Prinzipal, zeitbegrenzt, protokolliert |
| Trennung von Verantwortlichen | nicht darstellbar | je Organisation, Teil 8 |

Zwei Anforderungen bleiben offen und sind als Fundamententscheidungen in Teil 10 aufgeführt: Dienstkonten für maschinellen Zugriff, FD-1, und die Markenebene, FD-4.

---

# Teil 10: Weitere Fundamententscheidungen

Nicht implementieren, nicht migrieren. Dokumentiert, begründet, mit Auswirkung.

## FD-1: Dienstkonten für maschinellen Zugriff

**Sachverhalt.** Ein Unternehmenskunde wird maschinellen Zugriff verlangen, etwa damit ein eigenes Auswertungswerkzeug Kennzahlen abruft. Ein Dienstkonto ist keine Person und hat keine Identität im Sinne dieses Modells.

**Warum später teuer.** Wenn die Auflösungsfunktion über eine Nutzerkennung definiert wird, muss jede Prüfung angepasst werden, sobald ein Prinzipal keine Person mehr ist. Wird sie über einen **Prinzipalbegriff** definiert, ist die Erweiterung additiv.

**Empfehlung, jetzt ohne Aufwand umsetzbar.** Die Auflösungsfunktion nimmt einen Prinzipal, nicht eine Nutzerkennung. Heute ist jeder Prinzipal eine Identität mit Mitgliedschaft. Das Dienstkonto wird nicht gebaut, aber der Begriff wird nicht verbaut.

**Auswirkung bei Nichtbeachtung.** Erfahrungsgemäß entsteht dann ein geteiltes Eigentümerkonto für Maschinen. Das ist die häufigste Ursache dafür, dass eine Sicherheitsprüfung bei einem Unternehmenskunden scheitert.

**Kosten jetzt: nur eine Festlegung zur Signatur. Kosten später: jede Berechtigungsprüfung.**

## FD-2: Mehrere Mitgliedschaften derselben Person in derselben Organisation

**Sachverhalt.** Eine Person scheidet aus und kommt später zurück. Erlaubt das Modell zwei Mitgliedschaften in derselben Organisation?

**Empfehlung: ja, aber höchstens eine `active`.** Begründung: Ihre Vorgabe verlangt, dass Historien erhalten bleiben. Bei nur einer Mitgliedschaft je Person und Organisation müsste die alte beim Wiedereintritt überschrieben werden, und die Historie ginge verloren.

**Auswirkung.** Die Eindeutigkeit ist nicht Person und Organisation, sondern Person und Organisation und `active`. Eine falsche Festlegung an dieser Stelle führt entweder zu Datenverlust beim Wiedereintritt oder zu mehreren gleichzeitig aktiven Mitgliedschaften mit widersprüchlichen Rollen.

**Ich entscheide das als Architektur und bitte um Bestätigung.**

## FD-3: Benutzername global oder je Organisation

**Empfehlung: global, an der Identität.** Begründung: Ein Benutzername bezeichnet einen Menschen. Wäre er je Organisation eindeutig, könnten zwei verschiedene Menschen denselben Namen tragen, und jede organisationsübergreifende Anzeige, etwa im Prüfprotokoll oder beim Support, wäre missverständlich.

**Auswirkung.** Die Eindeutigkeitsprüfung wandert von `profiles` an die Identität. Der bestehende Prüfschritt in `handle_new_user` bleibt inhaltlich gleich, nur der Bezug ändert sich.

**Ich entscheide das als Architektur und bitte um Bestätigung.**

## FD-4: Markenebene über der Organisation

**Sachverhalt.** Die Wissensdatenbank nennt drei Ebenen: Chogan als Unternehmen, Essence Tribe als Netzwerk, Team Şeyda als Team. Das Modell hat zwei: Organisation und Team.

**Empfehlung: jetzt nicht bauen, aber nie voraussetzen, dass die Organisation die oberste Ebene ist.** Konkret: Kein Code und keine Policy darf davon ausgehen, dass es über der Organisation nichts gibt.

**Auswirkung bei späterer Einführung.** Additiv, sofern die Empfehlung eingehalten wird. Strukturell, wenn irgendwo „Organisation ist die Wurzel" festgeschrieben wurde.

## FD-5: Kundenzugang

**Sachverhalt.** Die Wissensdatenbank führt die Rolle Kunde. AscendOS hat heute keinen Kundenzugang.

**Empfehlung: nicht in dieser Architektur.** Begründung: Ein Kunde hat keine Genealogie, keinen Rang, keine Punkte und keine Downline. Er passt nicht in eine Mitgliedschaft, sondern wäre ein eigener Prinzipaltyp. Die Kundenwerkzeuge der Generation 1 leisten das bereits und sind erprobt.

**Auswirkung bei späterer Einführung.** Ein weiterer Prinzipaltyp, additiv, sofern FD-1 beachtet wird. Genau deshalb sind die beiden verbunden.

## FD-6: Unveränderlichkeit provisionsrelevanter Daten

**Sachverhalt.** Punkte und Qualifikationsergebnisse tragen Provisionsansprüche. Pipeline-Ereignisse haben bereits einen Korrekturmechanismus über eine wirksame Sicht, der sich bewährt hat.

**Empfehlung: dasselbe Muster für Punkte und Qualifikation.** Nie ändern, immer anfügen und die alte Zeile als ersetzt kennzeichnen.

**Begründung.** Ein nachträglich geänderter Punktestand ändert einen Provisionsanspruch, ohne Spur. Bei einer Auseinandersetzung ist der ursprüngliche Wert dann nicht mehr belegbar.

**Auswirkung bei Nichtbeachtung.** Bei einer Streitigkeit über eine Provision ist die Beweisführung unmöglich. Nachträglich einzuführen bedeutet, dass für den gesamten Zeitraum davor kein Nachweis existiert.

---

# Teil 11: F2-Abschlussbericht

## 11.1 Zusammenfassung

Das bestehende Modell hatte drei Rollen, davon eine wirkungslos, kein Berechtigungssystem, keine Delegation, keine Rangordnung und eine Identität, die fest an eine Organisation gebunden war.

Die endgültige Architektur besteht aus:

- **drei Ebenen**: Identität, Mitgliedschaft, Organisation
- **drei Rollen je Mitgliedschaft** plus einem Prinzipal ohne Mitgliedschaft für den Anbieter
- **19 Berechtigungen** mit vier Geltungsbereichen
- **vier Regeln** gegen Rechteausweitung, darunter eine neue gegen mandantenübergreifende Erteilung
- **einem Notfallpfad** für DSGVO-Handlungen
- **einer Auflösungsfunktion** als einzige Wahrheitsquelle über alle Ebenen

38 Szenarien geprüft, 37 abgewiesen, eines ausdrücklich als vertragliche Frage gekennzeichnet.

## 11.2 Stärken

1. **Rollen kodieren nur Funktion.** Beziehung und Rang bleiben Daten. Eine Planänderung durch Chogan erzwingt keine Migration
2. **Regel 4 schließt den einzigen neuen Angriffsweg**, den die Mehrorganisationsfähigkeit eröffnet
3. **Fail closed bei Mehrdeutigkeit.** Ein System, das bei zwei Mitgliedschaften rät, erzeugt ein Leck, das kaum reproduzierbar ist
4. **Kontaktidentitäten sieht niemand im Normalbetrieb**, auch Admin, Eigentümer und Anbieter nicht
5. **Löschpflicht und Aufbewahrungspflicht sind gleichzeitig erfüllbar**, durch die Trennung in Teil 8.2
6. **Der Plattformbetreiber ist strukturell sauber**, weil er keine Mitgliedschaft braucht
7. **Die Umstellung ist bezahlbar**, weil die Indirektion in `current_org_id()` liegt und alle 31 Policies unverändert bleiben
8. **Identitätsdaten sind für keine Mitgliedschaftsrolle änderbar.** Verhindert Kontoübernahme durch Admins

## 11.3 Schwächen

1. **Höhere Einstiegskomplexität.** Drei Ebenen sind mehr als eine Tabelle. Gegenmaßnahme: Rollen bringen Grundausstattungen mit, der Normalfall braucht keine Erteilung
2. **Der Organisationswechsler ist eine neue Fehlerquelle in der Oberfläche.** Wer nicht erkennt, in welcher Organisation er arbeitet, erzeugt Fehleingaben. Gegenmaßnahme in Meilenstein 4: dauerhafte Sichtbarkeit
3. **Leistungskosten**, weil Berechtigungen nicht im Token liegen. Bewusst in Kauf genommen, weil sofortiger Entzug wichtiger ist
4. **Nur additive Berechtigungen**, keine Verbotslisten. Weniger Feinsteuerung, dafür nachvollziehbar
5. **Der Notfallpfad ist eine Ermessensentscheidung** und kann missbraucht werden. Einzige Gegenmaßnahme ist Sichtbarkeit für den Betroffenen
6. **Die Trennung Autor und Freigeber braucht zwei Personen.** In einer kleinen Organisation lästig. Ich empfehle, es nicht aufzuweichen

## 11.4 Risiken

| Priorität | Risiko | Bewertung |
|---|---|---|
| 1 | **F1 unverifiziert.** Szenario 1 und 6 stützen sich auf den Organisationsfilter, den F1 einführt | Der Filter ist geschrieben, nie ausgeführt. Bis zur Verifikation begründete Annahme, kein Nachweis |
| 2 | FD-6, provisionsrelevante Daten ohne Unveränderlichkeit | Nachträglich nicht heilbar. Für den Zeitraum davor existiert dann kein Nachweis |
| 3 | Realtime-Abonnements über einen Organisationswechsel hinweg | Mandantenübergreifendes Leck, das nur im Betrieb auftritt |
| 4 | Doppelidentitäten durch übersehene Weichenstellung in 1.7 | Nachträglich nur unter Datenverlust zusammenführbar |
| 5 | FD-4, Markenebene | Additiv, solange nirgends „Organisation ist die Wurzel" festgeschrieben wird |
| 6 | Leistung der Auflösung bei großen Strukturen | Mengenweise Prüfung statt je Zeile |
| 7 | Aufbewahrungsfristen des Prüfprotokolls nicht festgelegt | Wächst unbegrenzt, kein Sicherheitsrisiko |

## 11.5 Empfohlene Änderungen

| # | Änderung | Nutzen | Risiko | Status |
|---|---|---|---|---|
| Ä1 | Identität und Mitgliedschaft trennen | alle Mehrmandantenfälle bleiben offen | eine Ebene mehr je Policy | **freigegeben** |
| Ä2 | `role` aus `profiles_public` entfernen | Eigentümer nicht mehr org-weit identifizierbar | gering | empfohlen |
| Ä3 | Kontakte bleiben bei der beendeten Mitgliedschaft | DSGVO-Pflicht erfüllt | keins technisch | **architektonisch erledigt**, ein Parameter offen |
| Ä4 | Auskunfts- und Löschpfad über `can_manage_privacy` | DSGVO-Pflicht erfüllt | der Pfad selbst braucht dieselbe Härte wie der Notfallpfad | **architektonisch erledigt** |
| Ä5 | `leader` als überholt markieren, nicht entfernen | keine Scheinsicherheit, keine Migration | keins, null Profile | empfohlen |
| Ä6 | Kein kaskadierendes Löschen Identität zu Mitgliedschaft | Aufbewahrungspflicht bleibt erfüllbar | keins | **verbindlich** |
| Ä7 | Auflösungsfunktion über einen Prinzipalbegriff definieren | Dienstkonten später additiv | keins | empfohlen, siehe FD-1 |

## 11.6 Offene Punkte

| # | Punkt | Art | Entscheider |
|---|---|---|---|
| O1 | Ausleitung der Kontakte beim Ausscheiden, ja oder nein | geschäftlich | Sie |
| O2 | Aufbewahrungsfristen des Prüfprotokolls je Kategorie | geschäftlich, rechtlich | Sie |
| O3 | Bestätigung von FD-2 und FD-3 | Architektur, von mir entschieden | Sie, bestätigend |
| O4 | Symbol-Asset aus dem Logo gewinnen | Umsetzung | Sie, dann ich |
| O5 | Grundausstattung je Rolle im Detail | Architektur | ich, Teil der Umsetzungsvorbereitung |

**Keiner dieser Punkte ändert die Struktur.** O1 und O2 sind Parameter, O3 sind Bestätigungen bereits getroffener Festlegungen, O4 ist ein Beschnitt, O5 ist Ausarbeitung innerhalb des Modells.

## 11.7 Langfristige Skalierbarkeit

| Zeitraum | Bewertung |
|---|---|
| 1 Jahr, ein Mandant | tragfähig |
| 2 bis 3 Jahre, mehrere Teams als Mandanten | tragfähig. Genau der Fall, für den Ä1 entschieden wurde |
| 3 bis 5 Jahre, Unternehmenskunden | tragfähig mit FD-1 als Erweiterung. Verzeichnisdienst und Bereitstellung sind additiv |
| über 5 Jahre, mehrere Marken | Markenebene als Erweiterung, FD-4. Additiv, sofern die Empfehlung eingehalten wird |

Das Berechtigungssystem selbst, also 19 Berechtigungen mit Geltungsbereich und vier Ausweitungsregeln, halte ich ohne Umbau über fünf Jahre für tragfähig. Neue Bereiche kommen als Berechtigungen hinzu, nicht als Rollen. Das war das Ziel, und es ist erreicht.

Mit Ihrer Entscheidung zu Ä1 ist der begrenzende Faktor entfallen. Er lag nicht im Rollenmodell.

---

# Abschluss

## JA

Das Rollen- und Berechtigungsmodell ist produktionsreif als verbindliche Implementierungsgrundlage.

**F2 ist erfolgreich abgeschlossen.** Die Implementierung kann auf dieser Grundlage beginnen.

Begründung: Die Fundamentfrage ist durch Ihre Entscheidung geklärt. Die beiden DSGVO-Blocker sind in Teil 8 architektonisch gelöst, nicht nur beschrieben. Das Modell ist gegen 38 Szenarien geprüft. Die verbleibenden offenen Punkte sind Parameter und Bestätigungen, keine Strukturfragen, und keiner von ihnen kann das Modell noch verändern.

## Eine Bedingung zur Umsetzungsreihenfolge

Diese Bedingung betrifft nicht die Architektur, sondern die Reihenfolge, und ich halte sie für zwingend:

**Die Implementierung von F2 beginnt erst nach der Verifikation von F1.**

Grund: F2 verändert genau die Funktionen, die F1 verändert, nämlich `current_org_id()`, `is_ancestor_of()`, `get_downline()` und `protect_profile_columns()`. Beides gleichzeitig umzusetzen, während F1 nie ausgeführt wurde, macht jeden Fehler doppelt schwer zuzuordnen. Die Verifikationsschritte für F1 stehen in Abschnitt 9 des Meilenstein-1-Berichts und brauchen eine Maschine.

Zwei Szenarien dieser Prüfung, Nummer 1 und Nummer 6, stützen sich unmittelbar auf den Organisationsfilter, den F1 einführt. Solange F1 nicht verifiziert ist, ist ihre Deckung eine begründete Annahme.

## Was als nächstes ansteht

Meilenstein 3, Internationalisierung, ist reine Analyse und Architektur und damit ohne Maschine leistbar. Er beginnt nach Ihrer Freigabe.

Eine Anmerkung zur Reihenfolge: Meilenstein 3 wird durch diese Fassung leichter, weil jetzt geklärt ist, dass Sprache an der **Identität** hängt und nicht an der Mitgliedschaft. Eine Person hat eine Sprache, unabhängig davon, in wie vielen Organisationen sie ist. Das ist eine der Festlegungen aus Teil 1.2, die dort nebenbei getroffen wurde und in Meilenstein 3 tragend wird.
