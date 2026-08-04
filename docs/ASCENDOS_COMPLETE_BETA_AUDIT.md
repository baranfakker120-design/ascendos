# AscendOS Complete Beta Audit

**Sprint:** 5.5 — Complete Product Verification (no features, no refactors)  
**Date:** 2026-08-04  
**Baseline:** `main` @ post-PR #39 / #40 era (`get_genealogy_tree`, person Coach, CF Pages)  
**Method:** Codebase verification only — no assumptions, no runtime production probes  
**Author stance:** Brutally honest. UI without logic = incomplete. Schema without writer = dead. Cron without schedule = never fires.

---

## Executive Verdict

AscendOS is a **strong beta CRM + Coach + Daily Plan core** bolted onto a **half-finished recognition / notification / content platform**.

| Layer                                           | Honest read                                            |
| ----------------------------------------------- | ------------------------------------------------------ |
| Contacts + pipeline + offline queue             | 🟢 Real product                                        |
| Coach chat + RAG + person conversation          | 🟢 Real product                                        |
| Daily Plan / Closing Loop / Journey week-1      | 🟢 Real product                                        |
| Rank frames 01–10 display + collection/equip    | 🟢 Complete (Sprint 6 System 1)                        |
| Team tree pan/zoom                              | 🟡 Works; scale claims oversold                        |
| Live Coaching Today card                        | 🟡 Works as “one Zoom event”; not a platform           |
| Advisor of the Month                            | 🟢 Calculator + cron + catch-up + history UI           |
| AAA Cinema / Hero cinema                        | 🟢 RankUp + Advisor HeroScreen (Sprint 6)              |
| Push / scheduled notifications                  | 🔴 Tables + Settings theater; **no delivery**          |
| Multi-org content tenancy (Stories / Live / KC) | 🔴 **No `org_id` — global to all authenticated users** |
| Gamification XP/Levels                          | 🔴 **Does not exist** (AP economy does)                |
| Settings (theme, delete account, sync controls) | 🔴 Mostly copy / fake                                  |

**Ship beta only if** you accept: single-org deployment, device-local CRM retention after logout, no push reminders, and Knowledge Center content **not** feeding the Coach (until later Sprint 6 systems land).

---

## Status Legend

| Symbol                   | Meaning                                       |
| ------------------------ | --------------------------------------------- |
| 🟢 Complete              | Implemented end-to-end and wired              |
| 🟡 Partially Implemented | Real pieces exist; gaps, stubs, or UI-only    |
| 🔴 Broken / Missing      | Absent, never fires, or critically incomplete |

**Priority:** P0 Critical · P1 Important · P2 Nice to Have

---

# 1. Avatar & Frame System

## Status: 🟢 Complete · Priority: P1 · Remediated Sprint 6 System 1 (2026-08-04)

### Shipped product catalog (frames 01–10)

| Key         | Name                        | Trigger                                                       | Automatic                 | Disappears                               | Priority             |
| ----------- | --------------------------- | ------------------------------------------------------------- | ------------------------- | ---------------------------------------- | -------------------- |
| frame-01    | Newcomer                    | AP ≥ 0                                                        | Yes                       | Higher AP rank                           | AP ladder            |
| frame-02    | Active                      | AP ≥ 250                                                      | Yes                       | Higher AP rank                           | AP ladder            |
| frame-03…05 | Consistent / Elite / Legend | AP thresholds                                                 | Yes                       | Higher AP rank                           | AP ladder            |
| frame-06    | Team Leader                 | **Qualified** (5 active firstlines) via `display_rank_for_ap` | Yes                       | When higher rank (Mentor) or unqualified | Below SA/Dev/Berater |
| frame-07    | Mentor                      | AP ≥ 50k                                                      | Yes                       | —                                        | AP ladder            |
| frame-08    | Developer                   | `role = developer`                                            | Yes                       | Role change                              | Below SA             |
| frame-09    | Super Admin                 | `role = super_admin`                                          | Yes                       | Role change                              | Highest              |
| frame-10    | Berater des Monats          | `monthly_awards` **place = 1** (current UTC title month)      | Yes (System 2 calculator) | Period end                               | Below SA/Dev         |

**Also:** 14-day “NEU” badge (`isNewPartner`) is intentional card chrome, not a frame.  
**Inactive** is a genealogy **filter**, not a frame (by design).

### Explicitly out of catalog (not System 1 failures)

| Name                             | Verdict                                                                                                         |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Top Recruiter                    | **No assets, no schema, no product rule** — cannot implement without new design. Deferred.                      |
| Special Event / Temporary frames | Schema placeholders only (`seasons` / `unlock_condition`) — no content. Deferred until seasons are productized. |
| AAA Cinema / HeroScreen          | **Done in System 3** (`AdvisorHeroScreen` + RankUp).                                                            |
| Advisor auto-calculation / cron  | **Done in System 2.**                                                                                           |

