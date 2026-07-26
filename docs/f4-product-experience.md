# F4: Product Experience Architecture

Verbindliche Grundlage aller künftigen Oberflächen.
Datum: 25. Juli 2026. Keine Implementierung, kein Code, keine Migration.

F1 eingefroren. F2 und F3 unverändert gültig.

---

# Teil 0: Verhältnis zum bestehenden Design-System

## 0.1 Es existiert bereits ein verbindliches System

`docs/design-system.md` enthält **Design System v1, Brand Foundation**, und es ist gut. Dieses Dokument ist **v2** und erweitert v1. Es ersetzt es nicht.

Verbindliche Entscheidungen aus v1, die unverändert bleiben:

| Entscheidung | Bewertung |
|---|---|
| Monochrom plus Champagner-Akzent, **kein Blau** | bleibt. Aus der Logo-Familie abgeleitet |
| Silber nur im Logo und in Meilenstein-Momenten, **nie als UI-Funktionsfarbe** | bleibt, und meine Messung bestätigt es, siehe 0.3 |
| Champagner ist ein Gewürz, kein Anstrich | bleibt. Die Ja-Nein-Liste in v1 Abschnitt 3 ist präzise |
| `accent-deep` als eigener Token für Text | bleibt. Behebt die häufigste Falle bei Goldtönen |
| Inter als einzige Schrift, Markenmomente über Behandlung | bleibt, mit Begründung in 6.3 |
| Funktionsfarben bleiben funktional, Rot und Grün als Ausnahme vom Monochrom | bleibt |
| Claim nur auf Login- und Marketingflächen, nie in der Arbeits-UI | bleibt |

Ich habe geprüft, ob eine der Entscheidungen von v1 dem Enterprise-Anspruch dieses Meilensteins widerspricht. Keine tut das. Die naheliegende Versuchung wäre ein kühler Blauakzent gewesen, wie ihn Linear, Stripe und Vercel verwenden. v1 hat Blau ausdrücklich ausgeschlossen und aus der Logo-Familie begründet. Diese Begründung trägt, und ein Wechsel wäre eine Markenänderung ohne Anlass.

## 0.2 Was v1 offen gelassen hat

| Offener Punkt aus v1 | Status in v2 |
|---|---|
| Emoji-Icons als v2-Empfehlung, bewusst zurückgestellt | **jetzt verbindlich behoben**, siehe 6.4 |
| Dark Mode als Token definiert, nicht verdrahtet | **verdrahtet**, siehe 6.2 |
| Logo als SVG angefordert | **weiter offen**, siehe 0.4 |
| Keine Informationsarchitektur | **Kern dieses Dokuments** |
| Kein Desktop, kein Tablet | **Teil 4** |
| Keine Befehlsleiste, keine globale Suche | **Teil 5** |

## 0.3 Drei Messungen am Logo

Statt zu beurteilen habe ich gemessen. Alle drei Ergebnisse haben architektonische Folgen.

**Messung 1: Die Materialfarbe des Symbols ist kühl.**

| Wert | Ergebnis |
|---|---|
| Mittelwert | R 198,1, G 199,6, B 201,4 |
| Farbstich | Blau liegt 3,3 Punkte über Rot, also **kühl** |
| Median | `#D7D8DA` |
| Spannweite | `#020409` bis `#FFFFFF` |

Das Symbol ist ein kühles Silber. Der Hintergrund von v1 ist ein **warmes** Off-White, `#F7F6F3`. Diese Paarung ist nicht falsch, kühles Metall auf warmem Papier ist ein etablierter Kontrast, aber sie ist bewusst und sollte dokumentiert sein.

**Messung 2: Auf hellem Grund verschwindet über die Hälfte des Symbols.**

Anteil der Symbolfläche mit einem Kontrast unter 1,5 zu 1:

| Untergrund | Unsichtbar oder kaum sichtbar |
|---|---|
| `bg` hell `#F7F6F3` | **55,4 Prozent** |
| `surface` `#FFFFFF` | **52,3 Prozent** |
| `bg` dunkel `#0F1012` | **0,6 Prozent** |

Das ist keine Geschmacksfrage. Auf dem hellen Standardhintergrund von v1 fehlt mehr als die Hälfte des Symbols. Die verbindliche Vorgabe verlangt das Symbol in Login, Splash, Ladeanzeige, Sidebar, Dashboard, Favicon, PWA, Einstellungen und im Coach-Header. An jeder dieser Stellen wäre es im hellen Theme halb aufgelöst.

Konsequenz in Teil 2.

**Messung 3: Der Champagner-Akzent unterschreitet die Anforderung für Grafikelemente.**

v1 sagt zu, alle Textkontraste lägen bei mindestens 4,5 zu 1. Das ist für Text korrekt. Für **Grafikelemente**, die Information tragen, gilt 3 zu 1, und das wurde nicht geprüft:

| Prüfung | Licht | Dunkel |
|---|---|---|
| `ink` auf `bg` | 17,34 zu 1, erfüllt | 17,16 zu 1, erfüllt |
| `muted` auf `bg` | 4,59 zu 1, erfüllt | 6,93 zu 1, erfüllt |
| `accent-deep` als Text auf `surface` | 4,89 zu 1, erfüllt | 9,70 zu 1, erfüllt |
| `accent` als Text auf `surface` | 2,85 zu 1, **unterschritten**, in v1 bereits untersagt | 7,80 zu 1, erfüllt |
| **`accent` als Fläche auf `bg`, Soll 3 zu 1** | **2,64 zu 1, unterschritten** | 8,36 zu 1, erfüllt |
| `line` auf `bg`, Soll 3 zu 1 | 1,18 zu 1, **unterschritten** | 1,29 zu 1, **unterschritten** |

Zwei Befunde:

- **Champagner als Fortschrittsbalken, aktiver Tab und Fokusrahmen liegt im hellen Theme bei 2,64 zu 1.** Das sind Grafikelemente, die Information tragen. v1 nennt genau diese Verwendungen als erlaubt. Die Gegenmaßnahme in v1, Champagner nie als einzigen Informationsträger zu verwenden, ist genau richtig und macht das System benutzbar. Formal bleibt die Anforderung für Grafikkontrast dennoch unerfüllt
- **`line` liegt bei 1,18 zu 1.** Als dekorative Trennlinie ist das zulässig und ausdrücklich von der Anforderung ausgenommen. Als **einzige Kennzeichnung eines Eingabefeldes** ist es nicht zulässig. Es braucht einen zweiten Token, siehe 6.2

Beide Befunde fallen im dunklen Theme weg oder sind dort unkritisch. Das ist der zweite unabhängige Grund für Teil 2.

## 0.4 Der Logo-Beschnitt bleibt eine offene Lieferung

v1 hat das Logo als SVG angefordert mit der Begründung, die PNG-Datei auf weißem Grund tauge nicht für transparente Kontexte.

**Teilkorrektur:** Die inzwischen gelieferte Datei **ist** transparent. Gemessen: Alpha 0 an allen vier Ecken, 96,8 Prozent der Fläche vollständig transparent, maximales Alpha im Randstreifen 2 von 255. Der Einwand von v1 gegen die Transparenz ist damit erledigt.

**Der Einwand gegen die Skalierung besteht weiter.** Das Symbol liegt bei 360 mal 308 Pixeln. In der Navigation soll es bei 24 Pixeln Höhe erscheinen, im Favicon bei 16. Ein feiner Silberverlauf, von 308 auf 16 Pixel verkleinert, wird zu einem grauen Fleck. Für diese Größen ist ein SVG erforderlich, oder mindestens eine für Kleinstgrößen vereinfachte Rasterfassung.

Das ist eine **Lieferabhängigkeit**, kein Architekturmangel. Sie steht in Teil 11.

---

# Teil 1: Die Kernspannung, ehrlich benannt

## 1.1 Der Widerspruch im Auftrag

| Vorgabe | Belegte Wirklichkeit |
|---|---|
| Enterprise-Niveau wie Linear, Stripe, Vercel, Raycast | Die Wissensdatenbank stellt fest: Arbeit ausschließlich vom iPhone, kein Rechner |
| Auch mit 50 bis 100 Funktionen intuitiv | Die Nutzerschaft sind Vertriebspartner, überwiegend im Nebenerwerb |
| Befehlsleiste, Tastaturbedienung | Ein Telefon hat keine Tastatur im Sinne von Raycast |

Linear und Raycast sind Werkzeuge für geübte Anwender an einer Tastatur. Ihre Befehlsleiste ist der zentrale Bedienweg, nicht ein Zusatz. Ein Vertriebspartner, der zwischen zwei Terminen auf dem Telefon fünf Minuten hat, bedient nichts über eine Befehlsleiste.

## 1.2 Die Auflösung

**Übernommen wird die Strenge dieser Produkte, nicht ihr Bedienmodell.**

