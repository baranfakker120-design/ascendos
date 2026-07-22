# AscendOS — Architecture Decision Records (ADR)

Stand: Juli 2026 · Status aller ADRs: Akzeptiert
Zweck: Jede wesentliche technische Entscheidung ist hier nachvollziehbar dokumentiert, damit neue Entwickler auch in Jahren verstehen, warum AscendOS so gebaut ist — und unter welchen Bedingungen eine Entscheidung revidiert werden sollte.

Format je ADR: Kontext → Betrachtete Optionen → Entscheidung → Akzeptierte Nachteile → Langfristige Auswirkungen

---

## ADR-001: Supabase als Backend-Plattform

**Kontext:** AscendOS braucht Datenbank, Auth, Storage, serverseitige Logik und Realtime — mit einem sehr kleinen Entwicklerteam.

**Optionen:** (a) Supabase, (b) Firebase, (c) eigener Backend-Server (Node/NestJS) + gemanagte Postgres.

**Entscheidung:** Supabase.

**Begründung:** Postgres als Fundament (relationale Daten: Genealogie, Pipeline, Mandanten), Row Level Security als DB-seitige Sicherheitsschicht, Edge Functions für Logik, Auth integriert, EU-Region wählbar. Firebase verworfen: NoSQL-Modell passt nicht zu Baumstrukturen und relationaler Provisionslogik; Vendor-Lock-in bei Google. Eigener Server verworfen: Betriebsaufwand (Hosting, Skalierung, Security-Patches) steht in keinem Verhältnis zur Teamgröße.

**Akzeptierte Nachteile:** Abhängigkeit von Supabase als Anbieter; Edge Functions (Deno) haben ein kleineres Ökosystem als Node.

**Langfristig:** Da Supabase auf offenen Standards basiert (Postgres, GoTrue, PostgREST), ist eine spätere Migration auf selbst gehostetes Supabase oder reines Postgres möglich, ohne das Datenmodell zu verlieren.

---

## ADR-002: Shared-Database-Mandantenfähigkeit (org_id + RLS)

**Kontext:** AscendOS soll langfristig mehrere Teams und Unternehmen (White-Label) bedienen, startet aber mit einem Team.

**Optionen:** (a) Eine Datenbank, Trennung per `org_id` + RLS, (b) eine Datenbank pro Mandant, (c) Mandantenfähigkeit später nachrüsten.

**Entscheidung:** Shared Database mit `org_id` auf jeder fachlichen Tabelle und RLS-Policies, Hierarchie Organization → Team → User ab Tag 1.

**Begründung:** Eine Migrationsbasis, ein Deployment, RLS erzwingt Trennung auf DB-Ebene statt in Anwendungscode. DB-pro-Mandant ist bei 50+ Firmen operativ nicht beherrschbar und von Supabase nicht vorgesehen. Nachrüsten verworfen: `org_id` nachträglich in Bestandsdaten einzuziehen ist der teuerste anzunehmende Umbau.

**Akzeptierte Nachteile:** Jede Policy muss sauber geschrieben sein — ein Policy-Fehler beträfe potenziell Mandantengrenzen. Gegenmaßnahme: automatisierte pgTAP-RLS-Tests in der CI (ADR-014).

**Langfristig:** White-Label ist eine Konfigurations- und Vertriebsfrage, keine Architekturfrage mehr.

---

## ADR-003: Event-basierte Pipeline statt Statusfeld

**Kontext:** Kontakte durchlaufen Phasen (Lead → Präsentation → Fit Check → Partner). Drei externe Alt-Tools (WayToMoon, Firmenpräsentation, Business Fit Check) sollen zunächst manuell, später nativ integriert werden.

**Optionen:** (a) `contacts.status`-Feld, (b) Event-Tabelle `pipeline_events`, Phase als abgeleitete Sicht.

**Entscheidung:** `pipeline_events` mit `event_type`, `source` (`manual` | Tool-Key | `system`), `payload`. Die aktuelle Phase wird aus Events abgeleitet, nie gespeichert.

**Begründung:** Die spätere native Integration der Alt-Tools ändert nur die Event-`source`, nicht die Konsumenten (Daily Plan, KI, UI). Vollständige Historie entsteht automatisch und ist Grundlage für Priorisierung, Analytics und Achievements.

**Akzeptierte Nachteile:** Phase-Abfragen sind minimal teurer als ein Feld-Read (gelöst über Views/ggf. materialisierte Sicht).

**Langfristig:** Das Event-Modell trägt auch künftige Module (Analytics, Coachings) ohne Schemaänderung am Kern.

---

## ADR-004: Genealogie per sponsor_id + Recursive CTE

**Kontext:** Network-Marketing-Struktur: Sponsor, Firstline, Downline, Upline Manager.

**Optionen:** (a) `sponsor_id` + Recursive CTE, (b) Closure Table, (c) Materialized Path.

