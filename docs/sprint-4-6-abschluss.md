# Sprint 4.6 — Abschluss-Checkliste

## 1. Vollständig behobene Findings

| Finding | Fix | Nachweis |
|---|---|---|
| [K-1] P0 — knowledge_gaps leakt Kontaktdaten | Rohfragen werden nie gespeichert; LLM generalisiert zu anonymem Thema, bei Fehler wird NICHT geloggt | coach-chat/index.ts; ADR-023.1 |
| [P-2] P0 — Beta nicht messbar | `usage_events` + serverseitiges Tracking in commit/status/coach/contact-Pfaden, `app_opened` vom Client; 3 fertige Auswertungs-Queries | Migration 8; docs/beta-metriken.sql; pgTAP-Test |
| [A-3] P0 — Regel-Engine-Monolith | Zerlegt in `plan_contact_state()` + 5 Signal-Funktionen; Hauptfunktion = UNION + Ranking; Verhalten identisch (pgTAP grün-pflichtig) | Migration 8 |
| [D-1] P1 — profiles-Überexposition | Tabelle: nur eigenes Profil (+ Admin); Org-Sicht nur via `profiles_public` (9 Basisspalten); Frontend umgestellt | Migration 8; pgTAP-Tests angepasst |
| [F-1] P1 — Coach vergisst Konversation | Konversation lebt in der URL (`?c=`); beim Öffnen wird die jüngste passende Konversation automatisch fortgesetzt | CoachPage/coachApi |
| [F-2] P1 — weiße Seite bei Fehlern | App-weite ErrorBoundary mit Neu-laden-Karte, PII-freies Logging | app/ErrorBoundary.tsx |
| [F-3] P1 — keine Suche/Pagination | Serverseitige ilike-Suche; seitenweises Nachladen (50er-Seiten, hasMore-Sonde); Einzel-Kontakt hat eigene Query (behebt nebenbei [F-4]) | contactsApi/ContactsPage |
| [D-2] P1 — Fehl-Taps endgültig | `correction`-Events + `effective_pipeline_events`; Phase/Engine ignorieren Korrigiertes; Timeline zeigt durchgestrichen + „korrigieren"-Aktion | Migration 8; pgTAP-Test (Phase fällt korrekt zurück) |
| [S-2] P1 — Passwort nur clientseitig | `minimum_password_length = 8` in der Auth-Config (lokal); für Staging/Prod als Pflichtpunkt in der Beta-Checkliste | config.toml |
| [S-1] P1 — validate_invite ungedrosselt | Anon-RPC entzogen; einziger Pfad: Edge Function `validate-invite` mit IP-Limit 10/10 Min + Versuchs-Tabelle | Migration 8; validate-invite/index.ts |
| [S-3] P1 — match_knowledge ohne Org-Zwang | Neue Pflicht-Signatur mit `p_org_id`; alte Signatur gedroppt (kein Aufrufer kann sie vergessen) | Migration 8 |
| [A-1] P1 — Typen-Drift | `domain.ts` als einzige App-Schnittstelle; CI generiert Typen und bricht bei Abweichung | domain.ts; ci.yml |
| [A-5] P1 — kein Prod-Setup | `scripts/setup-production.sql`: idempotent, psql-Variablen, gibt Gründer-Codes aus | Skript |

## 2. Bewusst verschoben (mit Begründung)

