# Beta-Checkliste (Go/No-Go vor Team Seyda)

## Technik

☐ Alle Szenarien aus dem Testprotokoll grün (S1–S5)
☐ 26 pgTAP-Tests + Vitest + Lint + Typecheck + Build in CI grün
☐ Staging-Supabase (EU) aufgesetzt, Migrationen via CLI eingespielt
☐ Production-Supabase (EU) aufgesetzt; Setup-Skript statt Seed
(echte Org, Team, 2 Gründer-Invites, external_tools, agents)
☐ Supabase Pro auf Production aktiv; Backups täglich; Restore-Übung
durchgeführt und im Runbook dokumentiert (ADR-019)
☐ Netlify: main→Production, PR-Previews→Staging; Env-Vars pro Kontext
☐ Function-Secrets auf Staging+Production gesetzt (nie im Repo)
☐ E-Mail-Bestätigung auf Staging/Production AKTIV (lokal aus)
☐ Sentry (EU) eingebunden, PII-Scrubbing geprüft
☐ Coach-Tageslimit produktiv sinnvoll gesetzt (z. B. 50)

## Inhalt

☐ Mindestens Priorität-1-Dokumente (6) approved in Production
☐ Eval-Set komplett durchgespielt GEGEN die echte Wissensbasis
☐ external_tools-Links auf Production geprüft (die drei Netlify-Apps)

## Recht (vor echten Nutzern, ADR-020)

☐ Datenschutzerklärung + Impressum verlinkt (anwaltlich geprüft)
☐ AV-Verträge: Supabase, Netlify, Sentry, Google (Gemini API)
☐ Registrierung: Einwilligungs-Checkbox mit Link auf die Erklärung
☐ Hinweis für Berater zur Verantwortung für ihre Kontaktdaten

## Beta-Betrieb

☐ WhatsApp-Feedback-Gruppe angelegt; wöchentlicher Zoom terminiert
☐ Woche-0-Friendly-User benannt (Baran, Seyda + 2–3 Erfahrene)
☐ Der eine kritische Test geplant: ein Neuling registriert sich per
Sponsor-Link OHNE jede Erklärung — und wir schauen nur zu
☐ Wöchentlicher Blick definiert: Nutzung (usage: kommt mit Sprint 5),
knowledge_gaps, Function-Logs (metric: coach_chat)
☐ Abbruchkriterium akzeptiert: <50 % regelmäßige Nutzung nach 4 Wochen
→ erst Ursachen verstehen, keine neuen Features
