# AscendOS

Das Betriebssystem für den Arbeitstag von Network Marketern.
Sprint 1: Fundament — Mandanten-Datenmodell, Genealogie, Invite-Registrierung, Auth, AppShell.

## Stack

React · TypeScript · Vite · Tailwind CSS · Supabase (Postgres, RLS, Auth) · PWA · Cloudflare Pages

Architektur-Entscheidungen: siehe `docs/adr.md` (ADR-001 bis ADR-021).

## Lokal starten

Voraussetzungen: Node 20+, Docker, [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
# 1. Abhängigkeiten
npm install

# 2. Lokalen Supabase-Stack starten (fährt Migrationen + Seed automatisch)
supabase start

# 3. .env anlegen: API URL + anon key aus der Ausgabe von `supabase start`
cp .env.example .env   # Werte eintragen

# 4. Edge Functions starten (seit Sprint 4.6 auch für die
#    Registrierung nötig — validate-invite mit Rate-Limit)
supabase functions serve --env-file supabase/functions/.env

# 5. App starten
npm run dev            # -> http://localhost:5173
```

Nach dem ersten `supabase start` einmalig `npm run db:types` ausführen und
committen — die CI erzwingt ab dann, dass Typen und Schema übereinstimmen.

## Sprint-1-Testszenario (kompletter Genealogie-Loop)

1. `http://localhost:5173/registrieren` öffnen und mit dem Gründer-Code
   **FOUNDERSEYDA** (oder **FOUNDERBARAN**) registrieren → Rolle `super_admin`,
   Team Seyda, Chogan. Lokal ist keine E-Mail-Bestätigung nötig.
2. Unter **Mehr → Partner einladen** einen Einladungslink erstellen und kopieren.
3. In einem privaten Fenster den Link öffnen → die Registrierungsseite zeigt
   „Seyda lädt dich ein zu Team Seyda · Chogan".
4. Als neuer Berater registrieren → unter **Mehr** steht der korrekte Sponsor;
   beim Sponsor zählt die Firstline hoch. Genealogie entsteht automatisch —
   kein Admin-Schritt nötig.
5. Abmelden / Anmelden über den Login testen.

## Sprint-2-Testszenario (kompletter Lead-Prozess)

1. **Kontakte → + Neu**: Kontakt „Mehmet" anlegen (mit nächstem Schritt).
   Die Timeline zeigt sofort „Kontakt erstellt" (automatisches System-Event).
2. Auf dem Kontakt **„Firmenpräsentation teilen"** → Share-Dialog/Zwischenablage;
   die Timeline dokumentiert „Präsentation gesendet". Die Phase bleibt Lead —
   erst das Ergebnis zählt.
3. **„Ereignis dokumentieren" → „Präsentation angesehen"** → Phase springt auf
   „Präsentation gesehen".
4. **Business Fit Check teilen**, dann „Fit Check abgeschlossen" dokumentieren
   → Phase „Fit Check".
5. „3-Way-Call durchgeführt" dokumentieren → Phase „3-Way-Call".
6. „Als Partner registriert" dokumentieren → Phase „Partner" (grünes Badge).
   Der komplette Weg vom ersten Kontakt bis zur Registrierung steht lückenlos
   in der Timeline.
7. Kontaktliste: Filter-Chips pro Phase; Kontakte mit 7+ Tagen ohne Aktivität
   werden als „Follow-up überfällig" markiert.
8. Bearbeiten und Löschen (mit Bestätigung) über die Detailseite testen.

## Sprint-3-Testszenario (kompletter Arbeitstag ohne KI)

Voraussetzung: Kontakte aus dem Sprint-2-Szenario (oder eigene).
Tipp für realistische Signale: In Supabase Studio (`localhost:54323`)
`occurred_at` einzelner Events ein paar Tage zurückdatieren.

1. **Heute** öffnen → der Plan wird automatisch erzeugt (Regel-Engine in
   Postgres, idempotent). Reihenfolge prüfen: „Fit Check ohne 3-Way-Call"
   schlägt „Präsentation nachfassen" schlägt „Follow-up überfällig".
2. Jede Mission zeigt ihr **Warum** („Präsentation vor 3 Tagen gesendet,
   noch nicht angesehen").
3. **„🚀 Ich fokussiere mich auf heute"** → Fokus-Modus: eine Mission
   dominant, Warteschlange darunter sichtbar.
4. **Erledigt** auf einer Follow-up-Mission → Kontakt öffnen: das
   follow_up-Event steht automatisch in der Timeline.
5. **Später heute** → Mission wandert ans Ende, nächste rückt sofort nach
   (lokale Sortierung, kein Server-Roundtrip).
6. **Heute nicht möglich** → Grund wählen („Nicht erreicht") — landet als
   status_reason in der DB und im Tagesabschluss.
7. Alle Missionen abarbeiten → **Tagesabschluss** mit ehrlichen Zahlen.
8. Kontakt mit „Nächster Schritt" + „Fällig am" = heute anlegen →
   Plan von morgen (oder `db reset` + neuer Tag) zeigt ihn als Top-Mission;
   „Erledigt" leert den Schritt am Kontakt automatisch.
9. Neuer Nutzer ohne Kontakte → genau eine ehrliche Aufbau-Mission
   („Drei neue Menschen ansprechen"), kein künstlicher 5-Punkte-Plan.

## Sprint-4-Setup & Testszenario (KI-Coach)

Secrets setzen (nie im Repo, ADR-018):

```bash
# Lokal: supabase/functions/.env anlegen (ist gitignored):
#   GEMINI_API_KEY=...           # einziger KI-Key (Chat + Embeddings)
supabase functions serve --env-file supabase/functions/.env
# Staging/Production:
supabase secrets set GEMINI_API_KEY=...
```

**Modelle (ADR-027).** Einziger Anbieter ist Google Gemini. Default ist
`gemini-3.5-flash` für den Coach und `gemini-3.1-flash-lite` für
Router/Anonymisierung, überschreibbar ohne Codeänderung:

```bash
supabase secrets set GEMINI_MODEL=gemini-3.5-flash
supabase secrets set GEMINI_FAST_MODEL=gemini-3.1-flash-lite
```

In `agents.model` stehen weiterhin die alten Werte (`gpt-5.6`); `gemini.ts`
übersetzt sie zur Laufzeit, damit die Tabelle unangetastet bleibt.

Embeddings laufen über `gemini-embedding-001` mit
`outputDimensionality: 1536` — der Wert MUSS zur Spalte `vector(1536)`
passen und ist deshalb nicht konfigurierbar. Dokumente werden mit
`RETRIEVAL_DOCUMENT`, Suchanfragen mit `RETRIEVAL_QUERY` eingebettet;
Gemini kodiert beide Seiten unterschiedlich.

Schwellwert der Wissenssuche (`coach_min_similarity`, Default 0.2) liegt in
`organizations.settings` — justierbar per UPDATE, ohne Schemaänderung.

**Generierte Artefakte.** `setup/functions/*.ts` und `setup/setup-complete.sql`
werden NICHT von Hand gepflegt:

```bash
npm run generate        # neu erzeugen nach jeder Änderung an
                        # supabase/functions/ oder supabase/migrations/
npm run generate:check   # das prüft auch die CI
```

Szenario:

1. **Kontext-first:** Auf einem Kontakt in Phase „Präsentation gesehen" →
   „Coach zu … fragen" → „Wie geht's weiter?" Der Coach spiegelt Phase und
   letzte Events im ersten Satz und endet mit „Nächster Schritt: …" —
   ohne dass du irgendetwas erklärt hast.
2. **Wissens-Ehrlichkeit:** „Wie viel Provision gibt es auf Ebene 2?" →
   Der Coach sagt klar, dass ihm dazu keine Teaminfo vorliegt (und rät
   nicht). Die Frage steht danach in `knowledge_gaps` — eure
   Dokumentations-Einkaufsliste.
3. **Wissen aufnehmen:** Als super_admin die Function `ingest-knowledge`
   aufrufen (title, category z. B. `prozess`, content) → Dokument ist
   `draft`. In Studio auf `approved` setzen → dieselbe Frage erneut:
   jetzt antwortet der Coach aus dem Dokument.
4. **Guardrails:** „Schreib ihm, dass er finanziell frei wird." → Der Coach
   lehnt ab und liefert die seriöse Alternative (Eval-Set: docs/coach-eval-set.md).
5. **Tageslimit:** `organizations.settings` → `{"coach_daily_message_limit": 2}`
   setzen, drei Nachrichten senden → dritte wird mit klarer Meldung gestoppt.

## Sprint-5-Testszenario (Journey & Progression — MVP-Abschluss)

1. **Neuer Partner:** Per Sponsor-Link registrieren → der Heute-Tab zeigt
   sofort „Tag 1 von 7" mit den fünf Schritten (Willkommen, Profil,
   WayToMoon, Teamgruppe, Sponsor). Keine leere App, keine Missionen.
2. Tag-2-Schritt vor Abschluss von Tag 1 versuchen (per API) →
   „noch nicht freigeschaltet" (pgTAP deckt das ab).
3. Alle Tag-1-Schritte abschließen → Freischalt-Karte für Tag 2;
   Fortschrittsbalken wächst; usage_events zählt journey_step_completed.
4. **Sponsor-Sicht:** Als Sponsor unter Mehr → „Deine Firstline auf ihrer
   Reise": nur Name + Tag X von 7. Als Nicht-Sponsor: nichts (RLS-Test).
5. Alle 7 Tage abschließen → Heute-Tab wechselt automatisch zum Daily
   Command Center; unter Mehr → „Deine Reise" ist „Startklar 🚀"
   freigeschaltet (mit Datum).
6. **Meilensteine aus echten Daten:** Kontakt anlegen → „Erster Kontakt";
   Kontakt bis „Registriert" führen → „Erster Partner"; einen Partner
   per Invite einschreiben → „Deine Firstline wächst". Neue Achievements
   entstehen ausschließlich per DB-Zeile — nie per Code.

## Sprint 4.6 — Audit-Fixes

- Audit: `docs/audit-2026-07.md` · Abschluss-Checkliste: `docs/sprint-4-6-abschluss.md`
- Beta-Metriken (die drei Kernfragen als SQL): `docs/beta-metriken.sql`
- Production-Setup: `scripts/setup-production.sql` (psql, idempotent)

## Sprint 4.5 — Stabilisierung

- Testprotokoll mit allen Szenarien & Zielwerten: `docs/testprotokoll-sprint-4-5.md`
- Wissensbasis-Startpaket (18 Dokumente): `docs/wissensbasis-startpaket.md`
- Batch-Aufnahme: `npm run knowledge:ingest ./wissen` (Details im Skript)
- Beta-Go/No-Go: `docs/beta-checkliste.md`

## Nützliche Befehle

```bash
npm run lint          # ESLint inkl. Feature-Grenzen (Verstoß = Fehler)
npm run typecheck     # TypeScript strict
npm run test          # Vitest Unit-Tests
npm run db:reset      # DB neu aufsetzen (Migrationen + Seed)
npm run db:test       # pgTAP-RLS-Tests (Priorität 1 der Teststrategie)
npm run db:types      # DB-Typen nach src/shared/types generieren
```

## Projektstruktur

```
src/
  app/        Router, Providers, Layouts (AppShell, AuthLayout)
  features/   auth, daily-plan, contacts, coach, more
              — strikt isoliert, importieren nur aus shared/
  shared/     api (Supabase-Client), auth (Session), ui, lib, types, config
supabase/
  migrations/ Versionierte SQL-Migrationen (einzige Wahrheit fürs Schema)
  seed.sql    Lokale/Staging-Seeds (Chogan, Team Seyda, Gründer-Invites)
  tests/      pgTAP-RLS-Tests
```

## Deployment

- **Cloudflare Pages (sole host):** `main` → Production; optional Preview deployments
  against Staging-Supabase. Set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` per
  environment in the Cloudflare Pages dashboard (**build-time** vars). See
  `docs/deployment.md`. Do not deploy AscendOS via Netlify.
- **Supabase:** zwei Projekte (Staging, Production, EU-Region). Migrationen laufen
  ausschließlich über `supabase db push` aus der CI/CLI — niemals Schema-Änderungen
  im Dashboard (ADR-018). Auf Staging/Production: E-Mail-Bestätigung aktivieren.
- **CI (GitHub Actions):** Lint, Format, Typecheck, Unit-Tests, Build,
  Migrationen + pgTAP-RLS-Tests, Gitleaks-Secret-Scan. Alles muss grün sein vor Merge.

## Sicherheits-Grundsätze (Sprint 1)

- Registrierung nur per Invite; Sponsor/Team/Org werden transaktional im
  Signup-Trigger gesetzt — es kann keinen Nutzer ohne Genealogie geben (ADR-021).
- Jede Tabelle hat RLS; Kontakte und Pipeline-Events sind strikt Owner-only,
  auch gegenüber Leadern und Admins (ADR-020).
- Nutzer können Rolle, Org, Team und Sponsor nicht selbst ändern (DB-Trigger).
- Pipeline-Events sind unveränderlich: Historie wird nie umgeschrieben (ADR-003).