### What Sprint 6 System 1 implemented

1. **`display_rank_for_ap(org, ap, tl_qualified)`** — Team Leader frame only when qualified; otherwise highest earned non-TL rank (fixes null/`frame-06` lie).
2. **Genealogy + qualification progress** use that contract; Berater flag = **place 1 only**.
3. **Collection + equip UI** on Profile (`FrameCollection`) via `list_my_frame_cosmetics` / `equip_frame_cosmetic`.
4. **`resolveDisplayFrameKey`** priority: SA → Dev → Berater → **equipped** → AP rank.
5. **Auto-equip** highest unlocked AP frame when none equipped (`ap_apply_to_total` trigger).
6. **Role cosmetics grant** (`ensure_role_frame_cosmetics` for frame-08/09).
7. **`RankUpOverlay`** on Profile when display rank key changes (localStorage per membership).
8. Avatar upload already production-complete (unchanged).

### Evidence

- `supabase/migrations/20260817000030_sprint6_frame_display_contract.sql`
- `src/shared/lib/frameAssets.ts`, `resolveDisplayFrame.test.ts`
- `src/features/profile/{FrameCollection,RankUpOverlay,cosmeticsApi,ProfilePage,profileApi}.tsx`
- `supabase/tests/database/frame_display.test.sql`

---

# 2. Advisor of the Month

## Status: 🟢 Complete · Priority: P0 · Remediated Sprint 6 System 2 (2026-08-04)

| Question                  | Finding                                                                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Calculated automatically? | **Yes.** `compute_monthly_awards` / `run_monthly_awards_job` write places 1–3 from `ap_ledger`.                                                                 |
| Runs on 1st of month?     | **Yes.** GitHub Actions `.github/workflows/monthly-awards.yml` at `5 0 1 * *` UTC → Edge Function `run-monthly-awards`. Catch-up via `ensure_monthly_awards()`. |
| Timezone?                 | **UTC only** (title month = current UTC month start; activity = previous UTC month). No org TZ (product decision).                                              |
| Tie handling?             | **Defined:** AP desc → earlier `memberships.created_at` → `membership_id` asc. Documented in SQL comment + Vitest.                                              |
| Storage?                  | `monthly_awards` filled by job/catch-up; unique on `(org, period, place)` and `(org, period, membership)`.                                                      |
| History UI?               | **Yes.** Profile `AdvisorAwardsHistory` — current podium + past title months via `list_monthly_awards`.                                                         |
| UI / badge / frame?       | Frame-10 + gold team-node when place=1 for **current title month**; place 1 also unlocks `hero-berater-des-monats` cosmetic.                                    |
| Animation / popup?        | 🟢 `AdvisorHeroScreen` (System 3) + RankUp for AP ranks.                                                                                                        |
| Functional?               | **Yes** end-to-end with cron secrets + client catch-up safety net.                                                                                              |

### Semantics

- **Title period** (`monthly_awards.period`) = first day of the UTC month the title is **held** (matches System 1 readers).
- **Activity window** = previous UTC month `[title − 1 month, title)` on `ap_ledger.created_at`.
- **Idempotent:** existing rows for `(org, period)` → `already_computed` (no rewrite).
- **Eligibility:** any org membership with `sum(delta) > 0` in the window (inactive still eligible if they earned AP).

### Ops requirements (production)

1. Deploy migration `20260818000031_sprint6_monthly_awards.sql`.
2. Deploy Edge Function `run-monthly-awards` with secret `MONTHLY_AWARDS_CRON_SECRET`.
3. Set GitHub Actions secrets `SUPABASE_URL` + `MONTHLY_AWARDS_CRON_SECRET`.
4. Until (2)–(3) are live, Profile/Team catch-up still fills the **current** title month on first authenticated load.

### Evidence

- `supabase/migrations/20260818000031_sprint6_monthly_awards.sql`
- `supabase/functions/run-monthly-awards/index.ts`
- `.github/workflows/monthly-awards.yml`
- `src/features/profile/{AdvisorAwardsHistory,monthlyAwardsLogic,profileApi}.*`
- `src/features/genealogy/genealogyApi.ts` (catch-up)
- `supabase/tests/database/monthly_awards.test.sql`

---

# 3. AAA Cinema / Recognition Cinema

## Status: 🟢 Complete · Priority: P0 · Remediated Sprint 6 System 3 (2026-08-04)

