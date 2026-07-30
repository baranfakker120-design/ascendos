# KI-Infrastruktur: Analyse und Anbietervergleich

Recherchestand: 29. Juli 2026. Keine Implementierung, kein Code, keine Migration.

**Vorbehalt zu allen Zahlen:** Kostenlose Kontingente ändern sich bei jedem Anbieter monatlich. Google hat sein Angebot Ende 2025 gekürzt und im April 2026 die Pro-Modelle vollständig aus dem kostenlosen Bereich entfernt. Jede Zahl unten ist vor einer Entscheidung an der Quelle zu prüfen.

---

# Teil 0: Die Diagnose vor dem Vergleich

## 0.1 Die 503-Fehler sind kein Defekt, sondern das Produkt

Das kostenlose Kontingent von Google AI Studio hat **keine Dienstgütezusage**. Bei Lastspitzen und Wartungsarbeiten werden Anfragen aus dem kostenlosen Bereich **nachrangig behandelt**. Genau das erzeugt die beobachtete Meldung „This model is currently experiencing high demand".

Daraus folgt eine unbequeme Erkenntnis: **Keine Wiederholungslogik behebt das.** Wir haben zwei Versuche mit exponentiellem Backoff, und die Fehlerbehandlung ist differenziert. Das war richtig und ändert nichts an der Ursache. Der Coach fällt aus, weil er auf einem Kontingent läuft, das ausdrücklich keine Verfügbarkeit zusagt.

**Der kürzeste Weg zur Zuverlässigkeit ist deshalb nicht zwingend ein Anbieterwechsel.** Eine Zahlungsmethode bei Google hebt das Konto auf Tier 1 mit 150 bis 300 Anfragen pro Minute und beendet die Nachrangigkeit. Bei den heutigen Mengen, 68 Coach-Nachrichten insgesamt, kostet das im Monat wenige Euro.

Das gehört gesagt, bevor eine Migration erwogen wird.

## 0.2 Der Befund, der schwerer wiegt als die Verfügbarkeit

**Google darf Eingaben aus dem kostenlosen Kontingent zur Modellverbesserung verwenden.** Das ist in der Preisdokumentation als Gegenleistung für den kostenlosen Zugang benannt und mehrfach unabhängig belegt.

Für AscendOS ist das kein Nebenpunkt, sondern ein Rechtsproblem:

- Der Coach-Kontext enthält **Kontaktnamen, Notizen und den nächsten Schritt** zu Menschen, die AscendOS nicht kennen und nicht zugestimmt haben
- F2 Teil 8.1 legt fest, dass die **Organisation Verantwortlicher** im Sinne der DSGVO ist
- F2 Teil 5 stellt Kontaktidentitäten unter die strengste Grenze des ganzen Modells

Eine Weitergabe dieser Daten in ein Trainingsverfahren ist mit dieser Architektur nicht vereinbar. **Das kostenlose Gemini-Kontingent ist für AscendOS damit unabhängig von der Verfügbarkeit nicht dauerhaft tragbar.**

Zur Genauigkeit: Der bezahlte Gemini-Zugang enthält diese Klausel **nicht**. Der Wechsel auf Tier 1 löst also beide Probleme gleichzeitig, das Verfügbarkeits- und das Datenschutzproblem.

## 0.3 Was der Wechsel technisch kostet

| Bestandteil | Betroffen |
|---|---|
| `_shared/gemini.ts` | ja, Client und Modellabbildung |
| Wiederholungslogik, Fehlerbehandlung | wiederverwendbar, anbieterunabhängig |
| `agents.model` als Datensatz | keine Migration nötig, Laufzeitabbildung besteht |
| **Einbettungen** | **nicht betroffen**, siehe unten |
| `pgvector`, 1536 Dimensionen, `match_knowledge` | nicht betroffen |

**Wichtig zur Trennung:** Der Chat und die Einbettungen sind zwei getrennte Aufrufe. Ein Wechsel des Chat-Anbieters erfordert **keinen** Wechsel des Einbettungsmodells. Das ist wesentlich, weil ein Wechsel des Einbettungsmodells eine andere Dimensionszahl und damit eine Neuberechnung des gesamten Korpus bedeuten würde. Groq und Cerebras bieten ohnehin keine Einbettungen an.

