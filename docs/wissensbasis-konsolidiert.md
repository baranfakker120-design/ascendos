# Konsolidierte Wissensdatenbank — AscendOS

**Quelle:** eine Unterhaltung („AscendOS Product Bible foundation", zuletzt 22.07.2026).
**Reichweite:** ausschließlich Projekt-Unterhaltungen. Normale Chats außerhalb dieses Projekts waren nicht zugänglich.
**Herkunft markiert:** `[B]` = von dir festgelegt · `[V]` = mein damaliger Vorschlag, von dir angenommen · `[?]` = offen oder unbelegt.

> Fachliches Chogan-/Team-Seyda-Wissen ist hier **nicht** enthalten, weil es in den Chats nie ausgesprochen wurde. Siehe Abschnitt 8.

---

## 1. Identität und Beteiligte

|                       |                                                                                   |
| --------------------- | --------------------------------------------------------------------------------- |
| **Produkt**           | AscendOS — KI-Betriebssystem für Network Marketing `[B]`                          |
| **KI-Coach**          | „Ascent" (umbenannt von „Coach", um Kollision mit der Journey zu vermeiden) `[V]` |
| **Mutterunternehmen** | Chogan `[B]`                                                                      |
| **Team**              | Team Seyda `[B]`                                                                  |
| **Weitere Marke**     | Essence Tribe Network (Logo-Assets in der Designphase verwendet) `[B]`            |
| **Baran**             | Gründer, `super_admin` `[B]`                                                      |
| **Seyda**             | Mitgründerin, `super_admin`, Freigabeinstanz für Wissen `[B]`                     |
| **Arbeitsumgebung**   | ausschließlich iPhone, kein Terminal, kein PC `[B]`                               |

---

## 2. Strategische Leitsätze

**„Der Burggraben ist die Wissensbasis, nicht der Code."** `[B]`
Deine eigene Formulierung, und rückwirkend die Begründung für fast jede Architekturentscheidung: Wissen liegt in Daten statt in Prompts, ist versioniert und mandantenfähig. Bei einem späteren White-Label-Verkauf wird die leere Maschine verkauft — das Wissen bleibt euer Vorsprung.

**„Nie Code anfassen, wenn sich das Vertriebssystem weiterentwickelt."** `[B]`
Neue Schulungen, Zoom-Aufzeichnungen, Leitfäden, FAQ, Produkte erweitern die Wissensbasis, ohne Deployment. Deshalb sind Agenten Datensätze und keine Klassen.

**Ehrliche Lücke vor falscher Sicherheit.** `[V]`
Ein Coach, der bei fehlender Quelle „bei Chogan bekommst du X % Provision" halluziniert, zerstört Vertrauen schneller als jeder Bug. Jede Lücke wird in `knowledge_gaps` protokolliert und ist ein Signal, welches Dokument fehlt.

---

## 3. Wissensarchitektur — drei Ebenen `[B]`

**Ebene 1 — Unternehmenswissen:** Produkte, Produktbeschreibungen, Vergütungsplan, Unternehmensregeln, FAQ, Richtlinien, Compliance.

**Ebene 2 — Teamwissen:** WayToMoon, Firmenpräsentation, Business Fit Check, Zoom-Coachings, interne Schulungen, Gesprächsleitfäden, Best Practices, Recruiting-System, Verkaufsprozess, Follow-up-Strategien, Duftparty-System.

**Ebene 3 — Modellwissen:** Allgemeine Kommunikation, Psychologie, Führung, Produktivität, Gesprächsführung darf das Sprachmodell beitragen.

**Vorrangregel:** Sobald eine Frage Team Seyda oder Chogan betrifft, überschreiben eure Dokumente das Modell. Technisch umgesetzt: Ebene 1 und 2 sind ein Filter (`team_id`), keine getrennten Systeme.