**Product clarification:** There is no separate feature named “AAA Cinema / Kino.” In this codebase “AAA” was a marketing adjective. The **planned recognition cinema** (Sprint 4) is:

| Piece            | Role                                         | Status                            |
| ---------------- | -------------------------------------------- | --------------------------------- |
| `RankUpOverlay`  | AP rank-up celebration                       | 🟢 System 1                       |
| `HeroScreen`     | Berater des Monats podium (places 1–3)       | 🟢 System 3 (`AdvisorHeroScreen`) |
| Seen persistence | `usage_events.hero_seen` + `metadata.period` | 🟢 Cross-device via RPC           |

| Question        | Finding                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------- |
| Trigger         | Current title-month awards exist + user has not `hero_seen` for that period                       |
| Timing          | On authenticated AppShell load (after awards catch-up)                                            |
| Animation       | CSS choreography (scrim, stage, staggered podium, glow) — no three.js (Sprint 4 performance rule) |
| Unlock / popup  | Full-screen modal; Escape / Continue dismisses                                                    |
| History / reset | Once per title month per user; next month new awards → shows again                                |
| Storage         | `usage_events` (`hero_seen`) + monthly_awards podium                                              |

Do not confuse with: cinematic BottomNav CSS, `EnergyCore` canvas, `ApRewardSticker` particles, TeamLeader sessionStorage dialog.

### Evidence

- `supabase/migrations/20260819000032_sprint6_recognition_cinema.sql`
- `src/features/profile/AdvisorHeroScreen.tsx`, `advisorHeroLogic.ts`, `advisor-hero.css`
- `src/features/profile/RankUpOverlay.tsx` (System 1)
- `src/app/layouts/AppShell.tsx`
- `supabase/tests/database/recognition_cinema.test.sql`

---

# 4. Zoom Coaching (Live Coaching)

## Status: 🟡 Partially Implemented · Priority: P0 (honesty) / P1 (product)

| Capability                     | Status | Notes                                                                 |
| ------------------------------ | ------ | --------------------------------------------------------------------- |
| Event CRUD in Supabase         | 🟢     | `live_coaching_events`, admin page `/live-coaching`                   |
| Media upload                   | 🟢     | Storage bucket `coaching-media`                                       |
| Today card countdown           | 🟢     | Client `setInterval` 1s                                               |
| Join Zoom                      | 🟢     | `zoomus://` + HTTPS fallback                                          |
| Calendar links                 | 🟢     | Apple / Google / Outlook                                              |
| Pick “today’s” event           | 🟡     | Heuristic soonest non-finished                                        |
| Cloud sync to members          | 🟡     | RLS read of `active` events; **no Realtime**, no poll on member query |
| Reminders (30m / 5m)           | 🔴     | Scheduled in **publisher localStorage** only; flush on Today          |
| `coaching_notification_outbox` | 🔴     | Written on publish; **zero readers / workers**                        |
| Web Push                       | 🔴     | `push_subscriptions` table; **no app usage**                          |
| Recurrence (`repeat_rule`)     | 🔴     | Column + admin select; **no expansion logic**                         |
| Library / replay / multi-event | 🔴     | `LIVE_COACHING_FUTURE` all `false`                                    |
| Expired meetings               | 🟡     | “Finished” UI; no archive job                                         |
| Tenancy                        | 🔴     | **No `org_id`** — any authenticated user can see active events        |

### Brutal summary

Shippable as **“one Zoom card on Today + Join + calendar.”** Not shippable as a coaching notification platform.

### Evidence

- `src/features/live-coaching/*`
- `supabase/migrations/20260815000028_sprint_5_1_knowledge_live_coaching.sql`

---

# 5. Notifications

## Status: 🔴 Broken / Missing (as a product system) · Priority: P0