**Entscheidung:** `profiles.sponsor_id` als einzige Quelle der Wahrheit; Downline-Abfragen über eine gekapselte Postgres-Funktion `get_downline(user_id)` mit Recursive CTE. Registrierung ausschließlich über Invite-Codes (`invites`-Tabelle), die `sponsor_id` und Team transaktional setzen.

**Begründung:** Einfachstes korrektes Modell; bei Teamgrößen unter ~50.000 Knoten ist CTE-Performance unkritisch. Closure Table/Materialized Path sind Optimierungen mit Pflegeaufwand, die erst bei Konzern-Größenordnung nötig werden — und dann additiv nachrüstbar sind (Index-Struktur neben der Quelle der Wahrheit).

**Akzeptierte Nachteile:** Sehr tiefe/breite Bäume würden CTE-Kosten erzeugen; Monitoring der Query-Zeiten ab größeren Orgs.

**Langfristig:** Kein Umbau nötig, nur optionale Beschleunigungsschicht.

---

## ADR-005: Journey-Engine statt hardcodiertem Onboarding

**Kontext:** 7-Tage-Onboarding im MVP, später beliebig erweiterbar, langfristig pro Mandant unterschiedlich.

**Optionen:** (a) Feste Onboarding-Seiten im Code, (b) generische Journey-Engine (`journeys`, `journey_steps`, `user_progress`), Inhalte aus der DB.

**Entscheidung:** Journey-Engine. Das 7-Tage-Onboarding ist der erste Datensatz, nicht das erste Feature.

**Begründung:** Content-Änderungen ohne Deployment; Erweiterung auf Tag 8–30 durch Admins; White-Label-fähig per Design. Das Onboarding rendert im selben Fokus-Modus wie der Daily Plan — neue Partner lernen das Kernritual ab Tag 1.

**Akzeptierte Nachteile:** Etwas mehr Anfangsaufwand als statische Seiten; Content-Verantwortung liegt beim Team (leere Journey = leeres Feature).

**Langfristig:** Dieselbe Engine trägt später Academy-Lernpfade und Leader-Ausbildung.

---

## ADR-006: Daily Plan als Hybrid aus Regel-Engine und LLM

**Kontext:** Der Tagesplan soll sich intelligent anfühlen, aber schnell, günstig und zuverlässig sein. Neupriorisierung nach jeder erledigten Mission.

**Optionen:** (a) Jede Priorisierung per LLM, (b) reine Regel-Engine ohne LLM, (c) Hybrid.

**Entscheidung:** Hybrid. Deterministische Regel-Engine erzeugt Kandidaten und sortiert sofort/lokal um (verschoben → nach hinten, terminiert → zur Uhrzeit). Das LLM priorisiert final, formuliert Begründungen und wird nur bei bedeutenden Ereignissen erneut gerufen (neues Pipeline-Event, neuer Kontakt, Tageszeitwechsel). Fallback: Ohne LLM-Antwort liefert die Regel-Engine den Plan allein — die App ist morgens nie leer.

**Begründung:** LLM-Call nach jedem Tap wäre langsam (2–4 s) und teuer; reine Regeln könnten weder erklären noch kontextuell abwägen.

**Akzeptierte Nachteile:** Zwei Logikpfade müssen konsistent gehalten werden.

**Langfristig:** Kostenstruktur bleibt bei Nutzerwachstum linear beherrschbar; Ausfallsicherheit gegenüber LLM-Anbietern.

---

## ADR-007: KI ausschließlich hinter Edge Functions, niemals autonom handelnd

**Kontext:** KI-Kernprodukt, aber API-Keys, Kostenkontrolle, Compliance und Vertrauen müssen gesichert sein.

**Optionen:** (a) LLM-Aufrufe direkt aus dem Frontend, (b) alle Aufrufe über Edge Functions.

**Entscheidung:** Ausschließlich Edge Functions (`generate-daily-plan`, `coach-chat`, `draft-message`, …). Keys nur als Supabase-Secrets. Pro-Nutzer-Tageslimits in `organizations.settings`. Produktprinzip: Die KI priorisiert, analysiert, erklärt, führt — sie versendet niemals selbst Nachrichten und trifft keine automatisierten Entscheidungen mit Wirkung auf Personen (DSGVO Art. 22); jede Aktion bestätigt der Nutzer.

**Akzeptierte Nachteile:** Geringfügig höhere Latenz durch den Proxy-Hop; Streaming muss durch die Function geschleift werden.

**Langfristig:** Anbieterwechsel (Modell/Provider) ist eine serverseitige Änderung ohne Client-Release; Guardrails sind zentral durchsetzbar.

---

## ADR-008: Compliance-Guardrails als Systembestandteil

**Kontext:** DACH-Recht (UWG, HWG) und Plattform-Vertrauen: keine Einkommensversprechen, keine Heil-/Gesundheitsversprechen, keine Garantien, kein Druck-Vokabular.