Alle unten empfohlenen Anbieter sprechen das **OpenAI-kompatible** Format. Der Austausch betrifft eine Datei.

---

# Teil 1: Vergleichstabelle

Bewertung der Eignung ausdrücklich **für AscendOS**, nicht allgemein.

| Anbieter | Free Tier | Karte | Sofort nutzbar | Grenzen kostenlos | Trainiert auf Daten | OpenAI-Format | Kommerziell | Eignung |
|---|---|---|---|---|---|---|---|---|
| **Google Gemini** | ja, dauerhaft | nein | ja | Flash 10–15 RPM, 1.500/Tag, 250k–1M TPM. Pro seit April 2026 **nicht mehr** kostenlos | **ja, im Free Tier** | über Hülle | ja | **heute im Einsatz.** Free Tier untragbar, Tier 1 gut |
| **Groq** | ja, dauerhaft | nein | ja, ~30 Sekunden | 30 RPM, 6k–30k TPM, RPD modellabhängig 1.000–14.400 | **nein** | ja | ja | **stärkster Kandidat** |
| **Cerebras** | ja, dauerhaft | nein | ja | ~30 RPM, 14.400/Tag, 60–64k TPM, 1M Token/Tag | nicht dokumentiert | ja | ja | starker Zweitkandidat |
| **OpenRouter** | ja | nein für Gratismodelle | ja | 20 RPM, **50 Anfragen/Tag** bis 10 USD Guthaben, danach 1.000/Tag | je Anbieter | ja | je Modell | gut als Ausweichweg |
| **Mistral AI** | ja, „Experiment" | nein | ja | ~1 Mrd. Token/Monat, aber **2 RPM** | **Zustimmung zum Training ist Voraussetzung** | ja | ja | 2 RPM disqualifiziert für Chat |
| **Cloudflare Workers AI** | ja | nein | ja | 10.000 „Neuronen"/Tag, nicht in Anfragen umrechenbar | nein | teils | ja | nur sinnvoll bei Betrieb auf Workers |
| **DeepSeek** | Probeguthaben, Flash teils ohne Obergrenze | ja für Aufladung | ja | uneinheitlich dokumentiert | unklar | ja | ja | **Datenlage China, für DSGVO problematisch** |
| **Cohere** | Testschlüssel | nein | ja | ~100 Anfragen/Tag | nein | teils | **nein, ausdrücklich nicht kommerziell** | **disqualifiziert** |
| **Together AI** | nur Startguthaben | ja | ja | kein dauerhaftes Kontingent | nein | ja | ja | ungeeignet als Basis |
| **Hugging Face Inference** | ja | nein | ja | strenge Grenzen, nicht klar dokumentiert | modellabhängig | teils | modellabhängig | ungeeignet für interaktiven Chat |
| **Fireworks AI** | schmal | ja | ja | kleines Kontingent | nein | ja | ja | kein Vorteil gegenüber Groq |
| **SambaNova** | schmal | teils | ja | kleines Kontingent | nein | ja | ja | kein Vorteil gegenüber Groq |
| **GitHub Models** | ja | nein | ja | Tageskontingente | Azure-Bedingungen | ja | eingeschränkt | interessant, aber an GitHub-Konto gebunden |
| **NVIDIA NIM** | 1.000 Guthaben | nein | ja | einmalig | nein | ja | ja | Probeguthaben, keine Basis |

Nicht in der Liste, weil ohne kostenlosen Zugang: OpenAI und Anthropic verlangen für den API-Zugang eine Zahlungsmethode.

---

# Teil 2: Die drei Kandidaten im Detail

## 2.1 Groq

**Stärken.** Kein Training auf Kundendaten, ausdrücklich dokumentiert. Kein Kreditkartenzwang. Schnellste Antwortzeiten im Feld, 300 bis 1.000 Token pro Sekunde auf eigener Hardware. OpenAI-kompatibel. Zwischengespeicherte Eingaben zählen **nicht** gegen das Kontingent, was bei unserer langen Systemanweisung erheblich ist.