| Notification                  | Exists?                      | Trigger?                                    | Works?                               | Verdict               |
| ----------------------------- | ---------------------------- | ------------------------------------------- | ------------------------------------ | --------------------- |
| New member                    | No system                    | —                                           | —                                    | 🔴 Missing            |
| Activation                    | No                           | —                                           | —                                    | 🔴 Missing            |
| Follow-up due                 | Roadmap only                 | —                                           | Never                                | 🔴 Missing            |
| Inactive member               | Coach insight heuristic      | Client `analyzeOrg`                         | Advisory UI only                     | 🟡 Not a notification |
| Birthday                      | Draft kind / automation kind | **Never** (no `birth_date` usage in `src/`) | Never fires                          | 🔴 Stub               |
| Zoom reminder                 | Local Notification API       | Publisher device schedule                   | Audience never gets it               | 🔴 Theater            |
| Coach reminder                | Automation prefs             | Default OFF; no runner                      | Never                                | 🔴 Stub               |
| Advisor of the Month          | Frame-10 + Profile history   | Job + catch-up + display                    | Title month works                    | 🟢 Award path         |
| AAA Cinema                    | Advisor HeroScreen           | Title-month awards + not seen               | Once per period                      | 🟢                    |
| Achievement unlocked          | DB `check_achievements`      | On Progress/Journey open                    | Unlocks quietly; **no toast/push**   | 🟡 Silent             |
| Push notification             | Settings toggle              | Requests permission                         | No VAPID / SW push / subscribe write | 🔴 UI only            |
| Browser notification          | Coaching path                | `showCoachingNotification`                  | Local only                           | 🟡                    |
| Badge counter (`setAppBadge`) | No                           | —                                           | —                                    | 🔴                    |
| Genealogy `messageBadge`      | Column / UI                  | Hardcoded `0` in tree RPC path              | Never shows                          | 🔴 Dead UI            |
| Offline notification          | No                           | OfflineBootstrap = sync queues              | ≠ notifications                      | 🔴                    |
| In-app notification center    | Roadmap Phase 7              | Tables not migrated                         | —                                    | 🔴 Missing            |

### Evidence

- `src/features/live-coaching/notifications.ts`
- `src/features/settings/SettingsPage.tsx` (push toggle)
- `src/features/coach/intelligence/automation.ts` (defaults `enabled: false`)
- `docs/roadmap-ascendos.md` Phase 7
- No `from('push_subscriptions')` in `src/`

---

# 6. Automations

## Status: 🔴 Missing platform · Priority: P0

| Process                                         | Implemented?                                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Cloudflare Cron / Workers schedules             | **No** (`wrangler.toml` has no triggers)                                                    |
| `pg_cron` / `pg_net`                            | **Not installed** (documented Sprint 0)                                                     |
| Edge Function schedules                         | **Partial** — `run-monthly-awards` via GitHub Actions cron (System 2); no general scheduler |
| Coaching outbox processor                       | **No**                                                                                      |
| Monthly awards job                              | 🟢 System 2 (`run_monthly_awards_job` + GH Actions + catch-up)                              |
| Coach birthday / inactivity / follow-up senders | **Stub prefs only**                                                                         |
| Client `setInterval`                            | UI only (countdown, notify flush, offline flush)                                            |
| Daily plan generation                           | **On user open** (`generate_daily_plan` RPC) — not midnight                                 |
| Streak sync                                     | 🟢 Trigger on `usage_events`                                                                |
| AP award on pipeline/usage                      | 🟢 DB triggers                                                                              |
| Achievement check                               | 🟢 On-demand RPC when Progress/Journey opens                                                |

**Anything that must fire when the app is closed cannot work today.**

---

# 7. Gamification

## Status: 🟡 Partially Implemented · Priority: P1

| Surface                                | Status                                        |
| -------------------------------------- | --------------------------------------------- |
| AP rules + ledger + totals             | 🟢 DB + triggers + pgTAP                      |
| Auto AP from pipeline/usage            | 🟢                                            |
| Manual AP tasks                        | 🟢 Leadership UI + RPC                        |
| Rank / EnergyCore / frames on Profile  | 🟢 Display                                    |
| ApRewardSticker on Daily Plan          | 🟢                                            |
| Streak days                            | 🟢 DB trigger                                 |
| Achievements / milestones              | 🟢 On-demand (`ProgressPage`)                 |
| Cosmetics unlock on AP                 | 🟢 DB insert + Collection/equip UI (System 1) |
| Payout entitlements (€100 TL)          | 🟡 Entitlement rows, not payments             |
| Monthly Berater award                  | 🔴 No auto fill                               |
| **XP**                                 | 🔴 Does not exist                             |
| **Levels** (as XP levels)              | 🔴 Does not exist (AP ranks do)               |
| Badges (achievement UI polish / toast) | 🟡 Data without celebration push              |
| `features/gamification/`               | 🔴 Never created                              |

---

# 8. Ascend Coach

## Status: 🟢 Chat core Complete · 🟡 Intelligence Partial · Priority: P0 for chat honesty