| Von Linear und Stripe übernommen | Nicht übernommen |
|---|---|
| Kompromisslose Konsistenz. Dieselbe Handlung sieht überall gleich aus | Tastaturbedienung als Hauptweg |
| Zurückhaltung. Nichts blinkt, nichts hüpft | Hohe Informationsdichte auf kleinem Raum |
| Geschwindigkeit als Merkmal, nicht als Nebenprodukt | Erwartung geübter Anwender |
| Disziplin bei Informationsdichte. Weniger auf einem Bildschirm, klarer | Desktop als Leitfläche |
| Leere Zustände als Aufforderung, nicht als Fehlermeldung | |

Konkret bedeutet das: **Die Befehlsleiste ist der Kraftweg für Desktop und wird gebaut. Der Hauptweg auf dem Telefon bleibt die Navigation und eine Suche mit einem Feld.** Beide greifen auf denselben Index zu. Details in Teil 5.

## 1.3 Die eigentliche Aufgabe der Oberfläche

Die Wissensdatenbank stellt an mehreren Stellen fest, dass der Engpass die direkte Ansprache ist und nicht der Werkzeugbestand.

Daraus folgt die Messlatte für jede Gestaltungsentscheidung in diesem Dokument:

> Bringt diese Entscheidung den Nutzer schneller zur nächsten Nachricht an einen Menschen?

Eine Oberfläche, die beeindruckt und dabei einen Klick zwischen den Nutzer und seinen nächsten Kontakt legt, ist für dieses Produkt schlechter, nicht besser.

---

# Teil 2: Die Signatur, aus der Messung abgeleitet

## 2.1 Die Entscheidung

**Das Symbol steht immer auf dunklem Grund. In jedem Theme.**

Begründung: Messung 2 in 0.3. Auf hellem Grund fehlen 55,4 Prozent der Symbolfläche, auf dunklem 0,6 Prozent.

Umsetzung ohne jede Änderung am Logo:

| Theme | Wo das Symbol steht |
|---|---|
| Dunkel | ohnehin dunkler Grund, kein Zusatz nötig |
| Hell | in einem dunklen Träger: Navigationsleiste, Kopfblock, Splash-Fläche |

Das ist zulässig. Untersagt sind Änderungen am Logo, eine **weiße** Fläche dahinter, Schatten, Farbänderung und Verzerrung. Ein dunkler Träger ist eine Layoutentscheidung, keine Logoänderung, und v1 hat in Abschnitt 6 selbst nach einer Lösung für dunklen Grund gefragt.

## 2.2 Warum das gleichzeitig die Signatur ist

Der Design-Skill dieser Umgebung rät, die Kühnheit an einer Stelle auszugeben und alles daneben ruhig zu halten.

Die eine Stelle ist hier gefunden, und zwar aus einer Messung statt aus Geschmack: **AscendOS trägt eine dunkle Graphitschiene, die die Marke hält, unabhängig vom Theme.** Auf dem Telefon ist das die untere Navigationsleiste, auf dem Desktop die linke Schiene, auf dem Splash die Fläche.

Nebeneffekt, der die Entscheidung stützt: Die Schiene bleibt in beiden Themes identisch. Ein Nutzer, der zwischen hell und dunkel wechselt, erkennt das Produkt wieder. Das leisten wenige Anwendungen.

Was ausdrücklich **nicht** passiert, weil es der Standardlook wäre, vor dem der Skill warnt: kein fast schwarzer Vollbildhintergrund mit einem grellen Akzent. Der helle Grund von v1 bleibt Standard. Dunkel ist die Schiene, nicht die Anwendung.

---

# Teil 3: Informationsarchitektur

## 3.1 Das Skalierungsprinzip

Die Frage des Auftrags lautet, ob die Plattform mit 100 Funktionen noch bedienbar ist. Die Antwort hängt an einem Satz:

> **Die Navigation wächst mit den Rollen, nicht mit der Zahl der Funktionen.**

Man kann nicht zu 100 Funktionen navigieren. Man kann zu etwa fünf Orten navigieren und dort das finden, was zum jeweiligen Gegenstand gehört. Drei Mechanismen tragen das:

| Mechanismus | Aufgabe |
|---|---|
| **Stabile Primärnavigation** | maximal fünf Einträge, feste Positionen, wächst nie |
| **Kontextnavigation am Gegenstand** | eine Funktion, die einen Kontakt betrifft, erscheint am Kontakt |
| **Suche und Befehlsleiste** | der eine Weg zu allem, was man nicht sucht, sondern kennt |

Die Wissensdatenbank belegt, was bei Verstoß passiert: Das Ultimate Tool wirkte überwältigend, und Bereiche wurden **entfernt**. Also verworfene Arbeit. Und in `17_BEST_PRACTICES.md`: Bei umfangreichen Werkzeugen entscheidet die Navigation über den Nutzen, nicht der Inhaltsumfang.

## 3.2 Fünf Navigationsebenen

| Ebene | Was | Wo |
|---|---|---|
| 1 Primär | fünf Bereiche | untere Leiste mobil, linke Schiene Desktop |
| 2 Sekundär | Unterbereiche eines Bereichs | Reiter oder Liste im Bereich |
| 3 Kontext | Handlungen an einem Gegenstand | am Gegenstand selbst |
| 4 Befehle | alles, sofern bekannt | Suche mobil, Befehlsleiste Desktop |
| 5 Verlauf | zuletzt verwendet, Favoriten | Startseite und Befehlsleiste |

## 3.3 Primärnavigation

Fünf Einträge. **Feste Positionen. Sie verschieben sich nie**, auch wenn ein Eintrag ausgeblendet ist. Begründung: Muskelgedächtnis. Eine Leiste, die je nach Rolle umsortiert, muss bei jeder Nutzung neu gelesen werden.

| Position | Bereich | Sichtbar für | Aufgabe |
|---|---|---|---|
| 1 | **Heute** | alle | Tagesplan. Der eine Ort, an dem der Tag beginnt |
| 2 | **Kontakte** | alle | Pipeline und Kontaktpflege |
| 3 | **Ascent** | alle | der Coach |
| 4 | **Team** | nur mit Downline | Struktur, Aktivierung, Kennzahlen |
| 5 | **Mehr** | alle | strukturierter Einstieg in alles Übrige |

Position 4 ist an eine **Beziehung** gebunden, nicht an eine Rolle. Wer eine Downline hat, sieht Team. Das entspricht F2, wo Sichtbarkeit an der Beziehung hängt und nicht an einer zugewiesenen Rolle. Ohne Downline bleibt der Platz leer, die übrigen vier behalten ihre Position.

**Ascent liegt bewusst in der Mitte.** Er ist die Funktion mit dem höchsten Erklärwert und der größten Nutzungsfrequenz nach Heute, und die Mitte ist mit dem Daumen am leichtesten erreichbar.

## 3.4 Der Bereich Mehr ist kein Sammelbecken

Der häufigste Fehler an dieser Stelle: Mehr wird eine wachsende Liste. Genau daran ist laut Wissensdatenbank das Ultimate Tool gescheitert.

**Mehr hat sechs feste Abteilungen. Sie wachsen nicht. Neue Funktionen werden einer davon zugeordnet.**

| Abteilung | Inhalt heute | Sichtbarkeit |
|---|---|---|
| **Mein Geschäft** | Rang und Qualifikation, Lizenzstatus, Ziele, Fortschritt, Auszeichnungen | alle |
| **Wissen** | Wissensdatenbank, Training und Journey, Produkte und Katalog | alle, Inhalte nach Freigabe |
| **Kommunikation** | Nachrichten, Termine, Benachrichtigungen | alle |
| **Werkzeuge** | die Werkzeuge der Generation 1 aus `external_tools` | nach Freigabestufe |
| **Verwaltung** | Nutzer, Rollen, Rechte, Wissensfreigabe, Produktpflege, KI, Prüfprotokoll, Datenschutz | **nur mit Berechtigung** |
| **Konto** | Profil, Sprache, Organisation, Theme, Abmelden | alle |

Das ist die Antwort auf 100 Funktionen: **sechs Schubladen mit festen Namen.** Eine neue Funktion kommt in eine bestehende Schublade oder an einen Gegenstand. Sie bekommt keinen neuen Menüpunkt. Wenn eine Funktion in keine Schublade passt, ist das ein Hinweis, dass sie nicht zum Produkt gehört.

## 3.5 Vollständige Seitenkarte