**Schwächen.** Ausschließlich offene Modelle, also Llama, Qwen, GPT-OSS. Kein Gemini, kein GPT, kein Claude. Grenzen gelten auf **Organisationsebene**, mehrere Schlüssel helfen nicht. Und die Angaben zum Tageskontingent widersprechen sich in den Quellen: Die offizielle Tabelle nennt für `llama-3.3-70b-versatile` **1.000 Anfragen pro Tag**, mehrere Sekundärquellen nennen 14.400. Das ist vor einer Entscheidung zu klären.

**Kosten beim Wachstum.** Zahlungsmethode ohne Mindestumsatz hebt die Grenzen um den Faktor zehn und senkt die Tokenpreise um 25 Prozent. Llama 3.3 70B liegt bei 0,59 USD Eingabe und 0,79 USD Ausgabe je Million Token, GPT-OSS 120B bei 0,15 und 0,60. Bei unseren Mengen sind das einstellige Eurobeträge im Monat.

**Offene Frage, die ich nicht beantworten kann.** Die Qualität in **deutscher Sprache**. Llama 3.3 und Qwen sind brauchbar, aber Gemini Flash gilt im Deutschen als stärker. Das ist keine Recherchefrage, sondern eine Messfrage, siehe Teil 4.

## 2.2 Cerebras

**Stärken.** Höchster Durchsatz, bis 2.000 Token pro Sekunde. Kontingent mit 14.400 Anfragen und 1 Million Token pro Tag deutlich großzügiger als Groq. Keine Karte. OpenAI-kompatibel.

**Schwächen.** Die Datenlage zum Umgang mit Kundendaten ist **nicht so klar dokumentiert wie bei Groq**. Das ist für AscendOS der entscheidende Punkt und muss vor einer Entscheidung schriftlich geklärt sein. Ebenfalls nur offene Modelle.

## 2.3 Google Gemini, bezahlt

**Stärken.** Kein Wechsel nötig, kein Code außer Konfiguration. Beste deutsche Qualität der drei. **Keine Trainingsklausel im bezahlten Zugang.** 150 bis 300 Anfragen pro Minute auf Tier 1, keine Nachrangigkeit. Einbettungen und Chat bleiben beim selben Anbieter, ein Bruchpunkt weniger.

**Schwächen.** Kreditkarte und Rechnungsadresse erforderlich. Damit verletzt es Priorität 3.

**Kosten.** Flash ist günstig. Bei 68 Nachrichten insgesamt und etwa 2.000 Token je Aufruf liegen wir im Bereich von Cent pro Monat. Selbst bei fünfzig aktiven Beratern mit täglicher Nutzung bleibt es einstellig.

---

# Teil 3: Empfehlung

Gegen deine sieben Prioritäten geprüft.

## 3.1 Kurzfristig, um den Ausfall zu beenden

**Zahlungsmethode bei Google hinterlegen und auf Tier 1 wechseln.**

| Priorität | Erfüllt |
|---|---|
| 1 Zuverlässigkeit | **ja**, Nachrangigkeit endet, 150–300 RPM |
| 2 Kostenloser Einstieg | nein, aber Kosten im Centbereich |
| 3 Keine Karte | **nein** |
| 4 Deutsche Antworten | **ja**, beste der Kandidaten |
| 5 Antwortzeiten | gut |
| 6 Skalierbarkeit | ja, Tier 2 ab 250 USD Umsatz |
| 7 Einfache Integration | **ja, kein Code** |

Begründung: Es behebt das Verfügbarkeitsproblem **und** das Datenschutzproblem aus 0.2 in einem Schritt, ohne eine Zeile Code. Priorität 1 ist deine wichtigste, Priorität 3 die drittwichtigste.

## 3.2 Mittelfristig, als Ausweichweg

**Groq als zweiter Anbieter**, ohne automatische Umschaltung.

Das widerspricht nicht deiner Vorgabe gegen eine Anbieterabstraktion, solange es bei **einer** zusätzlichen Konfigurationsmöglichkeit bleibt und nicht zu einem Vermittlungsdienst ausgebaut wird. Der Nutzen: Fällt Google aus, ist ein Umschalten eine Einstellung statt einer Entwicklungsaufgabe.

Groq ist der einzige Kandidat, der kein Training auf Kundendaten betreibt, keine Karte verlangt, OpenAI-kompatibel ist und schnell antwortet.

## 3.3 Was ich nicht empfehle