| Capability                           | Status   | Notes                                                             |
| ------------------------------------ | -------- | ----------------------------------------------------------------- |
| AI chat E2E                          | 🟢       | Client → Edge `coach-chat` (auth, limit, RAG, providers, persist) |
| Message persistence                  | 🟢       | `coach_messages` / `coach_convos`                                 |
| Error handling                       | 🟢 Basic | Optimistic rollback; user-facing errors                           |
| Contact context (server)             | 🟢       | Loaded under JWT                                                  |
| Person conversation screen           | 🟢       | `/coach/person/:mid` (PR #39)                                     |
| Auto person context brief            | 🟢       | Client prepend once (`personContext.ts`)                          |
| Workspace list / archive             | 🟢 Local | localStorage + IDB — **not cloud sync**                           |
| Org intelligence / CEO briefing      | 🟡       | Client heuristics over RPCs — **not a second LLM**                |
| Suggested actions                    | 🟡       | Prompt chips → navigate to chat                                   |
| Follow-up generation                 | 🟡       | Derived insights; not scheduled sends                             |
| Message preparation / WhatsApp cards | 🟢       | Cards + extract draft                                             |
| Message draft library (birthday…)    | 🔴       | `messageDrafts.ts` — tests/exports only, not production UI        |
| Coach memory (objections/promises)   | 🔴       | localStorage stub; not product flow                               |
| Automations auto-send                | 🔴       | Default OFF; constitution forbids surprise send                   |
| Knowledge RAG                        | 🟢       | When `knowledge_docs` approved                                    |
| Knowledge Center articles → Coach    | 🔴       | **Different tables — never connected**                            |
| Daily limit                          | 🟢       | RPC `coach_messages_today`                                        |

### Brutal summary

**Chat + RAG + persistence is the real product.** “COO intelligence” is a useful rules engine, not magic. Dual knowledge systems mean operators can publish into Knowledge Center and **nothing reaches Coach replies**.

---

# 9. Team Tree

## Status: 🟡 Functional with fragilities · Priority: P1

| Area                              | Status                                                              |
| --------------------------------- | ------------------------------------------------------------------- |
| Zoom (pinch / wheel / double-tap) | 🟢 (improved PR #40)                                                |
| Pan                               | 🟢                                                                  |
| Selection                         | 🟢 URL `?member=`                                                   |
| Navigation to Coach / back        | 🟢 (PR #40)                                                         |
| Performance at claimed 10k        | 🔴 Oversold — full edge SVG + full JS tidy layout                   |
| Gesture stability                 | 🟡 Stage capture + idle culling (PR #40); still watch double-select |
| Mobile UX                         | 🟡 Ops strip steals ≤28dvh; tree cramped                            |
| Tablet UX                         | 🟡 Better space; same edge cost                                     |
| Animations                        | 🟡 Node/edge/aura CSS — perf risk                                   |

### Bugs / fragilities

1. **Double-select path:** card `onClick` + stage `elementFromPoint` tap both call `onSelect`.
2. Camera `emit()` every move (docs promised rAF batching).
3. **Edges never virtualized** — all paths mounted.
4. Full layout recompute on every collapse/filter.
5. RPC-missing **fallback tree is structurally dishonest** (fake memberships).
6. Coach insight bubble on every visible card (cost + clutter).
7. Minimap capped at 200 dots.
8. `didCenter` once forever — no re-center after major filter.
9. Unbounded pan — can lose the tree.
10. `messageBadge` always 0 — dead UI chrome.

### Evidence

- `GenealogyViewport.tsx`, `useGenealogyCamera.ts`, `cameraMath.ts`
- `docs/sprint-4-1-genealogy-architecture.md` (10k claim)

---

# 10. Contacts

## Status: 🟢 Core Complete · 🟡 Filters Partial · 🔴 Import/Export Missing · Priority: P1

| Feature                        | Status                                                           |
| ------------------------------ | ---------------------------------------------------------------- |
| Search (server `ilike`)        | 🟢                                                               |
| Phase filter chips             | 🟡 **Client-side on loaded page only** — wrong under “load more” |
| Sorting                        | 🟡 Fixed `updated_at desc` — no UI                               |
| Create / edit                  | 🟢 + draft persistence                                           |
| Delete                         | 🟢 Online; 🔴 **not offline-queued**                             |
| Detail / pipeline / history    | 🟢                                                               |
| Share tools + screenshot proof | 🟢                                                               |
| Offline create/update/events   | 🟢                                                               |
| Import (CSV/vCard/device)      | 🔴 Missing                                                       |
| Export                         | 🔴 Missing                                                       |
| Phone-book sync                | 🔴 Missing                                                       |

---

# 11. Today Dashboard

## Status: 🟡 Partially Implemented · Priority: P1

Routing: incomplete Journey → Stories + Live + Sync + **JourneyToday** + CEO + Coach OS; else → `TodayPage` (Daily Plan stack).

| Widget               | Data source                                | Logic                      | Refresh                  | Actions                        | Empty/Loading               | Status |
| -------------------- | ------------------------------------------ | -------------------------- | ------------------------ | ------------------------------ | --------------------------- | ------ |
| Stories              | Admin `ascend_stories` + coach-built cards | Merge feeds                | Admin 60s poll           | Open story                     | **Returns `null` if empty** | 🟡     |
| Live Coaching        | `live_coaching_events`                     | Pick today                 | Query + 30s notify flush | Join, calendar                 | **`null` if none**          | 🟡     |
| Sync chip            | Offline queues                             | Status                     | Interval                 | —                              | Shows state                 | 🟢     |
| Daily Plan / Mission | `generate_daily_plan` + IDB day memory     | Commit → Focus → Closing   | Query invalidation       | Done/defer/skip, prep, end day | Loading/error/empty cards   | 🟢     |
| Journey Today        | Journey RPCs                               | Week-1 steps               | Query                    | Complete steps                 | Loading/error               | 🟢     |
| CEO Briefing         | Client `useCoachOrgIntelligence`           | Morning/evening heuristics | On inputs                | Ask → Coach                    | Loading; `null` if no intel | 🟡     |
| Coach OS strip       | Same intel + suggestions                   | Horizon chips              | On inputs                | Open coach                     | Weak empty copy             | 🟡     |

**UX issue:** First viewport is a **stacked dashboard**, not one composition (Stories + Live + Sync + Missions + CEO + Coach).

---

# 12. Settings

## Status: 🔴 Mostly Incomplete · Priority: P1

| Area                    | Status                                                 |
| ----------------------- | ------------------------------------------------------ |
| Language                | 🟢 `setLocale`                                         |
| Theme                   | 🔴 Copy only — “Dark mode follows with PWA polish”     |
| Profile                 | 🟢 Separate `/profil` routes (not Settings)            |
| Cloud Sync controls     | 🔴 Missing (home indicator only)                       |
| Logout                  | 🟢 `signOut()` — **does not clear IDB**                |
| Import / Export         | 🔴 Missing                                             |
| Account delete          | 🔴 **Fake** — confirm → “contact support” hint; no API |
| Push toggle             | 🔴 Permission ask only                                 |
| General / Privacy cards | 🔴 Copy-only                                           |
| Support                 | 🟡 Mailto links                                        |

---

# 13. Database

## Status: 🟡 Core solid · Sprint 5 content tenancy broken · Priority: P0

### Live & used (high confidence)

`organizations`, `teams`, `profiles`, `memberships`, `invites`, `contacts`, `pipeline_events`, `daily_plans`, `daily_plan_items`, `coach_convos`, `coach_messages`, `knowledge_docs`, `knowledge_chunks`, `journeys`, `journey_steps`, `user_progress`, `achievements`, `user_achievements`, `usage_events`, `external_tools`, `leadership_*`, `ap_*` (via RPC), `ranks`, `live_coaching_events`, `ascend_stories`, `coach_knowledge_*`

### Schema-only / dead / write-sink

| Table                                     | Verdict                                              |
| ----------------------------------------- | ---------------------------------------------------- |
| `push_subscriptions`                      | 🔴 Dead — no client/Edge writers                     |
| `coaching_notification_outbox`            | 🔴 Write-only; no processor; **SELECT using (true)** |
| `monthly_awards`                          | 🟢 Writers: job + `ensure_monthly_awards`            |
| `seasons`                                 | 🟡 Schema placeholder; no season product             |
| `cosmetic_items` / `membership_cosmetics` | 🟢 Collection/equip UI (System 1)                    |
| `payouts`                                 | 🟡 Entitlements; no client queries                   |
| `knowledge_gaps`                          | 🟡 Edge inserts; no admin UI                         |
| `agents`                                  | 🟡 Edge-only                                         |

### Critical issues

1. **Dual knowledge:** Coach RAG = `knowledge_docs`. Knowledge Center = `coach_knowledge_articles`. **Never connected.**
2. **No `org_id` on Stories / Live Coaching / Coach Knowledge / outbox** → cross-tenant readable to all authenticated users.
3. Indexes generally present for core CRM/coach; Sprint 5 content skipped tenancy indexes because it skipped tenancy.
4. Broad `GRANT ALL` + RLS-only defense; `profiles_public` SELECT granted to **anon**.

### Evidence

- `src/shared/types/database.types.ts`
- Migrations `20260815000028`, `20260816000029`, `20260805000018`
- RLS tests under `supabase/tests/database/`

---

# 14. Security

## Status: 🟡 Core auth OK · P0 offline + tenancy holes · Priority: P0

| Area                                             | Status                                     | Notes                                 |
| ------------------------------------------------ | ------------------------------------------ | ------------------------------------- |
| Supabase Auth + `RequireAuth`                    | 🟢                                         |                                       |
| Role from `memberships.role`                     | 🟢                                         | Not `profiles.role`                   |
| Client route gates                               | 🟡                                         | Explicitly not the security boundary  |
| Org header `x-ascendos-org`                      | 🟢                                         | Validated in `active_membership_id()` |
| Env: only anon URL/key in Vite                   | 🟢                                         | Secrets Edge-only (`.env.example`)    |
| Edge CORS `*`                                    | 🟡                                         | Weak                                  |
| Offline IDB caches CRM + coach                   | 🔴                                         | Survives refresh                      |
| **`signOut` clears IDB?**                        | 🔴 **No** — only `supabase.auth.signOut()` |
| Cross-org Stories/Live/KC                        | 🔴                                         | No `org_id`                           |
| Outbox readable by all auth users                | 🔴                                         | `using (true)`                        |
| Account delete                                   | 🔴                                         | Fake                                  |
| Login error mapping                              | 🟢                                         | Generic i18n                          |
| Invite create raw `error.message`                | 🟡                                         | Leak risk                             |
| Public storage buckets (avatars, coaching media) | 🟡                                         | Intentional; guessable URLs           |

---

# 15. UX Audit

Scores are code-informed estimates (structure/CSS/a11y), not visual QA lab scores.

| Screen            | Visual | UX  | Read | Mobile | Consist. | A11y | Perf | Anim | Avg     |
| ----------------- | ------ | --- | ---- | ------ | -------- | ---- | ---- | ---- | ------- |
| Today / Journey   | 7      | 6   | 6    | 7      | 6        | 7    | 5    | 7    | 6.4     |
| Contacts          | 6      | 7   | 7    | 8      | 7        | 6    | 7    | 5    | 6.6     |
| Coach workspace   | 8      | 8   | 7    | 7      | 7        | 7    | 6    | 8    | 7.3     |
| Person Coach      | 8      | 8   | 8    | 8      | 8        | 8    | 7    | 8    | **7.9** |
| Team tree         | 8      | 7   | 6    | 6      | 6        | 7    | 5    | 8    | 6.6     |
| Profile           | 7      | 7   | 7    | 8      | 7        | 6    | 7    | 7    | 7.0     |
| Settings          | 5      | 5   | 7    | 8      | 6        | 7    | 8    | 3    | 6.1     |
| More hub          | 4      | 5   | 6    | 7      | 5        | 5    | 8    | 2    | 5.3     |
| Team Seyda iframe | 3      | 4   | 5    | 5      | 3        | 4    | 4    | 1    | **3.6** |
| Knowledge admins  | 5–6    | 5–6 | 6    | 6      | 4–5      | 5    | 6    | 3–4  | ~5.3    |
| Auth              | 5      | 7   | 8    | 8      | 6        | 7    | 9    | 2    | 6.5     |

### UX issues (concrete)

1. **P0:** Bottom nav Team uses `TeamSeydaIcon` but routes to genealogy `/team`; real Seyda guide is `/team-seyda` via More — icon/name lie.
2. **P1:** Today is a stacked dashboard (Stories + Live + Sync + Missions + CEO + Coach OS).
3. **P1:** Team page piles Leader Dashboard + Insights + Warnings + Leaderboard + AP Tasks + tree.
4. **P1:** Settings fake delete / copy-only theme & privacy.
5. **P1:** Dual Knowledge admin IA (`/wissen` vs `/knowledge-center`).
6. **P2:** `NewConversationSheet` lacks Escape/focus trap of `BottomSheet`.
7. **P2:** Genealogy `role="application"` hurts screen readers.
8. **P2:** Coach workspace + BottomNav fight for height (person coach correctly hides nav).
9. **P3:** `*` → `/` (no 404).
10. **P3:** German/English path mix (`/registrieren`, `/kontakte`, `/wissen`, `/more`).

---

# Final Scorecard (all systems)

| #   | System                              | Status | Priority   |
| --- | ----------------------------------- | ------ | ---------- |
| 1   | Avatar & Frame display              | 🟢     | —          |
| 2   | Advisor of the Month                | 🟢     | —          |
| 3   | AAA Cinema / Recognition cinema     | 🟢     | —          |
| 4   | Zoom / Live Coaching                | 🟡     | P0 honesty |
| 5   | Notifications                       | 🔴     | P0         |
| 6   | Automations / Cron                  | 🔴     | P0         |
| 7   | Gamification (AP)                   | 🟡     | P1         |
| 7b  | XP / Levels                         | 🔴     | P2         |
| 8   | Ascend Coach chat                   | 🟢     | —          |
| 8b  | Coach intelligence / dual knowledge | 🟡/🔴  | P0         |
| 9   | Team Tree                           | 🟡     | P1         |
| 10  | Contacts core                       | 🟢     | —          |
| 10b | Contacts import/export              | 🔴     | P2         |
| 11  | Today Daily Plan                    | 🟢     | —          |
| 11b | Today peripheral slots              | 🟡     | P1         |
| 12  | Settings                            | 🔴     | P1         |
| 13  | Database core                       | 🟢     | —          |
| 13b | Sprint 5 tenancy                    | 🔴     | P0         |
| 14  | Auth                                | 🟢     | —          |
| 14b | Offline logout hygiene              | 🔴     | P0         |
| 15  | UX consistency                      | 🟡     | P1         |

---

# P0 Punch List (must decide before Sprint 6)

1. **Do not market push / Zoom reminders** — they do not work.
2. **Fix or quarantine Sprint 5 content tenancy** (Stories, Live Coaching, Knowledge Center, outbox) — add `org_id` or freeze to single-org only.
3. **Connect or rename Knowledge systems** — operators editing Knowledge Center does not feed Coach.
4. **Clear offline stores on sign-out** — shared devices retain CRM + coach history.
5. ~~**Advisor of the Month**~~ — **done (Sprint 6 System 2).** Deploy migration + Edge Function + GH secrets; catch-up covers misses.
6. **Nav honesty:** Team icon vs Team Seyda.
7. **Settings honesty:** remove or implement delete account / theme / push.

---

# P1 Punch List

- ~~Collection / equip cosmetics UI~~ — done (System 1)
- ~~Team Leader AP-frame vs firstline qualification~~ — done (System 1)
- Contacts phase filter server-side
- Genealogy edge virtualization / layout cost vs 10k claim
- Double-select on tree cards
- Today / Team density (one job per section)
- Live Coaching recurrence / Realtime / member poll
- Account delete API or remove control

---

# P2 Punch List

- Import/export contacts
- Top Recruiter / event / temporary frames (or delete schema promises)
- Toast on achievement unlock
- `messageBadge` real or remove
- `knowledge_gaps` admin UI
- Dialog a11y parity
- Docs: PROJECT_BIBLE / beta checklist still mention Netlify in places — hosting is Cloudflare Pages

---

# Dead Code / Unused / Never Triggered (inventory)

| Item                                     | Why                                     |
| ---------------------------------------- | --------------------------------------- |
| `push_subscriptions`                     | No writers                              |
| `coaching_notification_outbox` processor | No reader/worker                        |
| `monthly_awards` auto-fill               | **Done** — job + catch-up               |
| `HeroScreen` / AAA Cinema                | **Done** as Advisor HeroScreen + RankUp |
| `RankUpOverlay` / Collection UI          | **Done** (System 1)                     |
| `messageDrafts` production UI            | Tests only                              |
| Coach `automation.ts` runners            | Prefs only; default OFF                 |
| `ApBadge` in features                    | Unused                                  |
| Genealogy `messageBadge` UI              | Always 0                                |
| `LIVE_COACHING_FUTURE` surfaces          | All false                               |
| Settings theme/privacy/general controls  | Copy only                               |
| Settings delete account                  | Fake confirm                            |
| Event/temporary frame evaluators         | Schema only                             |
| XP / Levels                              | Absent                                  |

---

# What Actually Works (protect this)

1. Auth + memberships + org switcher
2. Contacts CRM + pipeline + share tools + offline create/update
3. Coach chat + RAG (`knowledge_docs`) + person conversation + WhatsApp cards
4. Daily Plan state machine + Closing Loop + Journey week-1
5. AP economy triggers + ranks display + EnergyCore + frame collection/equip
6. Team genealogy view (for realistic team sizes) + member sheet + Coach deep link
7. Live Coaching **admin publish + Today join card** (without relying on reminders)
8. Ascend Stories bar when content exists
9. i18n catalogs (de/en/fr/it/tr) for shipped surfaces
10. **Advisor of the Month** calculator + schedule + Profile history (Sprint 6 System 2)
11. **Recognition cinema** — RankUpOverlay + Advisor HeroScreen podium (Sprint 6 System 3)
12. CI: lint, typecheck, unit tests, build assert for `VITE_*`, pgTAP RLS suite

---

# Recommendation for Sprint 6 Gate

Sprint 6 is **in progress** (Systems 1–3 green). Remaining P0 items still block marketing claims for push, Zoom reminders, multi-org content tenancy, dual knowledge, and logout hygiene.

This audit is verification-only. No code was changed for this document.

---

_Evidence drawn from `src/`, `supabase/migrations/`, `supabase/functions/`, `docs/`, and asset inventory under `public/brand/frames/` as of the audit date._
