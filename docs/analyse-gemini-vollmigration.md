# Technische Analyse: Vollständige Migration auf Google Gemini

**Auftrag:** Bestandsanalyse, keine Codeänderung.
**Stand der Codebasis:** Chat-Generierung läuft bereits über Gemini (ADR-026), Embeddings noch über OpenAI.
**Analysierte Dateien:** 108

---

## 1. Ergebnis in einem Satz

**Ja, eine vollständige Migration auf Gemini ist ohne Schema-Migration möglich** — weil `gemini-embedding-001` über Matryoshka-Dimensionen exakt 1536-dimensionale Vektoren ausgeben kann. `vector(1536)`, der HNSW-Index und die Signatur von `match_knowledge()` bleiben unangetastet.

**Aber:** Die vorhandenen Embedding-_Zeilen_ müssen neu erzeugt werden. Das ist eine Daten-, keine Schemaänderung — und aktuell voraussichtlich kostenlos, weil die Wissensbasis leer ist. Details in Abschnitt 5.

---

## 2. OpenAI-Inventar: exakte Fundstellen

### 2.1 Produktivcode (Quelle)

Nur **eine** Datei enthält noch OpenAI:

| Datei                               | Zeilen  | Inhalt                                                     |
| ----------------------------------- | ------- | ---------------------------------------------------------- |
| `supabase/functions/_shared/llm.ts` | 15–16   | `https://api.openai.com/v1/responses`, `.../v1/embeddings` |
|                                     | 20–21   | `text-embedding-3-small`, `EMBEDDING_DIMENSIONS = 1536`    |
|                                     | 25–30   | `gpt-5.6`, `gpt-5.6-luna`, Fallback `gpt-4.1`              |
|                                     | 101–110 | `OPENAI_MODEL`, `OPENAI_FAST_MODEL`, `ROUTER_MODEL`        |
|                                     | 122–126 | `OPENAI_API_KEY`                                           |

Es gibt **kein OpenAI-SDK** im Projekt. Die Anbindung erfolgt über `fetch` gegen die REST-Endpunkte. Das vereinfacht die Migration erheblich: keine Paketabhängigkeit, keine Lockfile-Änderung, kein `npm:`-Import zu entfernen.

### 2.2 Generierte Artefakte (kein Handlungsbedarf)

`setup/functions/coach-chat.ts` und `setup/functions/ingest-knowledge.ts` enthalten dieselben Fundstellen — sie sind **inlined Kopien** von `llm.ts`, erzeugt von `scripts/bundle-functions.mjs`. Sie werden durch `npm run generate` automatisch mitgezogen und dürfen nicht von Hand angefasst werden.

### 2.3 Toter Code in `llm.ts`

Nach der Chat-Umstellung ist die Hälfte des Moduls unbenutzt:

| Export                                                                                                                                     | Status          |
| ------------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| `embed`, `embedBatch`, `LlmError`, `ChatMessage`                                                                                           | **in Gebrauch** |
| `chatCompletion`, `fastModel`, `resolveModel`, `mapClaudeModel`, `ChatInput`, `ReasoningEffort`, `EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS` | toter Code      |

Konsequenz: Die komplette OpenAI-Chat-Maschinerie (Responses API, Modell-Fallback, Reasoning-Budget) wird weiterhin in **beide** Dashboard-Bundles einkopiert — `coach-chat.ts` ist dadurch 1020 Zeilen groß. Die Migration entfernt das ersatzlos.

### 2.4 Dokumentation

`README.md` (Z. 101–112), `.env.example` (Z. 7–9), `setup/SETUP-ANLEITUNG.md` (Z. 55–60) beschreiben noch OpenAI-Secrets. Kein Laufzeiteinfluss, aber Teil der Migration.

---

## 3. Betroffene Komponenten

| Komponente                                          | OpenAI-Nutzung                                            | Betroffen           |
| --------------------------------------------------- | --------------------------------------------------------- | ------------------- |
| **Chat / Coach (Generierung)**                      | keine — bereits Gemini                                    | nein                |
| **Router** (Agentenauswahl)                         | keine — bereits Gemini                                    | nein                |
| **Themen-Anonymisierung** ([K-1])                   | keine — bereits Gemini                                    | nein                |
| **Embeddings**                                      | `embed()`, `embedBatch()`                                 | **ja, vollständig** |
| **RAG / Retrieval** (`coach-chat`)                  | ein `embed(message)` pro Nachricht                        | **ja**              |
| **Wissensdatenbank-Ingestion** (`ingest-knowledge`) | `embedBatch()` pro Dokument                               | **ja**              |
| **Volltextsuche**                                   | existiert nicht (kein `tsvector`, kein `pg_trgm`)         | nein                |
| **Hintergrundprozesse**                             | existieren nicht (kein `pg_cron`, kein `pg_net`)          | nein                |
| **Tagesplan / Regel-Engine**                        | rein SQL, keine KI                                        | nein                |
| **`validate-invite`**                               | keine KI-Nutzung                                          | nein                |
| **Frontend / UI**                                   | **null Referenzen** auf Anbieter, Modelle oder Embeddings | nein                |
| **CI**                                              | keine KI-Secrets                                          | nein                |
| **DB-Tests**                                        | keine Embedding-Tests                                     | nein                |