| Anbieter | Grund |
|---|---|
| **Mistral** | 2 Anfragen pro Minute im kostenlosen Zugang, und Zustimmung zum Training ist Voraussetzung. Beides disqualifiziert, obwohl der europäische Sitz für die DSGVO attraktiv wäre |
| **Cohere** | kommerzielle Nutzung ausdrücklich untersagt |
| **DeepSeek** | Datenlage und Serverstandort für einen deutschen Mandanten mit Kontaktdaten Dritter nicht vertretbar |
| **Together, Fireworks, SambaNova, NVIDIA NIM** | Startguthaben statt dauerhaftem Kontingent |
| **Hugging Face** | Grenzen für interaktiven Chat zu unsicher |
| **OpenRouter als Basis** | 50 Anfragen pro Tag ohne Guthaben. Als Ausweichweg interessant, als Grundlage zu knapp |

---

# Teil 4: Was diese Recherche nicht beantworten kann

**Die deutsche Antwortqualität.** Priorität 4 ist mit Suchergebnissen nicht zu beantworten. Werbetexte von Anbietern und Vergleichslisten sagen nichts über den Ton, den Team Şeyda braucht.

**Du hast das Werkzeug dafür bereits:** `docs/coach-eval-set.md`. Es prüft Ton, Compliance-Grenzen und fachliche Richtigkeit. Der belastbare Weg ist, dieselben Fragen gegen Gemini Flash, Llama 3.3 70B auf Groq und ein Cerebras-Modell zu stellen und die Antworten zu vergleichen.

Das ist eine Messung von wenigen Stunden und ersetzt jede Recherche.

**Zwei Punkte, die vor einer Entscheidung schriftlich zu klären sind:**

1. Groqs Tageskontingent: 1.000 oder 14.400 Anfragen? Die Quellen widersprechen sich
2. Cerebras' Umgang mit Kundendaten. Bei Groq ist es dokumentiert, bei Cerebras habe ich keine belastbare Aussage gefunden

---

# Teil 5: Zusammenfassung in drei Sätzen

Die 503-Fehler sind keine Störung, sondern die zugesagte Eigenschaft eines Kontingents ohne Dienstgütezusage, und keine Wiederholungslogik behebt das.

Wichtiger als die Verfügbarkeit ist, dass Google Eingaben aus dem kostenlosen Zugang zur Modellverbesserung verwenden darf, was mit Kontaktdaten Dritter und der Verantwortlichkeit der Organisation aus F2 nicht vereinbar ist.

Beides endet mit einer Zahlungsmethode bei Google, ohne eine Zeile Code, für wenige Euro im Monat, und Groq ist der beste zweite Anbieter, falls du unabhängig werden willst.

---

# Teil 6: Abschlussbewertung für das Szenario ohne Zahlungsmethode

Eigenes, in sich geschlossenes Szenario. Ausgeschlossen: OpenAI, Anthropic. Gefordert: möglichst keine Karte, möglichst keine Rechnungsadresse, dauerhafter oder sehr großzügiger Free Tier, kommerzielle Nutzung erlaubt, DSGVO möglichst gut, höchste Zuverlässigkeit.

## 6.1 Der Zielkonflikt, der dieses Szenario bestimmt

Teil 0.2 hat gezeigt: Ohne Zahlungsmethode bleibt Googles Trainingsklausel bestehen, die für unsere Kontaktdaten Dritter nicht tragbar ist. Google scheidet damit für dieses Szenario **vollständig** aus, nicht nur die Empfehlung aus Teil 3.1.

Die verbliebenen Anbieter zerfallen bei genauerer Prüfung der Vertragsdokumente, nicht nur der Werbeaussagen, in ein Muster, das die ganze Bewertung prägt:

| Anbieter | Trainiert auf Daten | DPA im kostenlosen Zugang |
|---|---|---|
| Groq | nein, dokumentiert | **ja**, mit EU-Standardvertragsklauseln, auch ohne Karte |
| Cerebras | nein, dokumentiert | **nein**, in den Bedingungen ausdrücklich ausgeschlossen. Cerebras verarbeitet dort als unabhängiger Verantwortlicher, nicht als Auftragsverarbeiter |
| Mistral, Free-Tier „Experiment" | **ja, Voraussetzung für den Zugang** | entfällt, weil bereits die Trainingsklausel disqualifiziert |
| OpenRouter | je nach durchgereichtem Modell | **nein**, ein rechtsverbindliches DPA ist ausdrücklich Enterprise-Kunden vorbehalten |
| Cloudflare Workers AI | nicht dokumentiert gefunden | nicht verifiziert, siehe 6.5 |