| Finding | Nach | Warum vertretbar |
|---|---|---|
| [P-1] Beta-Gate Journey | Sprint 5 | Kein Fix, sondern das nächste Feature; Friendly-User-Tests (Woche 0) sind vorher zulässig |
| [A-4] Offline-Queue | P2 | ADR-012 wurde stattdessen korrigiert (ADR-023) — Doku beschreibt jetzt den echten Stand |
| [K-2..K-6] Router-Heuristik, Query-Condensation, Token-Budgets, Output-Guardrail, Similarity-Kalibrierung | P2, nach ersten Realdaten | Kalibrierung ohne echte Wissensbasis/Nutzung wäre Raten; Eval-Set deckt die Risiken übergangsweise |
| [S-4] CORS-Allowlist, [S-5] Prompt-Injection-Delimiter | P2 | JWT-Pflicht bzw. Freigabe-Workflow begrenzen das Risiko; Härtung vor Launch |
| [S-7] DSGVO-Funktionen (Löschung, Einwilligungs-Checkbox, Auto-Ablauf) | vor LAUNCH, Pflicht | Beta läuft im engsten Kreis; Beta-Checkliste blockiert den Launch ohne diese Punkte |
| [D-3..D-6] Zyklenschutz, Skalierungs-Indizes, Cleanup | P2/P3 | Kein Risiko bei Beta-Größenordnung; als Migrationen billig nachrüstbar |
| [F-5, F-6, P-4, P-5] | P2 | Komfort, nicht Korrektheit |

## 3. Bestehende Restrisiken (offen benannt)

1. **Ungetestete Laufzeit:** Migration 8 und die Function-Änderungen sind statisch geprüft, aber ohne Live-Umgebung nicht ausgeführt. Erster Schritt nach Übergabe: `db reset` + alle 29 pgTAP-Tests + Eval-Set — Findings zurück an mich.
2. **CI-Typen-Gate ist scharf geschaltet:** Der nächste Push schlägt fehl, bis einmalig `npm run db:types` ausgeführt und committet wurde (danach `domain.ts` kurz gegenprüfen). Das ist gewollt — der Zwang ist der Fix.
3. **Gap-Generalisierung hängt am LLM:** Fällt der Router-Modell-Call aus, entstehen keine Gap-Einträge (Privacy-first). Blinder Fleck in der Wissenserfassung während LLM-Ausfällen — akzeptiert.
4. **Rate-Limit via `x-forwarded-for`:** hinter manchen Proxys teilen sich Nutzer eine IP (Sammellimit) — für Beta-Größe unkritisch.
5. **Lokale Registrierung braucht jetzt `supabase functions serve`** (validate-invite). Im README dokumentiert; wer es vergisst, sieht eine klare Fehlermeldung.
6. **profiles_public** ist eine zweite Pflegestelle: neue „öffentliche" Profilspalten müssen bewusst in die View aufgenommen werden — das ist Feature, nicht Bug (Datenminimierung by default), aber man muss es wissen.

## 4. Angepasste ADRs

- **ADR-012 korrigiert:** Offline-Queue-Behauptung entfernt; gültiger Stand dokumentiert (via ADR-023).
- **ADR-016 erfüllt:** usage_events existieren jetzt; Umsetzungsdetail (serverseitiges Tracking) in ADR-023.2.
- **ADR-020 konkretisiert:** Datenminimierung bei Profilen technisch erzwungen (profiles_public).
- **ADR-022 ergänzt:** Wissenslücken-Logging nur noch anonymisiert.
- **ADR-003 ergänzt:** Korrektur-Events als Heilungsmechanismus bei erhaltener Immutabilität.
- **NEU ADR-023:** alle Sprint-4.6-Härtungen mit akzeptierten Nachteilen.

## Definition of Done — Status

☐ Lokal: `db reset` grün, 29 pgTAP-Tests grün, Vitest/Lint/Typecheck grün
☐ Einmalig `npm run db:types` committen (CI-Gate)
☐ Eval-Set gegen echte Keys erneut durchgespielt (Gap-Anonymisierung stichprobenartig in `knowledge_gaps` verifiziert!)
☐ Registrierungs-Flow mit laufenden Functions getestet (inkl. Rate-Limit: 11. Versuch → Meldung)
☐ Danach: Audit Nr. 2

Erst wenn Audit Nr. 2 ohne P0 und mit höchstens wenigen P1 zurückkommt, startet Sprint 5.