### Befund zum Frontend

Eine gezielte Suche über `src/` nach `openai`, `gemini`, `embedding`, `model` ergab **null Treffer**. Das Frontend ruft genau zwei Edge Functions auf (`coach-chat`, `validate-invite`) und kennt vom KI-Stack nichts außer dem JSON-Vertrag `{ conversationId, agentKey, reply }`. Die Anbieterentkopplung ist architektonisch vollständig — das ist die Hauptursache dafür, dass diese Migration überhaupt risikoarm ist.

---

## 4. Zu ändernde Dateien

| #   | Datei                                                   | Art der Änderung                                                                                                               | Risiko  |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------- |
| 1   | `supabase/functions/_shared/gemini.ts`                  | `geminiEmbed()` / `geminiEmbedBatch()` ergänzen                                                                                | niedrig |
| 2   | `supabase/functions/_shared/llm.ts`                     | **löschen** (alle Nutzer migriert)                                                                                             | mittel  |
| 3   | `supabase/functions/coach-chat/index.ts`                | Import `embed`→`geminiEmbed`, `LlmError`→`GeminiError`, `ChatMessage`→`GeminiChatMessage`; `min_similarity` explizit übergeben | niedrig |
| 4   | `supabase/functions/ingest-knowledge/index.ts`          | Import auf `gemini.ts`, `taskType: RETRIEVAL_DOCUMENT`                                                                         | mittel  |
| 5   | `scripts/bundle-functions.mjs`                          | `llm.ts` aus `SHARED_ORDER` entfernen                                                                                          | niedrig |
| 6   | `setup/functions/*.ts`                                  | **generiert** — `npm run generate`                                                                                             | keins   |
| 7   | `README.md`, `.env.example`, `setup/SETUP-ANLEITUNG.md` | Secrets-Doku                                                                                                                   | keins   |
| 8   | `docs/adr.md`                                           | ADR-027                                                                                                                        | keins   |

**Nicht zu ändern:** keine Migration, keine Tabelle, kein RLS-Policy, keine Frontend-Datei, kein `netlify.toml`, kein Routing, kein API-Endpunkt.

`ChatMessage` wird derzeit aus `llm.ts` für die Typisierung der Chat-History importiert. `gemini.ts` exportiert bereits ein strukturgleiches `GeminiChatMessage` — der Typ wandert also mit, statt neu entstehen zu müssen.

---

## 5. Machbarkeit ohne Datenbankänderung

### 5.1 Die harte Abhängigkeit

Drei Stellen sind auf 1536 Dimensionen festgelegt:

```
20260724000006:62   embedding extensions.vector(1536)
20260724000006:68   using hnsw (embedding extensions.vector_cosine_ops)
20260726000008:427  match_knowledge(query_embedding extensions.vector(1536), ...)
```

### 5.2 Warum es trotzdem geht

`gemini-embedding-001` unterstützt Matryoshka Representation Learning. Google nennt 768, 1536 und 3072 als empfohlene Ausgabegrößen. Mit `outputDimensionality: 1536` passt der Vektor **exakt** in die bestehende Spalte.

Damit gilt:

| Anforderung                | Status                                          |
| -------------------------- | ----------------------------------------------- |
| Keine Datenbankmigration   | **erfüllt** — kein DDL nötig                    |
| Keine Tabellenänderung     | **erfüllt**                                     |
| `vector(1536)` unverändert | **erfüllt**                                     |
| Keine UI-Änderung          | **erfüllt** — Frontend kennt den Anbieter nicht |
| Keine Frontend-Änderung    | **erfüllt** — JSON-Vertrag bleibt identisch     |

### 5.3 Die Einschränkung, die bleibt

Ein Anbieterwechsel bei Embeddings ändert den **Vektorraum**. Bereits eingebettete Chunks liegen im OpenAI-Raum; eine Gemini-Query dagegen zu vergleichen liefert semantisch bedeutungslose Treffer. Der Coach würde nicht abstürzen — er würde falsche Dokumente als „oberste Wahrheit" zitieren. Das ist der gefährlichste Fehlermodus, weil er ohne Fehlermeldung auftritt.