Der zentrale Befund: **Mistral ist als Unternehmen der DSGVO-freundlichste Standort aller Kandidaten, aber sein kostenloser Zugang ist der DSGVO-unfreundlichste**, weil er die Trainingszustimmung zur Bedingung macht. Die Firmenlage sagt hier nichts über den tatsächlichen Vertrag. Das ist der wichtigste Einzelbefund dieses Abschnitts.

## 6.2 Bewertung je Kandidat

### Groq

| Kriterium | Bewertung |
|---|---|
| Risiko künftiger Einschränkung | **mittel.** Die Quellen widersprechen sich beim Tageskontingent, 1.000 gegen 14.400 Anfragen. Eine Klärung an der Quelle ist vor jeder Festlegung nötig |
| Wahrscheinlichkeit 429 | **mittel.** 30 Anfragen pro Minute sind für einen Coach mit wenigen gleichzeitigen Nutzern ausreichend, bei mehreren Beratern gleichzeitig eng. Gilt organisationsweit, nicht je Schlüssel |
| Wahrscheinlichkeit 503 | **niedrig.** Eigene Rechenhardware, keine Berichte über lastbedingte Zurückstufung wie bei Google. Das kostenlose Kontingent ist ein harter Zähler, keine nachrangige Behandlung |
| Eignung als produktiver Coach | **gut**, unter Vorbehalt der ungeklärten Tagesgrenze und einer noch ausstehenden Prüfung der deutschen Antwortqualität |

### Cerebras

| Kriterium | Bewertung |
|---|---|
| Risiko künftiger Einschränkung | **mittel bis hoch.** Bedingungen für den Selbstbedienungszugang sind ausdrücklich als frei änderbar formuliert, ohne die Zusagen eines Vertragsverhältnisses |
| Wahrscheinlichkeit 429 | **niedrig.** 14.400 Anfragen und rund eine Million Token pro Tag sind das großzügigste Kontingent im Feld |
| Wahrscheinlichkeit 503 | **niedrig bis mittel.** Technisch für hohen Durchsatz gebaut, aber weniger unabhängige Betriebsberichte als bei Groq |
| Eignung als produktiver Coach | **technisch gut, rechtlich offen.** Das fehlende DPA im Selbstbedienungszugang ist der Punkt, der vor einem Einsatz mit echten Kontaktdaten schriftlich zu klären ist |

### OpenRouter

| Kriterium | Bewertung |
|---|---|
| Risiko künftiger Einschränkung | **hoch.** Das Tageskontingent wurde bereits verschärft, 50 Anfragen ohne Guthaben |
| Wahrscheinlichkeit 429 | **hoch.** 50 Anfragen am Tag sind für einen täglich genutzten Coach binnen Stunden aufgebraucht |
| Wahrscheinlichkeit 503 | **mittel.** Zwei Stationen zwischen Anfrage und Modell, OpenRouter selbst und der durchgereichte Anbieter. Automatisches Ausweichen senkt Gesamtausfälle, erhöht aber die Komplexität der Fehlersuche |
| Eignung als produktiver Coach | **schwach als alleinige Grundlage.** Als Werkzeug für den Qualitätsvergleich aus Teil 4 dagegen gut geeignet, weil viele Modelle über einen Zugang erreichbar sind |

### Mistral, kostenloser Zugang

| Kriterium | Bewertung |
|---|---|
| Risiko künftiger Einschränkung | **hoch.** Ein Zugang, der bereits die Zustimmung zum Training verlangt, wirkt wie eine Übergangslösung, keine dauerhafte Zusage |
| Wahrscheinlichkeit 429 | **sehr hoch.** Zwei Anfragen pro Minute bedeuten, dass eine zweite Coach-Nachricht binnen derselben Minute bereits scheitert |
| Wahrscheinlichkeit 503 | **niedrig bis mittel**, nicht der begrenzende Faktor |
| Eignung als produktiver Coach | **ungeeignet im kostenlosen Zugang.** Der bezahlte Zugang wäre datenschutzrechtlich der stärkste Kandidat im gesamten Vergleich, fällt aber unter diesem Szenario durch die Kartenpflicht heraus |