**Versionierung:** Jedes Dokument trägt Titel, Kategorie, Sprache, Version, Autor, Freigabestatus, Zielgruppe, gültig-ab, gültig-bis, Tags. Neue Dokumente ersetzen alte über `supersedes_doc_id`; das alte wird `archived` und bleibt nachvollziehbar. Nichts wird zerstört. `[B]`

**Freigabe:** Alles landet als `draft` und wird erst nach Prüfung durch Baran oder Seyda auf `approved` gesetzt. Nur Freigegebenes darf das RAG nutzen. `[B]`

---

## 4. Conversation Memory `[B]` + Datenschutzlösung `[V]`

Entsteht im Coach-Gespräch eine besonders gute Antwort, soll sie als Best Practice vorgeschlagen und nach Prüfung Teil der Wissensbasis werden — kontrolliert, niemals automatisch.

Der Haken und seine Lösung: Coach-Gespräche enthalten personenbezogene Daten. Der Flow ist deshalb dreistufig — Nutzer markiert → System erzeugt eine **anonymisierte, generalisierte** Fassung („Mehmet hat Angst vor 200 € Startkosten" → „Einwand: Startkosten-Bedenken") → Baran/Seyda geben frei → `knowledge_doc` mit `source_type: 'best_practice'` und `source_convo_id` als Herkunftsnachweis.

Status: Die Anonymisierung ist im Coach implementiert (Wissenslücken werden generalisiert protokolliert). Der Best-Practice-Vorschlagsweg aus der App ist **noch nicht gebaut**. `[?]`

---

## 5. Agenten

Für den Nutzer existiert **ein** Coach. Intern entscheidet ein Router-Agent, welcher Spezialist zuständig ist. `[B]`

**Von dir gewünscht `[B]`:** Daily Planner · Recruiting Coach · Sales Coach · Leadership Coach · Knowledge Coach · Content Coach

**In v1 tatsächlich gebaut:** `recruiting` · `sales` · `knowledge`. Der Daily Planner ist kein Chat-Agent, sondern die Regel-Engine des Daily Command Center. Leadership und Content sind offen. `[?]`

**Router:** ein einziger schneller, billiger Klassifikations-Call pro Konversation. Bewusst verworfen: LangChain/CrewAI-artige Multi-Agent-Frameworks — Abstraktionsschichten für ein Problem, das ein Switch-Statement mit LLM-Unterstützung löst. `[V]`

**Kategorien (verbindlich, steuern `agents.retrieval_categories`):**
`prozess` · `recruiting` · `einwaende` · `produkte` · `verkauf` · `duftparty` · `verguetung` · `schulung` · `faq`

Eine Kategorie außerhalb dieser Liste wird eingebettet, gespeichert und von keinem Agenten je gefunden.

---

## 6. Compliance-Grenzen (nicht verhandelbar) `[B]`+`[V]`

- Keine Einkommensversprechen, keine Prognosen, keine „finanzielle Freiheit"
- Keine Heil- oder Gesundheitswirkungen von Produkten
- Kein Druck, keine Manipulation, keine Tricks gegenüber Interessenten
- Der Coach versendet nie selbst Nachrichten — er bereitet vor, der Mensch entscheidet
- Bei entsprechenden Wünschen: kurz erklären warum nicht, seriöse Alternative anbieten

Diese Regeln gelten auch beim **Schreiben** der Dokumente: Was dort steht, sagt der Coach weiter.

---

## 7. Bestehendes App-Ökosystem (Generation 1) `[B]`

WayToMoon · MyWayToMoon · Business Fit Check · Duftparty · Team Seyda Guide · Training Team Seyda · Chogan Kataloge · Visual Check · DPURA

AscendOS ist Generation 2 und soll diese langfristig absorbieren. Technisch als Datensätze in `external_tools` modelliert statt im Code — die Integration ist damit eine Datenfrage. `[V]`

---

## 8. Was **nicht** extrahierbar war