Alle Zeilen in `knowledge_chunks` müssen daher neu erzeugt werden. **Das ist keine Schemamigration**, sondern ein Neuaufbau der Daten über den bestehenden Ingestion-Pfad.

**Entscheidender Befund:** Weder `setup/bootstrap.sql` noch `supabase/seed.sql` legen `knowledge_docs` an. Die Wissensbasis startet leer und wird ausschließlich manuell über `scripts/ingest-knowledge.mjs` gefüllt. Vor der Migration prüfen:

```sql
select count(*) as chunks, count(distinct doc_id) as docs
from public.knowledge_chunks;
```

Bei `0` entfällt die Daten-Neuerzeugung vollständig. Dann ist die Migration eine reine Codeänderung.

### 5.4 Schwellwert ohne DB-Änderung nachjustieren

`min_similarity` hat in `match_knowledge()` den Default `0.25`, getunt auf den OpenAI-Vektorraum. Gemini hat eine andere Ähnlichkeitsverteilung — der Wert wird fast sicher nicht passen.

`coach-chat` übergibt den Parameter aktuell **nicht** und nutzt damit den Default. Der Wert lässt sich deshalb aus der Edge Function heraus überschreiben, ohne die Funktionssignatur oder den Default in der Datenbank anzufassen. Empfehlung: als Org-Einstellung in `organizations.settings` führen — dieselbe Mechanik, die `coach_daily_message_limit` schon nutzt, also ebenfalls ohne Schemaänderung.

---

## 6. Migrationsplan

### Phase 0 — Bestandsaufnahme (5 Min, kein Code)

1. Chunk-Zählung aus 5.3 ausführen und notieren.
2. `GEMINI_API_KEY` im Google AI Studio auf Embedding-Zugriff prüfen.
3. Falls Chunks vorhanden: Quelldokumente sichern, sonst ist die Wissensbasis nach dem Löschen unrekonstruierbar.

### Phase 1 — Embedding-Funktion ergänzen (additiv, nicht brechend)

`gemini.ts` erhält `geminiEmbed()` und `geminiEmbedBatch()`. `llm.ts` bleibt vorerst unangetastet, damit jederzeit zurückgeschaltet werden kann. Zwingende Parameter:

- `model: 'gemini-embedding-001'`
- `outputDimensionality: 1536`
- `taskType: 'RETRIEVAL_DOCUMENT'` für die Ingestion, `'RETRIEVAL_QUERY'` für die Suche

Der letzte Punkt ist kein Feinschliff. Gemini-Embeddings sind **asymmetrisch**: Dokument und Frage werden unterschiedlich kodiert. Denselben `taskType` für beide zu verwenden kostet messbar Retrieval-Qualität. OpenAI kennt dieses Konzept nicht, deshalb existiert im aktuellen Code keine Entsprechung — es ist ein neuer Parameter, keine Übersetzung.

Weitere Punkte für die Umsetzung:

- **Zeichen-Cap senken.** `llm.ts:322` kappt bei 8000 Zeichen (~2000–2700 deutsche Token). `gemini-embedding-001` akzeptiert 2048 Token. Bei Chunks à 1600 Zeichen greift das nie, auf dem Query-Pfad ist es eine latente Fehlerquelle. Cap auf ~4000 Zeichen.
- **Normalisierung.** Google verlangt bei Dimensionen unter 3072 manuelle Normalisierung. Für diesen Anwendungsfall irrelevant, weil pgvector mit `<=>` (Cosine) rechnet und Cosine skaleninvariant ist. Trotzdem normalisieren — eine Zeile, und der Code bleibt korrekt, falls je auf L2 gewechselt wird.
- **Batch-Verhalten verifizieren.** Die Gemini-API-Dokumentation beschreibt mehrere Eingaben über einzelne `Content`-Objekte; die Vertex-Dokumentation nennt für `gemini-embedding-001` genau einen Text pro Request. Was für den API-Key-Pfad gilt, muss im ersten Testlauf geprüft werden. Falls einzeln: `EMBED_BATCH` auf 1 und Backoff verstärken.
- **Rate Limits.** Free Tier liegt bei etwa 100 Requests/Minute. Ein Massen-Import läuft dort ohne Backoff in 429er.

### Phase 2 — Retrieval umstellen (`coach-chat`)

Import auf `geminiEmbed()` mit `RETRIEVAL_QUERY`. Das bestehende `try/catch` um das Retrieval bleibt: fällt die Einbettung aus, antwortet der Coach ohne Dokumente und die Frage wird als Wissenslücke erfasst. Diese Degradation ist bereits implementiert und muss erhalten bleiben.

### Phase 3 — Ingestion umstellen und Wissensbasis neu aufbauen