```
Heute
  Tagesplan
  Morgen-Festlegung
  Fokusmodus
  Tagesrückblick

Kontakte
  Liste, filterbar
  Kontaktdetail
    Zeitleiste der Ereignisse
    Phase und naechster Schritt
    Werkzeuge teilen
    Ascent zu diesem Kontakt          <- Kontextsprung, kein eigener Bereich
  Neuer Kontakt

Ascent
  Unterhaltung
  Verlauf
  Themenwahl beim Start

Team                                   [nur mit Downline]
  Struktur
  Mitgliedsprofil
  Aktivierung                          [Berechtigung can_view_team]
  Kennzahlen                           [Berechtigung can_view_reports]

Mehr
  Mein Geschaeft
    Rang und Qualifikation
    Lizenzstatus
    Ziele
    Fortschritt und Auszeichnungen
  Wissen
    Wissensdatenbank, lesen
    Training und Journey
    Produkte und Katalog
  Kommunikation
    Nachrichten
    Termine
    Benachrichtigungen
  Werkzeuge
    externe Werkzeuge, nach Freigabestufe
  Verwaltung                           [nur mit Berechtigung, je Eintrag]
    Nutzer und Mitgliedschaften        can_manage_users
    Rollen                             can_manage_roles
    Berechtigungen                     can_manage_permissions
    Wissen verwalten und freigeben     can_manage_documents / can_approve_documents
    Produkte pflegen                   can_manage_products
    Training pflegen                   can_manage_training
    Nachrichten und Termine pflegen    can_manage_news / can_manage_events
    Ascent konfigurieren               can_manage_ai
    Auswertungen                       can_view_reports
    Pruefprotokoll                     can_view_audit
    Datenschutz                        can_manage_privacy
    Systemeinstellungen                can_manage_system
  Konto
    Profil
    Sprache
    Organisation wechseln              [nur bei mehreren Mitgliedschaften]
    Erscheinungsbild
    Abmelden
```

## 3.6 Bereiche, die nie in der Navigation erscheinen

| Bereich | Warum | Wie erreichbar |
|---|---|---|
| Registrierung | vor der Anmeldung | Einladungslink |
| Anmeldung | vor der Anmeldung | Startadresse |
| Kontaktdetail | Gegenstand, kein Bereich | über die Liste oder Suche |
| Mitgliedsprofil | Gegenstand | über Team oder Suche |
| Ascent zu einem Kontakt | Kontextsprung | vom Kontakt aus |
| Wissensartikel | Gegenstand | über Suche oder Zitat |
| Fehlerseiten | Zustand | automatisch |
| Notfallzugriff auf Fremddaten | soll wehtun, siehe F2 | nur aus Datenschutz, mit Begründung |
| Prüfprotokoll-Einzeleintrag | Gegenstand | aus dem Protokoll |

Regel: **Gegenstände haben keine Menüpunkte.** Nur Bereiche haben Menüpunkte. Diese Regel allein verhindert das Wachstum der Navigation, denn die meisten neuen Funktionen betreffen Gegenstände.

## 3.7 Wie sich die Navigation je Rolle verändert

Sie verändert sich **kaum**, und das ist beabsichtigt.

| Prinzipal | Primärnavigation | Mehr |
|---|---|---|
| Berater ohne Downline | 4 Einträge, Team leer | 5 Abteilungen, Verwaltung fehlt |
| Berater mit Downline | 5 Einträge | 5 Abteilungen |
| Admin | 5 Einträge | 6 Abteilungen, Verwaltung nach erteilten Berechtigungen |
| Super-Admin | 5 Einträge | 6 Abteilungen, Verwaltung vollständig |
| Plattformbetreiber | eigene Oberfläche, kein Mandantenzugang | entfällt |

**Verbindliche Regel: Ausblenden, nicht deaktivieren.** Eine sichtbare, aber gesperrte Funktion erzeugt die Frage, wie man sie freischaltet, und die Antwort lautet in einem Vertriebssystem oft „gar nicht". Das ist Frustration ohne Nutzen.

**Ausnahme, eng begrenzt:** Wo eine Funktion an einen erreichbaren Zustand gebunden ist, wird sie sichtbar und erklärt. Beispiel: Team erscheint erst mit der ersten gesponserten Person. Hier ist der Hinweis „erscheint, sobald du deinen ersten Partner hast" motivierend statt frustrierend.

## 3.8 Brotkrumen

Auf dem Telefon **keine** Brotkrumen. Begründung: Die Tiefe beträgt maximal drei Ebenen, und eine Brotkrumenleiste kostet auf 375 Pixeln Breite mehr, als sie einbringt. Stattdessen ein Zurück mit Zielbenennung, also „Zurück zu Kontakte" statt nur einem Pfeil.

Auf dem Desktop Brotkrumen ab der zweiten Ebene, weil dort Breite vorhanden ist und die Schiene den Kontext nicht vollständig zeigt.

Verbindlich für beide: **Maximal drei Ebenen.** Wer eine vierte braucht, hat den Gegenstand am falschen Ort eingehängt.

## 3.9 Zwei Änderungswünsche an F2 und F3

Die Arbeitsregeln verlangen für Abweichungen von bestehender Architektur eine Begründung mit Nutzen, Risiken und Alternativen. Zwei Vorgaben aus F2 und F3 kann ich in ihrer wörtlichen Form nicht empfehlen.

### Ä1: Aktive Organisation nur bei Mehrdeutigkeit dauerhaft sichtbar

**F2 verlangt:** die aktive Organisation dauerhaft sichtbar.

**Empfehlung:** dauerhaft sichtbar **nur, wenn die Identität mehr als eine aktive Mitgliedschaft hat.**

| | |
|---|---|
| **Nutzen** | Bei einer Mitgliedschaft, dem heutigen Fall für alle Nutzer, ist die Anzeige eine feste Zeile ohne Informationswert. Auf 375 Pixeln Breite ist das der teuerste Platz im Produkt |
| **Risiko** | Sehr gering. Bei genau einer Mitgliedschaft ist Verwechslung ausgeschlossen |
| **Alternative** | Wörtliche Umsetzung. Kostet dauerhaft eine Zeile für null Information |
| **Langfristig** | Sobald jemand eine zweite Mitgliedschaft erhält, erscheint die Anzeige automatisch. Der Wechsel ist ein Ereignis, das der Nutzer bemerkt, und genau dann braucht er die Anzeige |

Der Zweck der Vorgabe, nämlich Fehleingaben im falschen Mandanten zu verhindern, bleibt vollständig erfüllt. Er greift nur dann, wenn er greifen kann.

**Zusätzlich verbindlich:** Bei mehreren Mitgliedschaften erscheint die Organisation **in der Schiene**, also in dem dunklen Träger, der auch die Marke hält. Damit ist sie immer im Blick, ohne einen eigenen Balken zu erzwingen.

### Ä2: Sprachwechsler nicht dauerhaft sichtbar

**F3 verlangt:** Sprachwechsler dauerhaft sichtbar.

**Empfehlung:** Sprachwechsler unter **Konto**. Dauerhaft sichtbar bleibt dagegen die **Kennzeichnung des Sprach-Fallbacks am Inhalt**, und das ist der eigentlich wichtige Teil der Vorgabe.

| | |
|---|---|
| **Nutzen** | Die Sprache wird ein- bis zweimal im Leben eines Kontos gewechselt. Ein dauerhaftes Bedienelement dafür verbraucht einen der wenigen Plätze in der Navigation, den täglich genutzte Funktionen brauchen |
| **Risiko** | Ein Nutzer in der falschen Sprache findet den Wechsler nicht. **Gegenmaßnahme:** Der Wechsler erscheint zusätzlich auf der Anmeldeseite und im ersten Onboarding-Schritt, also genau dort, wo die Sprache erstmals falsch sein kann. Und er ist über die Suche erreichbar |
| **Alternative** | Wörtliche Umsetzung. Ein dauerhaftes Element für eine sehr seltene Handlung |
| **Langfristig** | Unverändert tragfähig. Kommen weitere Sprachen hinzu, ändert sich nur der Inhalt der Auswahl |

**Was ausdrücklich dauerhaft sichtbar bleibt:** die Kennzeichnung, wenn ein Inhalt aus der Fallback-Kette stammt. F3 verlangt, dass ein Sprachwechsel nie stillschweigend geschieht. Diese Kennzeichnung sitzt am Inhalt, nicht in der Navigation, und ist dort wirksamer, weil sie im Moment des Lesens erscheint.

Beide Änderungen sind Vorschläge und stehen unter Ihrer Freigabe. Ohne Freigabe setze ich die wörtliche Fassung um.

---

# Teil 4: Drei Oberflächen, eine Architektur

## 4.1 Grundsatz

**Eine Informationsarchitektur, drei Darstellungen.** Nicht drei Architekturen.

Dieselbe Seitenkarte, dieselben Namen, dieselben Reihenfolgen. Was sich unterscheidet, ist ausschließlich die Anordnung. Begründung: Drei Architekturen bedeuten dreifache Pflege, dreifache Prüfung und drei Orte, an denen eine Berechtigung falsch abgebildet sein kann.

## 4.2 Haltepunkte

| Name | Breite | Leitfläche | Anordnung |
|---|---|---|---|
| Kompakt | bis 767 | **Telefon, die Leitfläche** | untere Leiste, ein Inhaltsbereich |
| Mittel | 768 bis 1279 | Tablet | linke Schiene schmal, ein Inhaltsbereich, Detail als Overlay |
| Weit | ab 1280 | Desktop | linke Schiene, Liste und Detail nebeneinander |

