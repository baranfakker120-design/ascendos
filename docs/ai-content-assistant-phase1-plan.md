# AI Content Assistant — Phase 1: Analyse, Backup, Implementierungsplan

**Status:** Analyse abgeschlossen — **keine Feature-Implementierung in diesem Dokument**  
**Datum:** 2026-08-08  
**Regel:** Additive Erweiterung nur. Bestehende Domains (Coach, Kontakte, Team, Profil, Gamification, AP, Chats, Sync) bleiben unberührt.

---

## 0. Backup- / Rollback-Punkt

| Item                       | Wert                                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| Arbeitsstand vor Analyse   | Branch `cursor/today-hub-bubble-c4aa` war clean; `main` enthielt bereits PR #64 (Heute-Bubble) |
| Uncommittete Änderungen    | **keine**                                                                                      |
| Stash (unberührt gelassen) | `stash@{0}` von altem Branch `cursor/sprint6-i18n-coach-delete-c4aa` — nicht angefasst         |
| Backup-Basis               | `origin/main` @ `e4755e9` — `feat(nav): Heute-Bubble / Daily Hub wie Profil-Mehr (#64)`        |
| Git-Tag (Rollback)         | `backup-before-ai-content-assistant` → Commit `e4755e9`                                        |
| Feature-Branch             | `cursor/ai-content-assistant-c4aa` (von Tag/Main aus)                                          |

### Rollback

```bash
git checkout main
git reset --hard backup-before-ai-content-assistant
# oder Feature-Branch verwerfen:
git branch -D cursor/ai-content-assistant-c4aa
git push origin --delete cursor/ai-content-assistant-c4aa   # nur wenn gewünscht
```

---

## 1. Antworten A–M (Ist-Zustand)

### A) Wo ist der „Heute“-Bereich?

| Element          | Pfad / Route                                                                   |
| ---------------- | ------------------------------------------------------------------------------ |
| Home / Tagesplan | `/` → `TodayRoute` → `TodayPage` (`src/features/daily-plan/TodayPage.tsx`)     |
| Anker            | `#heute-tagesplan`, `#heute-aufgaben`, `#heute-prioritaeten`                   |
| Heute-Bubble     | `src/app/layouts/nav/TodayHubMenu.tsx`                                         |
| Content-Stub     | `/heute/content` → `src/features/content-assistant/AiContentAssistantPage.tsx` |

### B) Navigation

Bottom-Nav (`src/app/layouts/BottomNav.tsx`), 5 Tabs:

1. **Heute** (`/`) — `TodayHubMenu` (Bubble)
2. Kontakte (`/kontakte`)
3. Coach (`/coach`) — Center
4. Team (`/team`)
5. Profil — `ProfileStack` (`/profil`, `/settings`, `/more`)

Heute ist aktiv für `/` und `/heute/*`.

### C) Sichere Integrationsstelle

**Bereits vorhanden und ideal:**

- Route `/heute/content`
- Feature-Ordner `src/features/content-assistant/`
- Hub-Eintrag „AI Content Assistent“ in `TodayHubMenu`

Erweiterung **nur** dort + neue Tabellen/Bucket/Edge Function.  
**Nicht** in `coach-chat`, Knowledge-Center oder Stories-Admin „mit einbauen“.

### D) Bilder/Videos heute

| Use Case       | Storage                            | Hinweis                                  |
| -------------- | ---------------------------------- | ---------------------------------------- |
| Avatare        | Bucket `avatare`                   | öffentlich, ≤2 MiB                       |
| Live-Coaching  | Bucket `coaching-media`            | öffentlich, ≤50 MiB, nur Content-Manager |
| Ascend Stories | `media_url` / `media_path` Spalten | **kein** Stories-Bucket; oft externe URL |
| Knowledge      | Text → Chunks/Embeddings           | keine Binärdateien                       |

**Kein** Content-Asset-Bucket, keine Asset-Metadaten-Tabellen.

### E) Upload-Funktionen

- `uploadAvatarImage` — `src/features/profile/profileApi.ts`
- `uploadMedia` — `src/features/live-coaching/liveCoachingApi.ts` (privat, Manager)
- Offline-Queue-Kinds existieren (`avatar`, `knowledge`, `story`, …), Content-Assets **nicht** verdrahtet

### F) Storage

Nur `avatare` + `coaching-media` (Migrationen + RLS). Client: `src/shared/api/supabase.ts`.

### G) Datenbank / Cloud

- Supabase (Postgres + Storage + Edge Functions + RLS)
- Multi-Tenant: `org_id`, Memberships, `current_org_id()`
- Feature-Tabellen + RLS; Regeln serverseitig
- Migrationen append-only: `YYYYMMDDNNNNN_*.sql` (aktuell bis `…00031…`)

