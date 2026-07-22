# Sprint 4.5 — Testprotokoll & Stabilisierung

Regel: Jeder Durchlauf wird protokolliert (Datum, Tester, Ergebnis).
Jede Abweichung wird als Bug erfasst (Vorlage unten). Sprint 4.5 endet,
wenn alle Szenarien grün sind und die Beta-Checkliste vollständig ist.

## 0. Setup-Reihenfolge

1. `npm install` → `npm run lint && npm run typecheck && npm run test` (muss grün sein)
2. `supabase start` → `.env` füllen → `npm run db:test` (26 pgTAP-Tests grün)
3. `supabase/functions/.env` mit echten Keys → `supabase functions serve --env-file supabase/functions/.env`
4. `npm run dev`
5. Wissensbasis laden: `node scripts/ingest-knowledge.mjs ./wissen` (Startpaket:
   docs/wissensbasis-startpaket.md) → in Studio jedes Dokument prüfen → `approved`

## 1. End-to-End-Szenarien (je: Ergebnis ☐ OK / ☐ Bug #__)

### S1 — Genealogie
☐ Gründer-Registrierung (FOUNDERSEYDA) → super_admin, Team Seyda
☐ Einladungslink erstellen → privates Fenster → Berater-Registrierung
☐ Sponsor korrekt, Firstline-Zähler +1, ungültiger/verbrauchter Code wird abgelehnt

### S2 — Kompletter Interessenten-Prozess
☐ Kontakt „Mehmet" anlegen → Timeline zeigt „Kontakt erstellt"
☐ Präsentation teilen (Share/Clipboard) → Event „Präsentation gesendet", Phase bleibt Lead
☐ „Präsentation angesehen" dokumentieren → Phase „Präsentation gesehen"
☐ Fit Check teilen + „Fit Check abgeschlossen" → Phase „Fit Check"
☐ „3-Way-Call durchgeführt" → Phase „3-Way-Call"
☐ „Als Partner registriert" → Phase „Partner"; Timeline lückenlos (7 Events)

### S3 — Daily Plan (Regel-Engine)
Vorbereitung: In Studio `occurred_at` so zurückdatieren, dass entstehen:
1 Kontakt Fit-Check-ohne-Call, 1 Präsentation ≥2 Tage ungesehen,
1 Kontakt 8–13 Tage still, 1 terminierter Schritt heute fällig.
☐ Heute-Tab → 4 Missionen in exakt dieser Prioritätsfolge: fällig/Fit-Check oben
☐ Jede Mission zeigt ein konkretes Warum
☐ Commit → Fokus-Modus; „Erledigt" auf Follow-up → follow_up-Event am Kontakt
☐ „Später heute" → sofortige lokale Umsortierung, kein Ladezustand
☐ „Heute nicht möglich" + Grund → erscheint im Tagesabschluss
☐ App neu laden → Zustand identisch (Wahrheit liegt in der DB)
☐ Zweiter Nutzer ohne Kontakte → genau eine Aufbau-Mission

### S4 — Coach
☐ Vom Fit-Check-Kontakt: „Wie geht's weiter?" → spiegelt Phase/Events im
  ersten Satz, keine Rückfrage nach Bekanntem, endet mit „Nächster Schritt: …"
☐ Wissensfrage MIT freigegebenem Dokument → Antwort folgt dem Dokument
☐ Wissensfrage OHNE Dokument → ehrliche Lücke, kein Raten; Eintrag in
  `knowledge_gaps` (Studio prüfen)
☐ Komplettes Eval-Set (docs/coach-eval-set.md, 12 Fälle) durchklicken
☐ Tageslimit: settings auf 2 → dritte Nachricht wird sauber abgewiesen
☐ Draft-Dokument (nicht approved) darf NIE in einer Antwort auftauchen

### S5 — Robustheit
☐ Falsches Passwort, abgelaufener Invite, doppelter Benutzername → verständliche Fehlermeldungen
☐ Functions ohne Keys starten → Coach-Fehlermeldung freundlich, App sonst voll nutzbar
☐ Flugmodus: App-Shell lädt, klare Zustände statt weißer Seite
☐ Zwei Browser parallel (Sponsor + Berater): keine Daten des jeweils anderen sichtbar

## 2. Performance-Messung (Zielwerte)

| Messpunkt | Ziel | Wie messen |
|---|---|---|
| Daily Plan (Erstaufruf, generate) | < 500 ms | Network-Tab: rpc/generate_daily_plan |
| Daily Plan (Folgeaufruf) | < 150 ms | dito (idempotenter Pfad) |
| Kontaktliste (50 Kontakte) | < 200 ms | Network-Tab: contacts + contact_phases |
| Coach gesamt | < 6 s | `timings.total_ms` in der Response |
| — davon RAG (Embedding+Match) | < 800 ms | `timings.rag_ms` |
| — davon Router | < 1,5 s | `timings.router_ms` |
| — davon LLM | < 4 s | `timings.llm_ms` |
| Ingestion pro Dokument | < 15 s | Skript-Ausgabe |

Coach-Timings stehen pro Anfrage in der Response (`timings`) und als
JSON-Zeile in den Function-Logs (`metric: coach_chat`) — ohne Inhalte (ADR-019).

Datenbank-Tiefenanalyse bei Auffälligkeiten (Studio → SQL):

```sql
-- Testdaten aufblasen: 200 Kontakte + Events für den eigenen User, dann:
explain analyze select * from public.contact_phases where owner_id = auth.uid();
explain analyze select public.generate_daily_plan(current_date);
-- Langsame Statements insgesamt:
select query, calls, mean_exec_time
from pg_stat_statements order by mean_exec_time desc limit 15;
```

## 3. Bug-Log (Vorlage)

| # | Szenario | Schritte | Erwartet | Tatsächlich | Schwere (blocker/major/minor) | Status |
|---|---|---|---|---|---|---|
| 1 | | | | | | offen |

Regeln: Blocker stoppen den Sprint sofort. Kein Fix ohne Eintrag.
Fixes an Migrationen immer als NEUE Migration (ADR-018), nie als Edit.

## 4. Bereits im Review gefunden & gefixt (Sprint 4.5, Codeseite)

| # | Fund | Fix |
|---|---|---|
| R1 | `create_invite` referenzierte `gen_random_bytes` ohne Schema — wäre mit `search_path=public` in Production beim ersten Invite gescheitert | Migration 7: pgcrypto-Extension + `extensions.gen_random_bytes` |
| R2 | `coach_convos`/`coach_messages` fehlten in den Frontend-Typen — Typecheck-Fehler im Coach-Verlauf | Typen ergänzt |
| R3 | `vite.config.ts` nutzte Vite-`defineConfig` mit Vitest-`test`-Key — Typecheck-Fehler | Import auf `vitest/config` umgestellt |

Bekannte Rest-Risiken für den Live-Test (gezielt prüfen):
- pgvector-Operator `<=>` setzt `extensions` im search_path der DB voraus
  (Supabase-Standard; bei Fehler „operator does not exist" bitte melden).
- Deno-Import `jsr:@supabase/supabase-js@2` beim ersten `functions serve`
  (Version wird aufgelöst; bei Fehler Logs schicken).
- `navigator.share` existiert nur auf Mobile/HTTPS — Desktop nutzt den
  Clipboard-Fallback (gewollt).