**Das Telefon ist die Leitfläche, nicht der kleinste Fall.** Die Wissensdatenbank belegt, dass ausschließlich vom iPhone gearbeitet wird. Ein Entwurf, der am Desktop beginnt und nach unten verkleinert, verliert genau dort Qualität, wo alle Nutzer sind.

## 4.3 Eine ehrliche Empfehlung zum Umfang

Der Auftrag verlangt Wireframes für drei Flächen. Die liefere ich. Zur Umsetzung empfehle ich eine Reihenfolge:

| Fläche | Empfehlung |
|---|---|
| Kompakt | vollständig ausbauen. Hier sind die Nutzer |
| Weit | **responsiv** aus denselben Bausteinen, nicht eigens optimiert |
| Mittel | ergibt sich aus beiden, kein eigener Entwurf |

Begründung: Eine eigens für den Desktop optimierte Oberfläche verdreifacht den Aufwand für eine Nutzergruppe, die es heute nicht gibt. Sobald ein Unternehmenskunde mit Schreibtischarbeitsplätzen dazukommt, ist der Ausbau eine Erweiterung und kein Umbau, weil die Architektur ihn vorsieht. Nichts in diesem Dokument präjudiziert gegen den Desktop.

## 4.4 Berührungsziele und Erreichbarkeit

| Regel | Wert | Begründung |
|---|---|---|
| Mindestgröße Berührungsziel | 44 mal 44 Punkte | aus v1 übernommen |
| Primäre Handlung | im unteren Drittel | Daumenreichweite bei einhändiger Bedienung |
| Zerstörende Handlung | nie im unteren Drittel | ein versehentlicher Daumendruck darf nichts löschen |
| Abstand zwischen Zielen | mindestens 8 Punkte | |
| Unterer Sicherheitsabstand | Systemabstand plus 8 | Geräte ohne Knopf |

Die dritte Regel ist eine Konsequenz aus der zweiten und wird regelmäßig übersehen: Wenn die bequemste Zone der Handlung dient, darf dort nichts Zerstörendes liegen.

---

# Teil 5: Suche, Befehle, Verlauf

## 5.1 Die Antwort auf 100 Funktionen

Ein Index, zwei Zugänge.

| Fläche | Zugang | Auslösung |
|---|---|---|
| Kompakt | Suchfeld auf Heute und in jedem Bereich | Berührung |
| Weit | Befehlsleiste | Tastenkürzel und Schaltfläche |

**Ein gemeinsamer Index.** Getrennte Indizes für Suche und Befehlsleiste würden bedeuten, dass eine Funktion an einem Ort auffindbar ist und am anderen nicht. Das ist der Anfang von Inkonsistenz.

## 5.2 Was der Index enthält

| Art | Beispiel | Sichtbarkeit |
|---|---|---|
| Bereiche und Unterbereiche | Kontakte, Rang und Qualifikation | nach Berechtigung |
| Gegenstände | ein Kontakt, ein Mitglied, ein Wissensartikel | nach RLS |
| Handlungen | Kontakt anlegen, Tagesplan erzeugen | nach Berechtigung |
| Einstellungen | Sprache, Erscheinungsbild, Organisation wechseln | alle |
| Wissen | Volltext und Bedeutung | nach Freigabe und Sprache |

**Verbindlich: Der Index gibt niemals etwas aus, das der Prinzipal nicht sehen darf.** Er ist kein zweiter Zugriffsweg, sondern eine andere Darstellung desselben. Das folgt unmittelbar aus F2: Die Datenbank ist die Autorität, die Oberfläche ist Darstellung. Ein Suchergebnis, das auf eine gesperrte Seite führt, wäre ein Informationsleck über die Existenz.

## 5.3 Schnellhandlungen

Höchstens vier, kontextabhängig, immer an derselben Stelle.

| Kontext | Schnellhandlungen |
|---|---|
| Heute | Kontakt anlegen, Ascent fragen, Tagesplan erzeugen |
| Kontakte | Kontakt anlegen, Filter, Suche |
| Kontaktdetail | Ereignis erfassen, Nachricht entwerfen, Werkzeug teilen |
| Team | Mitglied suchen, Aktivierung ansehen |

Begründung für die Obergrenze: Vier Elemente sind ohne Zählen erfassbar. Ab sechs wird gelesen statt erkannt, und der Geschwindigkeitsgewinn ist verloren.

## 5.4 Verlauf und Favoriten

| Element | Verhalten | Wo |
|---|---|---|
| Zuletzt verwendet | die letzten fünf Gegenstände, automatisch | Heute und Befehlsleiste |
| Favoriten | manuell markiert, ohne Obergrenze | Befehlsleiste, auf Heute die ersten drei |

Bewusst zurückhaltend: Zuletzt verwendet ist automatisch und damit kostenlos für den Nutzer. Favoriten kosten eine Handlung und werden von den meisten nie benutzt. Deshalb sind sie vorhanden, aber nicht prominent. Ein Produkt, das Favoriten in den Mittelpunkt stellt, verlangt Einrichtungsarbeit vor dem ersten Nutzen.

---

# Teil 6: Design-System v2

## 6.1 Was aus v1 unverändert bleibt

Farbwelt, Akzentregeln, Typografie, Funktionsfarben, Claim-Regel. Siehe 0.1. Ich wiederhole sie hier nicht, um keine zweite Wahrheitsquelle zu erzeugen. **v1 bleibt das Farb- und Markendokument.** v2 ergänzt Struktur, Komponenten und Zustände.

## 6.2 Zwei Ergänzungen am Token-System

**Ergänzung 1: Ein Token für funktionale Ränder.**

Befund aus 0.3: `line` liegt bei 1,18 zu 1. Als dekorative Trennlinie zulässig, als einzige Kennzeichnung eines Eingabefeldes nicht.

| Token | Rolle | Anforderung |
|---|---|---|
| `line` | dekorative Trennung, Tabellenlinien, Kartenränder | keine, von der Anforderung ausgenommen |
| **`line-strong`**, neu | Eingabefelder, Auswahlfelder, alles, was als bedienbar erkennbar sein muss | mindestens 3 zu 1 gegen den Untergrund |

Ohne diese Trennung müsste man entweder `line` verdunkeln, was die ruhige Anmutung von v1 zerstört, oder die Anforderung verletzen. Zwei Token lösen beides.

**Ergänzung 2: Dark Mode wird verdrahtet.**

v1 hat die dunklen Werte definiert, aber keinen Umschalter. Verbindlich:

| Regel | Wert |
|---|---|
| Voreinstellung | Systemeinstellung des Geräts |
| Überschreibung | hell, dunkel, System. Am Konto gespeichert |
| Speicherort | **Identität**, nicht Mitgliedschaft. Nach F3 Teil 8.1 ist eine Anzeigeeinstellung persönlich |
| Schiene | bleibt in beiden Themes dunkel, siehe Teil 2 |

Das dunkle Theme ist nach der Messung in 0.3 in jeder Hinsicht das kontraststärkere. Es wird trotzdem nicht zur Voreinstellung, weil v1 den hellen Grund aus der Logo-Familie begründet und ein Wechsel eine Markenänderung ohne Anlass wäre.

## 6.3 Typografie

Inter bleibt, wie in v1 entschieden. Ich habe geprüft, ob der Enterprise-Anspruch eine zweite, charaktervollere Schrift verlangt.

**Ergebnis: nein.** Begründung:

1. v1 begründet Markenmomente über **Behandlung** statt über eine zweite Schrift, und leitet die Behandlung aus dem Logo ab: `ASCEND` leicht, `OS` fett. Ich habe das nachgemessen, Deckungsgrad 15,98 gegen 37,35 Prozent. Die Ableitung ist korrekt
2. Eine zweite Schriftdatei kostet Ladezeit auf der Leitfläche, dem Telefon
3. Linear und Vercel verwenden ebenfalls je eine Grotesk. Das Qualitätsniveau entsteht dort nicht durch Schriftvielfalt

**Falls** später eine Displayschrift gewünscht wird, gilt: ausschließlich auf Login und Splash, also dort, wo das Logo ohnehin steht, und niemals in der Arbeitsoberfläche.

Typenskala, ergänzend zu v1:

| Rolle | Größe | Gewicht | Bemerkung |
|---|---|---|---|
| Marke, Versalien | 14 bis 20 | 300 | `tracking` 0,25em, aus v1 |
| Seitentitel | 24 | 600 | |
| Abschnittstitel | 18 | 600 | |
| Bereichslabel | 12 | 500 | Versalien, `muted`, aus v1 |
| Fließtext | 16 | 400 | **nie kleiner auf dem Telefon** |
| Sekundärtext | 14 | 400 | `muted` |
| Zahlen | je Kontext | 500 | `tabular-nums`, aus v1 |