### H) KI-Schnittstellen

| Funktion         | Ort                                                                              |
| ---------------- | -------------------------------------------------------------------------------- |
| Coach-Chat       | Edge `coach-chat` — Groq → OpenRouter → Cerebras                                 |
| Knowledge-Ingest | Edge `ingest-knowledge` — Gemini Embeddings `vector(1536)`                       |
| Quota            | org `coach_daily_message_limit` (Default 50)                                     |
| Vision           | **Stubs only** (`visionContracts`, Share-Verification) — kein Model, nie Auto-AP |

**Kein** Content-Assistant-Endpoint. Coach-Quota darf **nicht** stillschweigend mitgenutzt werden.

### I) Web-/Search

- RAG über freigegebene Knowledge-Chunks: ja
- Öffentliche Web-Recherche / Trend-Fetch: **nein**
- Externes `fetch` nur zu LLM/Embedding-APIs

### J) Tägliche Keyword-/Hashtag-Recherche (technisch)

| Stufe                     | Ansatz                                                                                        | Voraussetzung                                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **V1 (empfohlen zuerst)** | Kuratierte + saisonale Keyword-Listen + LLM-Ableitung aus Asset-Metadaten + Team-Wissen (RAG) | Keine Meta-App-Review                                                                                                                 |
| **V2 (offiziell Meta)**   | Instagram Hashtag Search API (`GET /ig_hashtag_search`, `top_media`, `recent_media`)          | App Review + Feature **Instagram Public Content Access** + passende Permissions; Limit **30 unique Hashtags / 7 Tage** pro IG-Account |
| **Verboten**              | Scraping, inoffizielle Private APIs, Browser-Bots                                             | Meta Terms                                                                                                                            |

Quellen (offiziell):