Diese Themen aus deiner Liste sind in den zugänglichen Chats **nie inhaltlich vorgekommen** — nur als Kategorie oder Dateiname:

| Thema                       | Was fehlt                                                                                                                          |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Vergütungsplan**          | Keine Stufe, kein Prozentsatz, keine Karrierelogik                                                                                 |
| **Produkte**                | Keine Produktlinie, kein Name, keine Zielgruppe, keine Preislogik                                                                  |
| **Einwandbehandlung**       | Keine einzige erprobte Antwort. Nur die Einwände als Stichwort (Keine Zeit, Kein Geld, Pyramide?, Muss überlegen, Partner dagegen) |
| **Recruiting**              | Business Fit Check und 3-Way-Call sind benannt, aber Ablauf, Rollen und Fehlerquellen nicht beschrieben                            |
| **Duftparty**               | Nur als Kategorie. Kein Ablauf, keine Gastgeber-Logik                                                                              |
| **Zoom-Prozesse**           | Als Wissensquelle vorgesehen, Transkriptions-Pipeline auf v1.1 verschoben. Kein Prozess dokumentiert                               |
| **Onboarding / Schulungen** | „Erste 90 Tage" als Titel vorhanden, Inhalt nicht                                                                                  |
| **Links**                   | Keine sammelbaren URLs in den Chats                                                                                                |

**Warum:** Diese Unterhaltung war eine Bau-Unterhaltung. Wir haben über die Architektur _für_ dieses Wissen gesprochen, nicht über das Wissen.

---

## 9. Überholt — bewusst nicht übernommen

- **Anthropic/Claude als Coach-Modell** → ersetzt durch OpenAI, dann vollständig durch Gemini (ADR-026/027)
- **`text-embedding-3-small`** mit der Begründung „Anthropic bietet keine Embeddings" → ersetzt durch `gemini-embedding-001` mit 1536 Dimensionen (ADR-027)
- **`gemini-2.5-flash`** → am 09.07.2026 von Google abgeschaltet, ersetzt durch `gemini-3.5-flash` (ADR-028)
- **Multi-Agent-Frameworks** (LangChain/CrewAI) → verworfen
- **Vollautomatischer In-App-Setup-Assistent** → abgelehnt, weil der Anon-Key konstruktionsbedingt kein DDL ausführen kann und ein Management-Token im Web-Client ein kritisches Sicherheitsrisiko wäre

Die vollständige Entscheidungshistorie liegt ohnehin versioniert in `docs/adr.md` (ADR-001 bis ADR-029) — dort genauer als in jeder Chat-Rekonstruktion.

---

## 10. Konkreter nächster Schritt

Die Wissensdatenbank ist leer (`knowledge_chunks = 0`, live geprüft). Die Upload-Seite existiert seit heute. Die Einkaufsliste existiert seit Sprint 4.5.

Was fehlt, ist ausschließlich der Inhalt — und den hat niemand außer dir und Seyda.

**Reihenfolge, die den größten Nutzen zuerst freischaltet:**

1. `prozess__Unser-Weg-vom-Lead-zum-Partner.md` — die 5 Phasen
2. `prozess__Follow-up-Rhythmus.md` — wann nachfassen, wann loslassen
3. `einwaende__Top-10-Einwaende-mit-Antworten.md` — je Einwand: was dahintersteckt, plus eure Antwort
4. `recruiting__Der-Business-Fit-Check.md`
5. `recruiting__Der-3-Way-Call.md`
6. `verguetung__Verguetungsplan-einfach-erklaert.md` — Fakten, keine Prognosen

Danach nachfragegetrieben: wöchentlich `knowledge_gaps` sichten. Die häufigsten Lücken bestimmen Dokument 7, 8, 9 — die Nutzer sagen euch, was fehlt.

```sql
select question, count(*) as haeufigkeit, max(created_at) as zuletzt
from knowledge_gaps
group by question
order by haeufigkeit desc, zuletzt desc
limit 25;
```