16 Punkte als Mindestgröße für Fließtext auf dem Telefon ist verbindlich. Darunter beginnt auf iOS das automatische Vergrößern von Eingabefeldern, was das Layout verschiebt.

## 6.4 Symbole: die Behebung der Emoji-Frage

**Befund im Bestand: 27 Verstöße in 14 Dateien.**

| Art | Anzahl | Beispiele |
|---|---|---|
| Bildzeichen | 10 | Sonne, Personen, Schild, Stift, Zielscheibe, Telefon, Brief, Rakete, Blatt, Arm |
| Unicode-Zeichen als Symbol | 17 | Pfeile, Häkchen |

Ein Verstoß stammt von mir selbst, das Blatt-Zeichen in der Uploadfläche der Wissensdatenbank.

v1 hat das Problem in Abschnitt 7 selbst benannt und die Behebung **bewusst zurückgestellt**, mit der Begründung, in der Beta-Phase keinen Funktionszuwachs zu erzeugen. Diese Begründung war zu ihrer Zeit richtig. Sie trägt jetzt nicht mehr, weil die Vorgabe verbindlich ist und weil wir Architektur festlegen, nicht Funktionen bauen.

**Verbindlich:**

| Regel | Festlegung |
|---|---|
| Bibliothek | **Lucide** |
| Strichstärke | 1,5 Pixel |
| Größen | 16, 20, 24. Keine Zwischenwerte |
| Farbe | `currentColor`, nie fest |
| Unicode als Symbol | untersagt, auch Pfeile und Häkchen |
| Emoji in der Oberfläche | untersagt |
| Emoji in Nutzerinhalten | zulässig. Ein Kontaktname darf enthalten, was der Nutzer schreibt |

Begründung für Lucide gegenüber Heroicons und Tabler: Lucide hat eine einheitliche Strichstärke über den gesamten Satz, was bei gemischten Größen wichtiger ist als der Umfang. Heroicons liegt in zwei Varianten vor, deren Mischung eine häufige Inkonsistenzquelle ist. Tabler ist umfangreicher, aber in der Strichführung weniger einheitlich. Alle drei sind zulässig, Lucide ist die Empfehlung.

**Das Logo ist kein Symbol aus dem Satz.** Es bleibt ein eigenes Asset und wird nie durch ein Bibliothekssymbol ersetzt oder ergänzt.

## 6.5 Raster und Abstände

| Größe | Wert | Verwendung |
|---|---|---|
| Basiseinheit | 4 | alle Abstände sind Vielfache |
| Dicht | 8 | innerhalb einer Komponente |
| Standard | 16 | zwischen Komponenten |
| Abschnitt | 24 | zwischen Abschnitten |
| Bereich | 32 | über einem Seitentitel |
| Seitenrand kompakt | 16 | |
| Seitenrand weit | 32 | |
| Maximale Textbreite | 72 Zeichen | Lesbarkeit, betrifft Wissen und Ascent |

Raster: kompakt eine Spalte, mittel zwei, weit zwölf mit Schiene. **Kein mehrspaltiges Layout im kompakten Fall.** Zwei Spalten auf 375 Pixeln erzeugen Spalten, die für keinen Inhalt breit genug sind.

## 6.6 Komponenten

Für jede Komponente die Festlegung, die später Konsistenz erzwingt.

| Komponente | Festlegung |
|---|---|
| **Schaltfläche** | drei Stufen: primär Graphit, sekundär Rand, unauffällig nur Text. Genau **eine** primäre Handlung je Bildschirm |
| **Eingabefeld** | Rand `line-strong`, Beschriftung immer sichtbar, nie nur Platzhalter |
| **Auswahl** | unter 7 Werten Segmentanzeige, ab 7 Auswahlliste, ab 20 mit Suche |
| **Karte** | Behälter für einen Gegenstand. Kein Schatten, nur Rand. Schatten ausschließlich für schwebende Ebenen |
| **Liste** | die Leitform auf dem Telefon. Zeilenhöhe mindestens 56, ein Gegenstand je Zeile |
| **Tabelle** | **erst ab weit.** Im kompakten Fall wird eine Tabelle zur Liste, nicht zu einer scrollenden Tabelle |
| **Reiter** | maximal vier, sonst Auswahlliste. Kein horizontales Scrollen von Reitern |
| **Dialog** | nur für Bestätigungen, unter 80 Pixeln Höhe Inhalt |
| **Schublade** | für Formulare und Detailansichten im kompakten Fall, von unten |
| **Filter** | in einer Schublade, nicht als aufgeklappte Leiste. Aktive Filter als entfernbare Marke über der Liste |
| **Benachrichtigung** | kurze Meldung unten, 4 Sekunden, eine Rückgängig-Handlung zulässig |
| **Ladeplatzhalter** | Form des erwarteten Inhalts, nie ein Drehkreis für ganze Seiten |
| **Leerer Zustand** | Aussage, Begründung, **eine** Handlung. Kein Bild, keine Zeichnung |
| **Fehlerzustand** | was geschah, was zu tun ist. Keine Entschuldigung, keine technischen Kennungen |
| **Bestätigung** | nur bei nicht umkehrbaren Handlungen. Umkehrbares wird ausgeführt und mit Rückgängig angeboten |

Die Regel zu Tabellen ist die wichtigste für den Enterprise-Anspruch. Eine Tabelle auf einem Telefon ist immer ein Kompromiss. Der Ausweg über horizontales Scrollen ist der schlechteste, weil dann Spalten verborgen sind, deren Existenz man nicht sieht.

Die Regel zu Bestätigungen ist die wichtigste für die Geschwindigkeit. Jede unnötige Bestätigung ist ein Klick zwischen dem Nutzer und seiner Arbeit.

## 6.7 Bewegung

| Vorgang | Dauer | Kurve |
|---|---|---|
| Zustandswechsel, Berührung | 120 ms | ease-out |
| Ein- und Ausblenden von Ebenen | 200 ms | ease-out |
| Schublade | 240 ms | eigene Kurve, leicht überschwingfrei |
| Seitenwechsel | **keine** | |

**Kein Seitenwechseleffekt.** Begründung: Er kostet bei jedem Wechsel Zeit, und im kompakten Fall wechselt man häufig. Wahrgenommene Geschwindigkeit entsteht durch Weglassen, nicht durch flüssige Übergänge.

Verbindlich: ausschließlich `transform` und `opacity`, damit die Grafikeinheit arbeitet. `prefers-reduced-motion` wird respektiert und schaltet alles außer Zustandswechseln ab.

## 6.8 Barrierefreiheit

| Anforderung | Festlegung |
|---|---|
| Textkontrast | mindestens 4,5 zu 1. In v1 geprüft und erfüllt |
| Grafikkontrast | mindestens 3 zu 1. **Heute nicht erfüllt bei `accent` im hellen Theme**, siehe 0.3 |
| Status nie nur über Farbe | immer zusätzlich Text oder Symbol. Aus v1 |
| Fokus sichtbar | Ring in `accent`, mindestens 2 Pixel, nie entfernt |
| Bedienbarkeit per Tastatur | vollständig, auch wenn das Telefon die Leitfläche ist |
| Beschriftungen | jede Eingabe hat eine sichtbare Beschriftung |
| Symbole ohne Text | brauchen eine Textalternative |
| Sprache am Element | wenn ein Inhalt aus der Fallback-Kette stammt, siehe F3 |
| Laufrichtung | logische CSS-Eigenschaften, **ab sofort verbindlich**, aus F3 |
| Bewegung | `prefers-reduced-motion` |

Der zweite Punkt ist ein offener Befund und steht in Teil 10.

---

# Teil 7: Wireframes

## 7.1 Drei Layoutmuster statt dreiunddreißig Entwürfe

Jeder Bildschirm folgt einem von drei Mustern. Wenn ein Bildschirm ein viertes Muster braucht, ist das ein Hinweis auf eine Fehlplatzierung.

| Muster | Für | Beispiele |
|---|---|---|
| **A Liste und Detail** | Sammlungen von Gegenständen | Kontakte, Team, Wissen, Produkte, Nachrichten, Nutzerverwaltung |
| **B Übersicht** | Zustand und nächste Handlung | Heute, Dashboard, Rang, Fortschritt |
| **C Unterhaltung** | fortlaufender Verlauf | Ascent |

Das ist die eigentliche Antwort auf 100 Funktionen: Der zwanzigste Listenbildschirm braucht keinen neuen Entwurf.

## 7.2 Grundgerüst, alle drei Flächen