- [Hashtag Search](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/hashtag-search/)
- [Instagram Public Content Access](https://developers.facebook.com/docs/features-reference/instagram-public-content-access/)
- [IG Hashtag Search](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-hashtag-search/)

### K) Offizielle Meta-/Instagram-APIs (relevant)

| Fähigkeit                                               | API                                                                         | Quelle                                                                                           |
| ------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Content Publishing (Image/Video/Reels/Stories/Carousel) | Content Publishing → Container `POST /{ig-user-id}/media` + `media_publish` | [Content Publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing) |
| Login                                                   | Instagram Login **oder** Facebook Login for Business                        | dieselbe Doku                                                                                    |
| Hashtag Research                                        | Hashtag Search (+ Public Content Access)                                    | siehe J                                                                                          |
| Media muss öffentlich erreichbar sein                   | Meta fetcht `image_url` / `video_url`                                       | Content Publishing Guide                                                                         |

### L) Was braucht welche Berechtigungen / was ist möglich?

**Publishing (Business/Creator, verbunden):**

- Instagram Login Pfad u. a.: `instagram_business_basic`, `instagram_business_content_publish`
- Facebook Login Pfad u. a.: `instagram_basic`, `instagram_content_publish`, `pages_read_engagement` (+ ggf. weitere bei Business-Manager-Rollen)
- Rate Limit u. a.: Professional Account **max. 50 Posts / 24h** (Meta-Doku `media_publish`)
- Nutzer muss veröffentlichen **explizit** bestätigen (Produktregel AscendOS)

**Hashtag Search:** App Review + Instagram Public Content Access; 30 unique Hashtags / 7 Tage.

**Nicht über Graph API (daher nicht bauen):** Auto-Like, Auto-Follow/Unfollow, mass Engagement, Cookie-/Passwort-Login, Scraping.

### M) Was darf NICHT automatisiert werden?

Gemäß Meta Developer Terms / Automated Data Collection:

- Programmatischer Zugriff **außerhalb** der Platform APIs
- Scripts/Browser-Automation gegen Instagram-Web/App
- Passwortspeicherung, Cookie-Hijacking, Klick-Simulation
- Garantie-Claims („kein Shadowban“) — auch produktseitig verboten

Quelle: [Automated Data Collection](https://developers.facebook.com/docs/development/terms-and-policies/automated-data-collection/)

AscendOS Clean Check: Ampel (**Unauffällig** / **Attention** + Alternative), nie Garantien.

---

## 2. Dateien

### Bereits vorhanden (Einstieg — später erweitern)

- `src/features/content-assistant/AiContentAssistantPage.tsx`
- `src/app/layouts/nav/TodayHubMenu.tsx` (Hub-Link — nur bei Bedarf Labels/Routing)
- `src/app/router.tsx` (Route `/heute/content`)
- `src/shared/i18n/catalogs/{de,en,fr,tr,it,pl}.json` (`todayHub.*`)

### Geplante **neue** Dateien (spätere Phasen)

```
src/features/content-assistant/
  api/contentAssetsApi.ts
  api/contentDraftsApi.ts
  components/… (Library, Draft, CleanCheck, FormatPicker)
  lib/aspectRatio.ts
  lib/cleanCheck.ts          # client heuristics optional
  AiContentAssistantPage.tsx # ausbauen, nicht ersetzen von TodayPage

supabase/migrations/YYYYMMDD00032_content_assistant_foundation.sql
supabase/functions/content-assistant/index.ts   # EIGENE Function
supabase/functions/_shared/…                    # nur shared helpers, nicht coach-prompts umbauen
```

### **NICHT anfassen** (Schutzliste)

| Bereich                                | Beispiele                                                                    |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| Coach Chat / Prompts / Quota           | `coach-chat`, `prompts.ts`, Coach-i18n-Logik                                 |
| Kontakte / Pipeline                    | `contacts*`, pipeline RPCs                                                   |
| Team / Genealogy                       | `TeamPage`, genealogy engine/migrations                                      |
| Profil / AP / Ranks / Cosmetics        | gamification migrations, `ap_ledger`, award triggers                         |
| Stories Admin / Live Coaching Logik    | außer rein lesender Wiederverwendung von UI-Primitives                       |
| Applied Migrations                     | nie umschreiben                                                              |
| Generated setup                        | `setup/functions/*`, `setup/setup-complete.sql` (nur via `npm run generate`) |
| Embedding-Dimension / Knowledge-Schema | `vector(1536)` Contract                                                      |
| Bottom-Nav Tab-Struktur                | keine neuen Haupt-Tabs; Content bleibt unter Heute                           |

---

## 3. Datenmodell (neu, getrennt)

Neue Tabellen (Namen final in Migration — Vorschlag):

| Tabelle                    | Zweck                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------- |
| `content_assets`           | Asset-Metadaten; Original-Storage-Pfad; Format-Hints; never mutate binary in place |
| `content_asset_analysis`   | KI-Analyse (Thema, Keywords, Stimmung, Formateignung)                              |
| `content_drafts`           | Hook, Caption, CTA, Hashtags, Format, Status, Clean-Check-Ergebnis                 |
| `content_research_runs`    | tägliche/on-demand Research-Snapshots                                              |
| `content_research_terms`   | Keywords/Hashtags je Run                                                           |
| `content_publish_attempts` | optionale offizielle Publish-Versuche + Meta-IDs (später)                          |

Gemeinsame Spalten-Muster: `id`, `org_id`, `created_by`, `created_at`, `updated_at`, RLS via Membership.

**STOPP-Regel:** Keine Spalten an `contacts`, `profiles`, `ap_*`, `coach_*`, `daily_plans` anhängen „weil praktisch“.

---

## 4. Storage-Konzept

| Bucket (neu)     | Sichtbarkeit                                                                          | Regeln                                          |
| ---------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `content-assets` | privat oder signed URLs; für Meta-Publish ggf. zeitlich öffentliche signed/public URL | Path `{org_id}/{user_id}/{asset_id}/original.*` |
| Ableitungen      | `{…}/derivatives/{format}.*`                                                          | **Original nie überschreiben**                  |

Upload: eigene API analog Avatar/Coaching, eigene Offline-Queue-Kind nur wenn nötig.  
Max-Größen/MIME in Migration festlegen (Images + mp4/webm).

---

## 5. AI-Konzept

| Job                           | Wo                                  | Hinweis                                                                                    |
| ----------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------ |
| Asset-Analyse (Vision + Tags) | Edge `content-assistant`            | Provider über `_shared/ai-providers`; **eigene** Quota (`content_daily_*` in org settings) |
| Caption/Hook/CTA              | dieselbe Function, Action-Parameter | Compliance-Prompt (keine Einkommens-/Gesundheitsversprechen)                               |
| Clean Check                   | Regel-Engine + LLM Review           | Output: `clean` \| `attention` + rewrite                                                   |
| Kein Auto-Publish             | —                                   | Nutzer bestätigt immer                                                                     |

**Nicht** `coach-chat` erweitern für Content-Generation (Quota-/Prompt-/Produkt-Trennung).

---

## 6. Recherche-Konzept

1. **Phase A:** Saison + Nische + Asset-Analyse → Keyword-Sets (Haupt / Nische / Long-Tail) ohne Meta Hashtag API
2. **Phase B (optional):** Offizielle Hashtag Search nach App Review; Cache 7 Tage wegen Limit
3. UI zeigt Quellen-Transparenz („kuratiert“ vs. „IG Hashtag API“)
4. Keine Spam-Tags (`#fyp`, `#viral` als Default-Masse)

---

## 7. Instagram-Konzept (Phasen)

| Phase | Umfang                                                                                                |
| ----- | ----------------------------------------------------------------------------------------------------- |
| I     | „Auf Instagram öffnen“ = Share-Sheet / Copy Caption + Asset download/export — **kein** Graph Publish  |
| II    | Meta App + OAuth (Business/Creator) — Token sicher in Edge/Vault, nie Vite-Bundle                     |
| III   | Container create + `media_publish` nach explizitem User-Confirm; Status-Polling; Limit-Hinweis 50/24h |

Kein Scraping, kein Bot-Login.

---

## 8. Sicherheitskonzept

- RLS auf allen Content-Tabellen (`org_id` + membership)
- Storage: nur eigene Org-Pfade schreiben
- Secrets nur Edge Functions
- Original-Assets immutable; Drafts versionierbar
- Clean Check vor Anzeige „bereit“
- Keine Shadowban-Garantien
- DACH-Compliance wie Coach: keine Einkommensversprechen / Health Claims
- Vision/AP: Content-Analyse darf **nie** AP auslösen

---

## 9. UI-Konzept

- Einstieg: Heute-Bubble → AI Content Assistent (bestehend)
- Seite `/heute/content` ausbauen: Library · Heute vorbereitet · Draft-Detail · (später) Research
- Formate Story 9:16 / Feed 4:5 / Reel 9:16 als Karten (Design-Tokens, `Card`, bestehende Typo)
- CTAs: Content ansehen · Bearbeiten · Auf Instagram öffnen
- i18n in allen 6 Katalogen (`contentAssistant.*` oder Erweiterung `todayHub.*`)
- Mobile-first; Bottom-Nav bleibt

---

## 10. Implementierungsphasen (nach Plan-Freigabe)

| Phase | Lieferumfang                                                        | Risiko                                        |
| ----- | ------------------------------------------------------------------- | --------------------------------------------- |
| **2** | Schema + Bucket + Upload Library UI + Metadaten manuell             | niedrig                                       |
| **3** | Asset-Analyse Edge + Draft-Generator + Clean Check                  | mittel (AI cost/quota)                        |
| **4** | Täglicher „Content für heute“ Workflow (Scheduling lokal/cron Edge) | mittel                                        |
| **5** | Research V1 (ohne Meta)                                             | niedrig                                       |
| **6** | Instagram OAuth + offizielles Publishing                            | hoch (App Review, Tokens) — separat freigeben |

Zwischen jeder Phase: Regression Smoke (Coach, Kontakte, Team, Profil, Today, Sync).

---

## 11. Testplan

- Unit: Aspect-Ratio-Helfer, Clean-Check-Heuristiken, i18n-Keys
- Integration/RLS: pgTAP für neue Tabellen
- Manuell: Upload → Analyse → Draft → Clean Check → kein Auto-Publish
- Regression: Coach Chat senden; Kontakt öffnen; Team-Tree; Profil/Avatar; Today Mission; AP-Anzeige unverändert
- Mobile + Desktop Layout Content-Seite
- Locale DE/EN/TR/IT/PL/(FR)

---

## 12. Rollback-Plan

1. Feature-Flag / Route-Stub zurück auf Platzhalter-UI
2. Edge Function undeployen
3. Storage-Bucket leer lassen (Daten behalten) oder Org-scoped cleanup
4. Migrationen werden **nicht** rückwärts gelöscht; bei Abbruch: Feature-Code entfernen, Tabellen unbenutzt lassen
5. Hard rollback Codebase: Tag `backup-before-ai-content-assistant`

---

## 13. Offene Entscheidungen (STOPP vor Implementierung)

1. Wer darf Assets hochladen — jeder Berater oder nur Content-Manager/Admin?
2. Bucket public vs. signed-only (beeinflusst Meta `image_url`/`video_url`)?
3. Eigene Content-Quota vs. separates Billing?
4. Wann Meta App Review starten (Phase 6)?
5. Soll „täglicher Content um 12:00“ serverseitig cronnen oder nur on-open berechnen?

**Keine dieser Punkte wird ohne Freigabe implementiert.**

---

## 14. Kurzfazit

AscendOS hat bereits den **sicheren Einstieg** (`/heute/content` + Hub). Es fehlen Storage, Schema, Edge Function und Instagram-OAuth — alles **additiv** machbar, ohne Coach/Kontakte/Team/AP anzufassen. Recherche und Publishing nur über offizielle Meta-Wege oder kuratierte Alternativen; keine inoffizielle Automation.