1. `ingest-knowledge` auf `geminiEmbedBatch()` mit `RETRIEVAL_DOCUMENT`.
2. Nur falls Phase 0 Chunks gefunden hat: `delete from public.knowledge_chunks;` und `delete from public.knowledge_docs;` — als `super_admin` über die bestehende RLS-Policy, kein DDL.
3. `node scripts/ingest-knowledge.mjs ./wissen` neu laufen lassen.

Reihenfolge ist zwingend: erst Code, dann Daten. Andernfalls entstehen Chunks im alten Raum.

### Phase 4 — Schwellwert vermessen

Mit den ersten echten Dokumenten die Ähnlichkeitsverteilung messen, statt zu raten:

```sql
-- Nach der Neu-Ingestion: typische Ähnlichkeiten sichten
select round(similarity::numeric, 3) as sim, doc_title
from public.match_knowledge(
  (select embedding from public.knowledge_chunks limit 1),
  '00000000-0000-0000-0000-000000000001'::uuid,
  null, 20, 0.0   -- Schwelle bewusst aus
);
```

Aus der Verteilung den neuen Wert ableiten und aus `coach-chat` explizit übergeben.

### Phase 5 — Aufräumen

`llm.ts` löschen, `SHARED_ORDER` im Bundler kürzen, `npm run generate`, Doku und ADR-027. Erwarteter Effekt: `coach-chat.ts` schrumpft von 1020 auf etwa 700 Zeilen, `OPENAI_API_KEY` / `OPENAI_MODEL` / `OPENAI_FAST_MODEL` / `ROUTER_MODEL` entfallen restlos.

### Phase 6 — Abnahme

`docs/coach-eval-set.md` vollständig durchspielen. Bei einer RAG-Umstellung ist das keine Formalie: geprüft wird nicht die Antwortqualität des Modells, sondern ob die _richtigen_ Dokumente gefunden werden. Konkret gegen Fragen testen, deren Antwort nur in einem Teamdokument steht.

---

## 7. Risiken

| Risiko                                    | Schwere                                      | Gegenmaßnahme                                                                             |
| ----------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Chunks im alten Vektorraum bleiben liegen | **hoch** — falsche Zitate ohne Fehlermeldung | Reihenfolge in Phase 3 strikt einhalten; Chunk-Zählung vor und nach dem Umbau vergleichen |
| `min_similarity 0.25` passt nicht         | mittel — RAG liefert nichts oder Müll        | Phase 4, Wert vermessen statt schätzen                                                    |
| Falscher/kein `taskType`                  | mittel — schleichend schlechtere Treffer     | In `gemini.ts` als Pflichtparameter modellieren, nicht als Option mit Default             |
| Free-Tier-429 beim Import                 | niedrig — Import bricht ab                   | Backoff; der Rollback in `ingest-knowledge` löscht das halbe Dokument bereits             |
| Batch-Semantik weicht ab                  | niedrig                                      | Im ersten Testlauf mit zwei Texten verifizieren                                           |
| Google ändert Free-Tier-Konditionen       | mittel, extern                               | `llm.ts` ist per Git wiederherstellbar; Rückweg bleibt eine Codeänderung                  |

---

## 8. Was diese Analyse **nicht** belegen kann

- **Kein Live-Test.** Die Prüfumgebung hat keinen Netzwerkzugang. Alle Aussagen zu `gemini-embedding-001` stammen aus der Google-Dokumentation, nicht aus einem eigenen Aufruf. Zu verifizieren sind: 1536-Ausgabe, Batch-Verhalten, tatsächliche Free-Tier-Grenzen.
- **Kein Datenbankzugriff.** Ob `knowledge_chunks` tatsächlich leer ist, ergibt sich aus Bootstrap und Seed — bestätigen muss es die Abfrage aus 5.3.
- **Keine Qualitätsmessung.** Ob Gemini-Embeddings für deutschsprachige Network-Marketing-Inhalte besser oder schlechter abschneiden als `text-embedding-3-small`, ist ohne Eval-Durchlauf mit echten Dokumenten nicht beantwortbar. MTEB-Werte sagen darüber nichts Verlässliches aus.

---

## 9. Empfehlung

Migration durchführen, **jetzt** statt später — solange die Wissensbasis leer ist, entfällt der teuerste Teil vollständig. Die Codeänderung ist auf fünf Dateien begrenzt, das Frontend ist nicht betroffen, und der Rückweg bleibt über Git offen.

Zwei Punkte, die den Ausgang bestimmen und leicht übersehen werden: der `taskType` (asymmetrische Einbettung) und der neu zu vermessende `min_similarity`. Beides ist ohne Datenbankänderung lösbar — aber beides fällt bei Nichtbeachtung nicht als Fehler auf, sondern als leise schlechtere Antwortqualität.