```
KOMPAKT bis 767                 MITTEL 768-1279              WEIT ab 1280
+---------------------+  +--------------------------+  +----------------------------------+
| Kopf: Titel   [Akt] |  | []| Kopf         [Aktion]|  | []| Kopf              [Aktion]   |
+---------------------+  |   +----------------------+  | A |  Brotkrumen                   |
|                     |  | S |                      |  | S +------------------------------+
|   Inhalt            |  | c |   Inhalt             |  | c |  Liste     |  Detail         |
|   eine Spalte       |  | h |   eine Spalte        |  | h |            |                 |
|                     |  | i |   Detail als Overlay |  | i |            |                 |
|                     |  | e |                      |  | e |            |                 |
+---------------------+  | n |                      |  | n |            |                 |
| Heute Kont Asc Team |  | e |                      |  | e |            |                 |
|         Mehr        |  +--------------------------+  +----------------------------------+
+---------------------+
  ^ dunkle Schiene         ^ dunkle Schiene, schmal      ^ dunkle Schiene, breit
    traegt das Symbol        traegt das Symbol             traegt Symbol + Organisation
```

Die dunkle Schiene ist in allen drei Fällen derselbe Baustein an unterschiedlicher Position. Sie trägt das Symbol und, bei mehreren Mitgliedschaften, die aktive Organisation.

## 7.3 Anmeldung

```
KOMPAKT                                WEIT
+-----------------------------+        +-------------------------------------------+
|                             |        |                    |                      |
|   +---------------------+   |        |   dunkle Flaeche   |   helle Flaeche      |
|   |    dunkle Flaeche   |   |        |                    |                      |
|   |                     |   |        |     [Symbol]       |   Anmelden           |
|   |      [Symbol]       |   |        |     ASCENDOS       |                      |
|   |      ASCENDOS       |   |        |     Build a        |   E-Mail             |
|   |                     |   |        |     better         |   [_______________]  |
|   +---------------------+   |        |     tomorrow       |                      |
|                             |        |                    |   Passwort           |
|   E-Mail                    |        |                    |   [_______________]  |
|   [_____________________]   |        |                    |                      |
|                             |        |                    |   [   Anmelden   ]   |
|   Passwort                  |        |                    |                      |
|   [_____________________]   |        |                    |   Einladungscode?    |
|                             |        |                    |   Sprache: Deutsch   |
|   [      Anmelden       ]   |        |                    |                      |
|                             |        +-------------------------------------------+
|   Einladungscode einloesen  |
|   Sprache: Deutsch          |         Der Claim erscheint hier und nur hier
+-----------------------------+         plus Splash. Nie in der Arbeits-UI.
```

Die dunkle Fläche hinter dem Symbol ist die Umsetzung von Teil 2. Der Sprachwechsler steht hier ausdrücklich, weil dies der Ort ist, an dem die Sprache erstmals falsch sein kann, siehe Ä2.

## 7.4 Heute, Muster B

```
KOMPAKT
+---------------------------------+
| Heute, 25. Juli        [Suche]  |
+---------------------------------+
| Guten Morgen, Baran             |
| 3 Missionen fuer heute          |
|                                 |
| +-----------------------------+ |
| | 1  Mehmet kontaktieren      | |   Ordinale als Chevron, aus v1
| |    Seit 9 Tagen kein        | |
| |    Kontakt                  | |
| |    [Erledigt] [Verschieben] | |
| +-----------------------------+ |
| +-----------------------------+ |
| | 2  3-Way-Call mit Ayse      | |
| +-----------------------------+ |
| +-----------------------------+ |
| | 3  Drei neue Menschen       | |
| +-----------------------------+ |
|                                 |
| Schnell                         |
| [Kontakt] [Ascent] [Plan]       |
|                                 |
| Zuletzt                         |
| Mehmet · Ayse · Vertriebsplan   |
+---------------------------------+
| Heute  Kont  Ascent  Team  Mehr |
+---------------------------------+
```

Der Fortschrittsbalken der Journey erscheint in `accent`, wie in v1 festgelegt, und **nie als einziger Träger** der Information. Daneben steht immer „Tag 3 von 7" als Text. Das ist die Gegenmaßnahme zum Befund aus 0.3.

## 7.5 Kontakte, Muster A

```
KOMPAKT, Liste                        KOMPAKT, Detail
+-----------------------------+       +-----------------------------+
| Kontakte        [+] [Suche] |       | < Zurueck zu Kontakte       |
+-----------------------------+       +-----------------------------+
| [Alle] [Faellig] [Lead] ... |       | Mehmet Yilmaz               |
+-----------------------------+       | Praesentation gesehen       |
| Mehmet Yilmaz               |       |                             |
| Praesentation · vor 9 Tagen |       | Naechster Schritt           |
+-----------------------------+       | 3-Way-Call vereinbaren      |
| Ayse Demir                  |       |                             |
| Fit Check · heute faellig   |       | [Ereignis]  [Nachricht]     |
+-----------------------------+       | [Werkzeug]  [Ascent fragen] |
| ...                         |       |                             |
+-----------------------------+       | Zeitleiste                  |
| Heute Kont Ascent Team Mehr |       |  16.07  Praesentation       |
+-----------------------------+       |  12.07  Erstes Gespraech    |
                                      |  10.07  Kontakt erstellt    |
WEIT: beide Spalten gleichzeitig      +-----------------------------+
```

„Ascent fragen" ist der Kontextsprung aus 3.6: Ascent erhält den Kontakt als Kontext, ohne dass der Nutzer ihn beschreiben muss. Das ist der wichtigste Weg zwischen zwei Bereichen im ganzen Produkt, weil er direkt auf den dokumentierten Engpass wirkt.

## 7.6 Ascent, Muster C

```
KOMPAKT
+---------------------------------+
| Ascent              [Symbol]    |   <- Symbol oben rechts, verbindlich
+---------------------------------+      auf dunklem Traeger, Teil 2
| Kontext: Mehmet Yilmaz    [x]   |
+---------------------------------+
|                                 |
|                     +---------+ |
|                     | Frage   | |
|                     +---------+ |
| +-----------------------------+ |
| | Antwort von Ascent          | |
| |                             | |
| | Quelle: Einwandbehandlung   | |
| | [DE] Uebertragen aus        | |   <- Fallback-Kennzeichnung, F3
| |      Deutsch                | |
| +-----------------------------+ |
|                                 |
+---------------------------------+
| [Nachricht schreiben...]  [>]   |
+---------------------------------+
```

Zwei verbindliche Elemente in diesem Bildschirm:

1. **Das Symbol oben rechts**, ausdrücklich vorgegeben, auf dunklem Träger
2. **Die Fallback-Kennzeichnung am zitierten Inhalt**, aus F3. Sie sitzt am Zitat und nicht in der Kopfzeile, weil sie im Moment des Lesens wirken muss

## 7.7 Team, Wissen, Produkte, Nachrichten, Verwaltung

Alle folgen Muster A. Die Festlegungen je Bildschirm:

| Bildschirm | Liste zeigt | Detail zeigt | Besonderheit |
|---|---|---|---|
| Team, Struktur | Name, Rang, Aktivstatus, Ebene | Mitgliedsprofil, Aggregate | **nie Kontaktnamen der Downline**, F2 |
| Team, Aktivierung | Wer braucht Aufmerksamkeit, mit Begründung | Gesprächsvorschlag | Berechtigung `can_view_team` |
| Wissen | Titel, Kategorie, Sprache, Status | Artikel, maximal 72 Zeichen Breite | Entwürfe nur mit Berechtigung |
| Produkte | Name, Code, Preis | Beschreibung, Anwendung, Duftpyramide | Code **nie** übersetzt, F3 |
| Nachrichten | Titel, Datum | Beitrag | |
| Verwaltung, Nutzer | Name, Rolle, Status | Mitgliedschaft, keine Identitätsfelder | Identitätsdaten nicht änderbar, F2 |

Auf dem Telefon wird jede dieser Listen eine Liste, keine Tabelle. Im weiten Fall darf die Nutzerverwaltung eine Tabelle sein, weil dort Breite und ein Verwaltungskontext vorhanden sind.

## 7.8 Struktur als Visualisierung

Der einzige Bildschirm, der von Muster A abweicht.

```
WEIT
+--------------------------------------------------+
| Struktur                     [Baum] [Liste]      |
+--------------------------------------------------+
|                   (Baran)                        |
|                  /   |   \                       |
|            (Ayse) (Mehmet) (Fatma)                |
|              |        |                          |
|           (Emre)   (Deniz)                        |
|                                                  |
|  Knoten: Name, Rang, Aktivstatus                 |
|  Kein Kontaktname, keine Umsatzzahl              |
+--------------------------------------------------+

KOMPAKT: ausschliesslich Liste mit Einrueckung.
Ein Baum ist auf 375 Pixeln nicht lesbar.
```

Zur Frage nach Three.js und WebGL, siehe Teil 8.

---

# Teil 8: Three.js und WebGL

## 8.1 Wo es sich verdient

Der Auftrag erlaubt WebGL, wo es echten Mehrwert schafft. Ich habe jeden genannten Anwendungsfall geprüft.