**Optionen:** (a) Guardrails nur als Prompt-Hinweis, (b) Prompt-Verankerung in jedem Agenten + Eval-Set + konforme Alternativformulierung.

**Entscheidung:** Option (b). Verstöße werden nicht nur unterdrückt — der Coach formuliert aktiv die konforme Alternative („Compliance als Coaching").

**Akzeptierte Nachteile:** Kein Guardrail ist perfekt; Restrisiko wird über das Prompt-Eval-Set (ADR-015) und Freigabe-Workflow der Wissensbasis (ADR-010) minimiert.

**Langfristig:** Compliance-Regeln sind zentral pro Agent gepflegt und pro Mandant erweiterbar.

---

## ADR-009: RAG mit pgvector statt externer Vektor-Datenbank

**Kontext:** Der Coach arbeitet vollständig als Retrieval-Augmented Generation über die Team-/Firmen-Wissensbasis.

**Optionen:** (a) pgvector in Supabase-Postgres, (b) externe Vektor-DB (Pinecone, Weaviate, Qdrant).

**Entscheidung:** pgvector. `knowledge_docs` (versioniert, Metadaten, Freigabestatus) + `knowledge_chunks` (Embedding, ~500 Token, Überlappung). Retrieval filtert immer `status = 'approved'`, Gültigkeitszeitraum und `org_id`/`team_id` — RLS und Mandantenlogik gelten damit automatisch auch für Wissen.

**Begründung:** Keine zweite Infrastruktur, keine Daten-Synchronisation zwischen Systemen, Wissens-Zugriff unterliegt denselben Sicherheitsregeln wie alle Daten. Bei erwartbaren Korpusgrößen (Tausende bis Zehntausende Chunks pro Org) ist pgvector performant.

**Akzeptierte Nachteile:** Bei extremen Korpusgrößen (Millionen Chunks, hohe QPS) wäre eine dedizierte Vektor-DB überlegen — dann als nachgelagerter Index migrierbar.

**Langfristig:** Die Wissensbasis ist Teil des normalen Backups, der Migrationen und der DSGVO-Prozesse.

---

## ADR-010: Freigabe-Workflow für die Wissensbasis (Human-in-the-Loop)

**Kontext:** Wissen wächst aus Dokumenten, Zoom-Transkripten und markierten Coach-Antworten („Conversation Memory"). Ungeprüfte Inhalte könnten Fehler, veraltete Stände oder rechtlich heikle Aussagen enthalten.

**Optionen:** (a) Automatische Aufnahme aller Inhalte, (b) verpflichtende menschliche Freigabe.

**Entscheidung:** Nur Dokumente mit Status `approved` sind für Retrieval sichtbar. Upload/Ingestion ist automatisiert, Freigabe erfolgt durch Admins. Versionierung über `supersedes_doc_id`; Altversionen werden archiviert, nie zerstört. Best Practices aus Coach-Gesprächen werden vor der Freigabe automatisch anonymisiert/generalisiert (keine personenbezogenen Daten Dritter in der Team-Wissensbasis), Herkunft bleibt über `source_convo_id` nachvollziehbar. Antwort-Hierarchie im Prompt: Teamdokumente überschreiben Modellwissen; ohne Dokumententreffer zu Team-/Firmenfragen sagt der Coach ehrlich, dass ihm die Teaminfo fehlt — Lücken werden in `knowledge_gaps` geloggt und steuern die weitere Dokumentation (nachfragegetriebene Wissenserfassung).

**Akzeptierte Nachteile:** Freigabe kostet Admin-Zeit; bewusst in Kauf genommen als Qualitätssicherung des wertvollsten Unternehmensvermögens.

**Langfristig:** Die Wissensbasis ist auditierbar, versioniert und mandantenfähig — der eigentliche Burggraben von AscendOS.

---

## ADR-011: Spezialisierte Agenten als Datensätze + LLM-Router statt Agenten-Framework

**Kontext:** Mehrere Spezialisten (Daily Planner, Recruiting, Sales, Knowledge, später Leadership, Content), für den Nutzer ein einziger Coach.

**Optionen:** (a) Multi-Agent-Framework (LangChain/CrewAI o. ä.), (b) Agenten als Konfigurationsdatensätze (`agents`-Tabelle: System-Prompt, Retrieval-Filter, Modell) + ein schlanker Router-LLM-Call.

**Entscheidung:** Option (b). Neuer Spezialist = neue Tabellenzeile, kein Code. MVP-Schnitt: Router + Recruiting, Sales, Knowledge; Leadership/Content folgen, sobald die Wissensbasis Substanz dafür hat.

**Begründung:** Frameworks fügen unkontrollierte Abstraktionsschichten für ein Problem hinzu, das eine Klassifikation plus Prompt-Auswahl löst. Volle Kontrolle über Prompts, Kosten und Verhalten.

**Akzeptierte Nachteile:** Komplexere Orchestrierung (Multi-Step-Tool-Use) müsste später selbst gebaut werden — akzeptiert, weil aktuell nicht benötigt.

**Langfristig:** Agenten sind pro Mandant konfigurier- und erweiterbar; Modellwechsel pro Agent möglich.

---

## ADR-012: Frontend — React/Vite/TypeScript, Feature-Sliced, TanStack Query, PWA

**Kontext:** Web-First-Produkt, kleines Team, Anforderung „keine Änderung zerstört Bestehendes", spätere Mobile-Apps.

**Optionen (State):** Redux vs. TanStack Query. **Optionen (Struktur):** Schichtenarchitektur vs. Feature-Slices. **Optionen (App-Form):** PWA vs. sofort native App.

**Entscheidung:** Feature-Sliced-Struktur (`features/*` strikt isoliert, Import nur aus `shared/`), erzwungen per ESLint `import/no-restricted-paths` (Verstoß = Build-Fehler). TanStack Query für Server-State (kein Redux — 90 % des States sind Server-Daten; Cache, Refetch, Optimistic Updates inklusive). Typen per `supabase gen types` aus dem Schema generiert. PWA (installierbar, App-Shell offline, Missions-Status wird offline gequeued und beim Reconnect gesynct; kein vollwertiges Offline-Sync). Fokus-Modus als handgeschriebene Reducer-State-Machine (XState verworfen: Lernkurve/Bundle für eine einzelne Machine unverhältnismäßig). Login per E-Mail (Benutzername nur als Anzeigename; Username-Login verworfen wegen Passwort-Reset und Sonderfällen in Supabase Auth).

**Akzeptierte Nachteile:** PWA hat auf iOS Einschränkungen (Push, Installation); akzeptiert bis zur nativen App.

**Langfristig:** DB und Frontend können nicht auseinanderlaufen; Feature-Isolation hält Änderungen lokal.

---

## ADR-013: Geschäftslogik niemals im Frontend (Mobile-Readiness)

**Kontext:** Später sollen native Apps (React Native o. ä.) dieselben APIs nutzen. Das Backend darf nie nur für die Web-PWA gebaut sein.

**Optionen:** (a) Logik teils im Web-Client, (b) sämtliche Geschäftslogik in Edge Functions und Postgres (Funktionen, Policies, Trigger).

**Entscheidung:** Option (b). Priorisierung, Invite-Redemption, RAG, Guardrails, Achievements, Metriken — alles serverseitig. Der Web-Client ist ein austauschbarer Konsument; `shared/types` und `shared/api` sind später als Package extrahierbar.

**Akzeptierte Nachteile:** Mehr Edge-Function-Code statt „schnell im Client gelöst".

**Langfristig:** Eine native App ist ein UI-Projekt, kein Backend-Projekt.

---

## ADR-014: Teststrategie — RLS-Tests als oberste Priorität

**Kontext:** Ein RLS-Fehler wäre kein Bug, sondern ein meldepflichtiger Datenschutzvorfall.

**Entscheidung:** (1) pgTAP-Tests für jede RLS-Policy mit simulierten Nutzern (Berater sieht nie fremde Kontakte; Leader sieht keine Kontaktdaten, nur Aggregate; Org-Grenzen dicht; Invite kann keine fremde sponsor_id setzen) — laufen in der CI bei jeder Migration. (2) Vitest-Unit-Tests für Kernlogik (Regel-Engine, Phasen-Ableitung, Achievements, Invite-Flow). (3) Wenige stabile Playwright-E2E-Tests für kritische Pfade (Registrierung→Journey, Commit→Mission→Persistenz, Kontakt→Event→Phase). Bewusst keine ausufernde E2E-Suite (Wartungslast).

**Akzeptierte Nachteile:** Keine Coverage-Zieljagd; Lücken außerhalb der kritischen Logik möglich.

**Langfristig:** Sicherheit ist maschinell garantiert, bevor Features grün sind.

---

## ADR-015: LLM-Qualitätssicherung per manuellem Eval-Set statt CI-Automatisierung

**Kontext:** LLM-Antwortqualität ist nicht deterministisch testbar.

**Entscheidung:** Kuratiertes Eval-Set (~30 realistische Fälle inkl. Compliance-Fallen) mit Soll-Verhalten; wird vor jedem Prompt- oder Modellwechsel manuell durchlaufen. Halbautomatisierung erst nach Stabilisierung der Prompts.

**Akzeptierte Nachteile:** Manuelle Arbeit pro Änderung; bewusst gewählt gegenüber trügerischer CI-Sicherheit.

**Langfristig:** Das Eval-Set wächst mit realen Vorfällen zum Regressionsschutz.

---

## ADR-016: Eigenes Nutzungs-Tracking statt Analytics-Drittanbieter

**Kontext:** Die Beta muss drei Fragen messbar beantworten (regelmäßige Nutzung, Handlungsaktivierung, Coach-Nutzen). Drittanbieter-Analytics wären ein DSGVO- und Vertrauensrisiko.

**Entscheidung:** Interne `usage_events`-Tabelle (App geöffnet, Plan committed, Mission erledigt, Coach genutzt, Entwurf übernommen) + nächtlich materialisierte `activity_metrics`. Keine Drittanbieter-SDKs im Client.

**Akzeptierte Nachteile:** Kein fertiges Analytics-Dashboard; Auswertungen selbst gebaut (SQL reicht für die Beta).

**Langfristig:** Dieselben Daten speisen später Team-Analytics und Achievements — einmal erfasst, mehrfach genutzt.

---

## ADR-017: daily_plan_items als Tabelle statt JSONB

**Kontext:** Missionen brauchen Status (erledigt/später/nicht möglich), Gründe und Auswertbarkeit (Achievements, Metriken).

**Optionen:** (a) Plan-Items als JSONB im Plan, (b) eigene Tabelle `daily_plan_items`.

**Entscheidung:** Eigene Tabelle. (Korrektur einer früheren Entwurfsentscheidung aus Phase 2.)

**Begründung:** Status-Updates pro Mission, relationale Auswertung und RLS auf Zeilenebene sind mit JSONB fehleranfällig und schlecht indizierbar.

**Akzeptierte Nachteile:** Eine Tabelle und Joins mehr.

**Langfristig:** Missionsdaten sind erste Klasse für Analytics und Progression.

---

## ADR-018: Umgebungen, Migrationen und Deployment-Pipeline

**Kontext:** Zuverlässigkeit und Wartbarkeit ab Tag 1; keine manuellen Production-Änderungen.

**Entscheidung:** Development = lokale Supabase-Instanz (CLI/Docker) je Entwickler; Staging und Production = zwei getrennte Supabase-Projekte (EU-Region). Netlify Branch-Previews gegen Staging. CI-Gate (Lint, Typecheck, Vitest, pgTAP, Playwright, Gitleaks-Secret-Scan) vor jedem Merge. Migrationen ausschließlich als versionierte SQL-Dateien im Repo via Supabase CLI; automatisch gegen Staging, manuell ausgelöst gegen Production. Dashboard-Schemaänderungen auf Production sind untersagt.

**Akzeptierte Nachteile:** Lokales Docker-Setup als Einstiegshürde für neue Entwickler (durch Setup-Doku kompensiert).

**Langfristig:** Jede Umgebung ist jederzeit reproduzierbar; Umgebungs-Drift ist strukturell ausgeschlossen.

---

## ADR-019: Backups, Restore-Übung und Monitoring ohne PII

**Kontext:** Datenverlust wäre existenzbedrohend; Fehler müssen nachvollziehbar sein, ohne sensible Daten zu loggen.

**Entscheidung:** Supabase Pro für Production (tägliche Backups; Point-in-Time-Recovery nach Kostenprüfung). Vor Launch eine dokumentierte Restore-Übung (Staging aus Production-Backup, Zeitmessung, Runbook). Monitoring: Sentry mit EU-Datenresidenz für Frontend und Edge Functions, mit PII-Scrubbing (keine Nachrichteninhalte, keine Kontaktnamen, Nutzer nur als ID); Supabase-Logs; Uptime-Ping auf Health-Function. Coach-Inhalte werden nicht in Klartext-Logs geschrieben; Fehleranalyse über Metadaten (Agent, Latenz, Fehlercode).

**Akzeptierte Nachteile:** Laufende Kosten (Supabase Pro, ggf. PITR, Sentry); erschwerte Einzelfall-Diagnose ohne Inhalts-Logs.

**Langfristig:** Wiederherstellbarkeit ist bewiesen statt behauptet; Monitoring ist DSGVO-konform skalierbar.

---

## ADR-020: DSGVO-Konzept inkl. Daten Dritter und Löschkonzept

**Kontext:** Berater speichern personenbezogene Daten Dritter (Kontakte), die nie selbst eingewilligt haben. Zusätzlich: Nutzerkonten, Coach-Verläufe, Genealogie.

**Entscheidung:** EU-Region für alle Datenhaltung. AV-Verträge mit Supabase, Netlify, Sentry und LLM-Anbieter (inkl. Ausschluss der Trainingsnutzung). Datenminimierung im UI (keine Felder, die zu sensiblen Angaben über Kontakte einladen). Löschkonzept: Kontakte und Coach-Verläufe werden hart gelöscht; Profile werden bei Account-Löschung anonymisiert statt entfernt, damit die Genealogie der Downline intakt bleibt (Knoten „Ehemaliges Mitglied" ohne Personenbezug). Aufbewahrungsfristen je Datenart dokumentiert; Coach-Verläufe optional mit Auto-Ablauf. Rollenklärung: Der Berater ist für seine Kontaktdaten datenschutzrechtlich Verantwortlicher; AscendOS ist Auftragsverarbeiter. Datenschutzerklärung und finale rechtliche Bewertung vor Launch durch einen Anwalt — keine Engineering-Entscheidung.

**Akzeptierte Nachteile:** Anonymisierte Genealogie-Knoten statt vollständiger Löschung (rechtlich vertretbar, dokumentationspflichtig); externe Rechtskosten.

**Langfristig:** DSGVO-Konformität ist strukturell verankert und White-Label-tauglich (jede Org bringt eigene Rechtstexte mit).

---

## Pflege dieses Dokuments

Jede neue wesentliche Entscheidung erhält einen neuen ADR (fortlaufende Nummer). Bestehende ADRs werden nie gelöscht — bei Revision wird der alte ADR als „Ersetzt durch ADR-XXX" markiert. Ein ADR ist wesentlich, wenn er (a) schwer umkehrbar ist, (b) Kosten/Sicherheit/Datenschutz betrifft oder (c) die Arbeit mehrerer Features prägt.

---

## ADR-021: Registrierung als SECURITY-DEFINER-Trigger statt Edge Function

**Kontext:** Bei der Registrierung müssen Auth-User, Profil, Sponsor-, Team- und Org-Zuordnung sowie die Invite-Entwertung konsistent entstehen. Ein Zwischenzustand „User ohne Genealogie" darf nicht existieren.

**Optionen:** (a) Edge Function `redeem-invite` (zwei Schritte: signUp, dann Profil), (b) Trigger `handle_new_user` auf `auth.users` mit Invite-Metadata im Signup.

**Entscheidung:** Trigger. Der Signup übergibt `invite_code` + Profildaten als User-Metadata; der Trigger validiert (inkl. `FOR UPDATE`-Sperre gegen parallele Einlösung), legt das Profil an und entwertet den Invite — in einer Transaktion. Ungültiger Code lässt den gesamten Signup atomar fehlschlagen.

**Akzeptierte Nachteile:** Logik lebt in PL/pgSQL statt TypeScript; Fehlermeldungen werden über ein `AscendOS:`-Präfix an das Frontend durchgereicht. Ergänzend gilt für Sprint 1: Rollen-Checks in RLS laufen über `SECURITY DEFINER`-Helper (`current_org_id()`, `is_super_admin()`) statt JWT-Custom-Claims; der Wechsel auf Claims (Auth-Hook) erfolgt, sobald Leader-Ansichten kommen, und ändert nur Funktions-Interna, keine Policies.

**Langfristig:** Atomare Genealogie-Entstehung ist DB-garantiert und gilt unverändert für jeden künftigen Client (Web, native Apps).

---

## ADR-022: Coach-Architektur — Kontext-Injektion serverseitig, Aktion als Pflicht

**Kontext:** Der Coach (Sprint 4) darf keine ChatGPT-Kopie sein: Er arbeitet immer mit vorhandenem Kontext, fragt nur gezielt nach und endet mit einer konkreten Handlung.

**Entscheidungen:** (1) Kontext-Injektion ist Server-Sache: Der Client sendet nur `contactId` + Nachricht; die Edge Function lädt Kontakt, Phase, Events und nächsten Schritt selbst — mit dem JWT des Nutzers, also unter voller RLS. Kontext kann weder vergessen noch gefälscht werden. (2) Handlungsorientierung ist Prompt-Pflicht („Nächster Schritt: …" oder genau eine Rückfrage) und Teil des Eval-Sets (docs/coach-eval-set.md). (3) Wissens-Retrieval läuft als `match_knowledge` unter Invoker-RLS; ohne Treffer antwortet der Coach ehrlich ohne Teamwissen und loggt die Frage in `knowledge_gaps` (nachfragegetriebene Erfassung). (4) `draft-message` ist kein eigener Endpoint — Entwürfe sind ein Coach-Fall mit denselben Guardrails. (5) v1 ohne Token-Streaming; Streaming ist UX-Politur nach der Beta. (6) Embeddings via OpenAI `text-embedding-3-small` (Anthropic bietet keine Embeddings); Schlüssel ausschließlich als Function-Secrets. (7) Router = ein günstiger Klassifikations-Call pro Konversation; Agenten bleiben Datensätze (ADR-011).

**Akzeptierte Nachteile:** Antwortlatenz 2–4 s ohne Streaming; zweiter API-Anbieter (OpenAI) nur für Embeddings; Kontext-Ladezeit pro Anfrage (~3 parallele Queries, vernachlässigbar).

**Langfristig:** Der Kontextaufbau ist die Blaupause für alle künftigen Agenten (Leadership, Content); native Apps erben das Verhalten vollständig, weil nichts davon im Web-Client lebt.

---

## ADR-023: Sprint-4.6-Härtungen (Audit-Fixes)

**Kontext:** Der Audit (docs/audit-2026-07.md) fand 2 P0- und mehrere P1-Schwächen. Diese ADR dokumentiert die verbindlichen Korrekturen.

**Entscheidungen:**
1. **Wissenslücken-Logging [K-1]:** Rohfragen werden NIE gespeichert. Vor dem Logging generalisiert ein günstiger LLM-Aufruf die Frage zu einem anonymen Wissensthema (ohne Namen/persönliche Details); schlägt die Generalisierung fehl, wird nicht geloggt — Privacy vor Metrik. Ergänzt ADR-022.
2. **Nutzungs-Tracking [P-2]:** `usage_events` gemäß ADR-016, serverseitig geloggt wo Serverpfade existieren (`plan_committed`, `mission_completed/skipped`, `coach_message_sent`, `contact_created`); nur `app_opened` kommt vom Client. Tracking-Fehler brechen nie Kernfunktionen. Auswertung: docs/beta-metriken.sql.
3. **Regel-Engine [A-3]:** zerlegt in `plan_contact_state()` + eine Funktion pro Signal; `generate_daily_plan` ist nur noch UNION + Ranking. Neue Signalquellen (Journey, Sprint 5) sind eine Funktion + eine Zeile.
4. **Profiles-Datenminimierung [D-1]:** Tabelle nur noch eigenes Profil (+ Org-Admin); Org-Sichtbarkeit ausschließlich über die View `profiles_public` (Basisdaten). Konkretisiert ADR-020.
5. **Korrektur-Events [D-2]:** `correction`-Events machen Fehl-Eingaben unwirksam statt sie zu löschen; Ableitungen lesen `effective_pipeline_events`. Ergänzt ADR-003 — Immutabilität bleibt, Fehler werden heilbar.
6. **Invite-Validierung [S-1]:** anonymer RPC-Zugriff entzogen; einziger Pfad ist die Edge Function `validate-invite` mit IP-Rate-Limit (10/10 Min). Konsequenz: lokale Registrierung erfordert laufende Functions.
7. **`match_knowledge` [S-3]:** `p_org_id` ist Pflichtparameter; alte Signatur entfernt (Defense-in-Depth zusätzlich zur RLS).
8. **Typen-Disziplin [A-1]:** App importiert Domänen-Typen nur aus `shared/types/domain.ts`; `database.types.ts` gehört dem Generator, die CI erzwingt Übereinstimmung mit dem Schema.
9. **Production-Setup [A-5]:** `scripts/setup-production.sql` (idempotent, psql-Variablen) ersetzt jede manuelle Erstbefüllung.

**Korrektur an ADR-012 [A-4]:** Die dort beschriebene Offline-Queue für Missions-Status ist NICHT implementiert. Gültiger Stand: Die App-Shell ist offline verfügbar, Daten und Aktionen benötigen Netz. Eine Offline-Queue ist P2-Roadmap. (ADRs müssen den Code beschreiben, nicht den Wunsch.)

**Akzeptierte Nachteile:** Gap-Generalisierung kostet einen Mini-LLM-Call pro Lücke; validate-invite koppelt lokale Registrierung an `functions serve`; profiles_public ist eine zweite Pflegestelle für Profil-Spalten.

---

## ADR-024: LLM-Provider ausschließlich OpenAI

**Kontext:** Vereinfachung des Betriebs (ein einziger KI-Schlüssel statt zwei) auf Wunsch des Product Owners; Setup läuft vollständig mobil.

**Entscheidung:** Alle Chat-Aufrufe laufen über die OpenAI Responses API (`/v1/responses`), Embeddings unverändert über OpenAI. `ANTHROPIC_API_KEY` entfällt vollständig. Die `chatCompletion`/`embed`-Signaturen in `_shared/llm.ts` bleiben identisch — keinerlei Änderung an Business-Logik, Prompts, RAG, Auth oder API-Antworten (Provider-Schicht war dank ADR-007 austauschbar). Modellnamen sind weiterhin Daten (`agents.model`); Migration 10 stellt Default und Bestand auf `gpt-4.1` um, und `resolveModel()` mappt übrig gebliebene Claude-Namen aus Alt-Installationen defensiv auf `OPENAI_MODEL ?? gpt-4.1`. Router-/Gap-Anonymisierungs-Default: `gpt-4.1-mini`.

**Akzeptierte Nachteile:** Kompletter Vendor-Lock auf einen Anbieter (Ausfall = Ascent offline, Fallback bleibt die Regel-Engine des Daily Plans); das Eval-Set (docs/coach-eval-set.md) MUSS nach dem Wechsel einmal vollständig durchgespielt werden — Guardrail- und Tonverhalten sind modellabhängig.

**Langfristig:** Ein erneuter Providerwechsel bleibt eine Ein-Datei-Änderung plus Modell-Migration.

---

## ADR-025: Modell-Baseline, Reasoning-Budget und generierte Setup-Artefakte

**Kontext:** Nach ADR-024 lief alles über OpenAI, aber die Baseline stand auf `gpt-4.1` / `gpt-4.1-mini` — der Vorgänger-Generation. Parallel gab es drei strukturelle Probleme: die Dashboard-Einzeldateien (`setup/functions/*.ts`) und `setup/setup-complete.sql` wurden von Hand nachgeführt, `_shared/llm.ts` kannte weder Timeout noch Retry, und `setup/` lag außerhalb der Lint-/Format-Ausnahmen.

**Entscheidungen:**

1. **Baseline `gpt-5.6` (Coach) / `gpt-5.6-luna` (Router), Migration 11.** Die GPT-4.x-Generation ist Legacy; `gpt-4.1-nano` steht bereits mit Abschaltdatum auf OpenAIs Deprecation-Liste. Modellnamen bleiben Daten (`agents.model`), Overrides über `OPENAI_MODEL` / `OPENAI_FAST_MODEL` / `ROUTER_MODEL`.
2. **Automatischer Modell-Fallback.** Meldet OpenAI „Modell existiert nicht / kein Zugriff" (gestaffelte Rollouts, neue Accounts), wiederholt `chatCompletion()` den Call genau einmal mit `gpt-4.1`. Ein Zugriffsproblem darf den Coach nicht komplett ausfallen lassen.
3. **Reasoning-Budget getrennt vom Antwort-Budget.** GPT-5-Modelle verbrauchen unsichtbare Denk-Token aus `max_output_tokens`. Der Router lief mit `maxTokens: 8` — mit jedem Reasoning-Modell wäre das eine formal erfolgreiche, aber leere Antwort. Aufrufer geben weiterhin nur das sichtbare Budget an; `llm.ts` schlägt intern auf und setzt `reasoning.effort` (bei Nicht-Reasoning-Modellen weggelassen, sonst 400er).
4. **`store: false` bei allen Chat-Calls.** Coach-Prompts enthalten personenbezogene Kontaktdaten aus der Pipeline; sie gehören nicht in die Retention des Anbieters. Konsequente Fortsetzung von [K-1].
5. **Belastbarkeit in der Provider-Schicht.** Timeout (60 s Chat / 30 s Embeddings), Backoff-Retry auf 429/5xx mit Respekt vor `Retry-After`, expliziter Fehler bei fehlendem `OPENAI_API_KEY` statt kryptischem 401, Behandlung von `refusal` und `status: incomplete`. Fehler tragen einen maschinenlesbaren `code` (`LlmError`).
6. **Claude-Mapping nach Leistungsklasse.** `mapClaudeModel()` ist eine reine, testbare Funktion und erfasst auch Präfix-Schreibweisen (`anthropic/claude-…`). `haiku` → schnelles Modell, `sonnet`/`opus` → Chat-Modell. Damit sind Alt-Installationen zur Laufzeit abgesichert, unabhängig von Migration 11.
7. **Batch-Embeddings + Rollback in der Ingestion.** 64 Chunks pro Call statt einem Call pro Chunk (Laufzeitgrenze). Schlägt die Einbettung mittendrin fehl, wird das `knowledge_docs`-Row gelöscht — eine halb eingebettete Wissensbasis ist schlechter als keine, weil der Coach sie als vollständig behandelt.
8. **Setup-Artefakte sind generiert, nicht gepflegt.** `scripts/bundle-functions.mjs` und `scripts/build-setup-sql.mjs` erzeugen `setup/functions/*.ts` und `setup/setup-complete.sql` aus den echten Quellen; `npm run generate:check` blockiert in der CI jede Abweichung. Der Bundler bettet nur tatsächlich importierte Shared-Module ein — `validate-invite` schrumpfte von 199 auf 74 Zeilen, weil es nie ein LLM benutzt hat.
9. **`setup/` raus aus ESLint und Prettier.** Deno-Code mit generierter Formatierung gehört nicht in die Browser-Lint-Konfiguration; vorher hätte die CI daran scheitern können.

**Bewusst NICHT geändert:** Migration 6 enthält weiterhin `default 'claude-sonnet-4-6'`. Angewendete Migrationen werden nicht editiert (ADR-018); Migration 10/11 korrigieren den Default vor jedem `agents`-Insert, und `resolveModel()` fängt Altbestand zur Laufzeit ab. Zwei unabhängige Sicherungen sind hier besser als eine Geschichtsfälschung. Ebenso bleibt die Erwähnung von `ANTHROPIC_API_KEY` in ADR-024 stehen — ein ADR dokumentiert die Entscheidung, dass der Schlüssel entfällt; ihn zu löschen würde die Begründung unlesbar machen. Im Code existiert er nirgends.

**Akzeptierte Nachteile:** Reasoning-Modelle sind teurer und langsamer pro Antwort als `gpt-4.1`; das Eval-Set (docs/coach-eval-set.md) MUSS nach dem Wechsel einmal vollständig durchlaufen — Ton- und Guardrail-Verhalten sind modellabhängig. Der Fallback-Pfad kann stillschweigend auf ein schwächeres Modell wechseln; er wird deshalb per `console.warn` protokolliert.