### Cloudflare Workers AI

| Kriterium | Bewertung |
|---|---|
| Risiko künftiger Einschränkung | **mittel.** Finanziell stabiles Unternehmen, geringes Risiko einer plötzlichen Abschaltung, aber die Einheit „Neuronen pro Tag" ist nicht in Anfragen umrechenbar und damit für uns schwer zu planen |
| Wahrscheinlichkeit 429 | **mittel**, abhängig vom Modell und von der Länge der Systemanweisung, nicht verlässlich vorhersagbar |
| Wahrscheinlichkeit 503 | **niedrig.** Ausgereiftes, weltweites Netzwerk mit belegtem Verfügbarkeitsruf |
| Eignung als produktiver Coach | **mittel.** Kleinere Kontextfenster als die übrigen Kandidaten, engere Modellauswahl. Der Vorteil wäre am größten, wenn AscendOS bereits auf Cloudflare liefe, was nicht der Fall ist. Der Umgang mit personenbezogenen Daten war in dieser Recherche nicht abschließend zu klären |

## 6.3 Rangliste

| Rang | Anbieter | Ausschlaggebend |
|---|---|---|
| **1** | **Groq** | einziger Kandidat mit dokumentiertem DPA samt EU-Klauseln **ohne** Zahlungsmethode, kein Training, geringstes Risiko für 503 |
| **2** | **Cerebras** | größtes Kontingent, kein Training, aber ohne vertragliche Zusicherung im Selbstbedienungszugang |
| **3** | **Cloudflare Workers AI** | solide Verfügbarkeit, aber unklare Kontingentgröße und ungeprüfte Datenschutzlage speziell für Workers AI |
| **4** | **OpenRouter** | zu enges Tageskontingent für den täglichen Einsatz, DPA nur für Enterprise-Kunden |
| **5** | **Mistral, kostenloser Zugang** | 2 Anfragen pro Minute schließen einen Chat-Coach aus, Trainingszustimmung ist Voraussetzung |

## 6.4 Empfehlung für dieses Szenario

**Groq**, mit zwei Bedingungen vor der Festlegung.

**Erstens:** Das tatsächliche Tageskontingent für das vorgesehene Modell an der Quelle bestätigen, wegen der widersprüchlichen Angaben in 6.2.

**Zweitens:** Die deutsche Antwortqualität mit dem vorhandenen `docs/coach-eval-set.md` gegen ein offenes Modell wie Llama 3.3 70B prüfen, wie bereits in Teil 4 empfohlen. Das ist in diesem Szenario noch wichtiger, weil kein Zugang zu Gemini oder einem geschlossenen Spitzenmodell besteht.

**Cerebras als zusätzliches Kontingent, nicht als Ersatz.** Das große Tageskontingent eignet sich für Zeiten hoher Auslastung, aber das fehlende DPA im Selbstbedienungszugang bedeutet: Solange dieser Punkt nicht schriftlich mit Cerebras geklärt ist, sollte kein Kontaktkontext dorthin gelangen. Ein rein diagnostischer oder inhaltlicher Testbetrieb ohne personenbezogene Daten ist davon nicht betroffen.

**Die ehrliche Grenze dieser Empfehlung.** Innerhalb des Szenarios „keine Zahlungsmethode" bietet kein Anbieter die Kombination aus vertraglich zugesichertem Datenschutz **und** großzügigem Kontingent **und** höchster Verfügbarkeit gleichzeitig. Groq kommt dem am nächsten, weil es als einziger Kandidat ohne Karte ein belastbares DPA vorweist. Sobald das Kontaktvolumen von AscendOS wächst, verschiebt sich die Rechnung: Eine Zahlungsmethode bei Google oder bei Mistral löst das Datenschutzproblem vollständiger, als es innerhalb dieses Szenarios möglich ist. Diese Feststellung widerspricht nicht der Empfehlung für heute, sie benennt nur, wo die Grenze dieses Szenarios liegt.