| Vorgeschlagener Fall | Bewertung |
|---|---|
| Netzwerkvisualisierung der Struktur | **einziger Fall mit echtem Mehrwert**, und nur ab einer gewissen Größe |
| Premium-Dashboards | nein. Ein Dashboard ist Text und Zahlen. WebGL macht es langsamer, nicht besser |
| Datenvisualisierung | nein. Balken und Linien sind in SVG schärfer und barrierefrei |
| Hintergrundanimationen | nein. Widerspricht der Zurückhaltung von v1 und kostet Akkulaufzeit auf der Leitfläche |
| Hero-Bereiche | nur Login und Splash, und dort ist eine ruhige Fläche stärker als eine Animation |
| Interaktive Übersichten | fällt mit der Netzwerkvisualisierung zusammen |

## 8.2 Die eine Empfehlung, mit Bedingungen

**Struktur als Visualisierung, ausschließlich im weiten Fall, ab etwa 50 Knoten, mit einer Liste als vollwertiger Alternative.**

| Bedingung | Begründung |
|---|---|
| Nur ab weit | Ein Baum ist auf 375 Pixeln nicht lesbar. Der kompakte Fall erhält eine eingerückte Liste, und die ist dort besser, nicht schlechter |
| Erst ab etwa 50 Knoten | Darunter ist SVG schärfer, leichter und barrierefrei |
| Liste ist die Voreinstellung, nicht die Notlösung | Ein Nutzer, der Namen sucht, sucht in einer Liste schneller |
| Kein WebGL auf dem Telefon | Akkulaufzeit und Speicher. Die Wissensdatenbank belegt Telefonnutzung als Regelfall |
| Textalternative zwingend | Eine Zeichenfläche ist für Vorleseprogramme leer. Ohne Alternative wäre die Struktur für blinde Nutzer nicht zugänglich |
| Keine Umsatzzahlen im Knoten | F2, Teil 5, Fußnote 1. Nur Name, Rang, Aktivstatus |

Der letzte Punkt ist eine Berechtigungsfrage, nicht eine Gestaltungsfrage: Eine hübsche Netzwerkgrafik, die Umsätze je Knoten zeigt, verletzt die Compliance-Grenze aus F2 gegen Verdienstbeispiele.

## 8.3 Was ausgeschlossen bleibt

Bewegte Hintergründe, Partikeleffekte, dreidimensionale Diagramme, animierte Übergänge zwischen Bereichen, Glanz- und Spiegeleffekte am Logo.

Der letzte Punkt ausdrücklich: Das Logo trägt bereits einen Verlauf. Eine zusätzliche Animation darauf wäre eine Interpretation und ist untersagt.

---

# Teil 9: UX-Probleme im Bestand

## 9.1 Gefundene Probleme

| # | Problem | Schwere | Empfehlung |
|---|---|---|---|
| U1 | **27 Emoji- und Unicode-Symbole in 14 Dateien** | hoch | Lucide, siehe 6.4. Betrifft praktisch jede Oberfläche |
| U2 | **Kein Dark Mode verdrahtet**, Tokens vorhanden | mittel | 6.2 |
| U3 | `line` bei 1,18 zu 1 als einzige Kennzeichnung von Eingabefeldern | mittel | `line-strong`, 6.2 |
| U4 | `accent` bei 2,64 zu 1 als Grafikelement im hellen Theme | mittel | siehe Teil 10, FD-3 |
| U5 | **Mehr ist heute eine flache Liste** | mittel | sechs feste Abteilungen, 3.4. Ohne das wiederholt sich das Ultimate-Tool-Problem |
| U6 | Keine Suche, kein Sprung zwischen Bereichen | mittel | Teil 5. Mit 25 Bereichen heute noch tragbar, mit 50 nicht |
| U7 | Kein „Ascent zu diesem Kontakt" | mittel | 7.5. Der wirksamste Weg auf den dokumentierten Engpass |
| U8 | Keine Ladeplatzhalter, ganze Seiten warten | niedrig | 6.6 |
| U9 | Leere Zustände ohne Handlung | niedrig | 6.6 |
| U10 | Zurück ohne Zielbenennung | niedrig | 3.8 |
| U11 | Kein Sprachwechsler auf der Anmeldeseite | niedrig | 7.3. Genau dort ist die Sprache erstmals falsch |

## 9.2 Was im Bestand gut ist

Damit die Bewertung nicht einseitig ausfällt.

| Befund | Bewertung |
|---|---|
| Tokens laufen über CSS-Variablen, damit `organizations.branding` sie zur Laufzeit überschreiben kann | vorausschauend. Weiß-Label ohne Neubau ist damit möglich |
| `accent-deep` als eigener Token für Text | löst die häufigste Falle bei Goldtönen, bevor sie auftritt |
| Berührungsziele mindestens 44 Punkte | bereits eingehalten |
| Status nie nur über Farbe | bereits Regel |
| Chevron als wiederkehrendes Motiv | verbindet Marke und Oberfläche ohne Logogebrauch |
| Vier Navigationseinträge statt sieben | die richtige Ausgangsentscheidung |

---

# Teil 10: Fundamententscheidungen

Dokumentiert, begründet, nicht umgesetzt.

## FD-1: Gegenstände haben keine Menüpunkte

**Entscheidung.** Nur Bereiche erhalten Navigationseinträge. Gegenstände werden über Listen, Suche oder Kontextsprünge erreicht.

**Warum später teuer.** Diese Regel ist die einzige, die das Wachstum der Navigation dauerhaft begrenzt. Wird sie einmal gebrochen, gibt es keinen Grund mehr, sie beim nächsten Mal zu halten. Nach zwanzig Funktionen ist die Navigation unrettbar, und die Behebung heißt Umbau jeder Oberfläche, nicht Umsortieren eines Menüs.

**Kosten jetzt: eine Regel. Später: die Navigation neu.**

## FD-2: Sechs feste Abteilungen in Mehr

**Entscheidung.** Mehr hat sechs Abteilungen mit festen Namen. Neue Funktionen werden zugeordnet, nicht angehängt.

**Warum später teuer.** Eine flache Liste, die auf zwanzig Einträge wächst, wird nicht durch Sortieren gerettet. Die Wissensdatenbank belegt den Ausgang: Bereiche wurden entfernt, also Arbeit verworfen.

**Kosten jetzt: eine Struktur mit sechs Namen. Später: Nutzer, die Funktionen nicht finden, und entfernte Funktionen.**

## FD-3: Grafikkontrast des Akzents

**Sachverhalt.** `accent` liegt im hellen Theme bei 2,64 zu 1 als Fläche. Für Grafikelemente, die Information tragen, sind 3 zu 1 gefordert.

**Drei Optionen:**

| Option | Nutzen | Kosten und Risiken |
|---|---|---|
| A: `accent` im hellen Theme abdunkeln | Anforderung erfüllt | Der Champagner verliert seine Leichtigkeit. Widerspricht der Anmutung von v1 |
| B: Ein zweiter Token für tragende Grafikelemente, `accent` bleibt für Dekoration | Anforderung erfüllt, Anmutung bleibt | Ein Token mehr, und die Disziplin muss gehalten werden |
| C: Gegenmaßnahme aus v1 fortschreiben: Champagner nie als einziger Träger | keine Änderung | Formal bleibt die Anforderung unerfüllt. Praktisch benutzbar |

**Meine Empfehlung ist B.** Begründung: Die Gegenmaßnahme aus v1 ist richtig und sollte bleiben, aber sie ist eine Regel, die Menschen einhalten müssen. Ein zweiter Token macht die Einhaltung überprüfbar. Und die Anforderung ist bei einem Produkt mit Enterprise-Anspruch keine Formalie, weil Unternehmenskunden Barrierefreiheit prüfen.

**Diese Entscheidung betrifft v1 und steht deshalb unter Ihrer Freigabe.**

## FD-4: Logische CSS-Eigenschaften ab sofort

**Entscheidung.** Ab sofort für alles Neue verbindlich, kein rückwirkender Umbau vor der Entscheidung über Arabisch.

**Warum später teuer.** Aus F3, Befund T4: 36 von 48 Dateien betroffen, mechanisch, aber nicht automatisierbar, weil einige Angaben tatsächlich links bedeuten und nicht Anfang.

**Wichtig für diesen Meilenstein:** Werden in Meilenstein 4 Oberflächen entworfen, ohne diese Regel zu berücksichtigen, wächst der Rückstand mit jedem Entwurf. Deshalb steht die Regel hier und nicht erst bei der Umsetzung.

## FD-5: Eine Informationsarchitektur, drei Darstellungen

**Entscheidung.** Dieselbe Seitenkarte auf allen Flächen. Keine eigene Desktop-Architektur.

**Warum später teuer.** Zwei Architekturen bedeuten zwei Orte, an denen eine Berechtigung falsch abgebildet sein kann. Das ist nicht nur Pflegeaufwand, sondern eine Sicherheitsfrage: F2 verlangt, dass die Datenbank die Autorität ist und die Oberfläche Darstellung. Zwei Darstellungen mit unterschiedlicher Struktur erhöhen die Wahrscheinlichkeit, dass eine davon eine Funktion zeigt, die sie nicht zeigen darf.

## FD-6: Das Symbol steht immer auf dunklem Grund

**Entscheidung.** Siehe Teil 2, aus der Messung abgeleitet.

**Warum später teuer.** Wird das Symbol zunächst auf hellem Grund verbaut, entsteht in Login, Splash, Navigation, Favicon, PWA-Symbolen und Coach-Header je eine Stelle, an der es halb aufgelöst erscheint. Die Behebung berührt jede davon, plus die erzeugten Symbolsätze für die PWA.

## FD-7: Tabellen erst ab weit

**Entscheidung.** Im kompakten Fall wird jede Tabelle eine Liste.

**Warum später teuer.** Eine horizontal scrollende Tabelle auf dem Telefon verbirgt Spalten, deren Existenz der Nutzer nicht sieht. Wird das Muster einmal eingeführt, wird es kopiert. Der Rückbau betrifft dann jede Liste im Produkt.

---

# Teil 11: Product Experience Architecture Review

## 11.1 Bewertung

| Bereich | Bewertung | Begründung |
|---|---|---|
| **Informationsarchitektur** | tragfähig | Fünf Bereiche, sechs feste Abteilungen, Gegenstände ohne Menüpunkte. Wächst mit Rollen, nicht mit Funktionen |
| **Benutzerführung** | tragfähig | Maximal drei Ebenen, Kontextsprünge am Gegenstand, eine primäre Handlung je Bildschirm |
| **Konsistenz** | tragfähig | Drei Layoutmuster für alle Bildschirme. Der zwanzigste Listenbildschirm braucht keinen Entwurf |
| **Skalierbarkeit** | tragfähig bis etwa 100 Funktionen | Grenze ist nicht die Navigation, sondern die Zahl der Abteilungen. Bei mehr als etwa 12 Einträgen je Abteilung braucht es eine weitere Ebene, und die ist vorgesehen |
| **Wartbarkeit** | tragfähig | Eine Architektur, drei Darstellungen. v1 bleibt das Farbdokument, v2 ergänzt Struktur |
| **Enterprise UX** | tragfähig, mit Einschränkung | Strenge übernommen, Bedienmodell bewusst nicht. Die Einschränkung ist in 1.2 begründet und beabsichtigt |
| **Mobile UX** | **stärkster Bereich** | Telefon ist Leitfläche, nicht kleinster Fall. Daumenzonen, keine Tabellen, keine Seitenwechseleffekte |
| **Accessibility** | tragfähig, ein offener Befund | Textkontraste erfüllt, Grafikkontrast bei `accent` offen, FD-3 |
| **Performance** | tragfähig | Kein WebGL auf dem Telefon, keine Seitenwechseleffekte, ausschließlich `transform` und `opacity`, Sprachkataloge getrennt geladen |
| **Branding** | tragfähig, aus Messung abgeleitet | Dunkle Schiene als Signatur, Logo unverändert, Palette aus v1 |
| **Design-System** | tragfähig | v1 unverändert, v2 ergänzt zwei Token, Symbolsatz, Komponenten, Zustände |
| **Langfristige Tragfähigkeit** | tragfähig | Sieben Fundamententscheidungen benannt, jede mit Kostenvergleich |

## 11.2 Risiken

| Priorität | Risiko | Bewertung |
|---|---|---|
| 1 | **FD-1 oder FD-2 werden gebrochen** | Die Navigation ist danach nicht durch Umsortieren zu retten. Beide Regeln sind billig zu halten und teuer zu heilen |
| 2 | **Logo-SVG fehlt weiter** | Das Symbol soll bei 16 und 24 Pixeln erscheinen. Ein Verlauf von 308 auf 16 Pixel verkleinert wird ein grauer Fleck |
| 3 | Grafikkontrast des Akzents ungelöst, FD-3 | Bei einer Prüfung durch einen Unternehmenskunden ein Befund |
| 4 | 27 Symbolverstöße bleiben | Widerspricht der verbindlichen Vorgabe und der Premium-Linie |
| 5 | Desktop wird ausgebaut, bevor es Desktop-Nutzer gibt | Dreifacher Aufwand ohne Nutzen. Gegenmaßnahme in 4.3 |
| 6 | WebGL wird über den einen Fall hinaus verwendet | Akkulaufzeit auf der Leitfläche, Barrierefreiheit |
| 7 | Ä1 und Ä2 werden wörtlich umgesetzt | Zwei dauerhafte Elemente für seltene Handlungen auf der knappsten Fläche |

## 11.3 Offene Punkte

| # | Punkt | Art | Entscheider |
|---|---|---|---|
| O1 | **Logo als SVG**, Symbol solo und Kombinationsmarke | Lieferung | Sie |
| O2 | Freigabe für Ä1, Organisation nur bei Mehrdeutigkeit | Architekturänderung an F2 | Sie |
| O3 | Freigabe für Ä2, Sprachwechsler unter Konto | Architekturänderung an F3 | Sie |
| O4 | Freigabe für FD-3, Option B | Änderung an v1 | Sie |
| O5 | Kommt Arabisch, und damit die Laufrichtung | geschäftlich, aus F3 | Sie |
| O6 | Wird der Desktop ausgebaut, und wann | geschäftlich | Sie |
| O7 | Benennung der sechs Abteilungen in Mehr, endgültig | Formulierung | ich, mit Ihrer Bestätigung |

O1 ist der einzige, der die Umsetzung blockiert. Alle anderen sind Freigaben oder Formulierungen.

## 11.4 Was diese Architektur nicht leistet

1. **Sie ersetzt keine Gestaltung.** Sie legt Struktur, Muster und Zustände fest. Der visuelle Feinschliff entsteht in der Umsetzung
2. **Sie liefert keine Bildschirmentwürfe.** Die Wireframes sind Struktur, nicht Aussehen. Das ist beabsichtigt, weil Struktur verbindlich sein soll und Aussehen sich entwickeln darf
3. **Sie behebt die 27 Symbolverstöße nicht.** Sie legt fest, wodurch sie ersetzt werden
4. **Sie garantiert nicht, dass 100 Funktionen bedienbar sind.** Sie stellt die Regeln bereit, unter denen es möglich bleibt. Werden FD-1 und FD-2 gebrochen, gilt die Zusage nicht mehr

---

# Abschluss

## JA

Die Product Experience Architecture ist produktionsreif als verbindliche Grundlage künftiger Oberflächen.

Begründung: Die Informationsarchitektur ist vollständig, jede Funktion ist eingeordnet, und die Skalierungsfrage ist nicht mit einer Behauptung beantwortet, sondern mit zwei Regeln, deren Bruch benannte Folgen hat. Das bestehende Design-System v1 bleibt unangetastet und wird um Struktur, Symbolsatz, Komponenten und Zustände ergänzt. Drei Messungen am Logo haben Entscheidungen begründet, die sonst Geschmacksfragen geblieben wären. Sieben Fundamententscheidungen sind dokumentiert, jede mit Kostenvergleich jetzt gegen später.

## Eine Lieferabhängigkeit

**Das Logo als SVG ist erforderlich, bevor das Symbol umgesetzt wird.**

Das ist keine Architekturlücke, sondern eine fehlende Datei, und v1 hat sie bereits angefordert. Das Symbol soll in Favicon, Navigation und PWA-Symbolen bei 16 und 24 Pixeln erscheinen. Die vorhandene Rasterfassung ist 360 mal 308 Pixel mit einem feinen Verlauf. Auf 16 Pixel verkleinert bleibt ein grauer Fleck.

Alles andere in diesem Dokument ist ohne weitere Lieferung umsetzbar.

## Vier Freigaben, die ich brauche

| # | Freigabe | Ohne Freigabe |
|---|---|---|
| Ä1 | Aktive Organisation nur bei mehreren Mitgliedschaften | ich setze die wörtliche Fassung aus F2 um |
| Ä2 | Sprachwechsler unter Konto, Fallback-Kennzeichnung bleibt dauerhaft | ich setze die wörtliche Fassung aus F3 um |
| FD-3 | Zweiter Token für tragende Grafikelemente | die Gegenmaßnahme aus v1 bleibt, Anforderung formal unerfüllt |
| FD-7 | Tabellen erst ab weit | Listen und Tabellen mischen sich |

Ohne Ihre Freigabe weiche ich von F2, F3 und v1 nicht ab. Das ist die Arbeitsregel, und sie gilt auch dann, wenn ich die Abweichung für besser halte.

## Reihenfolge

Unverändert gültig aus den vorigen Meilensteinen: F1 verifizieren, F2 umsetzen, dann T1 und T2 aus F3. Die Umsetzung dieser Architektur setzt keinen dieser Schritte voraus und kann parallel vorbereitet werden, weil sie nichts an der Datenbank ändert. Die Symbolumstellung nach 6.4 ist der sinnvollste erste Schritt, weil sie 14 Dateien berührt und mit jeder neuen Oberfläche teurer wird.
